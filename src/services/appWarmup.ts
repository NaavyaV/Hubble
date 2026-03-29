import { getLeaderboard } from './leaderboardService'
import { prefetchImageUris } from '../utils/imagePrefetch'

/**
 * Single entry point for cold-start prefetch after the main shell mounts.
 * Leaderboard data is deduped via leaderboardService (cache + in-flight coalescing).
 */
export async function warmupTabCaches(): Promise<void> {
  try {
    const data = await getLeaderboard()
    if (data?.leaderboard?.length) {
      prefetchImageUris(data.leaderboard.map(e => e.avatar_url))
    }
  } catch {
    // Offline or transient errors — ignore; screens retry on focus/refresh.
  }
}
