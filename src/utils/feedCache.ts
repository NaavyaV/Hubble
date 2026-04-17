import AsyncStorage from '@react-native-async-storage/async-storage'

const FEED_CACHE_KEY = '@hubble/home_feed_cache_v1'
const MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

interface FeedCacheEnvelope {
  v: 1
  savedAt: number
  events: any[]
  hostProfiles: Record<string, any>
  hostOrganizations: Record<string, any>
}

export async function readFeedCache(): Promise<{
  events: any[]
  hostProfiles: Record<string, any>
  hostOrganizations: Record<string, any>
} | null> {
  try {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY)
    if (!raw) return null

    const parsed: FeedCacheEnvelope = JSON.parse(raw)
    if (parsed.v !== 1) return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    if (!parsed.events?.length) return null

    return {
      events: parsed.events,
      hostProfiles: parsed.hostProfiles || {},
      hostOrganizations: parsed.hostOrganizations || {},
    }
  } catch {
    return null
  }
}

export async function writeFeedCache(
  events: any[],
  hostProfiles: Record<string, any>,
  hostOrganizations: Record<string, any>,
): Promise<void> {
  try {
    const envelope: FeedCacheEnvelope = {
      v: 1,
      savedAt: Date.now(),
      events,
      hostProfiles,
      hostOrganizations,
    }
    await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(envelope))
  } catch {
    // Best-effort; don't break the app if storage fails
  }
}

export async function clearFeedCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FEED_CACHE_KEY)
  } catch {
    // ignore
  }
}
