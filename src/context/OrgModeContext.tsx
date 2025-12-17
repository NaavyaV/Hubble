import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabase'

export interface Organization {
  id: string
  name: string
  icon: string | null
  type: 'Greek Life' | 'Student Organization'
  description: string | null
  owner_id: string
  college_id: string | null
  created_at: string
  updated_at: string
}

interface OrgModeContextType {
  isOrgMode: boolean
  currentOrg: Organization | null
  setOrgMode: (org: Organization | null) => void
  exitOrgMode: () => void
  loading: boolean
  targetTab: string | null
  setTargetTab: (tab: string | null) => void
}

// Create a default context value to prevent undefined errors
const defaultContextValue: OrgModeContextType = {
  isOrgMode: false,
  currentOrg: null,
  setOrgMode: async () => {},
  exitOrgMode: async () => {},
  loading: true,
  targetTab: null,
  setTargetTab: () => {}
}

const OrgModeContext = createContext<OrgModeContextType>(defaultContextValue)

const ORG_MODE_STORAGE_KEY = '@org_mode'
const CURRENT_ORG_STORAGE_KEY = '@current_org'

export const OrgModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOrgMode, setIsOrgMode] = useState(false)
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetTab, setTargetTab] = useState<string | null>(null)

  // Load saved org mode from storage
  useEffect(() => {
    const loadOrgMode = async () => {
      try {
        const savedOrgMode = await AsyncStorage.getItem(ORG_MODE_STORAGE_KEY)
        const savedOrg = await AsyncStorage.getItem(CURRENT_ORG_STORAGE_KEY)
        
        if (savedOrgMode === 'true' && savedOrg) {
          const org = JSON.parse(savedOrg)
          // Verify the org still exists and user still owns it
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('org_ownership_id')
              .eq('id', user.id)
              .single()
            
            if (profile?.org_ownership_id === org.id) {
              const { data: orgData } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', org.id)
                .single()
              
              if (orgData) {
                setCurrentOrg(orgData as Organization)
                setIsOrgMode(true)
              } else {
                // Org doesn't exist, clear org mode
                await AsyncStorage.removeItem(ORG_MODE_STORAGE_KEY)
                await AsyncStorage.removeItem(CURRENT_ORG_STORAGE_KEY)
              }
            } else {
              // User no longer owns this org, clear org mode
              await AsyncStorage.removeItem(ORG_MODE_STORAGE_KEY)
              await AsyncStorage.removeItem(CURRENT_ORG_STORAGE_KEY)
            }
          }
        }
      } catch (error) {
        console.error('Error loading org mode:', error)
      } finally {
        setLoading(false)
      }
    }
    loadOrgMode()
  }, [])

  const setOrgMode = useCallback(async (org: Organization | null) => {
    try {
      if (org) {
        await AsyncStorage.setItem(ORG_MODE_STORAGE_KEY, 'true')
        await AsyncStorage.setItem(CURRENT_ORG_STORAGE_KEY, JSON.stringify(org))
        setCurrentOrg(org)
        setIsOrgMode(true)
      } else {
        await AsyncStorage.removeItem(ORG_MODE_STORAGE_KEY)
        await AsyncStorage.removeItem(CURRENT_ORG_STORAGE_KEY)
        setCurrentOrg(null)
        setIsOrgMode(false)
      }
    } catch (error) {
      console.error('Error saving org mode:', error)
    }
  }, [])

  const exitOrgMode = useCallback(async () => {
    await setOrgMode(null)
  }, [setOrgMode])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<OrgModeContextType>(() => ({
    isOrgMode,
    currentOrg,
    setOrgMode,
    exitOrgMode,
    loading,
    targetTab,
    setTargetTab
  }), [isOrgMode, currentOrg, setOrgMode, exitOrgMode, loading, targetTab])

  return (
    <OrgModeContext.Provider value={contextValue}>
      {children}
    </OrgModeContext.Provider>
  )
}

export const useOrgMode = (): OrgModeContextType => {
  const context = useContext(OrgModeContext)
  // Context should always have a value (either default or from provider)
  return context
}

