/**
 * Session + OTP gate for cold start.
 *
 * Note: `npx expo start --clear` clears only Metro’s JS/transform cache on your machine.
 * It does NOT delete AsyncStorage, Supabase tokens, or any data persisted on the device.
 * Production cold starts use the same persistence as dev; issues after --clear are timing/race,
 * not missing on-device storage.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { supabase, isInvalidRefreshTokenError } from '../services/supabase'
import { invalidateLeaderboardCache } from '../services/leaderboardService'
import { getCachedSession, clearSessionCache } from '../services/sessionService'
import { isNetworkError } from '../utils/networkUtils'
import type { User } from '../types'

const OTP_CACHE_KEY = '@hubble_otp_verified'

async function getCachedOtpVerified(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OTP_CACHE_KEY)
  } catch {
    return null
  }
}

async function setCachedOtpVerified(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(OTP_CACHE_KEY, userId)
  } catch {}
}

async function clearCachedOtpVerified(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OTP_CACHE_KEY)
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface AuthContextType {
  user: User | null
  isReady: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, isReady: false })

export function useAuth(): AuthContextType {
  return useContext(AuthContext)
}

type OtpGateResult = 'verified' | 'unverified' | 'no_profile' | 'transient_fail'

async function fetchOtpGateWithRetry(
  userId: string,
  signal: { cancelled: boolean },
  accountCreatedAt?: string
): Promise<OtpGateResult> {
  const accountAgeMin = accountCreatedAt
    ? (Date.now() - new Date(accountCreatedAt).getTime()) / 60_000
    : 999
  const isBrandNewAccount = accountAgeMin < 3
  const noProfileRetries = isBrandNewAccount ? 2 : 7

  for (let attempt = 0; attempt < 8; attempt++) {
    if (signal.cancelled) return 'transient_fail'

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('otp_verified')
      .eq('id', userId)
      .maybeSingle()

    if (!error) {
      if (!profile) {
        // RLS / cold tunnel often returns empty once; retry before treating as missing profile
        if (attempt < noProfileRetries) {
          await sleep(220 * (attempt + 1) + attempt * 100)
          continue
        }
        return 'no_profile'
      }
      return profile.otp_verified ? 'verified' : 'unverified'
    }

    if (isInvalidRefreshTokenError(error)) return 'unverified'

    const msg = String(error?.message ?? '').toLowerCase()
    const transient =
      isNetworkError(error) ||
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('aborted') ||
      msg.includes('failed') ||
      error?.name === 'AbortError'

    if (transient) {
      await sleep(280 * (attempt + 1) + attempt * 120)
      continue
    }

    await sleep(200)
  }
  return 'transient_fail'
}

async function resolveUserAfterHydration(session: Session, signal: { cancelled: boolean }): Promise<User | null> {
  if (!session.user) return null

  const cachedId = await getCachedOtpVerified()
  if (cachedId === session.user.id) {
    if (__DEV__) console.log('AuthProvider: OTP cache hit')
    return session.user as User
  }

  const gate = await fetchOtpGateWithRetry(session.user.id, signal, session.user.created_at)
  if (signal.cancelled) return null

  if (gate === 'verified') {
    await setCachedOtpVerified(session.user.id)
    return session.user as User
  }
  if (gate === 'unverified') return null

  if (gate === 'no_profile') {
    const age = (Date.now() - new Date(session.user.created_at).getTime()) / 60_000
    if (age >= 5) {
      await supabase.auth.signOut()
      await clearCachedOtpVerified()
    }
    return null
  }

  if (__DEV__) console.warn('AuthProvider: OTP check failed after retries; continuing with session')
  return session.user as User
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isReady, setIsReady] = useState(false)
  const readyRef = useRef(false)
  const bootstrapDoneRef = useRef(false)
  const bootstrapInflightRef = useRef<Promise<void> | null>(null)

  const markReady = useCallback(() => {
    if (!readyRef.current) {
      readyRef.current = true
      setIsReady(true)
    }
  }, [])

  // Last resort if auth layer hangs (should be extremely rare)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!readyRef.current) {
        if (__DEV__) console.warn('AuthProvider: absolute fail-safe (30s)')
        bootstrapDoneRef.current = true
        markReady()
      }
    }, 30_000)
    return () => clearTimeout(t)
  }, [markReady])

  useEffect(() => {
    const signal = { cancelled: false }

    async function waitForPersistedSession(maxMs: number): Promise<Session | null> {
      const deadline = Date.now() + maxMs
      while (!signal.cancelled && Date.now() < deadline) {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error && isInvalidRefreshTokenError(error)) {
          await supabase.auth.signOut()
          await clearCachedOtpVerified()
          return null
        }
        if (session?.user) return session
        await sleep(110)
      }
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error && isInvalidRefreshTokenError(error)) {
        await supabase.auth.signOut()
        await clearCachedOtpVerified()
        return null
      }
      return session ?? null
    }

    async function runBootstrap(hint: Session | null) {
      if (signal.cancelled || bootstrapDoneRef.current) return

      try {
        let session: Session | null = hint?.user ? hint : null
        if (!session?.user) {
          session = await waitForPersistedSession(12_000)
        }
        if (signal.cancelled) return

        if (!session?.user) {
          bootstrapDoneRef.current = true
          setUser(null)
          markReady()
          return
        }

        try {
          const { error } = await supabase.auth.getSession()
          if (error && isInvalidRefreshTokenError(error)) {
            await supabase.auth.signOut()
            await clearCachedOtpVerified()
            bootstrapDoneRef.current = true
            setUser(null)
            markReady()
            return
          }
        } catch (e: any) {
          if (isInvalidRefreshTokenError(e)) {
            try {
              await supabase.auth.signOut()
              await clearCachedOtpVerified()
            } catch {}
            bootstrapDoneRef.current = true
            setUser(null)
            markReady()
            return
          }
        }

        const u = await resolveUserAfterHydration(session, signal)
        if (signal.cancelled) return

        bootstrapDoneRef.current = true
        setUser(u)
        markReady()
      } catch {
        if (!signal.cancelled) {
          bootstrapDoneRef.current = true
          setUser(null)
          markReady()
        }
      }
    }

    function ensureBootstrap(hint: Session | null) {
      if (signal.cancelled || bootstrapDoneRef.current) return
      if (bootstrapInflightRef.current) return
      bootstrapInflightRef.current = runBootstrap(hint).finally(() => {
        bootstrapInflightRef.current = null
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        ensureBootstrap(session)
        return
      }

      // TOKEN_REFRESHED / SIGNED_IN can fire during cold start before bootstrap finishes.
      // Processing them early can clear the user (e.g. flaky profile read) and strand the UI on Welcome.
      if (!bootstrapDoneRef.current) {
        return
      }

      if (!session?.user) {
        invalidateLeaderboardCache()
        clearSessionCache()
        await clearCachedOtpVerified()
        setUser(null)
        return
      }

      const verify = async () => {
        try {
          const gate = await fetchOtpGateWithRetry(session.user.id, { cancelled: false }, session.user.created_at)
          if (gate === 'verified') {
            await setCachedOtpVerified(session.user.id)
            setUser(session.user as User)
            return
          }
          if (gate === 'transient_fail') {
            setUser(session.user as User)
            return
          }
          if (gate === 'no_profile') {
            const age = (Date.now() - new Date(session.user.created_at).getTime()) / 60_000
            if (age >= 5) await supabase.auth.signOut()
          }
          setUser(null)
        } catch (e: any) {
          if (isInvalidRefreshTokenError(e)) {
            try {
              await supabase.auth.signOut()
            } catch {}
          }
          setUser(null)
        }
      }

      if (event === 'TOKEN_REFRESHED') {
        setTimeout(verify, 200)
      } else {
        await verify()
      }
    })

    // If INITIAL_SESSION were ever delayed, still start hydration (single-flight lock prevents duplicates)
    const fallbackTimer = setTimeout(() => {
      if (!bootstrapDoneRef.current && !signal.cancelled) {
        ensureBootstrap(null)
      }
    }, 1500)

    return () => {
      signal.cancelled = true
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [markReady])

  useEffect(() => {
    if (!isReady) return
    let channel: any = null
    const signal = { cancelled: false }

    const setup = async () => {
      const sess = await getCachedSession()
      if (!sess?.user || signal.cancelled) return

      const name = `profile-otp-${sess.user.id}`
      for (const ch of supabase.getChannels()) {
        if (ch.topic === name || ch.topic === `realtime:${name}` || ch.topic.endsWith(name)) {
          supabase.removeChannel(ch)
        }
      }

      channel = supabase
        .channel(name)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${sess.user.id}`,
          },
          async (payload) => {
            if ((payload.new as { otp_verified?: boolean })?.otp_verified === true) {
              const s = await getCachedSession(true)
              if (s?.user) {
                await setCachedOtpVerified(s.user.id)
                setUser(s.user as User)
              }
            }
          }
        )
        .subscribe()
    }
    setup()
    return () => {
      signal.cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [isReady])

  const value = useMemo(() => ({ user, isReady }), [user, isReady])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
