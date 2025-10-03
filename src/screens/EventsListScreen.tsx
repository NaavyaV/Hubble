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
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { EventWithAttendees } from '../types'
import { useTheme } from '../context/ThemeContext'
import { getEventEndDate, isEventEnded, isEventInFuture } from '../utils/eventTimeUtils'

type EventListItem = EventWithAttendees & { goingCount: number; maybeCount: number; tags?: string[] }

type FilterType = 'my_events' | 'today' | 'week' | 'month' | 'all'
type SortType = 'date_asc' | 'date_desc' | 'people_going' | 'recently_created' | 'alphabetical'
type TimeFilterType = 'current' | 'past' | 'photo_gallery'

interface AdvancedFilters {
  friendsOnly: boolean
  peopleGoing: boolean
  hasCapacity: boolean
  last24Hours: boolean
  selectedTags: string[]
}
const predefinedTags = [
  'Game Night',
  'Study Session',
  'Movie Night',
  'Sports',
  'Food & Dining',
  'Music & Arts',
  'Networking',
  'Outdoor Activity',
  'Workshop',
  'Social Mixer'
]

const { height: screenHeight } = Dimensions.get('window')

export default function EventsListScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  const [events, setEvents] = useState<EventListItem[]>([])
  const [filteredEvents, setFilteredEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>('current')
  const [hostProfiles, setHostProfiles] = useState<Record<string, any>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userAttendances, setUserAttendances] = useState<Record<string, string>>({})
  const [userInvitations, setUserInvitations] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Set<string>>(new Set())
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [pastEventStates, setPastEventStates] = useState<{[eventId: string]: {showAttendees: boolean, eventImages: string[]}}>({})
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    friendsOnly: false,
    peopleGoing: false,
    hasCapacity: false,
    last24Hours: false,
    selectedTags: [],
  })
  const [sortBy, setSortBy] = useState<SortType>('date_asc')

  useEffect(() => {
    fetchEvents()
  }, [])

  // Refresh events when the tab is focused
  useFocusEffect(
    React.useCallback(() => {
      console.log('Events tab focused - refreshing events')
      fetchEvents()
    }, [])
  )

  useEffect(() => {
    filterEvents(events, activeFilter)
  }, [activeFilter, timeFilter, events, userAttendances, advancedFilters, sortBy])

  const onRefresh = () => {
    setRefreshing(true)
    fetchEvents()
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

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

      // First, get the user's friends
      await fetchFriends(user.id)

      // Fetch public events
      const { data: publicEvents, error: publicError } = await supabase
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
        .order('event_date', { ascending: true })

      if (publicError) throw publicError

      // Fetch events where user is the host (regardless of privacy)
      const { data: hostedEvents, error: hostedError } = await supabase
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

      if (hostedError) throw hostedError

      // Fetch friends-only events where user is invited
      const { data: invitedEvents, error: invitedError } = await supabase
        .from('events')
        .select(`
          *,
          attendees:event_attendees(
            id,
            user_id,
            status
          )
        `)
        .eq('privacy', 'friends_only')
        .in('id', await getInvitedEventIds(user.id))
        .order('event_date', { ascending: true })

      if (invitedError) throw invitedError

      // Combine all events and remove duplicates
      const allEvents = [...publicEvents, ...hostedEvents, ...invitedEvents]
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.id === event.id)
      )

      // Calculate attendee counts
      const eventsWithCounts = uniqueEvents.map(event => ({
        ...event,
        goingCount: event.attendees?.filter((a: any) => a.status === 'going').length || 0,
        maybeCount: event.attendees?.filter((a: any) => a.status === 'maybe').length || 0,
      }))

      // Set events immediately for faster UI response
      setEvents(eventsWithCounts)
      setLoading(false) // Show events as soon as basic data is loaded

      // Fetch additional data in parallel without blocking UI
      Promise.all([
        fetchHostProfiles(eventsWithCounts),
        fetchAttendeeProfiles(eventsWithCounts),
        fetchEventPhotos(eventsWithCounts),
        fetchUserAttendances(eventsWithCounts),
        fetchUserInvitations(eventsWithCounts)
      ]).catch(error => {
        console.error('Error fetching additional data:', error)
      })
    } catch (error) {
      console.error('Error fetching events:', error)
      setLoading(false)
    } finally {
      setRefreshing(false)
    }
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
    } catch (error) {
      console.error('Error fetching friends:', error)
    }
  }

  const getInvitedEventIds = async (userId: string) => {
    try {
      const { data: invitations } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', userId)

      return invitations?.map(inv => inv.event_id) || []
    } catch (error) {
      console.error('Error fetching invitations:', error)
      return []
    }
  }

  const fetchHostProfiles = async (eventsList: EventWithAttendees[]) => {
    try {
      const hostIds = [...new Set(eventsList.map(event => event.host_id))]
      if (hostIds.length === 0) return

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', hostIds)

      if (profiles) {
        const profilesMap = profiles.reduce((acc, profile) => {
          acc[profile.id] = profile
          return acc
        }, {} as Record<string, any>)
        setHostProfiles(profilesMap)
      }
    } catch (error) {
      console.error('Error fetching host profiles:', error)
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
        console.error('Error fetching event photos:', error)
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
    } catch (error) {
      console.error('Error in fetchEventPhotos:', error)
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
    } catch (error) {
      console.error('Error fetching attendee profiles:', error)
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
    } catch (error) {
      console.error('Error fetching user attendances:', error)
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
    } catch (error) {
      console.error('Error fetching user invitations:', error)
    }
  }

    const filterEvents = (eventsList: EventListItem[], filter: FilterType) => {
    let filtered = [...eventsList]

    // Apply time filter first (current vs past)
    const now = new Date()
    if (timeFilter === 'current') {
      filtered = filtered.filter(event => {
        // Event is current if it hasn't ended yet
        return !isEventEnded(event.event_date, event.start_time, event.end_time)
      })
    } else if (timeFilter === 'past') {
      // Calculate 30 days ago
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      filtered = filtered.filter(event => {
        const eventStart = new Date(event.event_date + ' ' + event.start_time)
        const eventEnd = getEventEndDate(event.event_date, event.start_time, event.end_time)
        
        // Event must have ended and be within the last 30 days
        return eventEnd < now && eventStart >= thirtyDaysAgo
      })
    }

    // Apply advanced filters
    if (advancedFilters.friendsOnly) {
      filtered = filtered.filter(event => 
        event.privacy === 'friends_only' || 
        friends.has(event.host_id)
      )
    }

    if (advancedFilters.peopleGoing) {
      filtered = filtered.filter(event => event.goingCount > 0)
    }

    if (advancedFilters.hasCapacity) {
      filtered = filtered.filter(event => event.max_attendees && event.max_attendees > 0)
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

    // Apply main filter
    switch (filter) {
      case 'my_events':
        if (timeFilter === 'past') {
          // In past events, only show events where user was going
          filtered = filtered.filter(event => userAttendances[event.id] === 'going')
        } else {
          // In current events, show both going and maybe
          filtered = filtered.filter(event => 
            userAttendances[event.id] === 'going' || userAttendances[event.id] === 'maybe'
          )
        }
        break
      case 'today':
        const today = new Date().toISOString().split('T')[0]
        filtered = filtered.filter(event => event.event_date === today)
        break
      case 'week':
        const weekFromNow = new Date()
        weekFromNow.setDate(weekFromNow.getDate() + 7)
        filtered = filtered.filter(event => new Date(event.event_date) <= weekFromNow)
        break
      case 'month':
        const monthFromNow = new Date()
        monthFromNow.setMonth(monthFromNow.getMonth() + 1)
        filtered = filtered.filter(event => new Date(event.event_date) <= monthFromNow)
        break
    }

    // Apply sorting
    switch (sortBy) {
      case 'date_asc':
        filtered.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
        break
      case 'date_desc':
        filtered.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
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

    setFilteredEvents(filtered as EventListItem[])
  }

  const renderPastEventCard = ({ item, hostProfile, userAttendance, isHost }: { 
    item: EventListItem, 
    hostProfile: any, 
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
            <Text style={styles.pastEventHost}>
              Hosted by {hostProfile?.full_name || hostProfile?.username || 'Unknown'}
            </Text>
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
            onPress={() => (navigation as any).navigate('EventPhotoGallery', { 
              event: item,
              eventImages: eventImages
            })}
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
    const userAttendance = userAttendances[item.id]
    const isInvited = userInvitations.has(item.id)
    const isHost = item.host_id === currentUserId

    // Render specialized past event card
    if (timeFilter === 'past') {
      return renderPastEventCard({ item, hostProfile, userAttendance, isHost })
    }

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => (navigation as any).navigate('EventDetail', { event: item })}
      >
        {/* Event Image */}
        {item.image_url && (
          <Image
            source={{ uri: item.image_url }}
            style={styles.eventImage}
            resizeMode="cover"
          />
        )}

        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventHost}>
                Hosted by {hostProfile?.full_name || hostProfile?.username || 'Unknown'}
              </Text>
            </View>
            {isInvited && (
              <View style={styles.invitedBadge}>
                <Text style={styles.invitedText}>Invited</Text>
              </View>
            )}
          </View>

          <Text style={styles.eventDescription} numberOfLines={2}>
            {item.description}
          </Text>

          {/* Event Tags */}
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {item.tags.slice(0, 3).map((tag, index) => (
                <View key={index} style={styles.eventTag}>
                  <Text style={styles.eventTagText}>{tag}</Text>
                </View>
              ))}
              {item.tags.length > 3 && (
                <View style={styles.eventTag}>
                  <Text style={styles.eventTagText}>+{item.tags.length - 3}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.eventDetails}>
            <View style={styles.eventDetail}>
              <Ionicons name="calendar" size={16} color="#e74c3c" />
              <Text style={styles.eventDetailText}>
                {formatDate(item.event_date)}
              </Text>
            </View>
            <View style={styles.eventDetail}>
              <Ionicons name="time" size={16} color="#f39c12" />
              <Text style={styles.eventDetailText}>
                {formatTime(item.start_time)}
              </Text>
            </View>
            <View style={styles.eventDetail}>
              <Ionicons name="location" size={16} color="#27ae60" />
              <Text style={styles.eventDetailText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          </View>

          <View style={styles.eventStats}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={16} color="#27ae60" />
              <Text style={styles.statText}>{item.goingCount} going</Text>
            </View>
            {item.maybeCount > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="help-circle" size={16} color="#f39c12" />
                <Text style={styles.statText}>{item.maybeCount} maybe</Text>
              </View>
            )}
            {item.max_attendees && (
              <View style={styles.statItem}>
                <Ionicons name="person-add" size={16} color="#3498db" />
                <Text style={styles.statText}>
                  {item.goingCount}/{item.max_attendees} spots
                </Text>
              </View>
            )}
          </View>

          {/* Show attendance status if user is going or maybe */}
          {userAttendance === 'going' && (
            <View style={styles.attendanceStatus}>
              <Ionicons name="checkmark-circle" size={16} color="#27ae60" />
              <Text style={styles.attendanceStatusText}>You're going</Text>
            </View>
          )}
          {userAttendance === 'maybe' && (
            <View style={styles.attendanceStatus}>
              <Ionicons name="help-circle" size={16} color="#f39c12" />
              <Text style={styles.attendanceStatusText}>You're maybe</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderFilterButton = (filter: FilterType, label: string) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        activeFilter === filter && styles.filterButtonActive,
        filter === 'my_events' && activeFilter === filter && styles.myEventsButtonActive
      ]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text style={[
        styles.filterButtonText,
        activeFilter === filter && styles.filterButtonTextActive,
        filter === 'my_events' && activeFilter === filter && styles.myEventsTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  )

  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Time Filter Bar */}
      <View style={styles.timeFilterContainer}>
        <TouchableOpacity
          style={[
            styles.timeFilterButton,
            timeFilter === 'current' && styles.timeFilterButtonActive
          ]}
          onPress={() => {
            setTimeFilter('current')
            setActiveFilter('all') // Reset to default filter for current events
          }}
        >
          <Text 
            style={[
              styles.timeFilterText,
              timeFilter === 'current' && styles.timeFilterTextActive
            ]}
            numberOfLines={1}
          >
            Coming Events
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.timeFilterButton,
            timeFilter === 'past' && styles.timeFilterButtonActive
          ]}
          onPress={() => {
            setTimeFilter('past')
            setActiveFilter('all') // Reset to default filter for past events
          }}
        >
          <Text 
            style={[
              styles.timeFilterText,
              timeFilter === 'past' && styles.timeFilterTextActive
            ]}
            numberOfLines={1}
          >
            Past Events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.photoGalleryIcon}
          onPress={() => {
            setTimeFilter('photo_gallery')
            // Navigate to general photo gallery
            ;(navigation as any).navigate('GeneralPhotoGallery')
          }}
        >
          <Ionicons 
            name="images-outline" 
            size={24} 
            color={timeFilter === 'photo_gallery' ? theme.primary : theme.textSecondary} 
          />
        </TouchableOpacity>
      </View>

      {/* Filter container with integrated filter button - only for coming events */}
      {timeFilter === 'current' && (
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
            scrollEnabled={true}
            bounces={false}
          >
            {renderFilterButton('my_events', 'My Events')}
            {renderFilterButton('all', 'All')}
            {renderFilterButton('today', 'Today')}
            {renderFilterButton('week', 'This Week')}
            {renderFilterButton('month', 'This Month')}
          </ScrollView>
        
          {/* Filter button with fade effect */}
          <View style={styles.filterButtonContainer}>
            <LinearGradient
              colors={[`${theme.headerBackground}00`, theme.headerBackground]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeOverlay}
            />
            <TouchableOpacity
              style={styles.filterIcon}
              onPress={() => setShowFilterModal(true)}
            >
              <Ionicons name="options" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {timeFilter !== 'photo_gallery' && (
        // Events List
        <FlatList
          data={filteredEvents}
          renderItem={renderEventCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.eventsList,
            filteredEvents.length === 0 && timeFilter === 'past' && styles.emptyStateContainer
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          style={styles.eventsFlatList}
          ListEmptyComponent={
            timeFilter === 'past' ? (
              <View style={styles.pastEventsEmptyState}>
                <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.pastEventsEmptyTitle}>No Recent Events</Text>
                <Text style={styles.pastEventsEmptyMessage}>
                  You haven't attended any events in the past 30 days
                </Text>
              </View>
            ) : activeFilter === 'my_events' && timeFilter === 'current' ? (
              <View style={styles.myEventsEmptyState}>
                <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.myEventsEmptyTitle}>No Events Yet</Text>
                <Text style={styles.myEventsEmptyMessage}>
                  You haven't signed up for any events yet!
                </Text>
              </View>
            ) : null
          }
        />
      )}

      
      
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
                  advancedFilters.hasCapacity && styles.filterOptionActive
                ]}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  hasCapacity: !prev.hasCapacity
                }))}
              >
                <Ionicons
                  name={advancedFilters.hasCapacity ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.hasCapacity ? '#3498db' : '#bdc3c7'}
                />
                <Text style={styles.filterOptionText}>Has Capacity Limit</Text>
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
                {predefinedTags.map((tag) => (
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
                  hasCapacity: false,
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
    width: 80,
    justifyContent: 'flex-end',
  },
  fadeOverlay: {
    position: 'absolute',
    left: -40,
    top: 0,
    bottom: 0,
    width: 40,
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
  photoGalleryContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  photoGalleryContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  photoGalleryTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
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
  eventsList: {
    padding: 20,
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
})
