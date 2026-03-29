import { supabase } from './supabase'
import { safeBlockOrQuery } from '../utils/queryHelpers'

export interface LeaderboardEntry {
  host_id: string
  full_name: string
  username: string
  avatar_url: string
  major: string
  graduating_year: string
  total_rsvps: number
  total_events_hosted: number
  rank: number
}

export interface LeaderboardResult {
  leaderboard: LeaderboardEntry[]
  currentUserRank: LeaderboardEntry | null
  currentUserId: string
}

const STALE_MS = 5 * 60 * 1000

let cache: { data: LeaderboardResult; fetchedAt: number } | null = null
let inflight: Promise<LeaderboardResult | null> | null = null

export function invalidateLeaderboardCache(): void {
  cache = null
  inflight = null
}

export async function getLeaderboard(options?: {
  force?: boolean
}): Promise<LeaderboardResult | null> {
  if (!options?.force && cache && Date.now() - cache.fetchedAt < STALE_MS) {
    return cache.data
  }

  if (options?.force) {
    cache = null
    inflight = null
  }

  if (!options?.force && inflight) {
    return inflight
  }

  const run = fetchLeaderboardFromNetwork()

  if (!options?.force) {
    inflight = run
    run.finally(() => {
      inflight = null
    })
  }

  return run
}

async function fetchLeaderboardFromNetwork(): Promise<LeaderboardResult | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: leaderboardData, error: leaderboardError } = await supabase
    .from('host_leaderboard')
    .select('*')
    .order('rank', { ascending: true })

  if (leaderboardError) throw leaderboardError

  const hostIds = leaderboardData?.map(entry => entry.host_id) || []

  const { data: verifiedProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .in('id', hostIds)
    .eq('otp_verified', true)

  if (profilesError) throw profilesError

  const { data: blockedData } = await supabase
    .from('user_blocks')
    .select('blocked_id, blocker_id')
    .or(safeBlockOrQuery(user.id))

  const blockedUserIds = new Set<string>()
  const blockerIds = new Set<string>()
  if (blockedData) {
    blockedData.forEach((b: any) => {
      if (b.blocker_id === user.id) {
        blockedUserIds.add(b.blocked_id)
      }
      if (b.blocked_id === user.id) {
        blockerIds.add(b.blocker_id)
      }
    })
  }

  const verifiedHostIds = new Set(verifiedProfiles?.map(p => p.id) || [])
  const filteredLeaderboard = leaderboardData?.filter(
    entry =>
      verifiedHostIds.has(entry.host_id) &&
      !blockedUserIds.has(entry.host_id) &&
      !blockerIds.has(entry.host_id)
  ) || []

  const reRankedLeaderboard = filteredLeaderboard.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  })) as LeaderboardEntry[]

  const userEntry = reRankedLeaderboard.find(entry => entry.host_id === user.id)

  const result: LeaderboardResult = {
    leaderboard: reRankedLeaderboard,
    currentUserRank: userEntry || null,
    currentUserId: user.id,
  }

  cache = { data: result, fetchedAt: Date.now() }
  return result
}
