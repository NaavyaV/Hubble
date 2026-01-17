import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { isNetworkError, showNetworkErrorAlert, checkNetworkConnection } from '../utils/networkUtils'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Global flag to prevent multiple simultaneous alerts
let isHandlingNetworkError = false

// Helper function to check if error is an invalid refresh token error
export function isInvalidRefreshTokenError(error: any): boolean {
  return (
    error?.message?.includes('Invalid Refresh Token') ||
    error?.message?.includes('Refresh Token Not Found') ||
    error?.status === 401 ||
    (error?.name === 'AuthApiError' && 
     (error?.message?.includes('refresh_token') || error?.message?.includes('session_not_found')))
  )
}

// Wrapper for fetch that handles network errors globally
async function fetchWithNetworkHandling(url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  try {
    // Check network connection first
    const connected = await checkNetworkConnection()
    if (!connected) {
      if (!isHandlingNetworkError) {
        isHandlingNetworkError = true
        showNetworkErrorAlert(() => {
          isHandlingNetworkError = false
          // User can retry manually - the request will be retried when they tap retry
        })
      }
      throw new Error('Network request failed: No internet connection')
    }
    
    // Make the request with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      isHandlingNetworkError = false // Reset flag on success
      return response
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      // Check if it's a network error
      if (isNetworkError(fetchError)) {
        if (!isHandlingNetworkError) {
          isHandlingNetworkError = true
          showNetworkErrorAlert(() => {
            isHandlingNetworkError = false
            // User can retry manually
          })
        }
      }
      
      throw fetchError
    }
  } catch (error: any) {
    // If it's a network error, show alert
    if (isNetworkError(error) && !isHandlingNetworkError) {
      isHandlingNetworkError = true
      showNetworkErrorAlert(() => {
        isHandlingNetworkError = false
        // User can retry manually
      })
    }
    
    throw error
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Add timeout settings for better simulator compatibility
  global: {
    headers: {
      'x-client-info': 'hubble-app',
    },
    // Security: Add request timeout and network error handling to prevent hanging requests
    fetch: fetchWithNetworkHandling,
  },
  // Increase timeout for simulators which may be slower
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Safe refresh session helper that handles invalid refresh token errors
export async function safeRefreshSession(): Promise<void> {
  try {
    await supabase.auth.refreshSession()
  } catch (error: any) {
    // If refresh token is invalid, sign out to clear invalid session
    if (isInvalidRefreshTokenError(error)) {
      if (__DEV__) {
        console.log('supabase.ts: Invalid refresh token detected, signing out')
      }
      // Clear invalid session by signing out
      await supabase.auth.signOut()
    }
    // Re-throw other errors
    throw error
  }
}
