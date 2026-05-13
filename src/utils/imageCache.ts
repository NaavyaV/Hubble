import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

const CACHE_INDEX_KEY = '@hubble/image_cache_index_v1'
const CACHE_DIR = `${FileSystem.cacheDirectory}hubble-images/`
const MAX_CACHE_BYTES = 80 * 1024 * 1024 // 80MB
const MAX_CACHE_FILES = 300
const MAX_ENTRY_AGE_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

type ImageCacheTier = 'profile' | 'event' | 'org' | 'default'

const CACHE_IMAGE_RULES: Record<
  ImageCacheTier,
  { maxBytes: number; maxDimension: number; startQuality: number }
> = {
  profile: { maxBytes: 100 * 1024, maxDimension: 256, startQuality: 0.72 },
  event: { maxBytes: 240 * 1024, maxDimension: 960, startQuality: 0.76 },
  org: { maxBytes: 120 * 1024, maxDimension: 320, startQuality: 0.74 },
  default: { maxBytes: 180 * 1024, maxDimension: 640, startQuality: 0.74 },
}

type CacheIndexEntry = {
  key: string
  remoteUri: string
  localUri: string
  size: number
  updatedAt: number
  lastAccessedAt: number
}

type CacheIndex = {
  version: 1
  items: Record<string, CacheIndexEntry>
}

type SourceMode = 'local-file' | 'expo-disk-cache' | 'memory-cache' | 'network'
type CacheMetrics = {
  localFileHits: number
  networkMisses: number
  diskHits: number
  memoryHits: number
  bytesSaved: number
}

let memIndex: CacheIndex | null = null
let initPromise: Promise<void> | null = null
let metrics: CacheMetrics = {
  localFileHits: 0,
  networkMisses: 0,
  diskHits: 0,
  memoryHits: 0,
  bytesSaved: 0,
}

function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i)
  }
  return `k${(h >>> 0).toString(36)}`
}

function buildKey(remoteUri: string, cacheKey?: string): string {
  return hashKey(cacheKey ? `${cacheKey}|${remoteUri}` : remoteUri)
}

function inferTier(remoteUri: string, cacheKey?: string): ImageCacheTier {
  const k = (cacheKey || '').toLowerCase()
  const u = remoteUri.toLowerCase()
  if (k.includes('profile:') || u.includes('profile-images')) return 'profile'
  if (k.includes('event:') || u.includes('event-images')) return 'event'
  if (k.includes('org:') || u.includes('/organizations/')) return 'org'
  return 'default'
}

async function ensureInitialized(): Promise<void> {
  if (memIndex) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
      }
      const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CacheIndex
        if (parsed?.version === 1 && parsed.items) {
          memIndex = parsed
          return
        }
      }
    } catch {
      // fall through to reset
    }
    memIndex = { version: 1, items: {} }
  })()
  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

async function persistIndex(): Promise<void> {
  if (!memIndex) return
  await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(memIndex))
}

async function removeEntry(key: string): Promise<void> {
  if (!memIndex) return
  const entry = memIndex.items[key]
  if (entry) {
    try {
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true })
    } catch {
      // ignore
    }
    delete memIndex.items[key]
  }
}

async function pruneCacheIfNeeded(): Promise<void> {
  if (!memIndex) return
  const now = Date.now()
  const items = Object.values(memIndex.items)

  for (const entry of items) {
    if (now - entry.updatedAt > MAX_ENTRY_AGE_MS) {
      await removeEntry(entry.key)
    }
  }

  let currentItems = Object.values(memIndex.items)
  let totalBytes = currentItems.reduce((sum, e) => sum + e.size, 0)

  if (totalBytes <= MAX_CACHE_BYTES && currentItems.length <= MAX_CACHE_FILES) {
    return
  }

  currentItems = currentItems.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
  for (const entry of currentItems) {
    if (totalBytes <= MAX_CACHE_BYTES && Object.keys(memIndex.items).length <= MAX_CACHE_FILES) {
      break
    }
    totalBytes -= entry.size
    await removeEntry(entry.key)
  }
}

function inferExtension(remoteUri: string): string {
  const clean = remoteUri.split('?')[0]
  const lastDot = clean.lastIndexOf('.')
  const ext = lastDot > -1 ? clean.slice(lastDot + 1).toLowerCase() : ''
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') {
    return ext
  }
  return 'img'
}

async function tryReadCachedUri(key: string): Promise<string | null> {
  if (!memIndex) return null
  const existing = memIndex.items[key]
  if (!existing) return null
  const info = await FileSystem.getInfoAsync(existing.localUri)
  if (!info.exists) {
    await removeEntry(key)
    await persistIndex()
    return null
  }
  existing.lastAccessedAt = Date.now()
  await persistIndex()
  return existing.localUri
}

async function compressCachedImage(sourceUri: string, tier: ImageCacheTier): Promise<string> {
  const rule = CACHE_IMAGE_RULES[tier]
  let quality = rule.startQuality
  let currentUri = sourceUri
  let bestUri = sourceUri

  for (let i = 0; i < 5; i += 1) {
    const transformed = await manipulateAsync(
      currentUri,
      [{ resize: { width: rule.maxDimension, height: rule.maxDimension } }],
      { compress: quality, format: SaveFormat.JPEG },
    )
    bestUri = transformed.uri
    const info = await FileSystem.getInfoAsync(bestUri)
    const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0
    if (size <= rule.maxBytes) {
      return bestUri
    }
    quality = Math.max(0.35, quality - 0.1)
    currentUri = transformed.uri
  }
  return bestUri
}

export async function resolveCachedImageUri(remoteUri: string, cacheKey?: string): Promise<string> {
  if (!remoteUri) return remoteUri
  await ensureInitialized()
  if (!memIndex) return remoteUri

  const key = buildKey(remoteUri, cacheKey)
  const cached = await tryReadCachedUri(key)
  if (cached) {
    metrics.localFileHits += 1
    const entry = memIndex.items[key]
    if (entry?.size) metrics.bytesSaved += entry.size
    return cached
  }

  try {
    const ext = inferExtension(remoteUri)
    const downloadedUri = `${CACHE_DIR}${key}.download.${ext}`
    const localUri = `${CACHE_DIR}${key}.jpg`
    const result = await FileSystem.downloadAsync(remoteUri, downloadedUri)
    if (result.status < 200 || result.status >= 300) {
      return remoteUri
    }

    const tier = inferTier(remoteUri, cacheKey)
    const compressedUri = await compressCachedImage(downloadedUri, tier)
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true })
    } catch {
      // ignore
    }
    if (compressedUri !== localUri) {
      await FileSystem.moveAsync({ from: compressedUri, to: localUri })
    }
    try {
      if (downloadedUri !== localUri) {
        await FileSystem.deleteAsync(downloadedUri, { idempotent: true })
      }
    } catch {
      // ignore
    }

    const info = await FileSystem.getInfoAsync(localUri)
    const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0
    const now = Date.now()
    memIndex.items[key] = {
      key,
      remoteUri,
      localUri,
      size,
      updatedAt: now,
      lastAccessedAt: now,
    }
    await pruneCacheIfNeeded()
    await persistIndex()
    metrics.networkMisses += 1
    return localUri
  } catch {
    return remoteUri
  }
}

export function trackRenderedImageSourceMode(mode: SourceMode): void {
  if (mode === 'expo-disk-cache') metrics.diskHits += 1
  if (mode === 'memory-cache') metrics.memoryHits += 1
}

export async function getImageCacheDebugSummary(): Promise<{
  fileCount: number
  totalBytes: number
  metrics: CacheMetrics
  largestFiles: Array<{ key: string; size: number; localUri: string }>
}> {
  await ensureInitialized()
  const items = memIndex ? Object.values(memIndex.items) : []
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0)
  const largestFiles = [...items]
    .sort((a, b) => b.size - a.size)
    .slice(0, 50)
    .map((item) => ({ key: item.key, size: item.size, localUri: item.localUri }))

  return {
    fileCount: items.length,
    totalBytes,
    metrics: { ...metrics },
    largestFiles,
  }
}

export async function runImageCacheMaintenance(): Promise<void> {
  await ensureInitialized()
  await pruneCacheIfNeeded()
  await persistIndex()
}
