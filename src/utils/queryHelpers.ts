/**
 * Security utility functions for database queries
 */

/**
 * Validates that a string is a valid UUID format
 * This helps prevent injection attacks by ensuring only valid UUIDs are used in queries
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Safely formats a UUID for use in Supabase PostgREST queries
 * Throws an error if the UUID is invalid
 */
export function safeUUID(uuid: string): string {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid UUID format: ${uuid}`)
  }
  return uuid
}

/**
 * Creates a safe .or() query string for friendship checks
 * Ensures both UUIDs are valid before constructing the query
 */
export function safeFriendshipOrQuery(userId1: string, userId2: string): string {
  const safe1 = safeUUID(userId1)
  const safe2 = safeUUID(userId2)
  return `and(user_id.eq."${safe1}",friend_id.eq."${safe2}"),and(user_id.eq."${safe2}",friend_id.eq."${safe1}")`
}

/**
 * Creates a safe .or() query string for user block checks
 */
export function safeBlockOrQuery(userId: string): string {
  const safe = safeUUID(userId)
  return `blocker_id.eq."${safe}",blocked_id.eq."${safe}"`
}

/**
 * Creates a safe .or() query string for friendship user_id/friend_id checks
 */
export function safeFriendshipUserOrQuery(userId: string): string {
  const safe = safeUUID(userId)
  return `user_id.eq."${safe}",friend_id.eq."${safe}"`
}

