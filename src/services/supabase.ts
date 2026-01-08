import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { isNetworkError, showNetworkErrorAlert, checkNetworkConnection } from '../utils/networkUtils'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Global flag to prevent multiple simultaneous alerts
let isHandlingNetworkError = false

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
