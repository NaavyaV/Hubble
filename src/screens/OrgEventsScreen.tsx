import React, { useState } from 'react'
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
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { isEventEnded, isEventCurrentlyHappening } from '../utils/eventTimeUtils'
import CreateEventScreen from './CreateEventScreen'
import notificationService from '../services/notifications'
import { deleteOrgEventCompletely } from '../utils/eventDeletion'
import EventCard from '../components/common/EventCard'
import { groupEventsByTime, GroupedEvent } from '../utils/eventGrouping'
import { sectionHeaderLargeStyle } from '../constants/sectionTypography'

export default function OrgEventsScreen() {
  const { theme } = useTheme()
  const { currentOrg } = useOrgMode()
  const navigation = useNavigation()
  const [events, setEvents] = useState<EventWithAttendees[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchOrgEvents = async () => {
    try {
      if (!currentOrg) {
        setEvents([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      // Get the logged-in user to verify ownership
      const user = await getCachedUser()
      if (!user) {
        setLoading(false)
        setRefreshing(false)
        return
      }

      // Verify user owns this org
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_ownership_id')
        .eq('id', user.id)
        .single()

      const userOwnsOrg = profile?.org_ownership_id === currentOrg.id

      const { data: eventsData, error } = await supabase
        .from('org_events')
        .select(`
          id, title, event_date, start_time, end_time, location, image_url, org_id, privacy, max_attendees, created_at, tags,
          attendees:org_event_attendees(
            id,
            user_id,
            status
          )
        `)
        .eq('org_id', currentOrg.id)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) throw error

      // Process events - format like personal events
      // Keep ALL events if user owns the org (don't filter by end date)
      const processedEvents = (eventsData || []).map(event => {
        const attendees = event.attendees || []
        const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
        return {
          ...event,
          attendees: attendees,
          attendee_count: attendeeCount,
          isOrgEvent: true, // Mark as org event
          userOwnsOrg: userOwnsOrg, // Mark if user owns the org
        }
      })

      // Set events immediately for faster UI response
      setEvents(processedEvents || [])
    } catch (error) {
      console.error('Error fetching org events:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Refresh events when the tab is focused (also handles mount + dependency changes)
  useFocusEffect(
    React.useCallback(() => {
      fetchOrgEvents()
    }, [currentOrg?.id])
  )

  const onRefresh = () => {
    setRefreshing(true)
    fetchOrgEvents()
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

  const handleEventPress = (event: EventWithAttendees) => {
    ;(navigation as any).navigate('EventDetail', { event })
  }

  const handleEventCreated = () => {
    setShowCreateModal(false)
    fetchOrgEvents()
  }

  const handleDeleteEvent = async (eventId: string) => {
    const eventToDelete = events.find(event => event.id === eventId)
    if (!eventToDelete) return

    // Only allow deletion if user owns the org
    const user = await getCachedUser()
    if (!user || !currentOrg) return

    // Verify user owns this org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_ownership_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.org_ownership_id !== currentOrg.id) {
      Alert.alert('Error', 'You can only delete events for organizations you own')
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
              setEvents(events.filter(event => event.id !== eventId))
              Alert.alert('Success', 'Event deleted successfully')

              // Send notifications and delete event in the background
              Promise.all([
                notificationService.sendEventEditDeleteNotification(
                  eventId,
                  eventToDelete.title,
                  user.id, // Use user.id as hostId for notification purposes
                  'deleted',
                  true // Indicate it's an org event
                ),
                deleteOrgEventCompletely(eventId)
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

  const renderEvent = ({ item }: { item: EventWithAttendees }) => {
    return (
      <EventCard
        item={{ ...item, attendee_count: (item as any).attendee_count || 0 }}
        showDeleteButton={true}
        onDelete={() => handleDeleteEvent(item.id)}
        onPress={() => handleEventPress(item)}
      />
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading events...</Text>
        </View>
      </View>
    )
  }

  // If user owns the org, show all events (including past ones)
  // Otherwise, only show current/upcoming events
  const currentEvents = events.filter(event => {
    if ((event as any).userOwnsOrg) {
      return true // Show all events if user owns the org
    }
    return !isEventEnded(event.event_date, event.start_time, event.end_time)
  })

  const groupedEvents = groupEventsByTime(currentEvents)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {groupedEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Events</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Your organization doesn't have any upcoming events. Tap the + button to create one!
          </Text>
        </View>
      ) : (
        <SectionList
          sections={groupedEvents}
          renderItem={renderEvent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeaderText, sectionHeaderLargeStyle, { color: theme.text }]}>
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
      )}

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: theme.primary }]}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={32} color={theme.buttonText} />
      </TouchableOpacity>

      {/* Create Event Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <CreateEventScreen
          onBack={() => setShowCreateModal(false)}
          onEventCreated={handleEventCreated}
          isOrgEvent={true}
          orgId={currentOrg?.id}
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
  sectionHeaderText: {},
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
    padding: 12,
  },
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
  compactHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  compactRowLeftAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  expandIcon: {
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
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactHost: {
    fontSize: 12,
  },
  compactMeta: {
    fontSize: 12,
    marginLeft: 6,
    flexShrink: 1,
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
  createButton: {
    position: 'absolute',
    bottom: 22,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
  },
})

