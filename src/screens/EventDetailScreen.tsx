import React, { useState, useEffect, useLayoutEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Linking,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { safeBlockOrQuery } from '../utils/queryHelpers'
import NotificationService from '../services/notifications'
import { ProfileModal } from '../components'
import { buildHostUpdateNotification } from '../utils/notificationTemplates'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { shouldShowPhoneNumber } from '../utils/phoneVisibility'
import { formatEventTimeDisplay, isMidnightSpanningEvent } from '../utils/eventTimeUtils'
import { deleteEventCompletely } from '../utils/eventDeletion'
import EventInviteScreen from './EventInviteScreen'
import CreateEventScreen from './CreateEventScreen'
import { buildEventInvitationNotification, buildBatchNotifications } from '../utils/notificationTemplates'
import ReportModal, { ReportReason } from '../components/modals/ReportModal'

interface EventAttendee {
  id: string
  event_id: string
  user_id: string
  status: 'going' | 'maybe' | 'not_going'
  user?: {
    id?: string
    full_name?: string
    avatar_url?: string
    bio?: string
    phone_number?: string
    phone_visibility?: 'public' | 'friends_only' | 'private'
    phone_visible_when_hosting?: boolean
  }
}

type RootStackParamList = {
  EventDetail: { event: EventWithAttendees }
}

type EventDetailRouteProp = RouteProp<RootStackParamList, 'EventDetail'>

export default function EventDetailScreen() {
  const { theme } = useTheme()
  const { isOrgMode } = useOrgMode()
  const navigation = useNavigation()
  // Hide default navigation header to remove extra space
  useLayoutEffect(() => {
    ;(navigation as any).setOptions?.({ headerShown: false })
  }, [navigation])
  const route = useRoute<EventDetailRouteProp>()
  const { event } = route.params

  // Safely initialize attendees with proper null checking
  const [attendees, setAttendees] = useState<EventAttendee[]>(() => {
    // Ensure we have a safe fallback
    if (event && event.attendees && Array.isArray(event.attendees)) {
      return event.attendees
    }
    return []
  })
  
  const [userAttendance, setUserAttendance] = useState<'going' | 'not_going' | null>(null)
  const [loading, setLoading] = useState(false)
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [hostProfile, setHostProfile] = useState<any>(null)
  const [hostOrganization, setHostOrganization] = useState<any>(null)
  const [college, setCollege] = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [isOrgOwner, setIsOrgOwner] = useState(false)
  const [showHostPhone, setShowHostPhone] = useState(false)
  const [hostPhoneVisibilityLoading, setHostPhoneVisibilityLoading] = useState(true)
  const [isInvited, setIsInvited] = useState(false)
  const [pendingNotification, setPendingNotification] = useState<{
    timer: NodeJS.Timeout | null
    lastState: 'going' | null
  }>({ timer: null, lastState: null })
  const [showOptionsModal, setShowOptionsModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [invitedUsers, setInvitedUsers] = useState<any[]>([])
  const [notGoingAttendees, setNotGoingAttendees] = useState<EventAttendee[]>([])
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportPhotoModalVisible, setReportPhotoModalVisible] = useState(false)
  const [photoSelectorVisible, setPhotoSelectorVisible] = useState(false)
  const [eventPhotos, setEventPhotos] = useState<any[]>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (event && event.id) {
      // OPTIMIZED: Run all independent queries in parallel
      fetchCurrentUser()
      fetchAttendeesWithProfiles()
      
      // Run these in parallel since they don't depend on each other
      Promise.all([
        fetchHostProfile(),
        fetchHostOrganization(),
        fetchCollege(),
        checkIfInvited(),
        fetchEventPhotos()
      ]).catch(error => {
        console.error('Error fetching event details:', error)
      })
      
      if (event.privacy === 'invite_only') {
        fetchInvitedUsers()
      }

      // Set up realtime subscription for auto-refresh
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'
      
      const channel = supabase
        .channel(`event-attendees-${event.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: attendeesTable,
            filter: `event_id=eq.${event.id}`
          },
          (payload) => {
            // Refresh attendees when changes occur
            fetchAttendeesWithProfiles(true).catch(error => {
              console.error('Error refreshing attendees from realtime:', error)
            })
          }
        )
        .subscribe()

      // Cleanup subscription on unmount or event change
      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [event?.id])

  useEffect(() => {
    // Only check phone visibility for user hosts, not org hosts
    if (hostProfile && currentUserId && !hostOrganization) {
      checkHostPhoneVisibility()
    }
  }, [hostProfile, currentUserId, hostOrganization])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pendingNotification.timer) {
        clearTimeout(pendingNotification.timer)
      }
    }
  }, [pendingNotification.timer])

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
      
      // Check if this is an org event (from org_events table or has isOrgEvent flag)
      // Org events don't have host_id, so check for that or the isOrgEvent flag
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      
      if (!isOrgEvent) {
        const hostStatus = user?.id === event.host_id
        setIsHost(hostStatus)
        setIsOrgOwner(false)
        
        // If user is host, automatically set them as "going"
        if (hostStatus) {
          setUserAttendance('going')
          // Ensure host is added to attendees table
          await ensureHostIsAttending()
        }
      } else {
        // For org events, check if user owns the org
        setIsHost(false)
        
        if (user && (event as any).org_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('org_ownership_id')
            .eq('id', user.id)
            .single()
          
          const userOwnsOrg = profile?.org_ownership_id === (event as any).org_id
          setIsOrgOwner(userOwnsOrg)
        } else {
          setIsOrgOwner(false)
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  const ensureHostIsAttending = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if host is already in attendees
      const { data: existingAttendance } = await supabase
        .from('event_attendees')
        .select('*')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .single()

      // If not already attending, add host as "going"
      if (!existingAttendance) {
        const { error } = await supabase
          .from('event_attendees')
          .insert({
            event_id: event.id,
            user_id: user.id,
            status: 'going'
          })

        if (error) {
          console.error('Error adding host to attendees:', error)
        }
      }
    } catch (error) {
      console.error('Error ensuring host attendance:', error)
    }
  }

  const fetchAttendeesWithProfiles = async (skipLoading = false) => {
    try {
      if (!skipLoading) {
        setLoading(true)
      }
      
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return
      
      // Separate blocked users (users I blocked) from blockers (users who blocked me)
      const { data: blockedData } = await supabase
        .from('user_blocks')
        .select('blocked_id, blocker_id')
        .or(safeBlockOrQuery(currentUser.id))

      const blockedUserIds = new Set<string>() // Users I have blocked
      const blockerIds = new Set<string>() // Users who have blocked me
      if (blockedData) {
        blockedData.forEach((b: any) => {
          if (b.blocker_id === currentUser.id) {
            blockedUserIds.add(b.blocked_id) // I blocked them
          }
          if (b.blocked_id === currentUser.id) {
            blockerIds.add(b.blocker_id) // They blocked me
          }
        })
      }
      
      // Check if this is an org event
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'
      
      // OPTIMIZED: Use join to fetch attendees with profiles in a single query
      const { data: attendeesData, error: attendeesError } = await supabase
        .from(attendeesTable)
        .select(`
          *,
          user:profiles!${isOrgEvent ? 'org_event_attendees_user_id_fkey' : 'event_attendees_user_id_fkey'}(
            id,
            full_name,
            avatar_url,
            bio,
            phone_number
          )
        `)
        .eq('event_id', event.id)
        .eq('user.otp_verified', true)

      let attendeesWithProfiles: EventAttendee[] = []
      
      if (attendeesError) {
        // Fallback to separate queries if join fails
        const { data: attendeesOnly, error: attendeesOnlyError } = await supabase
          .from(attendeesTable)
          .select('*')
          .eq('event_id', event.id)

        if (attendeesOnlyError) throw attendeesOnlyError

        const userIds = attendeesOnly?.map(a => a.user_id) || []
        let profilesData: any[] = []
        
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, bio, phone_number')
            .in('id', userIds)
            .eq('otp_verified', true)
          
          if (profilesError) throw profilesError
          profilesData = profiles || []
        }

        attendeesWithProfiles = (attendeesOnly || []).map(attendee => ({
          ...attendee,
          user: profilesData.find(profile => profile.id === attendee.user_id)
        }))
      } else {
        // Use joined data
        attendeesWithProfiles = (attendeesData || []).map((attendee: any) => ({
          ...attendee,
          user: attendee.user || null
        }))
      }
      
      // Filter out blocked users AND blockers
      // If Person A blocks Person B, Person B should not see Person A in attendees
      const filteredAttendees = attendeesWithProfiles.filter(attendee => 
        !blockedUserIds.has(attendee.user_id) && 
        !blockerIds.has(attendee.user_id) // Exclude users who have blocked me
      )
      
      setAttendees(filteredAttendees)
      const notGoing = attendeesWithProfiles.filter(a => a.status === 'not_going')
      setNotGoingAttendees(notGoing)
      setProfilesLoaded(true)

      // Find current user's attendance status (only if not host and not org event in org mode)
      if (currentUser && !isHost && !(isOrgMode && isOrgEvent)) {
        const userAttendance = filteredAttendees.find(a => a.user_id === currentUser.id)
        // Set status based on attendance record
        if (userAttendance?.status === 'going' || userAttendance?.status === 'maybe') {
          setUserAttendance('going')
        } else if (userAttendance?.status === 'not_going') {
          setUserAttendance('not_going')
        } else {
          setUserAttendance(null)
        }
      }
    } catch (error) {
      console.error('Error fetching attendees with profiles:', error)
      setAttendees([])
      setProfilesLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchHostProfile = async () => {
    try {
      // Only fetch user profile if this is not an org event
      if ((event as any).org_id) {
        setHostProfile(null)
        return
      }
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, bio, phone_number')
        .eq('id', event.host_id)
        .single()

      if (error) throw error
      setHostProfile(profile)
    } catch (error) {
      console.error('Error fetching host profile:', error)
    }
  }

  const fetchHostOrganization = async () => {
    try {
      // Only fetch organization if this is an org event
      if (!(event as any).org_id) {
        setHostOrganization(null)
        return
      }
      
      const { data: org, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', (event as any).org_id)
        .single()

      if (error) throw error
      setHostOrganization(org)
    } catch (error) {
      console.error('Error fetching host organization:', error)
    }
  }

  const fetchCollege = async () => {
    try {
      if ((event as any).college_id) {
        const { data: collegeData, error } = await supabase
          .from('colleges')
          .select('*')
          .eq('id', (event as any).college_id)
          .single()

        if (error) throw error
        setCollege(collegeData)
      }
    } catch (error) {
      console.error('Error fetching college:', error)
    }
  }

  const fetchEventPhotos = async () => {
    try {
      const { data: photos, error } = await supabase
        .from('event_photos')
        .select('id, image_url, caption')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setEventPhotos(photos || [])
    } catch (error) {
      console.error('Error fetching event photos:', error)
      setEventPhotos([])
    }
  }

  const checkHostPhoneVisibility = async () => {
    if (!hostProfile || !currentUserId) {
      setHostPhoneVisibilityLoading(false)
      return
    }
    
    setHostPhoneVisibilityLoading(true)
    try {
      const shouldShow = await shouldShowPhoneNumber(hostProfile.id, currentUserId, true) // true because host is hosting this event
      setShowHostPhone(shouldShow)
    } catch (error) {
      console.error('Error checking host phone visibility:', error)
      setShowHostPhone(false)
    } finally {
      setHostPhoneVisibilityLoading(false)
    }
  }

  const checkIfInvited = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsInvited(false)
        return
      }

      // Check if this is an org event - invitations don't apply to org events
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      if (isOrgEvent) {
        setIsInvited(false)
        return
      }

      const { data: invitation, error } = await supabase
        .from('event_invitations')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error
      setIsInvited(!!invitation)
    } catch (error) {
      console.error('Error checking if invited:', error)
      setIsInvited(false)
    }
  }

  const fetchInvitedUsers = async () => {
    try {
      const { data: invitations, error } = await supabase
        .from('event_invitations')
        .select('user_id')
        .eq('event_id', event.id)

      if (error) throw error

      const invitedUserIds = (invitations || []).map(inv => inv.user_id)

      if (invitedUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', invitedUserIds)
          .eq('otp_verified', true)

        if (profilesError) throw profilesError
        setInvitedUsers(profiles || [])
      } else {
        setInvitedUsers([])
      }
    } catch (error) {
      console.error('Error fetching invited users:', error)
      setInvitedUsers([])
    }
  }

  const handleAttendanceToggle = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // If user is currently going, remove their attendance
      if (userAttendance === 'going') {
        await removeAttendance()
        return
      }

      // If user is marked as "not going", they want to change to "going"
      if (userAttendance === 'not_going') {
        await addAttendance()
        return
      }

      // User is not currently going, so add their attendance
      // Check if event is full and user is trying to go
      if (isEventFull()) {
        Alert.alert(
          'Event Full',
          'This event has reached its maximum capacity.',
          [{ text: 'OK' }]
        )
        return
      }

      // Clear any existing pending notification timer
      if (pendingNotification.timer) {
        clearTimeout(pendingNotification.timer)
      }

      // Add attendance
      await addAttendance()

      // Set up 2-minute delay for notification
      const newState = 'going'
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'
      
      const timer = setTimeout(async () => {
        try {
          // Check current attendance state after 2 minutes
          const { data: { user: currentUser } } = await supabase.auth.getUser()
          if (!currentUser) return

          const { data: currentAttendance } = await supabase
            .from(attendeesTable)
            .select('status')
            .eq('event_id', event.id)
            .eq('user_id', currentUser.id)
            .single()

          const currentState = currentAttendance && (currentAttendance.status === 'going' || currentAttendance.status === 'maybe') ? 'going' : null
          
          // Only send notification if the state is different from what it was when the timer started
          if (currentState !== pendingNotification.lastState) {
            await sendAttendanceChangeNotification(currentState)
          }
        } catch (error) {
          console.error('Error sending delayed attendance notification:', error)
        }
      }, 2 * 60 * 1000) // 2 minutes

      setPendingNotification({
        timer,
        lastState: newState
      })
    } catch (error) {
      console.error('Error updating attendance:', error)
      Alert.alert('Error', 'Failed to update attendance')
    }
  }

  const addAttendance = async () => {
    let user: any = null
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return
      user = currentUser

      // Check if this is an org event
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'

      // OPTIMISTIC UPDATE: Update UI immediately
      setUserAttendance('going')
      
      // Optimistically add user to attendees list if not already present
      setAttendees(prev => {
        const existingIndex = prev.findIndex(a => a.user_id === user.id)
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], status: 'going' }
          return updated
        } else {
          // Add new - we'll fetch the profile in the background
          return [...prev, {
            id: `temp-${user.id}`,
            event_id: event.id,
            user_id: user.id,
            status: 'going' as const,
            user: undefined // Will be populated by background fetch
          }]
        }
      })

      // Check if attendance record already exists
      const { data: existingAttendance } = await supabase
        .from(attendeesTable)
        .select('id, status')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingAttendance) {
        // Update existing record to 'going'
        const { error } = await supabase
          .from(attendeesTable)
          .update({ status: 'going' })
          .eq('event_id', event.id)
          .eq('user_id', user.id)

        if (error) {
          // Rollback on error
          setUserAttendance(null)
          throw error
        }
      } else {
        // Create new record with 'going' status
        const { error } = await supabase
          .from(attendeesTable)
          .insert({
            event_id: event.id,
            user_id: user.id,
            status: 'going'
          })

        if (error) {
          // Rollback on error
          setUserAttendance(null)
          throw error
        }
      }

      // Refresh attendees list in background (without loading state)
      fetchAttendeesWithProfiles(true).catch(error => {
        console.error('Error refreshing attendees:', error)
        // If refresh fails, try again with loading
        fetchAttendeesWithProfiles(false)
      })
    } catch (error) {
      console.error('Error adding attendance:', error)
      // Rollback optimistic update
      setUserAttendance(null)
      if (user) {
        setAttendees(prev => prev.filter(a => a.user_id !== user.id || !a.id?.startsWith('temp-')))
      }
      // Refresh to get correct state
      fetchAttendeesWithProfiles(true)
      Alert.alert('Error', 'Failed to mark as going')
    }
  }

  const removeAttendance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if this is an org event
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      
      // If user is invited (not org event), mark as "not going" instead of deleting
      if (isInvited && !isOrgEvent) {
        // Show confirmation alert
        Alert.alert(
          'Not Going',
          'Are you sure you are not going to this event? The host will be notified.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Confirm',
              style: 'destructive',
              onPress: async () => {
                try {
                  const attendeesTable = 'event_attendees'

                  // Check if attendance record already exists
                  const { data: existingAttendance } = await supabase
                    .from(attendeesTable)
                    .select('id, status')
                    .eq('event_id', event.id)
                    .eq('user_id', user.id)
                    .maybeSingle()

                  if (existingAttendance) {
                    // Update existing record to 'not_going'
                    const { error } = await supabase
                      .from(attendeesTable)
                      .update({ status: 'not_going' })
                      .eq('event_id', event.id)
                      .eq('user_id', user.id)

                    if (error) throw error
                  } else {
                    // Create new record with 'not_going' status
                    const { error } = await supabase
                      .from(attendeesTable)
                      .insert({
                        event_id: event.id,
                        user_id: user.id,
                        status: 'not_going'
                      })

                    if (error) throw error
                  }

                  // OPTIMISTIC UPDATE: Update UI immediately
                  setUserAttendance('not_going')
                  setAttendees(prev => {
                    const existingIndex = prev.findIndex(a => a.user_id === user.id)
                    if (existingIndex >= 0) {
                      const updated = [...prev]
                      updated[existingIndex] = { ...updated[existingIndex], status: 'not_going' }
                      return updated
                    }
                    return prev
                  })
                  
                  // Send notification to host
                  await sendNotGoingNotification()
                  
                  // Refresh attendees list in background (without loading state)
                  fetchAttendeesWithProfiles(true).catch(error => {
                    console.error('Error refreshing attendees:', error)
                    fetchAttendeesWithProfiles(false)
                  })
                  
                  // Exit the event page after confirming "not going"
                  // Use canGoBack to check if we can navigate back, otherwise navigate to MyEvents
                  if (navigation.canGoBack()) {
                    navigation.goBack()
                  } else {
                    navigation.dispatch(
                      CommonActions.navigate({
                        name: 'Main',
                        params: { screen: 'MyEvents' },
                      })
                    )
                  }
                } catch (error) {
                  console.error('Error marking as not going:', error)
                  Alert.alert('Error', 'Failed to mark as not going')
                }
              }
            }
          ]
        )
        return
      }

      // For non-invited events or org events, just delete the attendance record
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'
      
      // OPTIMISTIC UPDATE: Update UI immediately
      setUserAttendance(null)
      setAttendees(prev => prev.filter(a => a.user_id !== user.id))
      
      const { error } = await supabase
        .from(attendeesTable)
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id)

      if (error) {
        // Rollback on error
        fetchAttendeesWithProfiles(true)
        throw error
      }
      
      // Refresh attendees list in background (without loading state)
      fetchAttendeesWithProfiles(true).catch(error => {
        console.error('Error refreshing attendees:', error)
        // If refresh fails, try again with loading
        fetchAttendeesWithProfiles(false)
      })
    } catch (error) {
      console.error('Error removing attendance:', error)
      // Rollback - refresh to get correct state
      fetchAttendeesWithProfiles(true)
      Alert.alert('Error', 'Failed to remove attendance')
    }
  }

  const handleNotGoing = async () => {
    // If user is already marked as "not going", allow them to change to "going"
    if (userAttendance === 'not_going') {
      // User wants to mark as going - show alert confirmation
      Alert.alert(
        'Mark as Going',
        'Do you want to mark yourself as going to this event?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, I\'m Going',
            onPress: async () => {
              await addAttendance()
            }
          }
        ]
      )
      return
    }

    // User wants to mark as "not going" - show confirmation
    Alert.alert(
      'Not Going',
      'Are you sure you are not going to this event? The host will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return

              // Check if this is an org event
              const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
              const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'

              // Check if attendance record already exists
              const { data: existingAttendance } = await supabase
                .from(attendeesTable)
                .select('id, status')
                .eq('event_id', event.id)
                .eq('user_id', user.id)
                .maybeSingle()

              if (existingAttendance) {
                // Update existing record to 'not_going'
                const { error } = await supabase
                  .from(attendeesTable)
                  .update({ status: 'not_going' })
                  .eq('event_id', event.id)
                  .eq('user_id', user.id)

                if (error) throw error
              } else {
                // Create new record with 'not_going' status
                const { error } = await supabase
                  .from(attendeesTable)
                  .insert({
                    event_id: event.id,
                    user_id: user.id,
                    status: 'not_going'
                  })

                if (error) throw error
              }

              // OPTIMISTIC UPDATE: Update UI immediately
              setUserAttendance('not_going')
              setAttendees(prev => {
                const existingIndex = prev.findIndex(a => a.user_id === user.id)
                if (existingIndex >= 0) {
                  const updated = [...prev]
                  updated[existingIndex] = { ...updated[existingIndex], status: 'not_going' }
                  return updated
                }
                return prev
              })
              
              // Send notification to host (only for invited users and only for personal events)
              if (isInvited && !isOrgEvent) {
                await sendNotGoingNotification()
              }
              
              // Refresh attendees list in background (without loading state)
              fetchAttendeesWithProfiles(true).catch(error => {
                console.error('Error refreshing attendees:', error)
                fetchAttendeesWithProfiles(false)
              })
              
              // Exit the event page after confirming "not going"
              // Use canGoBack to check if we can navigate back, otherwise navigate to MyEvents
              if (navigation.canGoBack()) {
                navigation.goBack()
              } else {
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'Main',
                    params: { screen: 'MyEvents' },
                  })
                )
              }
            } catch (error) {
              console.error('Error marking as not going:', error)
              Alert.alert('Error', 'Failed to mark as not going')
            }
          }
        }
      ]
    )
  }

  const sendNotGoingNotification = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !event.host_id || user.id === event.host_id) return

      // Get user's profile data for the notification
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const userName = userProfile?.full_name || 'A user'

      // Use buildHostUpdateNotification with action 'left' (we'll customize the message)
      const notificationPayload = buildHostUpdateNotification({
        userId: event.host_id,
        eventId: event.id,
        eventTitle: event.title,
        userName: userName,
        action: 'left',
        additionalData: {
          attendeeId: user.id,
          declinedInvitation: true
        }
      })

      // Customize the notification message for declined invitations
      notificationPayload.title = `${userName} Declined Your Invitation`
      notificationPayload.body = `${userName} is not going to "${event.title || 'your event'}"`

      // Queue the notification
      const { error: queueError } = await supabase
        .from('notification_queue')
        .insert({
          user_id: notificationPayload.user_id,
          event_id: notificationPayload.event_id,
          type: notificationPayload.type,
          title: notificationPayload.title,
          body: notificationPayload.body,
          scheduled_for: notificationPayload.scheduled_for,
          data: notificationPayload.data
        })

      if (queueError) {
        console.error('Error queuing not going notification:', queueError)
      }
    } catch (error) {
      console.error('Error sending not going notification:', error)
    }
  }

  const handleReportEvent = async (reason: ReportReason, comments?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Confirmation alert is handled in ReportModal, so just submit
      const { error } = await supabase
        .from('reports')
        .insert({
          reported_by: user.id,
          content_type: 'event',
          content_id: event.id,
          reason: reason,
          comments: comments || null
        })

      if (error) throw error

      Alert.alert('Report Submitted', 'We have received your report, will handle within 24 hours')
      setReportModalVisible(false)
    } catch (error) {
      console.error('Error submitting report:', error)
      Alert.alert('Error', 'Failed to submit report')
    }
  }

  const handleReportPhoto = async (reason: ReportReason, comments?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !selectedPhotoUrl) return

      // Confirmation alert is handled in ReportModal, so just submit
      // Use photo_url for photos, content_id can be event_id or photo_id (UUID)
      const { error } = await supabase
        .from('reports')
        .insert({
          reported_by: user.id,
          content_type: 'event_photo',
          content_id: selectedPhotoId || event.id, // Use photo ID if available, otherwise event ID
          photo_url: selectedPhotoUrl, // Store the photo URL
          reason: reason,
          comments: comments || null
        })

      if (error) throw error

      Alert.alert('Report Submitted', 'We have received your report, will handle within 24 hours')
      setReportPhotoModalVisible(false)
      setSelectedPhotoId(null)
      setSelectedPhotoUrl(null)
    } catch (error) {
      console.error('Error submitting report:', error)
      Alert.alert('Error', 'Failed to submit report')
    }
  }

  const handleInvitesUpdated = async (newInvitedUsers: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isHost) return

      setShowInviteModal(false)

      // Get current invited user IDs
      const currentInvitedIds = invitedUsers.map(u => u.id)
      
      // Find newly added users (users in newInvitedUsers but not in currentInvitedIds)
      const newUsers = newInvitedUsers.filter(id => !currentInvitedIds.includes(id))

      if (newUsers.length === 0) {
        // No new users to invite
        await fetchInvitedUsers()
        await fetchAttendeesWithProfiles()
        return
      }

      // Filter out the host
      const usersToInvite = newUsers.filter(userId => userId !== user.id)

      if (usersToInvite.length === 0) {
        await fetchInvitedUsers()
        await fetchAttendeesWithProfiles()
        return
      }

      // Create invitation records
      const invitations = usersToInvite.map(userId => ({
        event_id: event.id,
        user_id: userId,
        invited_by: user.id
      }))

      const { error: inviteError } = await supabase
        .from('event_invitations')
        .insert(invitations)

      if (inviteError) {
        console.error('Error creating invitations:', inviteError)
        Alert.alert('Error', 'Failed to send invitations')
        return
      }

      // Get host's profile for notification
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const hostName = hostProfile?.full_name || 'Someone'

      // Filter out muted users
      const { data: mutedData } = await supabase
        .from('user_mutes')
        .select('muter_id')
        .eq('muted_id', user.id)
        .in('muter_id', usersToInvite)
      
      const mutedUserIds = new Set((mutedData || []).map(m => m.muter_id))
      const filteredUsers = usersToInvite.filter(id => !mutedUserIds.has(id))
      
      if (filteredUsers.length > 0) {
        // Send notifications
        if (event.privacy === 'invite_only') {
          // For private events, send invitation notifications
          const notificationData = buildBatchNotifications(
            filteredUsers,
            buildEventInvitationNotification,
            {
              eventId: event.id,
              hostName: hostName,
              eventTitle: event.title,
              privacy: 'invite_only',
              additionalData: {
                hostId: user.id
              }
            }
          )

          const { error: notificationError } = await supabase
            .from('notification_queue')
            .insert(notificationData)

          if (notificationError) {
            console.error('Error queuing notifications:', notificationError)
          }
        } else {
          // For public events, send event created notifications
          const notificationData = buildBatchNotifications(
            filteredUsers,
            buildEventInvitationNotification,
            {
              eventId: event.id,
              hostName: hostName,
              eventTitle: event.title,
              privacy: 'public',
              additionalData: {
                hostId: user.id
              }
            }
          )

          const { error: notificationError } = await supabase
            .from('notification_queue')
            .insert(notificationData)

          if (notificationError) {
            console.error('Error queuing notifications:', notificationError)
          }
        }
      }

      // Refresh the invited users list and attendees
      await fetchInvitedUsers()
      await fetchAttendeesWithProfiles()
    } catch (error) {
      console.error('Error handling invites update:', error)
      Alert.alert('Error', 'Failed to update invitations')
    }
  }

  const handleDeleteEvent = async () => {
    // Only allow deletion if user is hosting this event or owns the org
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || (!isHost && !isOrgOwner)) {
      Alert.alert('Error', 'You can only delete events you are hosting or own')
      return
    }

    // Check if this is an org event
    const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)

    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Navigate immediately to avoid UI delay
              // Notifications will be queued and processed in the background
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Main',
                      params: { 
                        screen: isOrgEvent ? 'OrgEvents' : 'MyEvents' 
                      },
                    },
                  ],
                })
              )

              // Send notifications and delete event in the background
              // This happens after navigation so UI is responsive
              Promise.all([
                NotificationService.sendEventEditDeleteNotification(
                  event.id,
                  event.title,
                  event.host_id,
                  'deleted'
                ),
                isOrgEvent 
                  ? (async () => {
                      const { deleteOrgEventCompletely } = await import('../utils/eventDeletion')
                      await deleteOrgEventCompletely(event.id)
                    })()
                  : deleteEventCompletely(event.id)
              ]).catch(error => {
                console.error('Error during event deletion:', error)
              })
            } catch (navError) {
              // Fallback: try simple navigate if reset fails
              try {
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'Main',
                    params: { 
                      screen: isOrgEvent ? 'OrgEvents' : 'MyEvents' 
                    },
                  })
                )
              } catch (fallbackError) {
                console.error('Navigation error after event deletion:', fallbackError)
                // If all navigation fails, at least show success message
              }
            }
          }
        }
      ]
    )
  }

  const sendAttendanceChangeNotification = async (currentState: 'going' | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if this is an org event
      const isOrgEvent = (event as any).isOrgEvent || (!event.host_id && (event as any).org_id)
      
      // For org events, send notification to org owner instead of host
      if (isOrgEvent) {
        if (!hostOrganization) return
        
        // Get org owner (if organization has an owner)
        // Note: owner_id can be NULL if the original owner deleted their account
        if (!hostOrganization.owner_id) return // No owner, skip notification
        
        const { data: orgOwner } = await supabase
          .from('profiles')
          .select('id')
          .eq('org_ownership_id', hostOrganization.id)
          .maybeSingle()

        if (!orgOwner || user.id === orgOwner.id) return // Don't notify if user is the org owner or no owner found

        // Get user's profile data for the notification - ensure it loads before proceeding
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Error fetching user profile for notification:', profileError)
          return
        }

        // Ensure we have the user name before sending notification
        if (!userProfile?.full_name) {
          console.warn('User profile name not available, skipping notification')
          return
        }

        const userName = userProfile.full_name

        // Use centralized notification builder
        const notificationPayload = buildHostUpdateNotification({
          userId: orgOwner.id,
          eventId: event.id,
          eventTitle: event.title,
          userName: userName,
          action: currentState === 'going' ? 'joined' : 'left',
          additionalData: {
            attendeeId: user.id
          }
        })

        // Queue the notification instead of sending immediately
        const { error: queueError } = await supabase
          .from('notification_queue')
          .insert({
            user_id: notificationPayload.user_id,
            event_id: notificationPayload.event_id,
            type: notificationPayload.type,
            title: notificationPayload.title,
            body: notificationPayload.body,
            scheduled_for: notificationPayload.scheduled_for,
            data: notificationPayload.data
          })

        if (queueError) {
          console.error('Error queuing org event host update notification:', queueError)
        }
        return
      }

      // For personal events, send to host
      if (!hostProfile) return

      // Only send notification to the host (not to the user themselves)
      if (user.id === event.host_id) return

      // Get user's profile data for the notification - ensure it loads before proceeding
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error fetching user profile for notification:', profileError)
        return
      }

      // Ensure we have the user name before sending notification
      if (!userProfile?.full_name) {
        console.warn('User profile name not available, skipping notification')
        return
      }

      const userName = userProfile.full_name

      // Use centralized notification builder
      const notificationPayload = buildHostUpdateNotification({
        userId: event.host_id,
        eventId: event.id,
        eventTitle: event.title,
        userName: userName,
        action: currentState === 'going' ? 'joined' : 'left',
        additionalData: {
          attendeeId: user.id
        }
      })

      // Queue the notification instead of sending immediately
      const { error: queueError } = await supabase
        .from('notification_queue')
        .insert({
          user_id: notificationPayload.user_id,
          event_id: notificationPayload.event_id,
          type: notificationPayload.type,
          title: notificationPayload.title,
          body: notificationPayload.body,
          scheduled_for: notificationPayload.scheduled_for,
          data: notificationPayload.data
        })

      if (queueError) {
        console.error('Error queuing host update notification:', queueError)
      }
    } catch (error) {
      console.error('Error sending attendance change notification:', error)
    }
  }


  const handleUserPress = (user: any) => {
    setSelectedUser(user)
    setShowProfileModal(true)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const getGoingCount = () => {
    return attendees.filter(a => a.status === 'going').length
  }

  const isEventFull = () => {
    if (!event.max_attendees) return false
    return getGoingCount() >= event.max_attendees
  }

  const renderAttendee = (attendee: EventAttendee) => {
    const user = attendee.user
    if (!user) return null

    return (
      <TouchableOpacity
        key={attendee.id}
        style={styles.attendeeItem}
        onPress={() => handleUserPress(user)}
      >
        <View style={styles.attendeeAvatar}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color={theme.textSecondary} />
          )}
        </View>
        <View style={styles.attendeeInfo}>
          <View style={styles.attendeeNameRow}>
            <Text style={[styles.attendeeName, { color: theme.text }]}>{user.full_name || 'Unknown'}</Text>
            {user.id === event.host_id && (
              <View style={[styles.hostBadge, { backgroundColor: theme.warning }]}>
                <Ionicons name="star" size={12} color={theme.buttonText} />
                <Text style={[styles.hostBadgeText, { color: theme.buttonText }]}>Host</Text>
              </View>
            )}
          </View>
          <Text style={[styles.attendeeStatus, { color: theme.textSecondary }]}>
            {attendee.status === 'not_going' ? 'Not Going' : 'Going'}
          </Text>
        </View>
        <View style={[
          styles.statusIndicator,
          { backgroundColor: attendee.status === 'not_going' ? theme.error : theme.success }
        ]} />
      </TouchableOpacity>
    )
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Event not found</Text>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Minimal Top Bar with Back Button and Options */}
      <SafeAreaView edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 0 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowOptionsModal(true)} style={{ padding: 6 }}>
            <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Title and College ABOVE image */}
        <View style={[styles.content, { paddingTop: 4, paddingBottom: 8 }]}>
          {college && (
            <View style={styles.collegeRow}>
              {college.logo_url && (
                <Image 
                  source={{ uri: college.logo_url }} 
                  style={styles.collegeLogo}
                  resizeMode="contain"
                />
              )}
              <Text style={[styles.collegeName, { color: theme.textSecondary }]}> {college.name}</Text>
            </View>
          )}
          <View style={styles.titleRow}>
            <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
            {event.privacy === 'invite_only' && (
              <View style={styles.privacyBadge}>
                <Ionicons name="lock-closed" size={16} color={theme.error} />
                <Text style={styles.privacyText}>Friends Only</Text>
              </View>
            )}
          </View>
        </View>

        {/* Event Image */}
        {event.image_url && (
          <Image source={{ uri: event.image_url }} style={styles.eventImage} />
        )}

        {/* Event Content */}
        <View style={styles.content}>

          {/* Description */}
          {event.description && (
            <Text style={[styles.eventDescription, { color: theme.textSecondary }]}>{event.description}</Text>
          )}

          {/* Host Info */}
          {(hostProfile || hostOrganization) && (
            <View style={styles.hostSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Hosted by</Text>
              {hostOrganization ? (
                <View style={[styles.hostInfo, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.hostAvatar, { backgroundColor: theme.surface }]}>
                    {hostOrganization.icon ? (
                      <Image source={{ uri: hostOrganization.icon }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="business" size={24} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={styles.hostNameRow}>
                    <Text style={[styles.hostName, { color: theme.text }]}>{hostOrganization.name || 'Unknown Organization'}</Text>
                  </View>
                </View>
              ) : hostProfile ? (
                <TouchableOpacity 
                  style={[styles.hostInfo, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => handleUserPress(hostProfile)}
                >
                  <View style={[styles.hostAvatar, { backgroundColor: theme.surface }]}>
                    {hostProfile.avatar_url ? (
                      <Image source={{ uri: hostProfile.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person" size={24} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={styles.hostNameRow}>
                    <Text style={[styles.hostName, { color: theme.text }]}>{hostProfile.full_name || 'Unknown'}</Text>
                    {isHost && (
                      <View style={styles.hostBadge}>
                        <Ionicons name="star" size={12} color="white" />
                        <Text style={styles.hostBadgeText}>You</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Event Details (no card background/border) */}
          <View style={[styles.detailsSection, { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0, padding: 0 }]}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={theme.primary} />
              <Text style={[styles.detailText, { color: theme.text }]}>{formatDate(event.event_date)}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color={theme.warning} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {event.end_time
                  ? `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
                  : `${formatTime(event.start_time)}`}
              </Text>
              {event.end_time && isMidnightSpanningEvent(event.start_time, event.end_time) && (
                <View style={[styles.midnightIndicator, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
                  <Ionicons name="moon" size={12} color={theme.primary} />
                  <Text style={[styles.midnightText, { color: theme.primary }]}>
                    Next day
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color={theme.error} />
              <Text style={[styles.detailText, { color: theme.text }]}>{event.location}</Text>
            </View>
            
            {event.max_attendees && (
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={20} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  Max {event.max_attendees} attendees
                </Text>
              </View>
            )}

          {/* Event Tags */}
          {Array.isArray((event as any).tags) && (event as any).tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {(event as any).tags.map((tag: string, index: number) => (
                <View key={index} style={styles.eventTag}>
                  <Text style={styles.eventTagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Attendance Actions - Don't show in org mode for org events */}
          {!isHost && !(isOrgMode && (event as any).isOrgEvent) && (
            <View style={styles.attendanceSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Attendance</Text>
              {isEventFull() && !userAttendance ? (
                <View style={[styles.eventFullContainer, { backgroundColor: theme.error + '20', borderColor: theme.error }]}>
                  <View style={styles.eventFullHeader}>
                    <Ionicons name="people" size={24} color={theme.error} />
                    <Text style={[styles.eventFullTitle, { color: theme.error }]}>Event is Full</Text>
                  </View>
                  <Text style={[styles.eventFullMessage, { color: theme.text }]}>
                    This event has reached its maximum capacity.
                  </Text>
                  <View style={styles.singleAttendanceButton}>
                    <TouchableOpacity
                      style={[
                        styles.goingButton,
                        { 
                          backgroundColor: userAttendance === 'going' ? theme.surface : theme.primary, 
                          borderColor: userAttendance === 'going' ? theme.border : theme.primary 
                        }
                      ]}
                      onPress={handleAttendanceToggle}
                    >
                      <Ionicons 
                        name={userAttendance === 'going' ? "checkmark-circle-outline" : "checkmark-circle"} 
                        size={24} 
                        color={userAttendance === 'going' ? theme.success : theme.buttonText} 
                      />
                      <Text style={[
                        styles.goingButtonText,
                        { 
                          color: userAttendance === 'going' ? theme.text : theme.buttonText 
                        }
                      ]}>
                        {userAttendance === 'going' ? "I'm Going (Tap to Remove)" : "I'm Going"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Show loading placeholder while checking phone visibility to prevent flash (not for org events) */}
                  {hostProfile?.phone_number && !hostOrganization && hostPhoneVisibilityLoading && (
                    <View style={styles.contactHostSection}>
                      <Text style={[styles.contactHostLabel, { color: theme.textSecondary }]}>
                        Or contact the host directly:
                      </Text>
                      <View style={[styles.contactHostButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Ionicons name="call" size={16} color={theme.textTertiary} />
                        <View style={[styles.loadingPlaceholder, { backgroundColor: theme.divider }]} />
                      </View>
                    </View>
                  )}

                  {/* Only show phone number after loading completes and permission is granted */}
                  {hostProfile?.phone_number && !hostOrganization && !hostPhoneVisibilityLoading && showHostPhone && (
                    <View style={styles.contactHostSection}>
                      <Text style={[styles.contactHostLabel, { color: theme.textSecondary }]}>
                        Or contact the host directly:
                      </Text>
                      <TouchableOpacity style={[styles.contactHostButton, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
                        <Ionicons name="call" size={16} color={theme.primary} />
                        <Text style={[styles.contactHostText, { color: theme.primary }]}>
                          {hostProfile.phone_number}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.attendanceButtonsContainer}>
                  {userAttendance === 'not_going' ? (
                    // When marked as "not going", show only full-width "Not Going" button
                    <TouchableOpacity
                      style={[
                        styles.notGoingButton,
                        { 
                          backgroundColor: theme.surface,
                          borderColor: theme.error,
                          width: '100%'
                        }
                      ]}
                      onPress={handleNotGoing}
                    >
                      <Ionicons 
                        name="close-circle" 
                        size={24} 
                        color={theme.error} 
                      />
                      <Text style={[
                        styles.notGoingButtonText,
                        { color: theme.error }
                      ]}>
                        Not Going (Tap to Mark Going)
                      </Text>
                    </TouchableOpacity>
                  ) : userAttendance === 'going' ? (
                    // When marked as "going", show only full-width "I'm Going" button (hide "Not Going")
                    <TouchableOpacity
                      style={[
                        styles.goingButton,
                        { 
                          backgroundColor: theme.surface, 
                          borderColor: theme.border,
                          width: '100%'
                        }
                      ]}
                      onPress={handleAttendanceToggle}
                    >
                      <Ionicons 
                        name="checkmark-circle-outline" 
                        size={24} 
                        color={theme.success} 
                      />
                      <Text style={[
                        styles.goingButtonText,
                        { color: theme.text }
                      ]}>
                        I'm Going (Tap to Remove)
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    // When no status, show "I'm Going" button (and "Not Going" if invited)
                    <>
                      <TouchableOpacity
                        style={[
                          styles.goingButton,
                          { 
                            backgroundColor: theme.primary, 
                            borderColor: theme.primary,
                            flex: 1,
                            marginRight: isInvited ? 8 : 0
                          }
                        ]}
                        onPress={handleAttendanceToggle}
                      >
                        <Ionicons 
                          name="checkmark-circle" 
                          size={24} 
                          color={theme.buttonText} 
                        />
                        <Text style={[
                          styles.goingButtonText,
                          { color: theme.buttonText }
                        ]}>
                          I'm Going
                        </Text>
                      </TouchableOpacity>
                      {isInvited && (
                        <TouchableOpacity
                          style={[
                            styles.notGoingButton,
                            { 
                              backgroundColor: theme.surface,
                              borderColor: theme.error,
                              flex: 1
                            }
                          ]}
                          onPress={handleNotGoing}
                        >
                          <Ionicons 
                            name="close-circle-outline" 
                            size={24} 
                            color={theme.error} 
                          />
                          <Text style={[
                            styles.notGoingButtonText,
                            { color: theme.error }
                          ]}>
                            Not Going
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Host Status */}
          {isHost && (
            <View style={[styles.hostStatusContainer, { backgroundColor: theme.warning + '20', borderColor: theme.warning }]}>
              <View style={styles.hostStatusHeader}>
                <Ionicons name="star" size={20} color={theme.warning} />
                <Text style={[styles.hostStatusTitle, { color: theme.warning }]}>You are the host</Text>
              </View>
              <Text style={[styles.hostStatusText, { color: theme.text }]}>
                You are automatically marked as going to this event.
              </Text>
            </View>
          )}

          {/* Attendees Section - Only show going and maybe */}
          <View style={[styles.attendeesContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.attendeesHeader}>
              <Text style={[styles.attendeesTitle, { color: theme.text }]}>Who's Going</Text>
              <View style={styles.attendeeStats}>
                <Text style={[styles.attendeeStatsText, { color: theme.textSecondary }]}>
                  {getGoingCount()} going
                  {event.max_attendees && ` out of ${event.max_attendees} max`}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading attendees...</Text>
              </View>
            ) : profilesLoaded ? (
              <View style={styles.attendeesList}>
                {attendees.filter(a => a.status === 'going').length > 0 ? (
                  attendees
                    .filter(a => a.status === 'going') // Only show "going" attendees
                    .map(renderAttendee)
                ) : (
                  <Text style={[styles.noAttendeesText, { color: theme.textSecondary }]}>No attendees yet</Text>
                )}
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
              </View>
            )}
          </View>

          {/* Not Going Section - Only for private events */}
          {event.privacy === 'invite_only' && notGoingAttendees.length > 0 && (
            <View style={[styles.attendeesContainer, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
              <View style={styles.attendeesHeader}>
                <Text style={[styles.attendeesTitle, { color: theme.text }]}>Who's Not Going</Text>
                <View style={styles.attendeeStats}>
                  <Text style={[styles.attendeeStatsText, { color: theme.textSecondary }]}>
                    {notGoingAttendees.length} not going
                  </Text>
                </View>
              </View>
              <View style={styles.attendeesList}>
                {notGoingAttendees.map(renderAttendee)}
              </View>
            </View>
          )}

          {/* Invited Section - Only for private events */}
          {event.privacy === 'invite_only' && (() => {
            // Filter out users who are already going or not going
            const pendingInvitedUsers = invitedUsers.filter((user) => {
              const isGoing = attendees.some(a => a.user_id === user.id && a.status === 'going')
              const isNotGoing = attendees.some(a => a.user_id === user.id && a.status === 'not_going')
              return !isGoing && !isNotGoing
            })
            
            if (pendingInvitedUsers.length === 0) return null
            
            return (
              <View style={[styles.attendeesContainer, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
                <View style={styles.attendeesHeader}>
                  <Text style={[styles.attendeesTitle, { color: theme.text }]}>Who's Invited</Text>
                  <View style={styles.attendeeStats}>
                    <Text style={[styles.attendeeStatsText, { color: theme.textSecondary }]}>
                      {pendingInvitedUsers.length} invited
                    </Text>
                  </View>
                </View>
                <View style={styles.attendeesList}>
                  {pendingInvitedUsers.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      style={styles.attendeeItem}
                      onPress={() => handleUserPress(user)}
                    >
                      <View style={styles.attendeeAvatar}>
                        {user.avatar_url ? (
                          <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                        ) : (
                          <Ionicons name="person" size={24} color={theme.textSecondary} />
                        )}
                      </View>
                      <View style={styles.attendeeInfo}>
                        <Text style={[styles.attendeeName, { color: theme.text }]}>{user.full_name || 'Unknown'}</Text>
                        <Text style={[styles.attendeeStatus, { color: theme.textSecondary }]}>Invited</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          })()}
        </View>
      </View>
      </ScrollView>

      {/* Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.menuContent, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <View style={[styles.menuHeader, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                {(isHost || isOrgOwner) ? 'Event Options' : 'Options'}
              </Text>
              <TouchableOpacity onPress={() => setShowOptionsModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.menuItemsContainer}>
              {isHost || isOrgOwner ? (
                <>
                  {/* Edit Event */}
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      setShowOptionsModal(false)
                      setShowEditModal(true)
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                        <Ionicons name="create-outline" size={22} color={theme.primary} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Edit Event</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Invite/Notify People - Only for personal events */}
                  {!((event as any).isOrgEvent || (!event.host_id && (event as any).org_id)) && (
                    <TouchableOpacity
                      style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => {
                        setShowOptionsModal(false)
                        setShowInviteModal(true)
                      }}
                    >
                      <View style={styles.menuItemContent}>
                        <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                          <Ionicons 
                            name={event.privacy === 'invite_only' ? "person-add-outline" : "notifications-outline"} 
                            size={22} 
                            color={theme.primary} 
                          />
                        </View>
                        <View style={styles.menuItemTextContainer}>
                          <Text style={[styles.menuItemTitle, { color: theme.text }]}>
                            {event.privacy === 'invite_only' ? 'Invite People' : 'Notify People'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  
                  {/* Delete Event */}
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      setShowOptionsModal(false)
                      handleDeleteEvent()
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                        <Ionicons name="trash-outline" size={22} color={theme.error} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.error }]}>Delete Event</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Report Event */}
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      setShowOptionsModal(false)
                      setReportModalVisible(true)
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                        <Ionicons name="flag" size={22} color={theme.error} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report Event</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Report Event Photo - Show if event has image_url */}
                  {event.image_url && (
                    <TouchableOpacity
                      style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => {
                        setShowOptionsModal(false)
                        setSelectedPhotoId(event.id) // Use event ID
                        setSelectedPhotoUrl(event.image_url || null) // Store the photo URL
                        setReportPhotoModalVisible(true)
                      }}
                    >
                      <View style={styles.menuItemContent}>
                        <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                          <Ionicons name="image-outline" size={22} color={theme.error} />
                        </View>
                        <View style={styles.menuItemTextContainer}>
                          <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report Event Photo</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  
                  {/* Report Photo - Only show if event has uploaded photos */}
                  {eventPhotos.length > 0 && (
                    <TouchableOpacity
                      style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => {
                        setShowOptionsModal(false)
                        // If only one photo, report it directly; otherwise show selector
                        if (eventPhotos.length === 1) {
                          setSelectedPhotoId(eventPhotos[0].id)
                          setSelectedPhotoUrl(eventPhotos[0].image_url)
                          setReportPhotoModalVisible(true)
                        } else {
                          // Show photo selector modal
                          setPhotoSelectorVisible(true)
                        }
                      }}
                    >
                      <View style={styles.menuItemContent}>
                        <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                          <Ionicons name="images-outline" size={22} color={theme.error} />
                        </View>
                        <View style={styles.menuItemTextContainer}>
                          <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report Uploaded Photo</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Invite/Notify Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <EventInviteScreen
          invitedUsers={invitedUsers.map(u => u.id)}
          isEditMode={true}
          eventId={event.id}
          onInvitesUpdated={handleInvitesUpdated}
          onClose={() => setShowInviteModal(false)}
        />
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <CreateEventScreen
          onBack={() => setShowEditModal(false)}
          onEventCreated={async (updatedEvent) => {
            setShowEditModal(false)
            // Refresh the event data by navigating to the updated event
            if (updatedEvent) {
              // Navigate to the updated event
              navigation.dispatch(
                CommonActions.navigate({
                  name: 'EventDetail',
                  params: { event: updatedEvent }
                })
              )
            } else {
              // If no updated event, just close modal
              // The screen will refresh when it regains focus
            }
          }}
          isOrgEvent={(event as any).isOrgEvent || (!event.host_id && (event as any).org_id)}
          orgId={(event as any).org_id}
          eventId={event.id}
          existingEvent={event}
          isEditMode={true}
        />
      </Modal>

      {/* Profile Modal */}
      <ProfileModal
        isVisible={showProfileModal}
        onClose={() => {
          setShowProfileModal(false)
          setSelectedUser(null)
        }}
        user={selectedUser}
        isHostingEvent={isHost}
      />

      {/* Report Modal */}
      <ReportModal
        isVisible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleReportEvent}
        contentType="event"
      />

      {/* Photo Selector Modal (if multiple photos) */}
      <Modal
        visible={photoSelectorVisible}
        transparent={true}
        animationType="fade"
          onRequestClose={() => {
            setPhotoSelectorVisible(false)
            setSelectedPhotoId(null)
            setSelectedPhotoUrl(null)
          }}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => {
            setPhotoSelectorVisible(false)
            setSelectedPhotoId(null)
            setSelectedPhotoUrl(null)
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.menuContent, { backgroundColor: theme.card, borderColor: theme.border, maxHeight: '70%' }]}
          >
            <View style={[styles.menuHeader, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>Select Photo to Report</Text>
              <TouchableOpacity onPress={() => {
                setPhotoSelectorVisible(false)
                setSelectedPhotoId(null)
                setSelectedPhotoUrl(null)
              }}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {eventPhotos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border, margin: 8 }]}
                  onPress={() => {
                    setSelectedPhotoId(photo.id)
                    setSelectedPhotoUrl(photo.image_url)
                    setPhotoSelectorVisible(false)
                    setReportPhotoModalVisible(true)
                  }}
                >
                  <Image source={{ uri: photo.image_url }} style={{ width: '100%', height: 200, borderRadius: 8 }} resizeMode="cover" />
                  {photo.caption && (
                    <Text style={[styles.menuItemTitle, { color: theme.textSecondary, marginTop: 8 }]} numberOfLines={2}>
                      {photo.caption}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Report Photo Modal */}
      <ReportModal
        isVisible={reportPhotoModalVisible}
        onClose={() => {
          setReportPhotoModalVisible(false)
          setSelectedPhotoId(null)
        }}
        onSubmit={handleReportPhoto}
        contentType="event_photo"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    marginBottom: 20,
  },
  eventImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  content: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  collegeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  collegeLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  collegeName: {
    fontSize: 16,
    fontWeight: '500',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe6e6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  privacyText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  eventDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  hostSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hostNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostName: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f39c12',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hostBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  detailsSection: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
  },
  attendanceSection: {
    marginBottom: 20,
  },
  attendanceButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attendanceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  attendanceButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  attendanceButtonText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  attendanceButtonTextActive: {
    color: 'white',
  },
  eventFullContainer: {
    backgroundColor: '#ffe6e6',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  eventFullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventFullTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e74c3c',
    marginLeft: 8,
  },
  eventFullMessage: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
    marginBottom: 12,
  },
  contactHostSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  contactHostLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  contactHostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3498db',
  },
  contactHostText: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '500',
    marginLeft: 8,
  },
  loadingPlaceholder: {
    height: 16,
    width: 120,
    borderRadius: 4,
    marginLeft: 8,
  },
  noContactText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  hostStatusContainer: {
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f39c12',
    marginBottom: 20,
  },
  hostStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hostStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f39c12',
    marginLeft: 8,
  },
  hostStatusText: {
    fontSize: 14,
    color: '#2c3e50',
  },
  attendeesContainer: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  attendeesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  attendeesTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  attendeeStats: {
    flex: 1,
    alignItems: 'flex-end',
  },
  attendeeStatsText: {
    fontSize: 14,
  },
  attendeesList: {
    gap: 12,
  },
  attendeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attendeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  attendeeName: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  attendeeStatus: {
    fontSize: 14,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  goingIndicator: {
    backgroundColor: '#27ae60',
  },
  maybeIndicator: {
    backgroundColor: '#f39c12',
  },
  notGoingIndicator: {
    backgroundColor: '#e74c3c',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  noAttendeesText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  backButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  // Tags styles
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  eventTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  eventTagText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '600',
  },
  midnightIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  midnightText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  singleAttendanceButton: {
    width: '100%',
    marginTop: 4,
  },
  attendanceButtonsContainer: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 4,
  },
  goingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 2,
  },
  goingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  notGoingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 2,
  },
  notGoingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 280,
    maxWidth: '90%',
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
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
    borderWidth: 1,
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
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },

})