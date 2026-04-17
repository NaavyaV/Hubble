import { supabase } from './supabase'
import { UTD_COLLEGE_NAME, UTD_DINING_API_URL, type DiningDayKey } from '../constants/dining'

export type DiningLocationRow = {
  id?: string
  college: string
  day_key: string
  day_label: string | null
  building: string
  venue: string
  hours: string
  refreshed_at?: string
}

type ApiSchedule = Record<string, { label?: string; locations: { building: string; venue: string; hours: string }[] }>

async function fetchFromUtDiningApi(): Promise<DiningLocationRow[]> {
  const res = await fetch(UTD_DINING_API_URL)
  if (!res.ok) {
    throw new Error(`Dining API ${res.status}`)
  }
  const body = (await res.json()) as { schedule?: ApiSchedule }
  const schedule = body.schedule
  if (!schedule) return []

  const rows: DiningLocationRow[] = []
  for (const [dayKey, dayData] of Object.entries(schedule)) {
    if (!dayData?.locations) continue
    for (const loc of dayData.locations) {
      rows.push({
        college: UTD_COLLEGE_NAME,
        day_key: dayKey,
        day_label: dayData.label ?? null,
        building: loc.building,
        venue: loc.venue,
        hours: loc.hours,
      })
    }
  }
  return rows
}

/**
 * Load dining rows for one weekday key. Uses Supabase when data exists; falls back to live API if empty or error.
 */
export async function getDiningLocationsForDay(dayKey: DiningDayKey): Promise<DiningLocationRow[]> {
  const { data, error } = await supabase
    .from('dining_locations')
    .select('*')
    .eq('college', UTD_COLLEGE_NAME)
    .eq('day_key', dayKey)
    .order('building', { ascending: true })
    .order('venue', { ascending: true })

  if (!error && data && data.length > 0) {
    return data as DiningLocationRow[]
  }

  try {
    const all = await fetchFromUtDiningApi()
    return all.filter((r) => r.day_key === dayKey).sort((a, b) => {
      const bb = a.building.localeCompare(b.building)
      if (bb !== 0) return bb
      return a.venue.localeCompare(b.venue)
    })
  } catch (e) {
    if (__DEV__) console.warn('diningService fallback API failed', e)
    return (data as DiningLocationRow[]) || []
  }
}
