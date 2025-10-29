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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import notificationService from '../services/notifications'
import { formatEventTimeDisplay, isMidnightSpanningEvent, isEventEnded, isEventCurrentlyHappening, isEventInFuture } from '../utils/eventTimeUtils'

export default function MyEventsScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [events, setEvents] = useState<EventWithAttendees[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMyEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
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
        .order('created_at', { ascending: false })

      if (error) throw error

      const eventsWithCounts = data?.map(event => {
        // Safely handle attendees array
        const attendees = event.attendees || []
        const attendeeCount = attendees.filter((a: any) => a.status === 'going').length || 0
        return {
          ...event,
          attendees: attendees, // Ensure attendees is always an array
          attendee_count: attendeeCount
        }
      }) || []

      setEvents(eventsWithCounts)
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
    const eventToDelete = events.find(event => event.id === eventId)
    if (!eventToDelete) return

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

  // Categorize events into past, current, and coming
  const categorizeEvents = () => {
    const past: EventWithAttendees[] = []
    const current: EventWithAttendees[] = []
    const coming: EventWithAttendees[] = []

    events.forEach(event => {
      if (isEventCurrentlyHappening(event.event_date, event.start_time, event.end_time)) {
        current.push(event)
      } else if (isEventEnded(event.event_date, event.start_time, event.end_time)) {
        past.push(event)
      } else if (isEventInFuture(event.event_date, event.start_time)) {
        coming.push(event)
      }
    })

    // Sort each category by date (most recent first for past, earliest first for coming)
    past.sort((a, b) => {
      const dateA = new Date(a.event_date + ' ' + a.start_time)
      const dateB = new Date(b.event_date + ' ' + b.start_time)
      return dateB.getTime() - dateA.getTime()
    })

    current.sort((a, b) => {
      const dateA = new Date(a.event_date + ' ' + a.start_time)
      const dateB = new Date(b.event_date + ' ' + b.start_time)
      return dateA.getTime() - dateB.getTime()
    })

    coming.sort((a, b) => {
      const dateA = new Date(a.event_date + ' ' + a.start_time)
      const dateB = new Date(b.event_date + ' ' + b.start_time)
      return dateA.getTime() - dateB.getTime()
    })

    return { past, current, coming }
  }

  const renderEvent = ({ item }: { item: EventWithAttendees }) => {
    const attendeeCount = (item as any).attendee_count || 0
    const isCurrent = isEventCurrentlyHappening(item.event_date, item.start_time, item.end_time)
    
    return (
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
        onPress={() => handleEventPress(item)}
      >
        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.eventImage} />
        )}
        
        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            <View style={styles.eventTitleContainer}>
              <Text style={[styles.eventTitle, { color: theme.text }]}>{item.title}</Text>
              {isCurrent && (
                <View style={[styles.currentBadge, { backgroundColor: theme.success + '20', borderColor: theme.success }]}>
                  <Ionicons name="pulse" size={10} color={theme.success} />
                  <Text style={[styles.currentBadgeText, { color: theme.success }]}>Current</Text>
                </View>
              )}
            </View>
            <View style={styles.eventActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface }]}
                onPress={() => handleDeleteEvent(item.id)}
              >
                <Ionicons name="trash-outline" size={20} color={theme.error} />
              </TouchableOpacity>
            </View>
          </View>
          
          {item.description && (
            <Text style={[styles.eventDescription, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          
          <View style={styles.eventDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={theme.error} />
              <Text style={[styles.detailText, { color: theme.text }]}>{item.location}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {formatDate(item.event_date)} at {formatEventTimeDisplay(item.start_time, item.end_time)}
              </Text>
              {item.end_time && isMidnightSpanningEvent(item.start_time, item.end_time) && (
                <View style={[styles.midnightIndicator, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
                  <Ionicons name="moon" size={12} color={theme.primary} />
                  <Text style={[styles.midnightText, { color: theme.primary }]}>
                    Next day
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} going
                {item.max_attendees && ` out of ${item.max_attendees} max`}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
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

  const { past, current, coming } = categorizeEvents()
  const hasAnyEvents = past.length > 0 || current.length > 0 || coming.length > 0

  const renderSectionHeader = (title: string, count: number) => {
    if (count === 0) return null
    
    return (
      <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <View style={[styles.badge, { backgroundColor: theme.primary + '20' }]}>
          <Text style={[styles.badgeText, { color: theme.primary }]}>{count}</Text>
        </View>
      </View>
    )
  }

  // Combined list for FlatList with sections
  const renderSectionedList = () => {
    const sections: Array<{ type: 'header' | 'event', data: any }> = []
    
    if (current.length > 0) {
      sections.push({ type: 'header', data: { title: 'Current', count: current.length } })
      current.forEach(event => sections.push({ type: 'event', data: event }))
    }
    
    if (coming.length > 0) {
      sections.push({ type: 'header', data: { title: 'Coming', count: coming.length } })
      coming.forEach(event => sections.push({ type: 'event', data: event }))
    }
    
    if (past.length > 0) {
      sections.push({ type: 'header', data: { title: 'Past', count: past.length } })
      past.forEach(event => sections.push({ type: 'event', data: event }))
    }
    
    return sections
  }

  const renderItem = ({ item }: { item: { type: 'header' | 'event', data: any } }) => {
    if (item.type === 'header') {
      return renderSectionHeader(item.data.title, item.data.count)
    } else {
      return renderEvent({ item: item.data })
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={renderSectionedList()}
        keyExtractor={(item, index) => {
          if (item.type === 'header') {
            return `header-${item.data.title}-${index}`
          }
          return `event-${item.data.id}-${index}`
        }}
        renderItem={renderItem}
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
          hasAnyEvents ? null : (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Events Yet</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                You haven't created any events yet. Tap the + button to create your first event!
              </Text>
            </View>
          )
        }
      />
    </View>
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
    padding: 16,
  },
  eventCard: {
    borderRadius: 12,
    marginBottom: 16,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
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
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  eventActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
  },
  eventDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  eventDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
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
})
