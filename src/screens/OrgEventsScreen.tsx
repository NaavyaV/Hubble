import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
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
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { isEventEnded, isEventCurrentlyHappening } from '../utils/eventTimeUtils'
import CreateEventScreen from './CreateEventScreen'
import notificationService from '../services/notifications'

export default function OrgEventsScreen() {
  const { theme } = useTheme()
  const { currentOrg } = useOrgMode()
  const navigation = useNavigation()
  const [events, setEvents] = useState<EventWithAttendees[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set())

  const fetchOrgEvents = async () => {
    try {
      if (!currentOrg) {
        setEvents([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      // Get the logged-in user to verify ownership
      const { data: { user } } = await supabase.auth.getUser()
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
          *,
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

  useEffect(() => {
    fetchOrgEvents()
  }, [currentOrg?.id])

  // Refresh events when the tab is focused
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
    const { data: { user } } = await supabase.auth.getUser()
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
              // Send notifications to all attendees before deleting
              // For org events, pass isOrgEvent flag and use user.id as hostId (for notification purposes only)
              await notificationService.sendEventEditDeleteNotification(
                eventId,
                eventToDelete.title,
                user.id, // Use user.id as hostId for notification purposes
                'deleted',
                true // Indicate it's an org event
              )

              const { error } = await supabase
                .from('org_events')
                .delete()
                .eq('id', eventId)

              if (error) throw error

              setEvents(events.filter(event => event.id !== eventId))
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

  const toggleExpanded = (eventId: string) => {
    setExpandedEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  const renderEvent = ({ item }: { item: EventWithAttendees }) => {
    const attendeeCount = (item as any).attendee_count || 0
    const isCurrent = isEventCurrentlyHappening(item.event_date, item.start_time, item.end_time)
    const isExpanded = expandedEventIds.has(item.id)
    const orgName = currentOrg?.name || 'Organization'
    
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
              {orgName}
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
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteEvent(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={theme.error} />
            </TouchableOpacity>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <FlatList
        data={currentEvents}
        renderItem={renderEvent}
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Events</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Your organization doesn't have any upcoming events. Tap the + button to create one!
            </Text>
          </View>
        }
      />

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: theme.primary }]}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

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
})

