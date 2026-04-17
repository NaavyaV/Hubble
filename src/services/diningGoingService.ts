import { supabase } from './supabase'
import { UTD_COLLEGE_NAME } from '../constants/dining'

export type DiningVisibility = 'everyone' | 'friends_only'

export type DiningGoingRow = {
  id: string
  user_id: string
  college: string
  building: string
  venue: string
  plan_date: string
  arrival_at: string
  departure_at: string
  visibility: DiningVisibility
}

export type DiningGoingWithProfile = DiningGoingRow & {
  profile: {
    id: string
    full_name: string | null
    username: string | null
    avatar_url: string | null
  }
}

export function venueKey(building: string, venue: string): string {
  return `${building}\u0000${venue}`
}

/** Accepted friend user ids (the other person in each friendship). */
export async function fetchAcceptedFriendIds(myUserId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'accepted')
    .or(`user_id.eq.${myUserId},friend_id.eq.${myUserId}`)

  if (error || !data) return new Set()
  const ids = new Set<string>()
  for (const row of data) {
    if (row.user_id === myUserId) ids.add(row.friend_id)
    else if (row.friend_id === myUserId) ids.add(row.user_id)
  }
  return ids
}

/**
 * Active plans: same calendar day (Central in app), not yet departed.
 */
export async function fetchActiveGoingForDate(planDate: string): Promise<DiningGoingWithProfile[]> {
  const nowIso = new Date().toISOString()
  const { data: rows, error } = await supabase
    .from('dining_going')
    .select('id, user_id, college, building, venue, plan_date, arrival_at, departure_at, visibility')
    .eq('college', UTD_COLLEGE_NAME)
    .eq('plan_date', planDate)
    .gt('departure_at', nowIso)

  if (error || !rows?.length) {
    if (__DEV__ && error) console.warn('fetchActiveGoingForDate', error)
    return []
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', userIds)

  if (pErr || !profiles) return rows.map((r) => ({ ...r, profile: { id: r.user_id, full_name: null, username: null, avatar_url: null } }))

  const profileById = new Map(profiles.map((p) => [p.id, p]))
  return rows.map((r) => ({
    ...r,
    profile: profileById.get(r.user_id) ?? {
      id: r.user_id,
      full_name: null,
      username: null,
      avatar_url: null,
    },
  })) as DiningGoingWithProfile[]
}

export function groupGoingByVenue(rows: DiningGoingWithProfile[]): Map<string, DiningGoingWithProfile[]> {
  const m = new Map<string, DiningGoingWithProfile[]>()
  for (const r of rows) {
    const k = venueKey(r.building, r.venue)
    const list = m.get(k) ?? []
    list.push(r)
    m.set(k, list)
  }
  return m
}

export async function upsertDiningGoing(params: {
  userId: string
  building: string
  venue: string
  planDate: string
  arrivalAt: Date
  departureAt: Date
  visibility: DiningVisibility
}): Promise<{ error: Error | null }> {
  const { userId, building, venue, planDate, arrivalAt, departureAt, visibility } = params
  const { error } = await supabase.from('dining_going').upsert(
    {
      user_id: userId,
      college: UTD_COLLEGE_NAME,
      building,
      venue,
      plan_date: planDate,
      arrival_at: arrivalAt.toISOString(),
      departure_at: departureAt.toISOString(),
      visibility,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,college,building,venue,plan_date' }
  )
  return { error: error ? new Error(error.message) : null }
}

export async function deleteMyDiningGoing(params: {
  userId: string
  planDate: string
  building: string
  venue: string
}): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('dining_going')
    .delete()
    .eq('user_id', params.userId)
    .eq('college', UTD_COLLEGE_NAME)
    .eq('plan_date', params.planDate)
    .eq('building', params.building)
    .eq('venue', params.venue)

  return { error: error ? new Error(error.message) : null }
}
