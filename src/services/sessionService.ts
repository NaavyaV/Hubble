import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

let cachedUser: User | null = null
let cachedSession: Session | null = null
let userPromise: Promise<User | null> | null = null
let sessionPromise: Promise<Session | null> | null = null
const STALE_MS = 60_000

let userFetchedAt = 0
let sessionFetchedAt = 0

function isStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > STALE_MS
}

export async function getCachedUser(force = false): Promise<User | null> {
  if (!force && cachedUser && !isStale(userFetchedAt)) {
    return cachedUser
  }

  if (!force && userPromise) return userPromise

  userPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        cachedUser = session.user
        userFetchedAt = Date.now()
        return cachedUser
      }
      const { data: { user } } = await supabase.auth.getUser()
      cachedUser = user
      userFetchedAt = Date.now()
      return user
    } finally {
      userPromise = null
    }
  })()

  return userPromise
}

export async function getCachedSession(force = false): Promise<Session | null> {
  if (!force && cachedSession && !isStale(sessionFetchedAt)) {
    return cachedSession
  }

  if (!force && sessionPromise) return sessionPromise

  sessionPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      cachedSession = session
      cachedUser = session?.user ?? cachedUser
      sessionFetchedAt = Date.now()
      if (session?.user) userFetchedAt = Date.now()
      return session
    } finally {
      sessionPromise = null
    }
  })()

  return sessionPromise
}

export function getCachedUserId(): string | null {
  return cachedUser?.id ?? null
}

export function clearSessionCache(): void {
  cachedUser = null
  cachedSession = null
  userPromise = null
  sessionPromise = null
  userFetchedAt = 0
  sessionFetchedAt = 0
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    cachedSession = session
    cachedUser = session.user
    sessionFetchedAt = Date.now()
    userFetchedAt = Date.now()
  } else {
    clearSessionCache()
  }
})
