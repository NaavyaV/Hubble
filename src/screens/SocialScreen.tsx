import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, SectionList, Alert, Modal, RefreshControl, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { safeFriendshipOrQuery, safeFriendshipUserOrQuery } from '../utils/queryHelpers'
import { ProfileModal, ImageWithFallback, OrgDetailModal, FriendCard, OrganizationCard } from '../components'
import ReportModal, { ReportReason } from '../components/modals/ReportModal'
import { useTheme } from '../context/ThemeContext'
import { Organization } from '../context/OrgModeContext'
import { setNetworkRestoredCallback } from '../utils/networkUtils'
import { sectionHeaderLargeStyle } from '../constants/sectionTypography'

interface ProfileRow {
  id: string
  full_name?: string
  avatar_url?: string
  phone_number?: string
  major?: string
  graduating_year?: string
  bio?: string
}

interface FriendshipRow {
  id: string
  user_id: string
  friend_id: string
  status: 'pending' | 'accepted' | 'blocked'
}

type TabType = 'friends' | 'organizations'

export default function SocialScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [me, setMe] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('friends')
  
  // Friends state
  const [allUsers, setAllUsers] = useState<ProfileRow[]>([])
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [incoming, setIncoming] = useState<FriendshipRow[]>([])
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([])
  const [incomingProfiles, setIncomingProfiles] = useState<Record<string, ProfileRow>>({})
  const [outgoingProfiles, setOutgoingProfiles] = useState<Record<string, ProfileRow>>({})
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null)
  const [recentlyAccepted, setRecentlyAccepted] = useState<Set<string>>(new Set())
  const [locallyPendingRequests, setLocallyPendingRequests] = useState<Set<string>>(new Set())
  const [userMenuVisible, setUserMenuVisible] = useState<string | null>(null)
  
  // Organizations state
  const [allOrgs, setAllOrgs] = useState<Organization[]>([])
  const [followedOrgs, setFollowedOrgs] = useState<string[]>([])
  const [orgNotifications, setOrgNotifications] = useState<Record<string, boolean>>({})
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [blockedOrgs, setBlockedOrgs] = useState<Set<string>>(new Set())
  const [blockedOrgsList, setBlockedOrgsList] = useState<Organization[]>([])
  
  // Friends sub-tabs
  const [friendsSubTab, setFriendsSubTab] = useState<'people' | 'pending' | 'friends'>('people')
  
  // Organizations sub-tabs
  const [orgsSubTab, setOrgsSubTab] = useState<'following' | 'all'>('following')
  
  // Track recently followed orgs to keep them visible
  const [recentlyFollowedOrgs, setRecentlyFollowedOrgs] = useState<Set<string>>(new Set())
  
  // Track friend menu popup (for pending requests)
  const [friendMenuVisible, setFriendMenuVisible] = useState<string | null>(null)
  // Track accepted friend menu popup (for friends tab)
  const [acceptedFriendMenuVisible, setAcceptedFriendMenuVisible] = useState<string | null>(null)
  
  // Track organization menu popup
  const [orgMenuVisible, setOrgMenuVisible] = useState<string | null>(null)
  
  // Blocked users state
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())
  
  // Muted users state
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set())
  
  // Blockers state (users who have blocked me)
  const [blockersSet, setBlockersSet] = useState<Set<string>>(new Set())
  
  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportContentType, setReportContentType] = useState<'user' | 'organization' | 'event' | 'event_photo'>('user')
  const [reportContentId, setReportContentId] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const isInitialMount = useRef(true)
  const hasInitialized = useRef(false)
  const previousActiveTab = useRef<TabType | null>(null)
  const friendsSubTabRef = useRef<'people' | 'pending' | 'friends'>('people')
  const friendshipRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const directorySearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDirectoryQueryRef = useRef('')

  useEffect(() => {
    // Don't set a timeout that forces loading to false
    // Let init() handle loading state properly
    init()
  }, [])

  // Server-side directory search (2+ chars); restore capped list when cleared after search.
  useEffect(() => {
    if (!me || activeTab !== 'friends' || friendsSubTab !== 'people') return
    const q = query.trim()
    if (directorySearchDebounceRef.current) {
      clearTimeout(directorySearchDebounceRef.current)
      directorySearchDebounceRef.current = null
    }
    if (q.length >= 2) {
      directorySearchDebounceRef.current = setTimeout(() => {
        directorySearchDebounceRef.current = null
        fetchAllUsers(true, me, q)
      }, 350)
    } else if (prevDirectoryQueryRef.current.length >= 2 && q.length < 2) {
      fetchAllUsers(true, me, '')
    }
    prevDirectoryQueryRef.current = q
    return () => {
      if (directorySearchDebounceRef.current) {
        clearTimeout(directorySearchDebounceRef.current)
        directorySearchDebounceRef.current = null
      }
    }
  }, [query, me, activeTab, friendsSubTab])

  // Set up network restoration callback to refresh when network comes back
  useEffect(() => {
    const handleNetworkRestored = () => {
      if (me && activeTab === 'friends' && !refreshing) {
        // Trigger a refresh when network is restored
        onRefresh()
      }
    }
    
    setNetworkRestoredCallback(handleNetworkRestored)
    
    // Cleanup
    return () => {
      setNetworkRestoredCallback(null)
    }
  }, [me, activeTab, refreshing])

  // Update ref whenever friendsSubTab changes
  useEffect(() => {
    friendsSubTabRef.current = friendsSubTab
    // Clear locally pending requests when switching to People tab
    // This ensures fresh state when opening/visiting the People tab
    if (friendsSubTab === 'people') {
      setLocallyPendingRequests(new Set())
    }
  }, [friendsSubTab])

  useFocusEffect(
    React.useCallback(() => {
      if (!me || !hasInitialized.current) return
      
      // Clear locally pending requests when leaving friends tab (switching to organizations)
      if (previousActiveTab.current === 'friends' && activeTab === 'organizations') {
        setLocallyPendingRequests(new Set())
      }
      
      // Initial fetch - always fetch all data
      if (activeTab === 'friends') {
        // CRITICAL: Fetch blockers FIRST and wait before fetching users
        // This ensures blockers are filtered out from all queries
        (async () => {
          const blockers = await fetchBlockersForUser(me)
          setBlockersSet(blockers)
          // Now fetch users (which will fetch fresh blockers anyway)
          fetchAllUsers(true)
        })().catch(err => {
          console.error('Error fetching blockers in focus effect:', err)
          // Still fetch users even if blockers fetch fails
          fetchAllUsers(true)
        })
        
        fetchFriendships(me)
        fetchBlockedUsers()
        fetchMutedUsers()
      } else {
        fetchOrganizations()
        fetchFollowedOrgs()
        fetchBlockedOrgs()
        // Clear recently followed orgs when switching tabs to apply proper filtering
        setRecentlyFollowedOrgs(new Set())
      }
      
      // Update previous tab
      previousActiveTab.current = activeTab
      
      // No polling; realtime + focus + pull-to-refresh provide fresh data
      // Set up real-time subscription for friendships changes - always update
      // Only subscribe to tables in supabase_realtime publication:
      // friendships is published; profiles, organizations, org_followers,
      // user_blocks, user_mutes, org_blocks are NOT — those refresh on focus
      // and pull-to-refresh only.
      const scheduleFriendshipRefresh = () => {
        if (activeTab !== 'friends' || !me) return
        if (friendshipRealtimeDebounceRef.current) {
          clearTimeout(friendshipRealtimeDebounceRef.current)
        }
        friendshipRealtimeDebounceRef.current = setTimeout(() => {
          friendshipRealtimeDebounceRef.current = null
          fetchFriendships(me)
        }, 450)
      }

      const channel = supabase
        .channel('social-friendships-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `user_id=eq.${me}`
          },
          scheduleFriendshipRefresh
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `friend_id=eq.${me}`
          },
          scheduleFriendshipRefresh
        )
        .subscribe()

      return () => {
        if (friendshipRealtimeDebounceRef.current) {
          clearTimeout(friendshipRealtimeDebounceRef.current)
          friendshipRealtimeDebounceRef.current = null
        }
        supabase.removeChannel(channel)
      }
    }, [me, activeTab])
  )

  const init = async () => {
    try {
      setLoading(true) // Ensure loading is true at start
      
      const user = await getCachedUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Set me immediately and wait a tick for state to update
      setMe(user.id)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // CRITICAL: Fetch blockers FIRST and wait for it to complete
      // This ensures blockers are filtered out from all queries
      // Pass user.id directly to avoid state timing issues
      const blockers = await fetchBlockersForUser(user.id)
      setBlockersSet(blockers)
      
      // Now fetch all data in parallel, but blockers are already set
      // Pass user.id directly to avoid state timing issues
      await Promise.all([
        fetchAllUsers(true, user.id), // Pass user.id directly to avoid state timing
        fetchFriendships(user.id),
        fetchOrganizations(),
        fetchFollowedOrgs(),
        fetchBlockedUsers(),
        fetchMutedUsers()
      ])
      
      hasInitialized.current = true
    } catch (error) {
      console.error('Error initializing SocialScreen:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Helper function that accepts user ID directly to avoid state timing issues
  const fetchBlockersForUser = async (userId: string): Promise<Set<string>> => {
    try {
      if (!userId) {
        return new Set()
      }
      
      // Get users who have blocked this user (user is the blocked_id)
      // This is CRITICAL: If Person A blocked Person B, Person B should not see Person A
      // Query: Find rows where blocked_id = userId, return blocker_id (the person who blocked this user)
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocker_id')
        .eq('blocked_id', userId)

      if (error) {
        console.error('Error fetching blockers:', error)
        return new Set()
      }
      
      const blockersSet = new Set<string>()
      if (data && Array.isArray(data)) {
        data.forEach((b: any) => {
          if (b && b.blocker_id) {
            blockersSet.add(b.blocker_id)
          }
        })
      }
      
      if (__DEV__ && blockersSet.size > 0) {
        console.log(`[BLOCKERS] Found ${blockersSet.size} blocker(s) for user ${userId}`)
      }
      
      return blockersSet
    } catch (error) {
      console.error('Exception fetching blockers:', error)
      return new Set()
    }
  }

  const fetchAllUsers = async (
    forceRefreshBlockers = false,
    userId?: string,
    directorySearch = '',
  ) => {
    try {
      // Use provided userId or fall back to me state
      const targetUserId = userId || me
      if (!targetUserId) {
        if (__DEV__) {
          console.log('[FETCH USERS] No user ID available, skipping')
        }
        return
      }
      
      // Always fetch fresh blockers to ensure we have the latest data
      // This is especially important after unblocking
      const blockers = await fetchBlockersForUser(targetUserId)
      setBlockersSet(blockers)
      
      const search = directorySearch.trim()
      const escaped = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
      let profileQuery = supabase
        .from('profiles')
        .select(`id, full_name, username, avatar_url, phone_number, major, graduating_year, bio`)
        .eq('otp_verified', true)
        .order('full_name')

      if (search.length >= 2) {
        profileQuery = profileQuery.or(
          `full_name.ilike.%${escaped}%,username.ilike.%${escaped}%`,
        )
        profileQuery = profileQuery.limit(60)
      } else {
        profileQuery = profileQuery.limit(150)
      }

      const { data, error } = await profileQuery

      if (error) {
        console.error('Error fetching users:', error)
        setAllUsers([])
        return
      }
      
      // CRITICAL: Filter out users who have blocked me (blockers)
      // This is MANDATORY - RLS might fail, so we MUST filter client-side
      // If Person A blocked Person B, Person B should not see Person A
      const filteredUsers = (data || []).filter(user => !blockers.has(user.id))
      
      if (__DEV__) {
        console.log(`[FETCH USERS] Fetched ${filteredUsers.length} users (${data?.length || 0} total, ${blockers.size} blockers filtered)`)
      }
      
      setAllUsers(filteredUsers)
    } catch (error) {
      console.error('Error fetching users:', error)
      setAllUsers([])
    }
  }

  const fetchFriendships = async (userId: string) => {
    try {
      // First, get users who have blocked me (blockers)
      const blockers = await fetchBlockers()
      
      // OPTIMIZED: Fetch friendships with profile data in a single query using joins
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          user_id,
          friend_id,
          status,
          user:profiles!friendships_user_id_fkey(
            id,
            full_name,
            avatar_url,
            phone_number,
            major,
            graduating_year,
            bio
          ),
          friend:profiles!friendships_friend_id_fkey(
            id,
            full_name,
            avatar_url,
            phone_number,
            major,
            graduating_year,
            bio
          )
        `)
        .or(safeFriendshipUserOrQuery(userId))

      if (error) throw error

      // Filter out friendships where the other user has blocked me
      const friendshipsData = (data || []).filter(f => {
        const otherUserId = f.user_id === userId ? f.friend_id : f.user_id
        return !blockers.has(otherUserId)
      })
      
      setFriendships(friendshipsData)

      // Filter out pending requests where the other user has blocked me
      const incomingRequests = friendshipsData.filter(
        f => f.friend_id === userId && f.status === 'pending' && !blockers.has(f.user_id)
      )
      const outgoingRequests = friendshipsData.filter(
        f => f.user_id === userId && f.status === 'pending' && !blockers.has(f.friend_id)
      )
      
      setIncoming(incomingRequests)
      setOutgoing(outgoingRequests)

      // Build profile maps from already-fetched data
      const incomingMap: Record<string, ProfileRow> = {}
      const outgoingMap: Record<string, ProfileRow> = {}
      
      incomingRequests.forEach(f => {
        const row = f.user as ProfileRow | ProfileRow[] | null | undefined
        const profile = Array.isArray(row) ? row[0] : row
        if (profile?.id) {
          incomingMap[f.user_id] = profile
        }
      })
      
      outgoingRequests.forEach(f => {
        const row = f.friend as ProfileRow | ProfileRow[] | null | undefined
        const profile = Array.isArray(row) ? row[0] : row
        if (profile?.id) {
          outgoingMap[f.friend_id] = profile
        }
      })
      
      setIncomingProfiles(incomingMap)
      setOutgoingProfiles(outgoingMap)
    } catch (error) {
      console.error('Error fetching friendships:', error)
      setFriendships([])
      setIncoming([])
      setOutgoing([])
      setIncomingProfiles({})
      setOutgoingProfiles({})
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      if (!me) {
        setRefreshing(false)
        return
      }
      
      // Check network connection before attempting refresh
      const { checkNetworkConnection } = await import('../utils/networkUtils')
      const connected = await checkNetworkConnection()
      if (!connected) {
        // Network not available, let the global handler show the alert
        setRefreshing(false)
        return
      }
      
      if (activeTab === 'friends') {
        // CRITICAL: Refresh blockers FIRST before fetching users
        // This ensures unblocked users appear immediately after refresh
        const blockers = await fetchBlockersForUser(me)
        setBlockersSet(blockers)
        
        // Clear locally pending requests first to ensure fresh state
        if (friendsSubTab === 'people') {
          setLocallyPendingRequests(new Set())
        }
        
        // Force refresh all data - use Promise.allSettled to ensure all complete even if some fail
        await Promise.allSettled([
          fetchAllUsers(true), // Force refresh with fresh blockers
          fetchFriendships(me),
          fetchBlockedUsers(),
          fetchMutedUsers()
        ])
      } else {
        await Promise.allSettled([
          fetchOrganizations(),
          fetchFollowedOrgs()
        ])
        setRecentlyFollowedOrgs(new Set())
      }
    } catch (error) {
      // Only log non-network errors
      const { isNetworkError } = await import('../utils/networkUtils')
      if (!isNetworkError(error)) {
        console.error('Error refreshing:', error)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const fetchOrganizations = async () => {
    try {
      if (!me) return
      
      // Fetch blocked orgs first
      const { data: blockedData } = await supabase
        .from('org_blocks')
        .select('org_id')
        .eq('user_id', me)
      
      const blockedOrgIds = new Set((blockedData || []).map((b: any) => b.org_id))
      setBlockedOrgs(blockedOrgIds)
      
      // Fetch all organizations
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, icon, type, description, owner_id, college_id, created_at, updated_at')
        .order('name')

      if (error) throw error
      
      // Filter out blocked orgs from main list
      const filteredOrgs = (data || []).filter(org => !blockedOrgIds.has(org.id))
      setAllOrgs(filteredOrgs)
      
      // Store blocked orgs separately
      const blockedOrgsData = (data || []).filter(org => blockedOrgIds.has(org.id))
      setBlockedOrgsList(blockedOrgsData)
    } catch (error) {
      console.error('Error fetching organizations:', error)
      setAllOrgs([])
      setBlockedOrgsList([])
    }
  }

  const fetchFollowedOrgs = async () => {
    try {
      if (!me) return
      
      const { data, error } = await supabase
        .from('org_followers')
        .select('org_id, notification_enabled')
        .eq('user_id', me)

      if (error) throw error

      const followedList: string[] = []
      const notificationsMap: Record<string, boolean> = {}
      
      if (data && Array.isArray(data)) {
        data.forEach((f: any) => {
          if (f && f.org_id) {
            followedList.push(f.org_id)
            notificationsMap[f.org_id] = f.notification_enabled !== false
          }
        })
      }
      
      setFollowedOrgs(followedList)
      setOrgNotifications(notificationsMap)
    } catch (error) {
      console.error('Error fetching followed orgs:', error)
    }
  }

  const fetchBlockedOrgs = async () => {
    try {
      if (!me) return
      
      const { data, error } = await supabase
        .from('org_blocks')
        .select('org_id')
        .eq('user_id', me)

      if (error) throw error

      const blockedSet = new Set<string>()
      if (data && Array.isArray(data)) {
        data.forEach((b: any) => {
          if (b && b.org_id) {
            blockedSet.add(b.org_id)
          }
        })
      }
      
      setBlockedOrgs(blockedSet)
    } catch (error) {
      console.error('Error fetching blocked orgs:', error)
    }
  }

  const handleOrgPress = (org: Organization) => {
    setSelectedOrg(org)
  }

  const handleFollowOrg = async (orgId: string) => {
    try {
      if (!me) return

      // Prevent following blocked orgs
      if (blockedOrgs.has(orgId)) {
        Alert.alert('Error', 'Cannot follow a blocked organization')
        return
      }

      const { error } = await supabase
        .from('org_followers')
        .insert({
          user_id: me,
          org_id: orgId,
          notification_enabled: true
        })

      if (error) throw error

      setFollowedOrgs(prev => [...prev, orgId])
      setOrgNotifications(prev => ({ ...prev, [orgId]: true }))
      // Track recently followed org to keep it visible
      setRecentlyFollowedOrgs(prev => new Set([...prev, orgId]))
    } catch (error) {
      console.error('Error following org:', error)
      Alert.alert('Error', 'Failed to follow organization')
    }
  }

  const handleUnfollowOrg = async (orgId: string) => {
    try {
      if (!me) return

      Alert.alert(
        'Unfollow Organization',
        'Are you sure you want to unfollow this organization?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unfollow',
            style: 'destructive',
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('org_followers')
                  .delete()
                  .eq('user_id', me)
                  .eq('org_id', orgId)

                if (error) throw error

                setFollowedOrgs(prev => prev.filter(id => id !== orgId))
                
                const newNotifications = { ...orgNotifications }
                delete newNotifications[orgId]
                setOrgNotifications(newNotifications)
                
                // Remove from recently followed if present
                setRecentlyFollowedOrgs(prev => {
                  const next = new Set(prev)
                  next.delete(orgId)
                  return next
                })
              } catch (error) {
                console.error('Error unfollowing org:', error)
                Alert.alert('Error', 'Failed to unfollow organization')
              }
            }
          }
        ]
      )
    } catch (error) {
      console.error('Error showing unfollow confirmation:', error)
    }
  }

  const handleBlockOrg = async (orgId: string) => {
    try {
      if (!me) return

      // Insert into org_blocks
      const { error: blockError } = await supabase
        .from('org_blocks')
        .insert({
          user_id: me,
          org_id: orgId
        })

      if (blockError) throw blockError

      // Auto-unfollow org
      const { error: unfollowError } = await supabase
        .from('org_followers')
        .delete()
        .eq('user_id', me)
        .eq('org_id', orgId)

      if (unfollowError) {
        console.error('Error unfollowing org:', unfollowError)
        // Continue even if unfollow fails
      }

      // Update UI state
      setBlockedOrgs(prev => new Set([...prev, orgId]))
      setFollowedOrgs(prev => prev.filter(id => id !== orgId))
      
      const newNotifications = { ...orgNotifications }
      delete newNotifications[orgId]
      setOrgNotifications(newNotifications)
      
      // Fetch the blocked org to add to blockedOrgsList
      const { data: blockedOrg } = await supabase
        .from('organizations')
        .select('id, name, icon, type, description, owner_id, college_id, created_at, updated_at')
        .eq('id', orgId)
        .single()
      
      if (blockedOrg) {
        setBlockedOrgsList(prev => [...prev, blockedOrg as Organization])
        // Remove from allOrgs if present
        setAllOrgs(prev => prev.filter(org => org.id !== orgId))
      }
      
      // Auto-unattend from all events hosted by this org
      const { data: orgEvents } = await supabase
        .from('org_events')
        .select('id')
        .eq('org_id', orgId)

      if (orgEvents && orgEvents.length > 0) {
        const eventIds = orgEvents.map(e => e.id)
        
        // Remove attendance from org events
        const { error: unattendError } = await supabase
          .from('org_event_attendees')
          .delete()
          .eq('user_id', me)
          .in('event_id', eventIds)

        if (unattendError) {
          console.error('Error unattending from org events:', unattendError)
        }

        // Remove notification reminders for these events
        // Note: This would require a separate query to notification_queue
        // For now, we'll just log it - the reminders will be filtered out when processed
        console.log(`Removed attendance from ${eventIds.length} org events`)
      }

      setOrgMenuVisible(null)
      
      const unattendedCount = orgEvents?.length || 0
      if (unattendedCount > 0) {
        Alert.alert(
          'Organization Blocked',
          `You have been removed from ${unattendedCount} event${unattendedCount > 1 ? 's' : ''} hosted by this organization.`,
          [{ text: 'OK' }]
        )
      } else {
        Alert.alert('Success', 'Organization blocked successfully')
      }
    } catch (error) {
      console.error('Error blocking org:', error)
      Alert.alert('Error', 'Failed to block organization')
    }
  }

  const handleUnblockOrg = async (orgId: string) => {
    try {
      if (!me) return

      Alert.alert(
        'Unblock Organization',
        'Are you sure you want to unblock this organization? You will be able to see their events and content again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            style: 'default',
            onPress: async () => {
              const { error } = await supabase
                .from('org_blocks')
                .delete()
                .eq('user_id', me)
                .eq('org_id', orgId)

              if (error) throw error

              // Update UI state
              setBlockedOrgs(prev => {
                const next = new Set(prev)
                next.delete(orgId)
                return next
              })
              
              // Move org from blockedOrgsList back to allOrgs
              const unblockedOrg = blockedOrgsList.find(org => org.id === orgId)
              if (unblockedOrg) {
                setBlockedOrgsList(prev => prev.filter(org => org.id !== orgId))
                setAllOrgs(prev => [...prev, unblockedOrg].sort((a, b) => a.name.localeCompare(b.name)))
              }
              
              Alert.alert('Success', 'Organization unblocked successfully')
            }
          }
        ]
      )
    } catch (error) {
      console.error('Error unblocking org:', error)
      Alert.alert('Error', 'Failed to unblock organization')
    }
  }

  const fetchBlockedUsers = async () => {
    try {
      if (!me) return
      
      // Get users I have blocked
      const { data: blockedData, error: blockedError } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', me)

      if (blockedError) throw blockedError

      const blockedSet = new Set<string>()
      if (blockedData && Array.isArray(blockedData)) {
        blockedData.forEach((b: any) => {
          if (b && b.blocked_id) {
            blockedSet.add(b.blocked_id)
          }
        })
      }
      
      setBlockedUsers(blockedSet)
    } catch (error) {
      console.error('Error fetching blocked users:', error)
    }
  }

  // Fetch users who have blocked the current user (blockers)
  const fetchBlockers = async (): Promise<Set<string>> => {
    // Use me from state, or fall back to fetching current user
    if (!me) {
      const user = await getCachedUser()
      if (!user) {
        console.warn('[BLOCKERS] ⚠️ No user ID available, returning empty set')
        return new Set()
      }
      return fetchBlockersForUser(user.id)
    }
    return fetchBlockersForUser(me)
  }

  const handleBlockUser = async (userId: string) => {
    try {
      if (!me) return

      // Create ONE-WAY block only (blocker blocks blocked, but blocked doesn't know)
      const { error: blockError } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: me, blocked_id: userId })

      if (blockError) throw blockError

      // Remove any reverse block entries if they exist
      await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', me)

      // Auto-unfriend: Delete/update friendships where status = 'accepted'
      const { error: unfriendError } = await supabase
        .from('friendships')
        .delete()
        .or(safeFriendshipOrQuery(me, userId))
        .eq('status', 'accepted')

      if (unfriendError) {
        console.error('Error unfriending user:', unfriendError)
      }

      // Cancel pending requests
      const { error: cancelError } = await supabase
        .from('friendships')
        .delete()
        .or(safeFriendshipOrQuery(me, userId))
        .eq('status', 'pending')

      if (cancelError) {
        console.error('Error cancelling pending requests:', cancelError)
      }

      // Update UI state
      setBlockedUsers(prev => new Set([...prev, userId]))
      
      // Remove from friendships state
      setFriendships(prev => prev.filter(f => 
        !((f.user_id === me && f.friend_id === userId) || (f.user_id === userId && f.friend_id === me))
      ))
      
      // Auto-unattend from all events hosted by this user
      const { data: userEvents } = await supabase
        .from('events')
        .select('id')
        .eq('host_id', userId)

      if (userEvents && userEvents.length > 0) {
        const eventIds = userEvents.map(e => e.id)
        
        // Remove attendance from user events
        const { error: unattendError } = await supabase
          .from('event_attendees')
          .delete()
          .eq('user_id', me)
          .in('event_id', eventIds)

        if (unattendError) {
          console.error('Error unattending from user events:', unattendError)
        }

        console.log(`Removed attendance from ${eventIds.length} user events`)
      }

      setUserMenuVisible(null)
      setFriendMenuVisible(null)
      
      const unattendedCount = userEvents?.length || 0
      if (unattendedCount > 0) {
        Alert.alert(
          'User Blocked',
          `You have been removed from ${unattendedCount} event${unattendedCount > 1 ? 's' : ''} hosted by this user.`,
          [{ text: 'OK' }]
        )
      } else {
        Alert.alert('Success', 'User blocked successfully')
      }
    } catch (error) {
      console.error('Error blocking user:', error)
      Alert.alert('Error', 'Failed to block user')
    }
  }

  const handleUnblockUser = async (userId: string) => {
    try {
      if (!me) return

      // Delete one-way block (only the block we created)
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', me)
        .eq('blocked_id', userId)

      if (error) throw error

      // Update UI state
      setBlockedUsers(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      
      Alert.alert('Success', 'User unblocked successfully')
    } catch (error) {
      console.error('Error unblocking user:', error)
      Alert.alert('Error', 'Failed to unblock user')
    }
  }

  const fetchMutedUsers = async () => {
    try {
      if (!me) return
      
      const { data, error } = await supabase
        .from('user_mutes')
        .select('muted_id')
        .eq('muter_id', me)

      if (error) throw error

      const mutedSet = new Set<string>()
      if (data) {
        data.forEach((m: any) => {
          if (m && m.muted_id) {
            mutedSet.add(m.muted_id)
          }
        })
      }
      
      setMutedUsers(mutedSet)
    } catch (error) {
      console.error('Error fetching muted users:', error)
    }
  }

  const handleMuteUser = async (userId: string) => {
    try {
      if (!me) return

      const { error } = await supabase
        .from('user_mutes')
        .insert({
          muter_id: me,
          muted_id: userId
        })

      if (error) throw error

      setMutedUsers(prev => new Set([...prev, userId]))
      setUserMenuVisible(null)
      setFriendMenuVisible(null)
      Alert.alert('Success', 'User muted successfully')
    } catch (error) {
      console.error('Error muting user:', error)
      Alert.alert('Error', 'Failed to mute user')
    }
  }

  const handleUnmuteUser = async (userId: string) => {
    try {
      if (!me) return

      const { error } = await supabase
        .from('user_mutes')
        .delete()
        .eq('muter_id', me)
        .eq('muted_id', userId)

      if (error) throw error

      setMutedUsers(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      setUserMenuVisible(null)
      setFriendMenuVisible(null)
      Alert.alert('Success', 'User unmuted successfully')
    } catch (error) {
      console.error('Error unmuting user:', error)
      Alert.alert('Error', 'Failed to unmute user')
    }
  }

  const handleReport = async (reason: ReportReason, comments?: string) => {
    try {
      if (!me || !reportContentId) return

      // Confirmation alert is already handled in ReportModal, so just submit
      const { error } = await supabase
        .from('reports')
        .insert({
          reported_by: me,
          content_type: reportContentType,
          content_id: reportContentId,
          reason: reason,
          comments: comments || null
        })

      if (error) throw error

      Alert.alert('Report Submitted', 'We have received your report, will handle within 24 hours')
      setReportModalVisible(false)
      setReportContentId(null)
    } catch (error) {
      console.error('Error submitting report:', error)
      Alert.alert('Error', 'Failed to submit report')
    }
  }

  const handleToggleOrgNotifications = async (orgId: string) => {
    try {
      if (!me) return

      const currentValue = orgNotifications[orgId] !== false
      const newValue = !currentValue

      const { error } = await supabase
        .from('org_followers')
        .update({ notification_enabled: newValue })
        .eq('user_id', me)
        .eq('org_id', orgId)

      if (error) throw error

      setOrgNotifications(prev => ({ ...prev, [orgId]: newValue }))
    } catch (error) {
      console.error('Error toggling org notifications:', error)
      Alert.alert('Error', 'Failed to update notification settings')
    }
  }

  // Friends functions (from FriendsScreen)
  const getFriendStatus = (userId: string): 'none' | 'pending_incoming' | 'pending_outgoing' | 'accepted' => {
    if (!me) return 'none'
    
    const friendship = friendships.find(
      f => (f.user_id === userId && f.friend_id === me) || (f.user_id === me && f.friend_id === userId)
    )
    
    if (!friendship) return 'none'
    if (friendship.status === 'accepted') return 'accepted'
    if (friendship.user_id === me) return 'pending_outgoing'
    return 'pending_incoming'
  }

  const sendFriendRequest = async (friendId: string) => {
    try {
      if (!me) return

      // Prevent sending friend request to blocked users
      if (blockedUsers.has(friendId)) {
        Alert.alert('Error', 'Cannot send friend request to a blocked user')
        return
      }

      // Check if this user has blocked me (they are a blocker)
      const blockers = await fetchBlockers()
      if (blockers.has(friendId)) {
        Alert.alert('Error', 'Cannot send friend request to this user')
        return
      }

      // Add to locally pending requests immediately for UI feedback
      setLocallyPendingRequests(prev => new Set([...prev, friendId]))

      // Find the user profile to add to outgoing immediately
      const userProfile = allUsers.find(u => u.id === friendId)
      
      // Immediately update outgoing state for instant UI feedback
      if (userProfile) {
        setOutgoing(prev => [...prev, {
          id: `temp-${friendId}`,
          user_id: me,
          friend_id: friendId,
          status: 'pending' as const,
          friend: userProfile
        }])
        setOutgoingProfiles(prev => ({
          ...prev,
          [friendId]: userProfile
        }))
      }

      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: me,
          friend_id: friendId,
          status: 'pending'
        })

      if (error) throw error
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error sending friend request:', error)
      // Remove from locally pending on error
      setLocallyPendingRequests(prev => {
        const next = new Set(prev)
        next.delete(friendId)
        return next
      })
      // Remove from outgoing on error
      setOutgoing(prev => prev.filter(f => f.friend_id !== friendId))
      const newOutgoingProfiles = { ...outgoingProfiles }
      delete newOutgoingProfiles[friendId]
      setOutgoingProfiles(newOutgoingProfiles)
      Alert.alert('Error', 'Failed to send friend request')
    }
  }

  const acceptFriendRequest = async (friendshipId: string) => {
    try {
      if (!me) return

      // Find the friendship to check if the other user is blocked
      const friendship = friendships.find(f => f.id === friendshipId)
      if (friendship) {
        const otherUserId = friendship.user_id === me ? friendship.friend_id : friendship.user_id
        if (blockedUsers.has(otherUserId)) {
          Alert.alert('Error', 'Cannot accept friend request from a blocked user')
          // Delete the friendship request
          await supabase.from('friendships').delete().eq('id', friendshipId)
          await fetchFriendships(me)
          return
        }
      }

      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId)

      if (error) throw error
      
      if (friendship) {
        setRecentlyAccepted(prev => new Set([...prev, friendship.friend_id]))
      }
      
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error accepting friend request:', error)
      Alert.alert('Error', 'Failed to accept friend request')
    }
  }

  const rejectFriendRequest = async (friendshipId: string) => {
    Alert.alert(
      'Reject Friend Request',
      'Are you sure you want to reject this friend request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId)

              if (error) throw error
              await fetchFriendships(me!)
            } catch (error) {
              console.error('Error rejecting friend request:', error)
              Alert.alert('Error', 'Failed to reject friend request')
            }
          }
        }
      ]
    )
  }

  const cancelFriendRequest = async (friendshipId: string) => {
    try {
      // Find the friendship to get the friend_id
      const friendship = friendships.find(f => f.id === friendshipId)
      const friendId = friendship?.friend_id || friendship?.user_id
      
      if (!friendId) {
        console.error('Could not find friend_id for friendship:', friendshipId)
        return
      }

      // Immediately update UI state before database call
      cancelFriendRequestByFriendId(friendId)

      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId)

      if (error) throw error
      await fetchFriendships(me!)
    } catch (error) {
      console.error('Error canceling friend request:', error)
      Alert.alert('Error', 'Failed to cancel friend request')
      // Refresh friendships on error to sync state
      if (me) {
        await fetchFriendships(me)
      }
    }
  }

  const cancelFriendRequestByFriendId = async (friendId: string) => {
    try {
      // Immediately update UI state
      // Remove from locally pending requests
      setLocallyPendingRequests(prev => {
        const next = new Set(prev)
        next.delete(friendId)
        return next
      })
      // Remove from outgoing array
      setOutgoing(prev => prev.filter(f => f.friend_id !== friendId))
      // Remove from outgoing profiles
      setOutgoingProfiles(prev => {
        const next = { ...prev }
        delete next[friendId]
        return next
      })

      // Try to delete from database if it exists
      if (me) {
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('user_id', me)
          .eq('friend_id', friendId)
          .eq('status', 'pending')

        // Don't throw error if friendship doesn't exist (it might have been just local state)
        if (error && error.code !== 'PGRST116') {
          throw error
        }
        
        await fetchFriendships(me)
      }
    } catch (error) {
      console.error('Error canceling friend request by friendId:', error)
      // Refresh friendships on error to sync state
      if (me) {
        await fetchFriendships(me)
      }
    }
  }

  const removeFriend = async (friendId: string) => {
    try {
      if (!me) return

      Alert.alert(
        'Remove Friend',
        'Are you sure you want to remove this friend?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .or(safeFriendshipOrQuery(me, friendId))

              if (error) throw error
              await fetchFriendships(me)
            }
          }
        ]
      )
    } catch (error) {
      console.error('Error removing friend:', error)
      Alert.alert('Error', 'Failed to remove friend')
    }
  }

  // Get friends data based on sub-tab (without search)
  const getFriendsDataBase = () => {
    switch (friendsSubTab) {
      case 'people':
        // Show all users except friends and ALL pending (both incoming and outgoing)
        // Include blocked users so they can be unblocked
        const friendIds = new Set(
          friendships
            .filter(f => f.status === 'accepted')
            .flatMap(f => [f.user_id, f.friend_id])
        )
        // Filter out pending requests from database, BUT exclude locally pending ones
        // This allows cards to stay visible when pressing buttons on People tab
        const allPendingIds = new Set(
          friendships
            .filter(f => f.status === 'pending')
            .flatMap(f => [f.user_id, f.friend_id])
        )
        // Exclude locally pending requests from being filtered out on People tab
        // This keeps them visible even if they're in the database as pending
        const locallyPendingSet = new Set(locallyPendingRequests)
        return allUsers.filter(user => 
          user.id !== me && 
          !friendIds.has(user.id) && 
          // If user is locally pending, don't filter them out (keep them visible)
          // Otherwise, filter out if they're in database as pending
          (locallyPendingSet.has(user.id) || !allPendingIds.has(user.id))
        )
      case 'pending':
        // Return empty array - we'll handle pending requests separately with sections
        return []
      case 'friends':
        // Filter out blocked users from friends list
        return acceptedFriends.filter(friend => !blockedUsers.has(friend.id))
      default:
        return []
    }
  }
  
  // Get friends data with search applied to current list
  const getFriendsData = () => {
    const baseData = getFriendsDataBase()
    if (!query) return baseData
    
    const searchLower = query.toLowerCase()
    return baseData.filter(user => 
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.phone_number?.includes(query)
    )
  }

  // Get orgs data based on sub-tab (without search)
  const getOrgsDataBase = () => {
    if (orgsSubTab === 'following') {
      return allOrgs.filter(org => followedOrgs.includes(org.id))
    } else {
      // All Orgs - exclude followed ones (but include recently followed ones to keep them visible)
      // Also include blocked orgs so they can be shown with unblock option
      const regularOrgs = allOrgs.filter(org => 
        (!followedOrgs.includes(org.id) || recentlyFollowedOrgs.has(org.id))
      )
      
      // Return both regular and blocked orgs (blocked will be shown with unblock option)
      return [...regularOrgs, ...blockedOrgsList]
    }
  }
  
  // Get orgs data with search applied to current list
  const getOrgsData = () => {
    const baseData = getOrgsDataBase()
    if (!query) return baseData
    
    const searchLower = query.toLowerCase()
    return baseData.filter(org => 
      org.name.toLowerCase().includes(searchLower) ||
      org.description?.toLowerCase().includes(searchLower) ||
      org.type.toLowerCase().includes(searchLower)
    )
  }

  const acceptedFriends = friendships
    .filter(f => {
      if (f.status !== 'accepted') return false
      const friendId = f.user_id === me ? f.friend_id : f.user_id
      return !blockersSet.has(friendId)
    })
    .map(f => {
      const friendId = f.user_id === me ? f.friend_id : f.user_id
      return allUsers.find(u => u.id === friendId)
    })
    .filter(Boolean) as ProfileRow[]

  const renderFriend = ({ item }: { item: ProfileRow }) => {
    const status = getFriendStatus(item.id)
    const isRecentlyAccepted = recentlyAccepted.has(item.id)
    const isLocallyPending = locallyPendingRequests.has(item.id)
    const isBlocked = blockedUsers.has(item.id)
    const isMuted = mutedUsers.has(item.id)

    return (
      <FriendCard
        user={item}
        status={status}
        isBlocked={isBlocked}
        isMuted={isMuted}
        isRecentlyAccepted={isRecentlyAccepted}
        isLocallyPending={isLocallyPending}
        onPress={() => {
          if (!isBlocked) {
            setSelectedUser(item)
          }
        }}
        onAddFriend={status === 'none' && !isLocallyPending ? () => sendFriendRequest(item.id) : undefined}
        onAcceptRequest={status === 'pending_incoming' ? () => {
          const friendship = friendships.find(
            f => f.friend_id === me && f.user_id === item.id && f.status === 'pending'
          )
          if (friendship) acceptFriendRequest(friendship.id)
        } : undefined}
        onRejectRequest={status === 'pending_incoming' ? () => {
          const friendship = friendships.find(
            f => f.friend_id === me && f.user_id === item.id && f.status === 'pending'
          )
          if (friendship) rejectFriendRequest(friendship.id)
        } : undefined}
        onCancelRequest={status === 'pending_outgoing' || isLocallyPending ? () => {
          const friendship = friendships.find(
            f => (f.user_id === me && f.friend_id === item.id) || (f.user_id === item.id && f.friend_id === me)
          )
          if (friendship) {
            cancelFriendRequest(friendship.id)
          } else if (isLocallyPending) {
            // Handle case where request was just sent but not yet in friendships array
            cancelFriendRequestByFriendId(item.id)
          }
        } : undefined}
        onRemoveFriend={status === 'accepted' ? () => removeFriend(item.id) : undefined}
        onUnblock={isBlocked ? () => {
          Alert.alert(
            'Unblock User',
            'Are you sure you want to unblock this user?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Unblock',
                style: 'default',
                onPress: () => handleUnblockUser(item.id)
              }
            ]
          )
        } : undefined}
        onMenuPress={() => {
          if (status === 'accepted') {
            setAcceptedFriendMenuVisible(item.id)
          } else if (status === 'none' && !isLocallyPending) {
            setUserMenuVisible(item.id)
          } else if (status === 'pending_outgoing' || isLocallyPending) {
            setFriendMenuVisible(item.id)
          }
        }}
        showMenuButton={true}
      />
    )
  }

  const renderOrg = ({ item }: { item: Organization }) => {
    const isFollowing = followedOrgs.includes(item.id)
    const notificationsEnabled = orgNotifications[item.id] !== false
    const isBlocked = blockedOrgs.has(item.id)

    return (
      <OrganizationCard
        organization={item}
        isFollowing={isFollowing}
        isBlocked={isBlocked}
        notificationsEnabled={notificationsEnabled}
        onPress={() => {
          if (!isBlocked) {
            handleOrgPress(item)
          }
        }}
        onFollow={() => handleFollowOrg(item.id)}
        onUnfollow={() => handleUnfollowOrg(item.id)}
        onUnblock={() => handleUnblockOrg(item.id)}
        onToggleNotifications={() => handleToggleOrgNotifications(item.id)}
        onMenuPress={() => setOrgMenuVisible(item.id)}
        showMenuButton={!isBlocked}
        variant="default"
      />
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: theme.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'friends' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'friends' ? theme.primary : theme.textSecondary }
          ]}>
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'organizations' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('organizations')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'organizations' ? theme.primary : theme.textSecondary }
          ]}>
            Organizations
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sub-tabs for Friends */}
      {activeTab === 'friends' && (
        <View style={[styles.subTabContainer, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'people' ? theme.primary : theme.surface,
                borderWidth: 0,
              }
            ]}
            onPress={() => setFriendsSubTab('people')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: friendsSubTab === 'people' ? theme.buttonText : theme.textSecondary }
            ]}>
              People
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'pending' ? theme.primary : theme.surface,
                borderWidth: 0,
              }
            ]}
            onPress={() => setFriendsSubTab('pending')}
          >
            <View style={styles.subTabButtonContent}>
              <Text style={[
                styles.subTabButtonText,
                { color: friendsSubTab === 'pending' ? theme.buttonText : theme.textSecondary }
              ]}>
                Pending
              </Text>
              {incoming.length > 0 && (
                <View style={[styles.pendingBadge, { backgroundColor: '#e74c3c' }]}>
                  <Text style={styles.pendingBadgeText}>
                    {incoming.length > 9 ? '9+' : incoming.length}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'friends' ? theme.primary : theme.surface,
                borderWidth: 0,
              }
            ]}
            onPress={() => setFriendsSubTab('friends')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: friendsSubTab === 'friends' ? theme.buttonText : theme.textSecondary }
            ]}>
              Friends
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sub-tabs for Organizations */}
      {activeTab === 'organizations' && (
        <View style={[styles.subTabContainer, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: orgsSubTab === 'following' ? theme.primary : theme.surface,
                borderWidth: 0,
              }
            ]}
            onPress={() => setOrgsSubTab('following')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: orgsSubTab === 'following' ? theme.buttonText : theme.textSecondary }
            ]}>
              Following
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: orgsSubTab === 'all' ? theme.primary : theme.surface,
                borderWidth: orgsSubTab === 'all' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setOrgsSubTab('all')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: orgsSubTab === 'all' ? theme.buttonText : theme.textSecondary }
            ]}>
              All Orgs
            </Text>
          </TouchableOpacity>
        </View>
      )}


      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.searchBarCapsule, { backgroundColor: theme.card }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={activeTab === 'friends' ? "Search..." : "Search organizations..."}
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {loading && !hasInitialized.current ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      ) : activeTab === 'friends' ? (
        friendsSubTab === 'pending' ? (
          (incoming.length === 0 && outgoing.length === 0) ? (
            <ScrollView
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.primary}
                  colors={[theme.primary]}
                />
              }
            >
              {!loading && hasInitialized.current ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="time-outline" size={64} color={theme.textTertiary} />
                  <Text style={[styles.emptyText, { color: theme.text }]}>
                    {query ? 'No pending requests found' : 'No pending requests'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <SectionList
              sections={[
                {
                  title: 'Incoming',
                  data: query 
                    ? incoming.map(f => incomingProfiles[f.user_id]).filter(Boolean).filter((profile: ProfileRow) => 
                        profile.full_name?.toLowerCase().includes(query.toLowerCase()) ||
                        profile.phone_number?.includes(query)
                      ) as ProfileRow[]
                    : incoming.map(f => incomingProfiles[f.user_id]).filter(Boolean) as ProfileRow[]
                },
                {
                  title: 'Outgoing',
                  data: query
                    ? outgoing.map(f => outgoingProfiles[f.friend_id]).filter(Boolean).filter((profile: ProfileRow) =>
                        profile.full_name?.toLowerCase().includes(query.toLowerCase()) ||
                        profile.phone_number?.includes(query)
                      ) as ProfileRow[]
                    : outgoing.map(f => outgoingProfiles[f.friend_id]).filter(Boolean) as ProfileRow[]
                }
              ]}
              renderItem={renderFriend}
              renderSectionHeader={({ section }) => {
                if (section.data.length === 0) return null
                return (
                  <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                    <Text
                      style={[
                        styles.sectionHeaderText,
                        sectionHeaderLargeStyle,
                        { color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
                      ]}
                    >
                      {section.title}
                    </Text>
                  </View>
                )
              }}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.primary}
                  colors={[theme.primary]}
                />
              }
            />
          )
        ) : (
          <FlatList
            data={getFriendsData()}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            ListEmptyComponent={
              !loading && hasInitialized.current ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
                  <Text style={[styles.emptyText, { color: theme.text }]}>
                    {query ? 'No users found' : 
                     friendsSubTab === 'people' ? 'No users to discover' :
                     'No friends yet'}
                  </Text>
                </View>
              ) : null
            }
          />
        )
      ) : (
        <FlatList
          data={getOrgsData()}
          renderItem={renderOrg}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          ListEmptyComponent={
            !loading && hasInitialized.current ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={64} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {query ? 'No organizations found' : 
                   orgsSubTab === 'following' ? 'Not following any organizations' :
                   'No organizations available'}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Pending Request Menu Popup */}
      {friendMenuVisible && (
        <Modal
          visible={!!friendMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFriendMenuVisible(null)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setFriendMenuVisible(null)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.menuContent, { backgroundColor: theme.card }]}
            >
              <View style={[styles.menuHeader, { borderBottomWidth: 0 }]}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Pending Request Options</Text>
                <TouchableOpacity onPress={() => setFriendMenuVisible(null)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItemsContainer}>
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const friendship = friendships.find(
                      f => (f.user_id === me && f.friend_id === friendMenuVisible) || (f.user_id === friendMenuVisible && f.friend_id === me)
                    )
                    if (friendship) {
                      cancelFriendRequest(friendship.id)
                      setFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="close-circle" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Cancel Request</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = friendMenuVisible
                    if (userId) {
                      handleBlockUser(userId)
                      setFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {mutedUsers.has(friendMenuVisible || '') ? (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = friendMenuVisible
                      if (userId) {
                        handleUnmuteUser(userId)
                        setFriendMenuVisible(null)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                        <Ionicons name="notifications" size={22} color={theme.primary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unmute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = friendMenuVisible
                      if (userId) {
                        handleMuteUser(userId)
                        setFriendMenuVisible(null)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                        <Ionicons name="notifications-off" size={22} color={theme.textSecondary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Mute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = friendMenuVisible
                    if (userId) {
                      setReportContentType('user')
                      setReportContentId(userId)
                      setReportModalVisible(true)
                      setFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.warning + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.warning || '#f39c12'} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* User Menu Popup (for non-friends) */}
      {userMenuVisible && (
        <Modal
          visible={!!userMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setUserMenuVisible(null)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setUserMenuVisible(null)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.menuContent, { backgroundColor: theme.card }]}
            >
              <View style={[styles.menuHeader, { borderBottomWidth: 0 }]}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>User Options</Text>
                <TouchableOpacity onPress={() => setUserMenuVisible(null)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItemsContainer}>
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    Alert.alert(
                      'Block User',
                      'Are you sure you want to block this user? You will not be able to see each other\'s content.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Block',
                          style: 'destructive',
                          onPress: () => {
                            const userId = userMenuVisible
                            if (userId) {
                              handleBlockUser(userId)
                            }
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = userMenuVisible
                    if (userId) {
                      setReportContentType('user')
                      setReportContentId(userId)
                      setReportModalVisible(true)
                      setUserMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.warning + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.warning || '#f39c12'} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {mutedUsers.has(userMenuVisible || '') ? (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = userMenuVisible
                      if (userId) {
                        handleUnmuteUser(userId)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                        <Ionicons name="notifications" size={22} color={theme.primary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unmute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = userMenuVisible
                      if (userId) {
                        handleMuteUser(userId)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                        <Ionicons name="notifications-off" size={22} color={theme.textSecondary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Mute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Accepted Friend Menu Popup (for friends tab) */}
      {acceptedFriendMenuVisible && (
        <Modal
          visible={!!acceptedFriendMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setAcceptedFriendMenuVisible(null)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setAcceptedFriendMenuVisible(null)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.menuContent, { backgroundColor: theme.card }]}
            >
              <View style={[styles.menuHeader, { borderBottomWidth: 0 }]}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Friend Options</Text>
                <TouchableOpacity onPress={() => setAcceptedFriendMenuVisible(null)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItemsContainer}>
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = acceptedFriendMenuVisible
                    if (userId) {
                      removeFriend(userId)
                      setAcceptedFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="person-remove" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Remove Friend</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {mutedUsers.has(acceptedFriendMenuVisible || '') ? (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = acceptedFriendMenuVisible
                      if (userId) {
                        handleUnmuteUser(userId)
                        setAcceptedFriendMenuVisible(null)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                        <Ionicons name="notifications" size={22} color={theme.primary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unmute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                    onPress={() => {
                      const userId = acceptedFriendMenuVisible
                      if (userId) {
                        handleMuteUser(userId)
                        setAcceptedFriendMenuVisible(null)
                      }
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                        <Ionicons name="notifications-off" size={22} color={theme.textSecondary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Mute</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = acceptedFriendMenuVisible
                    if (userId) {
                      Alert.alert(
                        'Block Friend',
                        'Are you sure you want to block this friend? You will not be able to see each other\'s content.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Block',
                            style: 'destructive',
                            onPress: () => {
                              handleBlockUser(userId)
                              setAcceptedFriendMenuVisible(null)
                            }
                          }
                        ]
                      )
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const userId = acceptedFriendMenuVisible
                    if (userId) {
                      setReportContentType('user')
                      setReportContentId(userId)
                      setReportModalVisible(true)
                      setAcceptedFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.warning + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.warning || '#f39c12'} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Profile Modal */}
      {selectedUser && (
        <ProfileModal
          user={selectedUser}
          isVisible={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {/* Organization Menu Popup */}
      {orgMenuVisible && (
        <Modal
          visible={!!orgMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setOrgMenuVisible(null)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setOrgMenuVisible(null)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.menuContent, { backgroundColor: theme.card }]}
            >
              <View style={[styles.menuHeader, { borderBottomWidth: 0 }]}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Organization Options</Text>
                <TouchableOpacity onPress={() => setOrgMenuVisible(null)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItemsContainer}>
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const orgId = orgMenuVisible
                    if (!orgId) return
                    
                    Alert.alert(
                      'Block Organization',
                      'Are you sure you want to block this organization? You will not be able to see their events or content.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Block',
                          style: 'destructive',
                          onPress: () => {
                            handleBlockOrg(orgId)
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    const orgId = orgMenuVisible
                    if (orgId) {
                      setReportContentType('organization')
                      setReportContentId(orgId)
                      setReportModalVisible(true)
                      setOrgMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.warning + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.warning || '#f39c12'} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Org Detail Modal */}
      {selectedOrg && (
        <OrgDetailModal
          org={selectedOrg}
          visible={!!selectedOrg}
          onClose={() => setSelectedOrg(null)}
          isFollowing={followedOrgs.includes(selectedOrg.id)}
          notificationsEnabled={orgNotifications[selectedOrg.id] !== false}
          onFollow={() => handleFollowOrg(selectedOrg.id)}
          onUnfollow={() => handleUnfollowOrg(selectedOrg.id)}
          onToggleNotifications={() => handleToggleOrgNotifications(selectedOrg.id)}
        />
      )}

      {/* Report Modal */}
      <ReportModal
        isVisible={reportModalVisible}
        onClose={() => {
          setReportModalVisible(false)
          setReportContentId(null)
        }}
        onSubmit={handleReport}
        contentType={reportContentType}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subTabContainer: {
    flexDirection: 'row',
    padding: 8,
    paddingTop: 16,
    gap: 8,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subTabButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  pendingBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingTop: 4,
  },
  sectionHeaderText: {},
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBarCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 0,
  },
  orgCardContainer: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 0,
    overflow: 'hidden',
  },
  orgCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  orgCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    flex: 1,
  },
  orgCardFooter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  orgMenuButton: {
    padding: 12,
    paddingTop: 16,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  followingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  notificationToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  blockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  blockedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardLeft: {
    marginRight: 12,
  },
  cardRight: {
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 14,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    marginTop: 4,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFriendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addFriendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFriendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pendingButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    borderRadius: 16,
    borderWidth: 0,
    minWidth: 280,
    maxWidth: '90%',
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 0,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuItemsContainer: {
    padding: 12,
    gap: 8,
  },
  menuItemCard: {
    borderRadius: 12,
    borderWidth: 0,
    overflow: 'hidden',
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuItemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemTextContainer: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
  },
})

