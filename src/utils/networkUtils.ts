import { Alert, Platform } from 'react-native'

let isOnline = true
let showAlert = false

// Suppress console.error when offline
let originalConsoleError: typeof console.error | null = null
let isSuppressingErrors = false

// Network restoration callback
let networkRestoredCallback: (() => void) | null = null

/**
 * Set a callback to be called when network is restored
 */
export function setNetworkRestoredCallback(callback: (() => void) | null) {
  networkRestoredCallback = callback
}

/**
 * Check if device is online by attempting a simple fetch request
 */
export async function checkNetworkConnection(): Promise<boolean> {
  try {
    // Use a fast endpoint to check connectivity
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
    
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache',
    }).finally(() => clearTimeout(timeoutId))
    
    const wasOffline = !isOnline
    isOnline = response.status === 204 || response.ok
    
    // If network was restored (was offline, now online), trigger callback
    if (wasOffline && isOnline && networkRestoredCallback) {
      // Delay slightly to ensure state is stable
      setTimeout(() => {
        if (networkRestoredCallback) {
          networkRestoredCallback()
        }
      }, 100)
    }
    
    return isOnline
  } catch (error) {
    const wasOffline = !isOnline
    isOnline = false
    return false
  }
}

/**
 * Check if the error is a network-related error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  
  // Check for common network error patterns
  const errorMessage = error?.message?.toLowerCase() || ''
  const errorCode = error?.code?.toLowerCase() || ''
  
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('offline') ||
    errorMessage.includes('internet') ||
    errorCode === 'network_error' ||
    errorCode === 'networkrequestfailed' ||
    errorCode === 'timeout' ||
    error?.name === 'NetworkError' ||
    error?.name === 'TypeError' // Fetch failures often throw TypeError
  )
}

/**
 * Suppress console.error for network errors
 */
function suppressErrorLogging() {
  if (!isSuppressingErrors && !originalConsoleError) {
    isSuppressingErrors = true
    originalConsoleError = console.error
    console.error = (...args: any[]) => {
      // Check if any argument is a network error
      const hasNetworkError = args.some(arg => 
        arg && (isNetworkError(arg) || 
        (typeof arg === 'string' && (
          arg.toLowerCase().includes('network') ||
          arg.toLowerCase().includes('fetch') ||
          arg.toLowerCase().includes('timeout') ||
          arg.toLowerCase().includes('connection') ||
          arg.toLowerCase().includes('offline') ||
          arg.toLowerCase().includes('internet') ||
          arg.toLowerCase().includes('failed') ||
          arg.toLowerCase().includes('networkerror')
        )))
      )
      
      // Only suppress network-related errors
      if (!hasNetworkError && originalConsoleError) {
        originalConsoleError(...args)
      }
    }
  }
}

/**
 * Restore console.error
 */
function restoreErrorLogging() {
  if (isSuppressingErrors && originalConsoleError) {
    isSuppressingErrors = false
    console.error = originalConsoleError
    originalConsoleError = null
  }
}

/**
 * Show network error alert with retry button
 */
export function showNetworkErrorAlert(onRetry?: () => void) {
  if (showAlert) return // Prevent multiple alerts
  showAlert = true
  
  // Suppress error logging when showing alert
  suppressErrorLogging()
  
  Alert.alert(
    'No Internet Connection',
    'You need to be connected to the internet to use Hubble!',
    [
      {
        text: 'Retry',
        onPress: async () => {
          showAlert = false
          const connected = await checkNetworkConnection()
          if (connected) {
            // Connected, restore error logging
            restoreErrorLogging()
            if (onRetry) {
              onRetry()
            }
          } else {
            // Still offline, show alert again after a delay
            setTimeout(() => {
              showAlert = false
              showNetworkErrorAlert(onRetry)
            }, 1000)
          }
        },
      },
    ],
    { cancelable: true, onDismiss: () => {
      showAlert = false
      // Restore error logging after a delay to let any pending errors finish
      setTimeout(() => {
        restoreErrorLogging()
      }, 500)
    }}
  )
}

/**
 * Wrap async functions to handle network errors gracefully
 */
export async function withNetworkErrorHandling<T>(
  fn: () => Promise<T>,
  onRetry?: () => void,
  suppressErrors: boolean = true
): Promise<T | null> {
  try {
    // Check network before executing
    const connected = await checkNetworkConnection()
    if (!connected) {
      if (suppressErrors) {
        // Suppress console.error when offline
        const originalConsoleError = console.error
        console.error = () => {} // Suppress errors temporarily
        showNetworkErrorAlert(onRetry)
        // Restore console.error after a delay
        setTimeout(() => {
          console.error = originalConsoleError
        }, 100)
      } else {
        showNetworkErrorAlert(onRetry)
      }
      return null
    }
    
    return await fn()
  } catch (error: any) {
    // Check if it's a network error
    if (isNetworkError(error)) {
      if (suppressErrors) {
        // Suppress console.error when offline
        const originalConsoleError = console.error
        console.error = () => {} // Suppress errors temporarily
        showNetworkErrorAlert(onRetry)
        // Restore console.error after a delay
        setTimeout(() => {
          console.error = originalConsoleError
        }, 100)
      } else {
        showNetworkErrorAlert(onRetry)
      }
      return null
    }
    
    // Re-throw non-network errors
    throw error
  }
}

/**
 * Get current online status (cached)
 */
export function getIsOnline(): boolean {
  return isOnline
}

/**
 * Set online status (for manual updates)
 */
export function setIsOnline(status: boolean) {
  isOnline = status
}

