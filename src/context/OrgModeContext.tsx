import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'

export interface Organization {
  id: string
  name: string
  icon: string | null
  type: 'Greek Life' | 'Student Organization'
  description: string | null
  owner_id: string | null
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

  // Phase 1: Restore from local cache immediately (no network).
  // Phase 2: Background-verify ownership (deferred, non-blocking).
  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      try {
        const [savedOrgMode, savedOrg] = await Promise.all([
          AsyncStorage.getItem(ORG_MODE_STORAGE_KEY),
          AsyncStorage.getItem(CURRENT_ORG_STORAGE_KEY),
        ])

        if (savedOrgMode === 'true' && savedOrg) {
          const org = JSON.parse(savedOrg) as Organization
          if (!cancelled) {
            setCurrentOrg(org)
            setIsOrgMode(true)
          }

          // Background ownership verification — don't block loading
          verifyOwnership(org.id).catch(() => {})
        }
      } catch {
        // Corrupted storage — reset silently
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    restore()
    return () => { cancelled = true }
  }, [])

  const verifyOwnership = useCallback(async (orgId: string) => {
    try {
      const user = await getCachedUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_ownership_id')
        .eq('id', user.id)
        .single()

      if (profile?.org_ownership_id !== orgId) {
        await AsyncStorage.multiRemove([ORG_MODE_STORAGE_KEY, CURRENT_ORG_STORAGE_KEY])
        setCurrentOrg(null)
        setIsOrgMode(false)
        return
      }

      const { data: freshOrg } = await supabase
        .from('organizations')
        .select('id, name, icon, type, description, owner_id, college_id, created_at, updated_at')
        .eq('id', orgId)
        .single()

      if (freshOrg) {
        setCurrentOrg(freshOrg as Organization)
      } else {
        await AsyncStorage.multiRemove([ORG_MODE_STORAGE_KEY, CURRENT_ORG_STORAGE_KEY])
        setCurrentOrg(null)
        setIsOrgMode(false)
      }
    } catch {
      // Network failure — keep local cache, will verify next launch
    }
  }, [])

  const setOrgMode = useCallback(async (org: Organization | null) => {
    try {
      if (org) {
        await AsyncStorage.setItem(ORG_MODE_STORAGE_KEY, 'true')
        await AsyncStorage.setItem(CURRENT_ORG_STORAGE_KEY, JSON.stringify(org))
        setCurrentOrg(org)
        setIsOrgMode(true)
      } else {
        await AsyncStorage.multiRemove([ORG_MODE_STORAGE_KEY, CURRENT_ORG_STORAGE_KEY])
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
  return useContext(OrgModeContext)
}
