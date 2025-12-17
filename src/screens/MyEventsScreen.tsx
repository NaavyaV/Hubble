import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  Alert,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import notificationService from '../services/notifications'
import { formatEventTimeDisplay, isMidnightSpanningEvent, isEventEnded, isEventCurrentlyHappening, isEventInFuture } from '../utils/eventTimeUtils'
import CreateEventScreen from './CreateEventScreen'

type TabType = 'attending' | 'invited' | 'hosting'

export default function MyEventsScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [attendingEvents, setAttendingEvents] = useState<(EventWithAttendees & { isHosting: boolean })[]>([])
  const [invitedEvents, setInvitedEvents] = useState<EventWithAttendees[]>([])
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

      // Fetch events user is hosting
      const { data: hostingEventsData, error: hostingError } = await supabase
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
        .order('start_time', { ascending: true })

      if (hostingError) throw hostingError

      // Fetch events user is going to (but not hosting) - both personal and org events
      const [attendingEventsResult, attendingOrgEventsResult] = await Promise.all([
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
          .eq('status', 'going')
      ])

      if (attendingEventsResult.error) throw attendingEventsResult.error
      if (attendingOrgEventsResult.error) throw attendingOrgEventsResult.error

      const attendingEventsData = attendingEventsResult.data || []
      const attendingOrgEventsData = (attendingOrgEventsResult.data || []).map((ea: any) => ({
        ...ea,
        events: ea.org_events ? { ...ea.org_events, isOrgEvent: true } : null
      }))

      // Fetch invited events (private invitations)
      const { data: invitations, error: invitationsError } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', user.id)

      if (invitationsError) throw invitationsError

      const invitedEventIds = (invitations || []).map(inv => inv.event_id)

      // Fetch public events user was notified about (check notification_log)
      const { data: notifications, error: notificationsError } = await supabase
        .from('notification_log')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('type', 'event_invitation')
        .not('event_id', 'is', null)

      if (notificationsError) {
        console.error('Error fetching notifications:', notificationsError)
      }

      const notifiedEventIds = new Set([
        ...invitedEventIds,
        ...(notifications || []).map(n => n.event_id).filter(Boolean)
      ])

      // Fetch invited events (both private and public that user was notified about)
      // Also check for org events user was notified about
      // Note: For org events, event_id is null in notification_log (to avoid foreign key constraint)
      // The org event ID is stored in data.orgEventId instead
      const { data: orgNotifications } = await supabase
        .from('notification_log')
        .select('data')
        .eq('user_id', user.id)
        .eq('type', 'org_event_created')

      // Extract orgEventId from the data field
      const notifiedOrgEventIds = new Set(
        (orgNotifications || [])
          .map(n => n.data?.orgEventId)
          .filter(Boolean)
      )
      
      let invitedEventsData: any[] = []
      if (notifiedEventIds.size > 0) {
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
          .in('id', Array.from(notifiedEventIds))
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

      // Process invited events - filter by max capacity and exclude already attending
      // Only include personal events (exclude org events from invited tab)
      const allInvitedEvents = [...invitedEventsData]
      const attendingEventIds = new Set(attendingEventsList.map(e => e.id))
      const hostingEventIds = new Set(hostingEventsList.map(e => e.id))
      
      const invitedEventsList = allInvitedEvents
        .filter((event: any) => {
          // Exclude events user is already attending or hosting
          if (attendingEventIds.has(event.id) || hostingEventIds.has(event.id)) {
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
        ...invitedEventsList.filter((e: any) => !e.isOrgEvent).map((e: any) => e.host_id)
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
              // Send notifications to all attendees except host before deleting
              await notificationService.sendEventEditDeleteNotification(
                eventId,
                eventToDelete.title,
                eventToDelete.host_id,
                'deleted'
              )

              const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', eventId)

              if (error) throw error

              setHostingEvents(hostingEvents.filter(event => event.id !== eventId))
              Alert.alert('Success', 'Event deleted successfully')
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
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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

  // Get events for current tab
  const getCurrentTabEvents = () => {
    switch (activeTab) {
      case 'attending':
        return attendingEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time))
      case 'invited':
        return invitedEvents.filter(event => !isEventEnded(event.event_date, event.start_time, event.end_time))
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
    const attendeeCount = (item as any).attendee_count || 0
    const isCurrent = isEventCurrentlyHappening(item.event_date, item.start_time, item.end_time)
    const isHosting = (item as any).isHosting || false
    const isExpanded = expandedEventIds.has(item.id)
    // For org events, show org name; for personal events, show host name
    const isOrgEvent = (item as any).isOrgEvent
    const hostName = isOrgEvent 
      ? ((item as any).org?.name || 'Organization')
      : ((item as any).host?.full_name || (item as any).host?.username || 'You')
    
    return (
      <View style={[styles.eventCard, { 
        backgroundColor: theme.card || theme.surface, 
        borderColor: theme.border,
        shadowColor: theme.shadow 
      }]}>
        {/* Compact header row */}
      <TouchableOpacity
          style={styles.compactHeader}
        onPress={() => handleEventPress(item)}
          activeOpacity={0.8}
        >
          <View style={styles.compactHeaderLeft}>
            <View style={styles.compactTitleRow}>
              <Text style={[styles.compactTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
              {isCurrent && (
                <View style={[styles.currentBadge, { backgroundColor: theme.success + '20', borderColor: theme.success }]}>
                  <Ionicons name="pulse" size={8} color={theme.success} />
                  <Text style={[styles.currentBadgeText, { color: theme.success }]}>Current</Text>
                </View>
              )}
            </View>
            <Text style={[styles.compactHost, { color: theme.textSecondary }]} numberOfLines={1}>
              {isHosting ? 'You' : hostName}
            </Text>
          </View>
          <View style={styles.compactHeaderCenter}>
            <View style={styles.compactRowLeftAligned}>
              <Ionicons name="calendar" size={14} color="#e74c3c" />
              <Text style={[styles.compactMeta, { color: theme.textSecondary }]} numberOfLines={1}>{formatDate(item.event_date)}</Text>
            </View>
            <View style={styles.compactRowLeftAligned}>
              <Ionicons name="time" size={14} color="#f39c12" />
              <Text style={[styles.compactMeta, { color: theme.textSecondary }]} numberOfLines={1}>{formatTime(item.start_time)}</Text>
            </View>
          </View>
          <View style={styles.compactHeaderRight}>
            {isHosting && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteEvent(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={theme.error} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.expandIcon}
              onPress={() => toggleExpanded(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Expanded content */}
        {isExpanded && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleEventPress(item)}
          >
            {/* Optional image */}
            {item.image_url && (
              <Image
                source={{ uri: item.image_url }}
                style={[styles.compactImage, { backgroundColor: theme.surface }]}
                resizeMode="cover"
              />
            )}

            {/* Description */}
            {item.description ? (
              <Text style={[styles.compactDescription, { color: theme.textSecondary }]}>{item.description}</Text>
            ) : null}
          
            {/* Location */}
            {item.location ? (
              <View style={[
                styles.compactLocationRow,
                !item.description && { paddingTop: 10 }
              ]}>
                <Ionicons name="location" size={16} color="#27ae60" />
                <Text style={[styles.compactLocationText, { color: theme.textSecondary }]}>{item.location}</Text>
            </View>
            ) : null}

            {/* Stats */}
            <View style={styles.compactStatsRow}>
              <View style={styles.compactRow}>
                <Ionicons name="people" size={14} color="#27ae60" />
                <Text style={[styles.compactMeta, { color: theme.textSecondary }]}>{attendeeCount} going</Text>
              </View>
              {item.max_attendees ? (
                <View style={styles.compactRow}>
                  <Ionicons name="person-add" size={14} color="#3498db" />
                  <Text style={[styles.compactMeta, { color: theme.textSecondary }]}>
                    {attendeeCount}/{item.max_attendees} spots
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        </View>
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

  const currentTabEvents = getCurrentTabEvents()

  const handleCreateEvent = () => {
    setShowCreateModal(true)
  }

  const handleEventCreated = () => {
    setShowCreateModal(false)
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
          <Text style={[
            styles.tabText,
            { color: activeTab === 'attending' ? theme.primary : theme.textSecondary }
          ]}>
            Attending
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'invited' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('invited')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'invited' ? theme.primary : theme.textSecondary }
          ]}>
            Invited
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'hosting' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('hosting')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'hosting' ? theme.primary : theme.textSecondary }
          ]}>
            Hosting
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentTabEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
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
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {activeTab === 'attending' ? 'No Events' : activeTab === 'invited' ? 'No Invitations' : 'No Hosting Events'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {activeTab === 'attending' 
                ? "You're not attending any upcoming events."
                : activeTab === 'invited'
                ? "You don't have any event invitations right now."
                : "You're not hosting any upcoming events. Tap the + button to create one!"}
            </Text>
          </View>
        }
      />

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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
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
  tabText: {
    fontSize: 16,
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
