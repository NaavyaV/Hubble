import React, { useEffect } from 'react'
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { OrgModeProvider } from './src/context/OrgModeContext'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import RootNavigator from './src/navigation/RootNavigator'
import { runImageCacheMaintenance } from './src/utils/imageCache'

let Updates: typeof import('expo-updates') | null = null
try {
  const m = require('expo-updates')
  if (m && typeof m.isEnabled !== 'undefined') Updates = m
} catch {
  Updates = null
}

function AppGate() {
  const { isReady } = useAuth()
  const { theme } = useTheme()

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={[styles.bootContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.bootTitle, { color: theme.text }]}>Hubble</Text>
          <ActivityIndicator size="large" color={theme.primary} style={styles.bootSpinner} />
          <Text style={[styles.bootSubtitle, { color: theme.textSecondary }]}>Starting up…</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  bootTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  bootSpinner: {
    marginBottom: 16,
  },
  bootSubtitle: {
    fontSize: 15,
    fontWeight: '500',
  },
})

export default function App() {
  useEffect(() => {
    try {
      const src = require('./assets/splash-icon.png')
      const resolved = Image.resolveAssetSource(src)
      if (resolved?.uri) Image.prefetch(resolved.uri)
    } catch {}
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (__DEV__ || !Updates?.isEnabled || !Updates?.checkForUpdateAsync) return
        const update = await Updates.checkForUpdateAsync()
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
        }
      } catch {}
    }, 10_000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const start = setTimeout(() => {
      runImageCacheMaintenance().catch(() => {})
    }, 3000)
    const interval = setInterval(() => {
      runImageCacheMaintenance().catch(() => {})
    }, 6 * 60 * 60 * 1000)
    return () => {
      clearTimeout(start)
      clearInterval(interval)
    }
  }, [])

  return (
    <ThemeProvider>
      <OrgModeProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
      </OrgModeProvider>
    </ThemeProvider>
  )
}
