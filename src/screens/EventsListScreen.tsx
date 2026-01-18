import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  Alert,
  Linking,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { safeBlockOrQuery } from '../utils/queryHelpers'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import { getEventEndDate, isEventEnded, isEventInFuture, parseLocalDate } from '../utils/eventTimeUtils'
import GeneralPhotoGalleryScreen from './GeneralPhotoGalleryScreen'
import { PREDEFINED_TAGS } from '../constants/tags'
import EventCard from '../components/common/EventCard'
import { groupEventsByTime, GroupedEvent } from '../utils/eventGrouping'
import { withNetworkErrorHandling, isNetworkError } from '../utils/networkUtils'

type EventListItem = EventWithAttendees & { goingCount: number; tags?: string[] }

type FilterType = 'all'
type SortType = 'date_asc' | 'date_desc' | 'people_going' | 'recently_created' | 'alphabetical'
type TimeFilterType = 'student' | 'org' | 'photo_gallery'

interface AdvancedFilters {
  friendsOnly: boolean
  peopleGoing: boolean
  last24Hours: boolean
  selectedTags: string[]
}

const { height: screenHeight } = Dimensions.get('window')

export default function EventsListScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  const [events, setEvents] = useState<EventListItem[]>([])
  const [filteredEvents, setFilteredEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter] = useState<FilterType>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>('student')
  const [hostProfiles, setHostProfiles] = useState<Record<string, any>>({})
  const [hostOrganizations, setHostOrganizations] = useState<Record<string, any>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userAttendances, setUserAttendances] = useState<Record<string, string>>({})
  const [userInvitations, setUserInvitations] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Set<string>>(new Set())
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [pastEventStates, setPastEventStates] = useState<{[eventId: string]: {showAttendees: boolean, eventImages: string[]}}>({})
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    friendsOnly: false,
    peopleGoing: false,
    last24Hours: false,
    selectedTags: [],
  })
  const [sortBy, setSortBy] = useState<SortType>('date_asc')
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (eventId: string) => {
    setExpandedEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  // Refresh events when the tab is focused and set up auto-refresh
  useFocusEffect(
    React.useCallback(() => {
      // Initial fetch
      fetchEvents()
      
      // Set up auto-refresh interval (every 5 seconds)
      const refreshInterval = setInterval(() => {
        fetchEvents()
      }, 5000)
      
      return () => {
        clearInterval(refreshInterval)
      }
    }, [])
  )

  useEffect(() => {
    filterEvents(events, 'all')
  }, [timeFilter, events, userAttendances, advancedFilters, sortBy])

  const onRefresh = async () => {
    setRefreshing(true)
    // Preserve expanded state during refresh
    const preservedExpandedIds = new Set(expandedEventIds)
    try {
      await fetchEvents()
      // Restore expanded state after refresh
      setExpandedEventIds(preservedExpandedIds)
    } catch (error: any) {
      // Only log errors if it's not a network error (network errors are handled by wrapper)
      if (!isNetworkError(error)) {
        console.error('Error refreshing events:', error)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const formatDate = (dateString: string) => {
    const { formatDateString } = require('../utils/eventTimeUtils')
    return formatDateString(dateString)
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const fetchEvents = async (): Promise<void | null> => {
    return await withNetworkErrorHandling(async () => {
      try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

      // OPTIMIZED: Run ALL queries in parallel for maximum performance
      const [
        friendsResult,
        invitedEventIds,
        userAttendancesResult,
        orgUserAttendancesResult,
        followedOrgsResult,
        blockedOrgsResult,
        blockedUsersResult,
        profileResult,
        publicEventsResult,
        orgEventsResult
      ] = await Promise.all([
        fetchFriends(user.id),
        getInvitedEventIds(user.id),
        supabase
          .from('event_attendees')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'going'),
        supabase
          .from('org_event_attendees')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'going'),
        supabase
          .from('org_followers')
          .select('org_id')
          .eq('user_id', user.id),
        supabase
          .from('org_blocks')
          .select('org_id')
          .eq('user_id', user.id),
        supabase
          .from('user_blocks')
          .select('blocked_id, blocker_id')
          .or(safeBlockOrQuery(user.id)),
        supabase
          .from('profiles')
          .select('org_ownership_id')
          .eq('id', user.id)
          .maybeSingle(),
        // Fetch public events (host profiles will be fetched separately if join fails)
        supabase
          .from('events')
          .select(`
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            ),
            host:profiles(
              id,
              full_name,
              username,
              avatar_url
            )
          `)
          .eq('privacy', 'public')
          .neq('host_id', user.id)
          .order('event_date', { ascending: true }),
        // Fetch org events (organization data will be fetched separately if join fails)
        supabase
          .from('org_events')
          .select(`
            *,
            attendees:org_event_attendees(
              id,
              user_id,
              status
            ),
            org:organizations(
              id,
              name,
              icon,
              type
            )
          `)
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true })
      ])

      // Extract data from results
      const attendingEventIds = new Set((userAttendancesResult.data || []).map(a => a.event_id))
      const attendingOrgEventIds = new Set((orgUserAttendancesResult.data || []).map(a => a.event_id))
      const followedOrgIds = new Set((followedOrgsResult.data || []).map(f => f.org_id))
      const blockedOrgIds = new Set((blockedOrgsResult.data || []).map(b => b.org_id))
      // Separate blocked users (users I blocked) from blockers (users who blocked me)
      const blockedUserIds = new Set<string>() // Users I have blocked
      const blockerIds = new Set<string>() // Users who have blocked me
      if (blockedUsersResult.data) {
        blockedUsersResult.data.forEach((b: any) => {
          if (b.blocker_id === user.id) {
            blockedUserIds.add(b.blocked_id) // I blocked them
          }
          if (b.blocked_id === user.id) {
            blockerIds.add(b.blocker_id) // They blocked me
          }
        })
      }
      const userOwnedOrgId = profileResult.data?.org_ownership_id || null

      if (__DEV__) {
        console.log('User owned org ID:', userOwnedOrgId)
      }

      // Check for errors - if join failed, we'll fetch profiles separately
      let publicEvents = []
      let orgEvents = []
      
      if (publicEventsResult.error) {
        // Join failed, fetch events without host profiles
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select(`
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            )
          `)
          .eq('privacy', 'public')
          .neq('host_id', user.id)
          .order('event_date', { ascending: true })
        
        if (eventsError) throw eventsError
        publicEvents = (eventsData || []).map(event => ({
          ...event,
          hostProfile: null // Will be fetched separately
        }))
      } else {
        // Join succeeded, use the data
        publicEvents = (publicEventsResult.data || []).map(event => ({
          ...event,
          hostProfile: event.host || null
        }))
      }
      
      if (orgEventsResult.error) {
        // Join failed, fetch org events without org data
        const { data: orgEventsData, error: orgEventsError } = await supabase
          .from('org_events')
          .select(`
            *,
            attendees:org_event_attendees(
              id,
              user_id,
              status
            )
          `)
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true })
        
        if (orgEventsError) throw orgEventsError
        orgEvents = (orgEventsData || []).map(event => {
          const userOwnsThisOrg = userOwnedOrgId === event.org_id
          return {
            ...event,
            isOrgEvent: true,
            isFollowedOrg: followedOrgIds.has(event.org_id),
            userOwnsOrg: userOwnsThisOrg,
            hostOrg: null // Will be fetched separately
          }
        }).filter(event => !blockedOrgIds.has(event.org_id))
      } else {
        // Join succeeded, use the data
        orgEvents = (orgEventsResult.data || []).map(event => {
          const userOwnsThisOrg = userOwnedOrgId === event.org_id
          if (__DEV__ && userOwnsThisOrg) {
            console.log('Found org event owned by user:', event.id, event.title, 'org_id:', event.org_id)
          }
          return {
            ...event,
            isOrgEvent: true,
            isFollowedOrg: followedOrgIds.has(event.org_id),
            userOwnsOrg: userOwnsThisOrg,
            hostOrg: event.org || null
          }
        }).filter(event => !blockedOrgIds.has(event.org_id))
      }
      
      // Filter out events hosted by users who have blocked me (blockers)
      // If Person A blocks Person B, Person B should not see Person A's events
      publicEvents = publicEvents.filter(event => {
        if (!event.host_id) return true
        return !blockerIds.has(event.host_id)
      })
      
      // Sort org events: followed orgs first, then others (both sorted by date)
      orgEvents.sort((a, b) => {
        const aFollowed = (a as any).isFollowedOrg ? 0 : 1
        const bFollowed = (b as any).isFollowedOrg ? 0 : 1
        if (aFollowed !== bFollowed) {
          return aFollowed - bFollowed // Followed orgs come first
        }
        // If both are followed or both are not, sort by date
        return parseLocalDate(a.event_date).getTime() - parseLocalDate(b.event_date).getTime()
      })

      // Combine all events and remove duplicates
      // NOTE: Only include public events and org events - private events are excluded
      // Private events should only appear in MyEvents tab (Invited/Hosting/Attending)
      const allEvents = [...publicEvents, ...orgEvents]
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.id === event.id)
      )

      // Filter out events user is already attending (both personal and org events)
      // Also explicitly exclude any private events (safety check)
      // Exclude events hosted by blocked users AND blockers
      const filteredEvents = uniqueEvents.filter(event => {
        // Exclude events hosted by users I have blocked
        if (!(event as any).isOrgEvent && blockedUserIds.has(event.host_id)) {
          return false
        }
        // Exclude events hosted by users who have blocked me (blockers)
        // If Person A blocks Person B, Person B should not see Person A's events
        if (!(event as any).isOrgEvent && blockerIds.has(event.host_id)) {
          return false
        }
        
        // Exclude events user is already attending
        if ((event as any).isOrgEvent) {
          if (attendingOrgEventIds.has(event.id)) {
            return false
          }
        } else {
          if (attendingEventIds.has(event.id)) {
            return false
          }
          // Explicitly exclude private events - they should only show in MyEvents tab
          if (event.privacy === 'invite_only') {
            return false
          }
        }
        return true
      })

      // Calculate attendee counts and filter by capacity
      // Don't filter by timeFilter here - let filterEvents handle that
      // This ensures all events are available for filtering
      const eventsWithCounts = filteredEvents
        .map(event => ({
        ...event,
        goingCount: event.attendees?.filter((a: any) => a.status === 'going').length || 0,
      }))
        .filter(event => {
          // Only show events that haven't reached max capacity (if defined)
          // BUT keep all events if user owns the org (even if at capacity)
          if ((event as any).isOrgEvent && (event as any).userOwnsOrg) {
            return true // Keep all events user owns, regardless of capacity
          }
          if (event.max_attendees && event.max_attendees > 0) {
            return event.goingCount < event.max_attendees
          }
          // If no max capacity, show the event
          return true
        })

      // Set events immediately for faster UI response (host profiles already included)
      setEvents(eventsWithCounts)
      setLoading(false)

      // Build host profiles map from already-fetched data and fetch any missing ones
      // Preserve existing profiles to prevent flickering during auto-refresh
      const hostProfilesMap: Record<string, any> = {}
      const missingHostIds: string[] = []
      
      publicEvents.forEach(event => {
        if (event.hostProfile) {
          hostProfilesMap[event.host_id] = event.hostProfile
        } else if (event.host_id) {
          missingHostIds.push(event.host_id)
        }
      })
      
      // Fetch any missing host profiles that weren't in the join query
      if (missingHostIds.length > 0) {
        const uniqueMissingIds = [...new Set(missingHostIds)]
        const { data: missingProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', uniqueMissingIds)
          .eq('otp_verified', true)
        
        if (missingProfiles) {
          missingProfiles.forEach(profile => {
            hostProfilesMap[profile.id] = profile
          })
        }
      }
      
      // Update state by merging existing profiles with new ones (preserves existing during refresh)
      setHostProfiles(prev => {
        const updated = { ...prev }
        // Update with new data, but keep existing profiles that aren't being updated
        Object.keys(hostProfilesMap).forEach(id => {
          updated[id] = hostProfilesMap[id]
        })
        return updated
      })

      // Build host organizations map from already-fetched data (initial set, will be updated by fetchHostOrganizations)
      const hostOrgsMap: Record<string, any> = {}
      orgEvents.forEach(event => {
        if (event.hostOrg) {
          hostOrgsMap[event.id] = event.hostOrg
        }
      })
      setHostOrganizations(hostOrgsMap)

      // Fetch remaining data in parallel without blocking UI (attendee profiles, photos, etc.)
      // Note: Host profiles are already loaded above, so we skip fetchHostProfiles
      Promise.all([
        fetchHostOrganizations(eventsWithCounts),
        fetchAttendeeProfiles(eventsWithCounts),
        fetchEventPhotos(eventsWithCounts),
        fetchUserAttendances(eventsWithCounts),
        fetchUserInvitations(eventsWithCounts)
      ]).catch(error => {
        if (!isNetworkError(error)) {
          console.error('Error fetching additional data:', error)
        }
      })
      
      if (!loading) {
        setRefreshing(false)
      }
      return undefined
    } catch (error: any) {
      // Only log errors if it's not a network error (network errors are handled by wrapper)
      if (!isNetworkError(error)) {
        console.error('Error fetching events:', error)
      } else {
        // If it's a network error, the wrapper already handled it, just update loading state
        setLoading(false)
        setRefreshing(false)
      }
      return undefined
    }
    }, () => fetchEvents(), true) // Pass retry callback and suppress errors
  }

  const fetchFriends = async (userId: string) => {
    try {
      const { data: friendsData } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted')

      if (friendsData) {
        const friendIds = new Set(friendsData.map(f => f.friend_id))
        setFriends(friendIds)
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching friends:', error)
      }
    }
  }

  const getInvitedEventIds = async (userId: string) => {
    try {
      const { data: invitations } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', userId)

      return invitations?.map(inv => inv.event_id) || []
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching invitations:', error)
      }
      return []
    }
  }

  const fetchHostProfiles = async (eventsList: EventWithAttendees[]) => {
    try {
      // Only fetch profiles for events that are NOT org events
      const nonOrgEvents = eventsList.filter(event => !(event as any).isOrgEvent && !(event as any).org_id)
      const hostIds = [...new Set(nonOrgEvents.map(event => event.host_id).filter(Boolean))]
      if (hostIds.length === 0) return

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', hostIds)
        .eq('otp_verified', true) // Only show OTP verified users

      if (profiles) {
        setHostProfiles(prev => {
          const updated = { ...prev }
          profiles.forEach(profile => {
            updated[profile.id] = profile
          })
          return updated
        })
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching host profiles:', error)
      }
    }
  }

  const fetchHostOrganizations = async (eventsList: EventWithAttendees[]) => {
    try {
      // Fetch organizations for events that ARE org events
      const orgEvents = eventsList.filter(event => (event as any).isOrgEvent)
      if (orgEvents.length === 0) return

      // Get unique org_ids from org events
      const orgIds = [...new Set(orgEvents.map(event => (event as any).org_id).filter(Boolean))]
      if (orgIds.length === 0) return

      const { data: organizations } = await supabase
        .from('organizations')
        .select('id, name, icon, type')
        .in('id', orgIds)

      if (organizations) {
        // Create a map: event.id -> organization (merge with existing)
        setHostOrganizations(prev => {
          const updated = { ...prev }
          orgEvents.forEach(event => {
            const org = organizations.find(o => o.id === (event as any).org_id)
            if (org) {
              updated[event.id] = org
            }
          })
          return updated
        })
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching host organizations:', error)
      }
    }
  }

  const fetchEventPhotos = async (eventsList: EventWithAttendees[]) => {
    try {
      // Get all event IDs
      const eventIds = eventsList.map(event => event.id)
      
      if (eventIds.length === 0) return

      // Fetch photos for all events
      const { data: photos, error } = await supabase
        .from('event_photos')
        .select('id, event_id, image_url, created_at')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false })

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching event photos:', error)
        }
        return
      }

      // Group photos by event ID
      const photosByEvent = photos?.reduce((acc: any, photo: any) => {
        if (!acc[photo.event_id]) {
          acc[photo.event_id] = []
        }
        acc[photo.event_id].push(photo.image_url)
        return acc
      }, {}) || {}

      // Update past event states with fetched photos
      setPastEventStates(prev => {
        const updated = { ...prev }
        Object.keys(photosByEvent).forEach(eventId => {
          updated[eventId] = {
            ...updated[eventId],
            eventImages: photosByEvent[eventId]
          }
        })
        return updated
      })
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in fetchEventPhotos:', error)
      }
    }
  }

  const fetchAttendeeProfiles = async (eventsList: EventWithAttendees[]) => {
    try {
      // Get all unique user IDs from attendees
      const attendeeUserIds = new Set<string>()
      eventsList.forEach(event => {
        if (event.attendees) {
          event.attendees.forEach((attendee: any) => {
            attendeeUserIds.add(attendee.user_id)
          })
        }
      })

      if (attendeeUserIds.size === 0) return

      // Fetch profiles for all attendee user IDs
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', Array.from(attendeeUserIds))
        .eq('otp_verified', true) // Only show OTP verified users

      if (profiles) {
        const profilesMap = profiles.reduce((acc, profile) => {
          acc[profile.id] = profile
          return acc
        }, {} as Record<string, any>)

        // Update events with attendee profile information
        setEvents(prevEvents => 
          prevEvents.map(event => ({
            ...event,
            attendees: event.attendees?.map((attendee: any) => ({
              ...attendee,
              user: profilesMap[attendee.user_id] || null
            })) || []
          }))
        )
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching attendee profiles:', error)
      }
    }
  }

  const fetchUserAttendances = async (eventsList: EventWithAttendees[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const eventIds = eventsList.map(event => event.id)
      if (eventIds.length === 0) return

      const { data: attendances } = await supabase
        .from('event_attendees')
        .select('event_id, status')
        .eq('user_id', user.id)
        .in('event_id', eventIds)

      if (attendances) {
        const attendanceMap = attendances.reduce((acc, attendance) => {
          acc[attendance.event_id] = attendance.status
          return acc
        }, {} as Record<string, string>)
        setUserAttendances(attendanceMap)
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching user attendances:', error)
      }
    }
  }

  const fetchUserInvitations = async (eventsList: EventWithAttendees[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const eventIds = eventsList.map(event => event.id)
      if (eventIds.length === 0) return

      const { data: invitations } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', user.id)
        .in('event_id', eventIds)

      if (invitations) {
        const invitationSet = new Set(invitations.map(inv => inv.event_id))
        setUserInvitations(invitationSet)
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error fetching user invitations:', error)
      }
    }
  }

    const filterEvents = (eventsList: EventListItem[], filter: FilterType) => {
    let filtered = [...eventsList]

    // Apply time filter first (student vs org)
    // Note: Events are already filtered by type in fetchEvents, but we still need to filter by time
    if (timeFilter === 'student') {
      // Show all current personal events (not ended)
      filtered = filtered.filter(event => {
        return !isEventEnded(event.event_date, event.start_time, event.end_time) && !(event as any).isOrgEvent
      })
    } else if (timeFilter === 'org') {
      // Show all org events
      // BUT keep all events if user owns the org (including past ones)
      filtered = filtered.filter(event => {
        if (!(event as any).isOrgEvent) return false
        // If user owns this org, show ALL events (including past ones)
        if ((event as any).userOwnsOrg) {
          if (__DEV__) {
            console.log('Keeping org event (user owns org):', event.id, event.title)
          }
          return true
        }
        // Otherwise, only show current/upcoming events
        const isEnded = isEventEnded(event.event_date, event.start_time, event.end_time)
        if (__DEV__ && isEnded) {
          console.log('Filtering out ended org event:', event.id, event.title)
        }
        return !isEnded
      })
      // Preserve order: followed org events first, then others (both sorted by date)
      filtered.sort((a, b) => {
        const aFollowed = (a as any).isFollowedOrg ? 0 : 1
        const bFollowed = (b as any).isFollowedOrg ? 0 : 1
        if (aFollowed !== bFollowed) {
          return aFollowed - bFollowed // Followed orgs come first
        }
        // If both are followed or both are not, sort by date
        return parseLocalDate(a.event_date).getTime() - parseLocalDate(b.event_date).getTime()
      })
    }

    // Apply advanced filters
    if (advancedFilters.friendsOnly) {
      filtered = filtered.filter(event => 
        event.privacy === 'invite_only' || 
        friends.has(event.host_id)
      )
    }

    if (advancedFilters.peopleGoing) {
      filtered = filtered.filter(event => event.goingCount > 0)
    }

    if (advancedFilters.last24Hours) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      filtered = filtered.filter(event => new Date(event.created_at) > yesterday)
    }

    // Filter by selected tags
    if (advancedFilters.selectedTags.length > 0) {
      filtered = filtered.filter(event => 
        event.tags && event.tags.some(tag => advancedFilters.selectedTags.includes(tag))
      )
    }

    // Coming Events screen - no additional main filter needed
    // Events are already filtered to exclude hosting and already attending

    // Apply sorting (but preserve followed org priority for org events)
    if (timeFilter === 'org') {
      // For org events, maintain followed org priority, then apply sorting within each group
      filtered.sort((a, b) => {
        const aFollowed = (a as any).isFollowedOrg ? 0 : 1
        const bFollowed = (b as any).isFollowedOrg ? 0 : 1
        if (aFollowed !== bFollowed) {
          return aFollowed - bFollowed // Followed orgs come first
        }
        // Within same group (both followed or both not), apply sortBy
        switch (sortBy) {
          case 'date_asc':
            return parseLocalDate(a.event_date).getTime() - parseLocalDate(b.event_date).getTime()
          case 'date_desc':
            return parseLocalDate(b.event_date).getTime() - parseLocalDate(a.event_date).getTime()
          case 'people_going':
            return b.goingCount - a.goingCount
          case 'recently_created':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          case 'alphabetical':
            return a.title.localeCompare(b.title)
          default:
            return parseLocalDate(a.event_date).getTime() - parseLocalDate(b.event_date).getTime()
        }
      })
    } else {
      // For student events, apply normal sorting
      switch (sortBy) {
        case 'date_asc':
          filtered.sort((a, b) => parseLocalDate(a.event_date).getTime() - parseLocalDate(b.event_date).getTime())
          break
        case 'date_desc':
          filtered.sort((a, b) => parseLocalDate(b.event_date).getTime() - parseLocalDate(a.event_date).getTime())
          break
        case 'people_going':
          filtered.sort((a, b) => b.goingCount - a.goingCount)
          break
        case 'recently_created':
          filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          break
        case 'alphabetical':
          filtered.sort((a, b) => a.title.localeCompare(b.title))
          break
      }
    }

    setFilteredEvents(filtered as EventListItem[])
  }

  const renderPastEventCard = ({ item, hostProfile, hostOrg, userAttendance, isHost }: { 
    item: EventListItem, 
    hostProfile: any,
    hostOrg: any,
    userAttendance: string | null, 
    isHost: boolean 
  }) => {
    const eventState = pastEventStates[item.id] || { showAttendees: false, eventImages: [] }
    const showAttendees = eventState.showAttendees
    const eventImages = eventState.eventImages

    const attendedCount = item.goingCount // People who actually went
    const attendedAttendees = item.attendees?.filter((a: any) => a.status === 'going' && a.user) || []

    const toggleShowAttendees = () => {
      setPastEventStates(prev => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          showAttendees: !showAttendees,
          eventImages: prev[item.id]?.eventImages || []
        }
      }))
    }


    return (
      <View style={styles.pastEventCard}>
        {/* Past Event Header */}
        <View style={styles.pastEventHeader}>
          <View style={styles.pastEventInfo}>
            <Text style={styles.pastEventTitle}>{item.title}</Text>
            {hostOrg || hostProfile ? (
              <Text style={styles.pastEventHost}>
                Hosted by {hostOrg ? hostOrg.name : (hostProfile?.full_name || hostProfile?.username || '')}
              </Text>
            ) : null}
            <Text style={styles.pastEventDate}>
              {formatDate(item.event_date)} • {formatTime(item.start_time)}
            </Text>
          </View>
          <View style={styles.pastEventBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#27ae60" />
            <Text style={styles.pastEventBadgeText}>Completed</Text>
          </View>
        </View>

        {/* Attendance Summary */}
        <View style={styles.pastEventStats}>
          <TouchableOpacity 
            style={styles.attendedButton}
            onPress={toggleShowAttendees}
          >
            <Ionicons name="people" size={16} color="#27ae60" />
            <Text style={styles.attendedText}>{attendedCount} attended</Text>
            <Ionicons 
              name={showAttendees ? "chevron-up" : "chevron-down"} 
              size={16} 
              color="#7f8c8d" 
            />
          </TouchableOpacity>

          {/* Photo Gallery Button */}
          <TouchableOpacity 
            style={styles.photoGalleryButton} 
            onPress={() => setShowPhotosModal(true)}
          >
            <Ionicons name="images" size={16} color="#3498db" />
            <Text style={styles.photoGalleryText}>Photos ({eventImages.length})</Text>
          </TouchableOpacity>
        </View>

        {/* Attendees List */}
        {showAttendees && attendedAttendees.length > 0 && (
          <View style={styles.attendeesList}>
            <Text style={styles.attendeesTitle}>Who attended:</Text>
            <View style={styles.attendeesGrid}>
              {attendedAttendees.slice(0, 6).map((attendee: any, index: number) => (
                <View key={index} style={styles.attendeeItem}>
                  {attendee.user?.avatar_url ? (
                    <Image 
                      source={{ uri: attendee.user.avatar_url }} 
                      style={styles.attendeeAvatar} 
                    />
                  ) : (
                    <View style={styles.attendeeAvatarPlaceholder}>
                      <Text style={styles.attendeeAvatarText}>
                        {attendee.user?.full_name?.charAt(0) || '?'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.attendeeName} numberOfLines={1}>
                    {attendee.user?.full_name || 'Unknown'}
                  </Text>
                </View>
              ))}
              {attendedAttendees.length > 6 && (
                <View style={styles.attendeeItem}>
                  <View style={styles.attendeeAvatarPlaceholder}>
                    <Text style={styles.attendeeAvatarText}>+{attendedAttendees.length - 6}</Text>
                  </View>
                  <Text style={styles.attendeeName}>More</Text>
                </View>
              )}
            </View>
          </View>
        )}

      </View>
    )
  }

  const renderEventCard = ({ item }: { item: EventListItem }) => {
    const hostProfile = hostProfiles[item.host_id]
    // For org events, look up by event.id
    const hostOrg = (item as any).isOrgEvent ? hostOrganizations[item.id] : null
    const userAttendance = userAttendances[item.id]
    const isInvited = userInvitations.has(item.id)
    const isHost = item.host_id === currentUserId
    const isExpanded = expandedEventIds.has(item.id)

    return (
      <EventCard
        item={item}
        hostProfile={hostProfile}
        hostOrg={hostOrg}
        userAttendance={userAttendance}
        isInvited={isInvited}
        isHost={isHost}
        isExpanded={isExpanded}
        onToggleExpand={() => toggleExpanded(item.id)}
        onPress={() => (navigation as any).navigate('EventDetail', { event: item })}
      />
    )
  }


  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading events...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Unified Header with Scroll View */}
      <View style={[styles.unifiedHeader, { backgroundColor: theme.background }]}>
        <View style={[styles.tabContainer, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              timeFilter === 'student' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
            ]}
            onPress={() => {
              setTimeFilter('student')
            }}
          >
            <Text 
              style={[
                styles.tabText,
                { color: timeFilter === 'student' ? theme.primary : theme.textSecondary }
              ]}
            >
              Student Events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              timeFilter === 'org' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
            ]}
            onPress={() => {
              setTimeFilter('org')
            }}
          >
            <Text 
              style={[
                styles.tabText,
                { color: timeFilter === 'org' ? theme.primary : theme.textSecondary }
              ]}
            >
              Org Events
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Events List */}
      {(() => {
        const groupedEvents = groupEventsByTime<EventListItem>(filteredEvents)
        
        if (groupedEvents.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {timeFilter === 'org' ? 'No Org Events' : 'No Events'}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {timeFilter === 'org' 
                  ? 'Org events coming soon'
                  : 'No upcoming events to show right now'}
              </Text>
            </View>
          )
        }
        
        return (
          <SectionList
            sections={groupedEvents}
            renderItem={renderEventCard}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeaderText, { color: theme.text }]}>
                  {section.title}
                </Text>
              </View>
            )}
            keyExtractor={(item) => item.id}
            style={styles.eventsFlatList}
            contentContainerStyle={styles.eventsList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.primary]}
                tintColor={theme.primary}
              />
            }
            showsVerticalScrollIndicator={false}
            extraData={expandedEventIds.size}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
            stickySectionHeadersEnabled={false}
          />
        )
      })()}

      
      
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowFilterModal(false)}
            >
              <Ionicons name="close" size={24} color="#7f8c8d" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Event Type</Text>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  advancedFilters.friendsOnly && styles.filterOptionActive
                ]}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  friendsOnly: !prev.friendsOnly
                }))}
              >
                <Ionicons
                  name={advancedFilters.friendsOnly ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.friendsOnly ? '#3498db' : '#bdc3c7'}
                />
                <Text style={styles.filterOptionText}>Friends Only</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Activity</Text>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  advancedFilters.peopleGoing && styles.filterOptionActive
                ]}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  peopleGoing: !prev.peopleGoing
                }))}
              >
                <Ionicons
                  name={advancedFilters.peopleGoing ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.peopleGoing ? '#3498db' : '#bdc3c7'}
                />
                <Text style={styles.filterOptionText}>People Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  advancedFilters.last24Hours && styles.filterOptionActive
                ]}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  last24Hours: !prev.last24Hours
                }))}
              >
                <Ionicons
                  name={advancedFilters.last24Hours ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.last24Hours ? '#3498db' : '#bdc3c7'}
                />
                <Text style={styles.filterOptionText}>Recently Created</Text>
              </TouchableOpacity>
            </View>

                        <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Tags</Text>
              <View style={styles.tagsFilterContainer}>
                {PREDEFINED_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.tagFilterButton,
                      advancedFilters.selectedTags.includes(tag) && styles.tagFilterButtonSelected
                    ]}
                    onPress={() => {
                      setAdvancedFilters(prev => ({
                        ...prev,
                        selectedTags: prev.selectedTags.includes(tag)
                          ? prev.selectedTags.filter(t => t !== tag)
                          : [...prev.selectedTags, tag]
                      }))
                    }}
                  >
                    <Text style={[
                      styles.tagFilterText,
                      advancedFilters.selectedTags.includes(tag) && styles.tagFilterTextSelected
                    ]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Sort By</Text>
              {[
                { value: 'date_asc', label: 'Date (Earliest First)' },
                { value: 'date_desc', label: 'Date (Latest First)' },
                { value: 'people_going', label: 'Most People Going' },
                { value: 'recently_created', label: 'Recently Created' },
                { value: 'alphabetical', label: 'Alphabetical' }
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sortOption,
                    sortBy === option.value && styles.sortOptionActive
                  ]}
                  onPress={() => setSortBy(option.value as SortType)}
                >
                  <Ionicons
                    name={sortBy === option.value ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={sortBy === option.value ? '#3498db' : '#bdc3c7'}
                  />
                  <Text style={styles.sortOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
                        <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setAdvancedFilters({
                  friendsOnly: false,
                  peopleGoing: false,
                  last24Hours: false,
                  selectedTags: [],
                })
                setSortBy('date_asc')
              }}
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Photos Modal */}
      <Modal
        visible={showPhotosModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotosModal(false)}
      >
        <TouchableOpacity 
          style={styles.photosModalOverlay}
          activeOpacity={1}
          onPress={() => setShowPhotosModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.photosModalContent, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <View style={styles.photosModalHeader}>
              <Text style={[styles.photosModalTitle, { color: theme.text }]}>Event Photos</Text>
              <TouchableOpacity onPress={() => setShowPhotosModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.photosModalBody}>
              <Ionicons name="cloud-upload-outline" size={64} color={theme.primary} />
              <Text style={[styles.photosModalText, { color: theme.text }]}>
                View and upload event photos on Google Drive
              </Text>
              
              <TouchableOpacity
                style={[styles.photosModalButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  Linking.openURL('https://google.com')
                  setShowPhotosModal(false)
                }}
              >
                <Ionicons name="open-outline" size={20} color="white" />
                <Text style={styles.photosModalButtonText}>Open Google Drive</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  timeFilterContainer: {
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unifiedHeader: {
    backgroundColor: theme.background,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  tabContainer: {
    flex: 1,
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtonsContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  headerScrollContent: {
    paddingHorizontal: 16,
    paddingRight: 120, // Add extra padding to ensure scrollability past floating buttons
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.border,
  },
  headerButtonEqual: {
    flex: 1,
    marginRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  headerButtonTextActive: {
    color: 'white',
  },
  floatingButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    justifyContent: 'flex-end',
  },
  floatingButton: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  floatingButtonActive: {
    backgroundColor: theme.primary + '20',
    borderRadius: 8,
    borderColor: theme.primary,
  },
  floatingButtonDisabled: {
    backgroundColor: theme.surface,
    opacity: 0.5,
  },
  photoGalleryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  photoGalleryTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  photoGalleryMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  timeFilterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  photoGalleryIcon: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  timeFilterButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  timeFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  timeFilterTextActive: {
    color: 'white',
  },
  filterContainer: {
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
    height: 60, // Fixed height to prevent squishing
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  filterButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
    backgroundColor: theme.headerBackground,
    width: 100,
    justifyContent: 'flex-end',
  },
  filterIcon: {
    padding: 8,
    backgroundColor: theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterContent: {
    paddingHorizontal: 20,
    paddingRight: 100, // Make room for filter button
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.surface,
    marginRight: 12,
    height: 36, // Fixed height for buttons
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  filterButtonText: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  myEventsButtonActive: {
    backgroundColor: '#4CAF50', // Subtle green
    borderColor: '#4CAF50',
  },
  myEventsTextActive: {
    color: 'white',
  },
  photoGalleryContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  photoGallerySubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyStateContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 32,
  },
  pastEventsEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  pastEventsEmptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
  },
  pastEventsEmptyMessage: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  myEventsEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  myEventsEmptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
  },
  myEventsEmptyMessage: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  comingEventsEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  comingEventsEmptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
  },
  comingEventsEmptyMessage: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  createEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: theme.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  createEventButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  eventsList: {
    padding: 20,
  },
  sectionHeader: {
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 12,
    paddingTop: 10,
  },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: '700',
  },
  eventsFlatList: {
    flex: 1,
  },
  eventCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  // Compact card header
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compactHeaderLeft: {
    flex: 4,
    marginRight: 10,
  },
  compactHeaderCenter: {
    width: 100,
    alignItems: 'flex-start',
    marginRight: 10,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  compactRowLeftAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  compactHost: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  compactMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    marginLeft: 6,
    flexShrink: 1,
  },
  expandIcon: {
    padding: 8,
  },
  compactImage: {
    width: '100%',
    height: 200,
    backgroundColor: theme.surface,
  },
  compactDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    lineHeight: 18,
  },
  compactLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  compactLocationText: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  compactStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  eventImage: {
    width: '100%',
    height: 200, // Good size for event images
    backgroundColor: theme.surface,
  },
  eventContent: {
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  eventHost: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  invitedBadge: {
    backgroundColor: theme.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.success + '40',
  },
  invitedText: {
    fontSize: 12,
    color: theme.success,
    fontWeight: '500',
  },
  eventDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  eventDetails: {
    marginBottom: 12,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventDetailText: {
    fontSize: 14,
    color: theme.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  eventStats: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 12,
    color: theme.textSecondary,
    marginLeft: 4,
  },
  attendanceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.border,
  },
  attendanceStatusText: {
    fontSize: 12,
    color: theme.text,
    marginLeft: 4,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.headerText,
    letterSpacing: -0.5,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  filterSection: {
    marginBottom: 32,
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  filterOptionActive: {
    backgroundColor: theme.primary + '10',
  },
  filterOptionText: {
    fontSize: 16,
    color: theme.text,
    marginLeft: 16,
    fontWeight: "500",
    flex: 1,
  },
  filterOptionIcon: {
    marginRight: 8,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  sortOptionActive: {
    backgroundColor: theme.primary + '10',
  },
  sortOptionText: {
    fontSize: 16,
    color: theme.text,
    marginLeft: 16,
    fontWeight: "500",
    flex: 1,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 16,
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: theme.headerBackground,
    borderTopWidth: 1,
    borderTopColor: theme.headerBorder,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: theme.surface,
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  clearButtonText: {
    fontSize: 16,
    color: theme.textSecondary,
    fontWeight: "600",
  },
  applyButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: "center",
    shadowColor: theme.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  applyButtonText: {
    fontSize: 16,
    color: "white",
    fontWeight: "700",
  },
  activeFilterCount: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  activeFilterCountText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: 12,
  },
  filterDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  closeButton: {
    padding: 8,
  },
  // Event tags styles
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 6,
  },
  eventTag: {
    backgroundColor: theme.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.primary + '40',
  },
  eventTagText: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '500',
  },
  // Tags filter styles
  tagsFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginRight: 8,
    marginBottom: 8,
  },
  tagFilterButtonSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  tagFilterText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  tagFilterTextSelected: {
    color: 'white',
  },
  // Past Event Card Styles
  pastEventCard: {
    backgroundColor: theme.card,
    borderRadius: 8,
    marginHorizontal: 4,
    marginBottom: 6,
    padding: 10,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 3,
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  pastEventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  pastEventInfo: {
    flex: 1,
  },
  pastEventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 2,
  },
  pastEventHost: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 2,
  },
  pastEventDate: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  pastEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60' + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pastEventBadgeText: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '600',
    marginLeft: 4,
  },
  pastEventStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60' + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flex: 1,
    marginRight: 12,
  },
  attendedText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
    marginLeft: 6,
    marginRight: 6,
  },
  photoGalleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3498db' + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  photoGalleryText: {
    fontSize: 14,
    color: '#3498db',
    fontWeight: '600',
    marginLeft: 6,
  },
  attendeesList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.divider,
  },
  attendeesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 12,
  },
  attendeesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  attendeeItem: {
    alignItems: 'center',
    width: 60,
  },
  attendeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  attendeeAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  attendeeAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  attendeeName: {
    fontSize: 11,
    color: theme.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  photosModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photosModalContent: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photosModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  photosModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
  },
  photosModalBody: {
    padding: 24,
    alignItems: 'center',
  },
  photosModalText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
    color: theme.text,
  },
  photosModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  photosModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
})
