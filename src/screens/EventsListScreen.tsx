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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { EventWithAttendees } from '../types'

type FilterType = 'going' | 'today' | 'week' | 'month' | 'all'
type SortType = 'date_asc' | 'date_desc' | 'people_going' | 'recently_created' | 'alphabetical'

interface AdvancedFilters {
  friendsOnly: boolean
  peopleGoing: boolean
  hasCapacity: boolean
  last24Hours: boolean
}

const { height: screenHeight } = Dimensions.get('window')

export default function EventsListScreen() {
  const navigation = useNavigation()
  const [events, setEvents] = useState<EventWithAttendees[]>([])
  const [filteredEvents, setFilteredEvents] = useState<EventWithAttendees[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [hostProfiles, setHostProfiles] = useState<Record<string, any>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userAttendances, setUserAttendances] = useState<Record<string, string>>({})
  const [userInvitations, setUserInvitations] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Set<string>>(new Set())
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    friendsOnly: false,
    peopleGoing: false,
    hasCapacity: false,
    last24Hours: false,
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
  }, [activeFilter, events, userAttendances, advancedFilters, sortBy])

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
        goingCount: event.attendees?.filter(a => a.status === 'going').length || 0,
        maybeCount: event.attendees?.filter(a => a.status === 'maybe').length || 0,
      }))

      setEvents(eventsWithCounts)

      // Fetch host profiles
      await fetchHostProfiles(eventsWithCounts)

      // Fetch user's attendance status
      await fetchUserAttendances(eventsWithCounts)

      // Fetch user's invitations
      await fetchUserInvitations(eventsWithCounts)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
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

  const filterEvents = (eventsList: EventWithAttendees[], filter: FilterType) => {
    let filtered = [...eventsList]

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

    // Apply main filter
    switch (filter) {
      case 'going':
        filtered = filtered.filter(event => userAttendances[event.id] === 'going')
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

    setFilteredEvents(filtered)
  }

  const renderEventCard = ({ item }: { item: EventWithAttendees }) => {
    const hostProfile = hostProfiles[item.host_id]
    const userAttendance = userAttendances[item.id]
    const isInvited = userInvitations.has(item.id)
    const isHost = item.host_id === currentUserId

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => navigation.navigate('EventDetail', { event: item })}
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

          <View style={styles.eventDetails}>
            <View style={styles.eventDetail}>
              <Ionicons name="calendar" size={16} color="#7f8c8d" />
              <Text style={styles.eventDetailText}>
                {formatDate(item.event_date)}
              </Text>
            </View>
            <View style={styles.eventDetail}>
              <Ionicons name="time" size={16} color="#7f8c8d" />
              <Text style={styles.eventDetailText}>
                {formatTime(item.start_time)}
              </Text>
            </View>
            <View style={styles.eventDetail}>
              <Ionicons name="location" size={16} color="#7f8c8d" />
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

          {/* Show attendance status if user is going */}
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
        activeFilter === filter && styles.filterButtonActive
      ]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text style={[
        styles.filterButtonText,
        activeFilter === filter && styles.filterButtonTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>Loading events...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <TouchableOpacity
          style={styles.filterIcon}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="options" size={24} color="#2c3e50" />
        </TouchableOpacity>
      </View>

      {/* Fixed height filter container */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {renderFilterButton('all', 'All')}
          {renderFilterButton('going', 'Going')}
          {renderFilterButton('today', 'Today')}
          {renderFilterButton('week', 'This Week')}
          {renderFilterButton('month', 'This Month')}
        </ScrollView>
      </View>

      <FlatList
        data={filteredEvents}
        renderItem={renderEventCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.eventsList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3498db']}
            tintColor="#3498db"
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Advanced Filters</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Ionicons name="close" size={24} color="#2c3e50" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Event Type</Text>
              <TouchableOpacity
                style={styles.filterOption}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  friendsOnly: !prev.friendsOnly
                }))}
              >
                <Ionicons
                  name={advancedFilters.friendsOnly ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.friendsOnly ? '#3498db' : '#7f8c8d'}
                />
                <Text style={styles.filterOptionText}>Friends Only</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Activity</Text>
              <TouchableOpacity
                style={styles.filterOption}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  peopleGoing: !prev.peopleGoing
                }))}
              >
                <Ionicons
                  name={advancedFilters.peopleGoing ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.peopleGoing ? '#3498db' : '#7f8c8d'}
                />
                <Text style={styles.filterOptionText}>People Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterOption}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  hasCapacity: !prev.hasCapacity
                }))}
              >
                <Ionicons
                  name={advancedFilters.hasCapacity ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.hasCapacity ? '#3498db' : '#7f8c8d'}
                />
                <Text style={styles.filterOptionText}>Has Capacity Limit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterOption}
                onPress={() => setAdvancedFilters(prev => ({
                  ...prev,
                  last24Hours: !prev.last24Hours
                }))}
              >
                <Ionicons
                  name={advancedFilters.last24Hours ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={advancedFilters.last24Hours ? '#3498db' : '#7f8c8d'}
                />
                <Text style={styles.filterOptionText}>Created in Last 24 Hours</Text>
              </TouchableOpacity>
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
                  style={styles.sortOption}
                  onPress={() => setSortBy(option.value as SortType)}
                >
                  <Ionicons
                    name={sortBy === option.value ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={sortBy === option.value ? '#3498db' : '#7f8c8d'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  filterIcon: {
    padding: 8,
  },
  filterContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
    height: 60, // Fixed height to prevent squishing
  },
  filterContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    marginRight: 12,
    height: 36, // Fixed height for buttons
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#3498db',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  eventsList: {
    padding: 20,
  },
  eventCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 200, // Good size for event images
    backgroundColor: '#f8f9fa',
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
    color: '#2c3e50',
    marginBottom: 4,
  },
  eventHost: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  invitedBadge: {
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  invitedText: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '500',
  },
  eventDescription: {
    fontSize: 14,
    color: '#5a6c7d',
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
    color: '#7f8c8d',
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
    color: '#7f8c8d',
    marginLeft: 4,
  },
  attendanceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  attendanceStatusText: {
    fontSize: 12,
    color: '#2c3e50',
    marginLeft: 4,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2c3e50',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  filterOptionText: {
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 12,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    marginRight: 12,
  },
  clearButtonText: {
    fontSize: 16,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3498db',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
})
