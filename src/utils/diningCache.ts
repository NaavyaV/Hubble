import AsyncStorage from '@react-native-async-storage/async-storage'
import type { DiningLocationRow } from '../services/diningService'
import type { DiningDayKey } from '../constants/dining'

const STORAGE_KEY = '@hubble/dining_locations_cache_v1'
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

type CacheShape = {
  v: 1
  savedAt: number
  days: Partial<
    Record<
      string,
      {
        day_label: string | null
        rows: DiningLocationRow[]
      }
    >
  >
}

export async function readDiningCache(dayKey: DiningDayKey): Promise<{
  day_label: string | null
  rows: DiningLocationRow[]
} | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as CacheShape
    if (c?.v !== 1 || typeof c.savedAt !== 'number' || !c.days) return null
    if (Date.now() - c.savedAt > MAX_AGE_MS) return null
    const entry = c.days[dayKey]
    if (!entry?.rows?.length) return null
    return { day_label: entry.day_label ?? null, rows: entry.rows }
  } catch {
    return null
  }
}

export async function writeDiningCacheDay(
  dayKey: DiningDayKey,
  day_label: string | null,
  rows: DiningLocationRow[]
): Promise<void> {
  let base: CacheShape = { v: 1, savedAt: Date.now(), days: {} }
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CacheShape
      if (parsed?.v === 1 && parsed.days && typeof parsed.savedAt === 'number') {
        base = { ...parsed, days: { ...parsed.days } }
      }
    } catch {
      /* replace */
    }
  }
  base.days[dayKey] = { day_label, rows }
  base.savedAt = Date.now()
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(base))
}
