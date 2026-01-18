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
  Alert,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import notificationService from '../services/notifications'
import { formatEventTimeDisplay, isMidnightSpanningEvent, isEventEnded, isEventCurrentlyHappening, isEventInFuture } from '../utils/eventTimeUtils'
import CreateEventScreen from './CreateEventScreen'
import { deleteEventCompletely } from '../utils/eventDeletion'
import { EmptyState } from '../components'
import EventCard from '../components/common/EventCard'
import { groupEventsByTime, GroupedEvent } from '../utils/eventGrouping'

type TabType = 'attending' | 'invited' | 'hosting'

export default function MyEventsScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [attendingEvents, setAttendingEvents] = useState<(EventWithAttendees & { isHosting: boolean })[]>([])
  const [invitedEvents, setInvitedEvents] = useState<EventWithAttendees[]>([])
  const [notGoingEvents, setNotGoingEvents] = useState<EventWithAttendees[]>([])
  const [hostingEvents, setHostingEvents] = useState<(EventWithAttendees & { isHosting: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('attending')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set())

  const fetchMyEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // OPTIMIZED: Run ALL queries in parallel for maximum performance
      const [
        hostingEventsResult,
        attendingEventsResult,
        attendingOrgEventsResult,
        invitationsResult,
        followedOrgsResult,
        blockedOrgsResult
      ] = await Promise.all([
        // Fetch events user is hosting
        supabase
          .from('events')
          .select(`
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            )
          `)
          .eq('host_id', user.id)
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true }),
        // Fetch events user is going to (personal events)
        supabase
          .from('event_attendees')
          .select(`
            event_id,
            status,
            events:events!event_attendees_event_id_fkey(
              *,
              attendees:event_attendees(
                id,
                user_id,
                status
              )
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'going'),
        // Fetch org events user is going to
        supabase
          .from('org_event_attendees')
          .select(`
            event_id,
            status,
            org_events:org_events!org_event_attendees_event_id_fkey(
              *,
              attendees:org_event_attendees(
                id,
                user_id,
                status
              )
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'going'),
        // Fetch all invited events
        supabase
          .from('event_invitations')
          .select('event_id')
          .eq('user_id', user.id),
        // Fetch orgs user follows with notifications
        supabase
          .from('org_followers')
          .select('org_id, created_at')
          .eq('user_id', user.id)
          .eq('notification_enabled', true),
        // Fetch blocked orgs
        supabase
          .from('org_blocks')
          .select('org_id')
          .eq('user_id', user.id)
      ])

      // Check for errors
      if (hostingEventsResult.error) throw hostingEventsResult.error
      if (attendingEventsResult.error) throw attendingEventsResult.error
      if (attendingOrgEventsResult.error) throw attendingOrgEventsResult.error
      if (invitationsResult.error) throw invitationsResult.error
      if (followedOrgsResult.error) throw followedOrgsResult.error
      if (blockedOrgsResult.error) throw blockedOrgsResult.error

      const hostingEventsData = hostingEventsResult.data || []
      const attendingEventsData = attendingEventsResult.data || []
      const blockedOrgIds = new Set((blockedOrgsResult.data || []).map(b => b.org_id))
      const attendingOrgEventsData = (attendingOrgEventsResult.data || []).map((ea: any) => ({
        ...ea,
        events: ea.org_events ? { ...ea.org_events, isOrgEvent: true } : null
      })).filter((ea: any) => !ea.org_events || !blockedOrgIds.has(ea.org_events.org_id))
      const invitedEventIds = new Set((invitationsResult.data || []).map(inv => inv.event_id))
      const followedOrgs = followedOrgsResult.data || []

      // Get org event IDs from orgs user follows (events created after following)
      // Exclude blocked orgs
      let notifiedOrgEventIds = new Set<string>()
      if (followedOrgs.length > 0) {
        const orgIds = followedOrgs.map(f => f.org_id).filter(id => !blockedOrgIds.has(id))
        if (orgIds.length > 0) {
          const { data: orgEvents } = await supabase
            .from('org_events')
            .select('id, org_id, created_at')
            .in('org_id', orgIds)

          if (orgEvents) {
            // Filter events created after user started following (or all if we can't determine)
            notifiedOrgEventIds = new Set(orgEvents.map(e => e.id))
          }
        }
      }
      
      let invitedEventsData: any[] = []
      if (invitedEventIds.size > 0) {
        const { data: invitedEventsResult, error: invitedEventsError } = await supabase
          .from('events')
          .select(`
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            )
          `)
          .in('id', Array.from(invitedEventIds))
          .neq('host_id', user.id) // Exclude events user is hosting
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true })

        if (invitedEventsError) {
          console.error('Error fetching invited events:', invitedEventsError)
        } else {
          invitedEventsData = invitedEventsResult || []
        }
      }

      // Note: Org events are no longer included in invited events
      // They should only appear in the "Attending" tab if the user is going to them

      // Process hosting events
      const hostingEventsList = (hostingEventsData || []).map(event => {
        const attendees = event.attendees || []
        const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
        return {
          ...event,
          attendees: attendees,
          attendee_count: attendeeCount,
          isHosting: true
        }
      })

      // Process attending events (exclude hosting) - combine personal and org events
      const allAttendingEvents = [
        ...(attendingEventsData || []).map((ea: any) => ea.events),
        ...(attendingOrgEventsData || []).map((ea: any) => ea.events)
      ].filter(Boolean)
      
      const attendingEventsList = allAttendingEvents
        .filter((event: any) => {
          // For personal events, exclude if user is hosting
          if (!(event as any).isOrgEvent && event.host_id === user.id) return false
          return true
        })
        .map((event: any) => {
          const attendees = event.attendees || []
          const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
          return {
            ...event,
            attendees: attendees,
            attendee_count: attendeeCount,
            isHosting: false
          }
        })

      // Fetch events user marked as "not going"
      const { data: notGoingAttendeesData, error: notGoingError } = await supabase
        .from('event_attendees')
        .select(`
          event_id,
          status,
          events:events!event_attendees_event_id_fkey(
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'not_going')

      if (notGoingError) throw notGoingError

      const notGoingEventsData = (notGoingAttendeesData || [])
        .map((ea: any) => ea.events)
        .filter((event: any) => event && !event.isOrgEvent)
        .map((event: any) => {
          const attendees = event.attendees || []
          const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
          return {
            ...event,
            attendees: attendees,
            attendee_count: attendeeCount
          }
        })

      // Process invited events - filter by max capacity and exclude already attending, hosting, or not going
      // Only include personal events (exclude org events from invited tab)
      const allInvitedEvents = [...invitedEventsData]
      const attendingEventIds = new Set(attendingEventsList.map(e => e.id))
      const hostingEventIds = new Set(hostingEventsList.map(e => e.id))
      const notGoingEventIds = new Set(notGoingEventsData.map((e: any) => e.id))
      
      const invitedEventsList = allInvitedEvents
        .filter((event: any) => {
          // Exclude events user is already attending, hosting, or marked as not going
          if (attendingEventIds.has(event.id) || hostingEventIds.has(event.id) || notGoingEventIds.has(event.id)) {
            return false
          }
          
          // Check max capacity
          const attendeeCount = (event.attendees || []).filter((a: any) => a.status === 'going').length || 0
          if (event.max_attendees && event.max_attendees > 0) {
            return attendeeCount < event.max_attendees
          }
          return true
        })
        .map((event: any) => {
          const attendees = event.attendees || []
          const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
          return {
            ...event,
            attendees: attendees,
            attendee_count: attendeeCount
          }
        })

      // Fetch host profiles for personal events and org data for org events
      const allHostIds = new Set([
        ...hostingEventsList.filter(e => !(e as any).isOrgEvent).map(e => e.host_id),
        ...attendingEventsList.filter(e => !(e as any).isOrgEvent).map(e => e.host_id),
        ...invitedEventsList.filter((e: any) => !e.isOrgEvent).map((e: any) => e.host_id),
        ...notGoingEventsData.filter((e: any) => !e.isOrgEvent).map((e: any) => e.host_id)
      ])

      const allOrgIds = new Set([
        ...hostingEventsList.filter(e => (e as any).isOrgEvent).map((e: any) => e.org_id),
        ...attendingEventsList.filter(e => (e as any).isOrgEvent).map((e: any) => e.org_id),
        ...invitedEventsList.filter((e: any) => e.isOrgEvent).map((e: any) => e.org_id)
      ])

      // Fetch host profiles and org data in parallel
      const [hostProfilesResult, orgDataResult] = await Promise.all([
        allHostIds.size > 0 ? supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', Array.from(allHostIds))
          .eq('otp_verified', true) : { data: [], error: null },
        allOrgIds.size > 0 ? supabase
          .from('organizations')
          .select('id, name, icon')
          .in('id', Array.from(allOrgIds)) : { data: [], error: null }
      ])

      const profilesMap: Record<string, any> = {}
      if (hostProfilesResult.data) {
        hostProfilesResult.data.forEach(profile => {
          profilesMap[profile.id] = profile
        })
      }

      const orgsMap: Record<string, any> = {}
      if (orgDataResult.data) {
        orgDataResult.data.forEach(org => {
          orgsMap[org.id] = org
        })
      }

      // Attach host profiles to personal events and org data to org events
      setHostingEvents(hostingEventsList.map(event => {
        if ((event as any).isOrgEvent) {
          return {
            ...event,
            org: orgsMap[(event as any).org_id] || null
          }
        } else {
          return {
            ...event,
            host: profilesMap[event.host_id] || null
          }
        }
      }))
      setAttendingEvents(attendingEventsList.map(event => {
        if ((event as any).isOrgEvent) {
          return {
            ...event,
            org: orgsMap[(event as any).org_id] || null
          }
        } else {
          return {
            ...event,
            host: profilesMap[event.host_id] || null
          }
        }
      }))
      setInvitedEvents(invitedEventsList.map((event: any) => {
        if (event.isOrgEvent) {
          return {
            ...event,
            org: orgsMap[event.org_id] || null
          }
        } else {
          return {
            ...event,
            host: profilesMap[event.host_id] || null
          }
        }
      }))
      setNotGoingEvents(notGoingEventsData.map((event: any) => {
        if (event.isOrgEvent) {
          return {
            ...event,
            org: orgsMap[event.org_id] || null
          }
        } else {
          return {
            ...event,
            host: profilesMap[event.host_id] || null
          }
        }
      }))
    } catch (error) {
      console.error('Error fetching my events:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchMyEvents()
  }, [])

  // Set up real-time subscriptions for constant refreshing
  useEffect(() => {
    let eventsChannel: any = null
    let attendeesChannel: any = null
    let orgAttendeesChannel: any = null
    let invitationsChannel: any = null
    let notGoingChannel: any = null

    const setupSubscriptions = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Subscribe to events table changes (for hosting events)
      eventsChannel = supabase
        .channel('my-events-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `host_id=eq.${user.id}`
          },
          () => {
            fetchMyEvents()
          }
        )
        .subscribe()

      // Subscribe to event_attendees changes (for attending events)
      attendeesChannel = supabase
        .channel('my-attending-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_attendees',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchMyEvents()
          }
        )
        .subscribe()

      // Subscribe to org_event_attendees changes (for org attending events)
      orgAttendeesChannel = supabase
        .channel('my-org-attending-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'org_event_attendees',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchMyEvents()
          }
        )
        .subscribe()

      // Subscribe to event_invitations changes (for invited events)
      invitationsChannel = supabase
        .channel('my-invitations-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_invitations',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchMyEvents()
          }
        )
        .subscribe()

      // Subscribe to event_attendees changes for "not going" status
      notGoingChannel = supabase
        .channel('my-not-going-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_attendees',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchMyEvents()
          }
        )
        .subscribe()
    }

    setupSubscriptions()

    return () => {
      if (eventsChannel) supabase.removeChannel(eventsChannel)
      if (attendeesChannel) supabase.removeChannel(attendeesChannel)
      if (orgAttendeesChannel) supabase.removeChannel(orgAttendeesChannel)
      if (invitationsChannel) supabase.removeChannel(invitationsChannel)
      if (notGoingChannel) supabase.removeChannel(notGoingChannel)
    }
  }, [])

  // Refresh when screen is focused and set up auto-refresh
  useFocusEffect(
    React.useCallback(() => {
      // Initial fetch
      fetchMyEvents()
      
      // Set up auto-refresh interval (every 5 seconds)
      const refreshInterval = setInterval(() => {
        fetchMyEvents()
      }, 5000)
      
      return () => {
        clearInterval(refreshInterval)
      }
    }, [])
  )

  const onRefresh = () => {
    setRefreshing(true)
    fetchMyEvents()
  }

  const handleEventPress = (event: EventWithAttendees) => {
    ;(navigation as any).navigate('EventDetail', { event })
  }


  const handleDeleteEvent = async (eventId: string) => {
    // Find the event to get its title and host_id
    const eventToDelete = hostingEvents.find(event => event.id === eventId)
    if (!eventToDelete) return

    // Only allow deletion if user is hosting this event
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || eventToDelete.host_id !== user.id) {
      Alert.alert('Error', 'You can only delete events you are hosting')
      return
    }

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
              // Update UI immediately
              setHostingEvents(hostingEvents.filter(event => event.id !== eventId))
              Alert.alert('Success', 'Event deleted successfully')

              // Send notifications and delete event in the background
              Promise.all([
                notificationService.sendEventEditDeleteNotification(
                  eventId,
                  eventToDelete.title,
                  eventToDelete.host_id,
                  'deleted'
                ),
                deleteEventCompletely(eventId)
              ]).catch(error => {
                console.error('Error during event deletion:', error)
              })
            } catch (error) {
              console.error('Error deleting event:', error)
              Alert.alert('Error', 'Failed to delete event')
            }
          }
        }
      ]
    )
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

  // Get events for current tab
  const getCurrentTabEvents = () => {
    switch (activeTab) {
      case 'attending':
        return attendingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time))
      case 'invited':
        // Return invited events and not going events as separate sections data
        return {
          invited: invitedEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time)),
          notGoing: notGoingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time))
        }
      case 'hosting':
        return hostingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time))
      default:
        return []
    }
  }

  const toggleExpanded = (eventId: string) => {
    setExpandedEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  const renderEvent = ({ item }: { item: EventWithAttendees & { isHosting?: boolean } }) => {
    const isExpanded = expandedEventIds.has(item.id)
    const isHosting = (item as any).isHosting || false
    // For org events, show org name; for personal events, show host name
    const isOrgEvent = (item as any).isOrgEvent
    const hostName = isOrgEvent 
      ? ((item as any).org?.name || 'Organization')
      : ((item as any).host?.full_name || (item as any).host?.username || (isHosting ? 'You' : ''))
    
    const hostOrg = isOrgEvent ? { id: (item as any).org_id || '', name: hostName } : null
    const hostProfile = !isOrgEvent && !isHosting ? ((item as any).host || null) : null
    
    return (
      <EventCard
        item={{ ...item, attendee_count: (item as any).attendee_count || 0 }}
        hostProfile={hostProfile}
        hostOrg={hostOrg}
        isHost={isHosting}
        isExpanded={isExpanded}
        onToggleExpand={() => toggleExpanded(item.id)}
        onPress={() => handleEventPress(item)}
      />
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading your events...</Text>
        </View>
      </View>
    )
  }

  const currentTabEventsData = getCurrentTabEvents()
  const currentTabEvents = activeTab === 'invited' ? 
    (currentTabEventsData as any).invited || [] :
    (Array.isArray(currentTabEventsData) ? currentTabEventsData : [])

  const handleCreateEvent = () => {
    setShowCreateModal(true)
  }

  const handleEventCreated = async (createdEvent?: any) => {
    setShowCreateModal(false)
    
    // If event data is provided, add it immediately to hosting events
    if (createdEvent && !createdEvent.isOrgEvent) {
      // Fetch full event data with attendees
      const { data: fullEventData, error } = await supabase
        .from('events')
        .select(`
          *,
          attendees:event_attendees(
            id,
            user_id,
            status
          )
        `)
        .eq('id', createdEvent.id)
        .single()

      if (!error && fullEventData) {
        const newEvent: EventWithAttendees & { isHosting: boolean } = {
          ...fullEventData,
          attendees: fullEventData.attendees || [],
          isHosting: true
        }
        
        // Add to hosting events immediately
        setHostingEvents(prev => {
          // Check if event already exists to avoid duplicates
          if (prev.some(e => e.id === newEvent.id)) {
            return prev.map(e => e.id === newEvent.id ? newEvent : e)
          }
          const { getEventStartDate } = require('../utils/eventTimeUtils')
          return [...prev, newEvent].sort((a, b) => {
            const dateA = getEventStartDate(a.event_date, a.start_time)
            const dateB = getEventStartDate(b.event_date, b.start_time)
            return dateA.getTime() - dateB.getTime()
          })
        })
        
        // Switch to hosting tab to show the new event
        setActiveTab('hosting')
      }
    }
    
    // Always refresh to ensure everything is up to date
    fetchMyEvents()
  }


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Tab Selector */}
      <View style={[styles.tabContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'attending' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('attending')}
        >
          <View style={styles.tabContent}>
            <Text style={[
              styles.tabText,
              { color: activeTab === 'attending' ? theme.primary : theme.textSecondary }
            ]}>
              Attending
            </Text>
            <View style={[styles.countBadge, { backgroundColor: theme.border }]}>
              <Text style={[styles.countText, { color: theme.textSecondary }]}>
                {attendingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time)).length}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'invited' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('invited')}
        >
          <View style={styles.tabContent}>
            <Text style={[
              styles.tabText,
              { color: activeTab === 'invited' ? theme.primary : theme.textSecondary }
            ]}>
              Invited
            </Text>
            <View style={[styles.countBadge, { backgroundColor: theme.border }]}>
              <Text style={[styles.countText, { color: theme.textSecondary }]}>
                {invitedEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time)).length}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'hosting' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('hosting')}
        >
          <View style={styles.tabContent}>
            <Text style={[
              styles.tabText,
              { color: activeTab === 'hosting' ? theme.primary : theme.textSecondary }
            ]}>
              Hosting
            </Text>
            <View style={[styles.countBadge, { backgroundColor: theme.border }]}>
              <Text style={[styles.countText, { color: theme.textSecondary }]}>
                {hostingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time)).length}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {activeTab === 'invited' ? (
        (() => {
          const invitedList = currentTabEvents || []
          const notGoingList = (currentTabEventsData as any).notGoing || []
          const hasInvitedEvents = invitedList.length > 0
          const hasNotGoingEvents = notGoingList.length > 0
          
          // If no events at all, show empty state
          if (!hasInvitedEvents && !hasNotGoingEvents) {
            return (
              <FlatList
                data={[]}
                keyExtractor={() => 'empty'}
                renderItem={() => null}
                contentContainerStyle={styles.eventsList}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[theme.primary]}
                    tintColor={theme.primary}
                  />
                }
                ListEmptyComponent={
                  <EmptyState
                    icon="calendar-outline"
                    title="No Invitations"
                    message="You don't have any event invitations right now."
                  />
                }
              />
            )
          }
          
          // Otherwise show SectionList with sections
          return (
            <SectionList
              sections={[
                ...(hasInvitedEvents ? [{
                  title: 'Pending',
                  data: invitedList,
                }] : []),
                ...(hasNotGoingEvents ? [{
                  title: 'Not Going',
                  data: notGoingList,
                }] : [])
              ]}
              keyExtractor={(item) => item.id}
              renderItem={renderEvent}
              renderSectionHeader={({ section }) => {
                if (section.data.length === 0) return null
                return (
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionHeaderText, { color: theme.text }]}>
                      {section.title}
                    </Text>
                  </View>
                )
              }}
              contentContainerStyle={styles.eventsList}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            />
          )
        })()
      ) : (() => {
        const groupedEvents = groupEventsByTime(currentTabEvents)
        
        if (groupedEvents.length === 0) {
          return (
            <EmptyState
              icon="calendar-outline"
              title={activeTab === 'attending' ? 'No Events' : 'No Hosting Events'}
              message={activeTab === 'attending' 
                ? "You're not attending any upcoming events."
                : "You're not hosting any upcoming events. Tap the + button to create one!"}
            />
          )
        }
        
        return (
          <SectionList
            sections={groupedEvents}
            renderItem={renderEvent}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeaderText, { color: theme.text }]}>
                  {section.title}
                </Text>
              </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.eventsList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.primary]}
                tintColor={theme.primary}
              />
            }
            stickySectionHeadersEnabled={false}
          />
        )
      })()}

      {/* Create Button - Only show on hosting tab */}
      {activeTab === 'hosting' && (
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: theme.primary }]}
          onPress={handleCreateEvent}
        >
          <Ionicons name="add" size={28} color={theme.buttonText} />
        </TouchableOpacity>
      )}

      {/* Create Event Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <CreateEventScreen
          onBack={() => setShowCreateModal(false)}
          onEventCreated={handleEventCreated}
      />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  eventsList: {
    padding: 20,
  },
  eventCard: {
    borderRadius: 12,
    marginBottom: 16,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
    borderWidth: 1,
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
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  compactHeaderCenter: {
    width: 100,
    alignItems: 'flex-start',
    marginRight: 10,
  },
  compactHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  },
  compactHost: {
    fontSize: 12,
  },
  compactMeta: {
    fontSize: 12,
    marginLeft: 6,
    flexShrink: 1,
  },
  expandIcon: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  compactImage: {
    width: '100%',
    height: 200,
  },
  compactDescription: {
    fontSize: 13,
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
    lineHeight: 18,
    flex: 1,
  },
  compactStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
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
  midnightIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  midnightText: {
    fontSize: 11,
    marginLeft: 3,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 30,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
  createButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  hostingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
  },
  hostingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
})
