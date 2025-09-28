import React, { createContext, useContext, useEffect, useState } from 'react'
import { Appearance, ColorSchemeName } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeColors {
  // Background colors
  background: string
  surface: string
  card: string
  
  // Text colors
  text: string
  textSecondary: string
  textTertiary: string
  
  // Primary colors
  primary: string
  primaryLight: string
  primaryDark: string
  
  // Accent colors
  accent: string
  success: string
  warning: string
  error: string
  
  // Border and divider colors
  border: string
  divider: string
  
  // Status colors
  online: string
  offline: string
  
  // Shadow colors
  shadow: string
  
  // Tab bar colors
  tabBarBackground: string
  tabBarBorder: string
  tabBarActive: string
  tabBarInactive: string
  
  // Header colors
  headerBackground: string
  headerBorder: string
  headerText: string
  
  // Modal colors
  modalBackground: string
  modalOverlay: string
  
  // Button colors
  buttonPrimary: string
  buttonSecondary: string
  buttonText: string
  buttonTextSecondary: string
  
  // Input colors
  inputBackground: string
  inputBorder: string
  inputText: string
  inputPlaceholder: string
}

const lightTheme: ThemeColors = {
  // Background colors
  background: '#f8f9fa',
  surface: '#ffffff',
  card: '#ffffff',
  
  // Text colors
  text: '#2c3e50',
  textSecondary: '#7f8c8d',
  textTertiary: '#bdc3c7',
  
  // Primary colors
  primary: '#3498db',
  primaryLight: '#5dade2',
  primaryDark: '#2980b9',
  
  // Accent colors
  accent: '#e74c3c',
  success: '#27ae60',
  warning: '#f39c12',
  error: '#e74c3c',
  
  // Border and divider colors
  border: '#e1e8ed',
  divider: '#f8f9fa',
  
  // Status colors
  online: '#27ae60',
  offline: '#95a5a6',
  
  // Shadow colors
  shadow: '#000000',
  
  // Tab bar colors
  tabBarBackground: '#ffffff',
  tabBarBorder: '#e1e8ed',
  tabBarActive: '#3498db',
  tabBarInactive: '#7f8c8d',
  
  // Header colors
  headerBackground: '#ffffff',
  headerBorder: '#e1e8ed',
  headerText: '#2c3e50',
  
  // Modal colors
  modalBackground: '#ffffff',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',
  
  // Button colors
  buttonPrimary: '#3498db',
  buttonSecondary: '#f8f9fa',
  buttonText: '#ffffff',
  buttonTextSecondary: '#2c3e50',
  
  // Input colors
  inputBackground: '#ffffff',
  inputBorder: '#e1e8ed',
  inputText: '#2c3e50',
  inputPlaceholder: '#7f8c8d',
}

const darkTheme: ThemeColors = {
  // Background colors
  background: '#121212',
  surface: '#1e1e1e',
  card: '#2d2d2d',
  
  // Text colors
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  textTertiary: '#666666',
  
  // Primary colors
  primary: '#64b5f6',
  primaryLight: '#90caf9',
  primaryDark: '#1976d2',
  
  // Accent colors
  accent: '#ff5722',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  
  // Border and divider colors
  border: '#333333',
  divider: '#2d2d2d',
  
  // Status colors
  online: '#4caf50',
  offline: '#666666',
  
  // Shadow colors
  shadow: '#000000',
  
  // Tab bar colors
  tabBarBackground: '#1e1e1e',
  tabBarBorder: '#333333',
  tabBarActive: '#64b5f6',
  tabBarInactive: '#666666',
  
  // Header colors
  headerBackground: '#1e1e1e',
  headerBorder: '#333333',
  headerText: '#ffffff',
  
  // Modal colors
  modalBackground: '#2d2d2d',
  modalOverlay: 'rgba(0, 0, 0, 0.7)',
  
  // Button colors
  buttonPrimary: '#64b5f6',
  buttonSecondary: '#333333',
  buttonText: '#ffffff',
  buttonTextSecondary: '#ffffff',
  
  // Input colors
  inputBackground: '#2d2d2d',
  inputBorder: '#333333',
  inputText: '#ffffff',
  inputPlaceholder: '#666666',
}

interface ThemeContextType {
  theme: ThemeColors
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = '@theme_mode'

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system')
  const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>('light')

  // Load saved theme mode from storage
  useEffect(() => {
    const loadThemeMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY)
        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          setThemeModeState(savedMode as ThemeMode)
        }
      } catch (error) {
        console.error('Error loading theme mode:', error)
      }
    }
    loadThemeMode()
  }, [])

  // Listen to system color scheme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(colorScheme)
    })

    // Set initial system color scheme
    setSystemColorScheme(Appearance.getColorScheme())

    return () => subscription?.remove()
  }, [])

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode)
      setThemeModeState(mode)
    } catch (error) {
      console.error('Error saving theme mode:', error)
    }
  }

  // Determine if we should use dark theme
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark')
  const theme = isDark ? darkTheme : lightTheme

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
