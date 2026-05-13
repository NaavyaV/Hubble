import { supabase } from '../services/supabase'
import { uploadBytesToBucket } from './upload'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''

export type ImageVariant = 'small' | 'feed' | 'detail' | 'full'

export function buildPublicAssetUrl(bucket: string, path: string): string {
  if (!supabaseUrl || !path) return ''
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

export function buildTransformedAssetUrl(
  bucket: string,
  path: string,
  variant: ImageVariant,
): string {
  if (!supabaseUrl || !path) return ''
  const base = `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}`
  switch (variant) {
    case 'small':
      return `${base}?width=128&height=128&resize=cover&quality=62`
    case 'feed':
      return `${base}?width=720&height=720&resize=cover&quality=64`
    case 'detail':
      return `${base}?width=1280&height=1280&resize=cover&quality=70`
    case 'full':
    default:
      return `${base}?quality=75`
  }
}

export async function uploadVersionedAsset(params: {
  uri: string
  bucket: 'profile-images' | 'event-images' | 'photos'
  entityType: 'avatars' | 'event-covers' | 'org-icons'
  entityId: string
  currentVersion?: number | null
  purpose: 'avatar' | 'cover' | 'gallery'
}): Promise<{ path: string; version: number; publicUrl: string }> {
  const { uri, bucket, entityType, entityId, currentVersion, purpose } = params
  const nextVersion = (currentVersion || 0) + 1
  const path = `${entityType}/${entityId}/v${nextVersion}.jpg`
  const publicUrl = await uploadBytesToBucket({
    bucket,
    filePath: path,
    uri,
    contentType: 'image/jpeg',
    purpose,
  })
  return { path, version: nextVersion, publicUrl }
}

export function inferImageTierFromCacheKey(cacheKey?: string): 'profile' | 'event' | 'org' | 'default' {
  const k = (cacheKey || '').toLowerCase()
  if (k.startsWith('avatar:') || k.startsWith('profile:')) return 'profile'
  if (k.startsWith('event:')) return 'event'
  if (k.startsWith('org:')) return 'org'
  return 'default'
}

