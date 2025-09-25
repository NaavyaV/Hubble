import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import ProfileModal from '../components/ProfileModal'
import { EventWithAttendees } from '../types'

interface EventAttendee {
  id: string
  event_id: string
  user_id: string
  status: 'going' | 'maybe' | 'not_going'
  user?: {
    id: string
    full_name?: string
    avatar_url?: string
    bio?: string
    phone_number?: string
  }
}

type RootStackParamList = {
  EventDetail: { event: EventWithAttendees }
}

type EventDetailRouteProp = RouteProp<RootStackParamList, 'EventDetail'>

export default function EventDetailScreen() {
  const navigation = useNavigation()
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
  
  const [userAttendance, setUserAttendance] = useState<'going' | 'maybe' | 'not_going' | null>(null)
  const [loading, setLoading] = useState(false)
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [hostProfile, setHostProfile] = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    if (event && event.id) {
      fetchCurrentUser()
      fetchAttendeesWithProfiles()
      fetchHostProfile()
    }
  }, [event?.id])

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
      const hostStatus = user?.id === event.host_id
      setIsHost(hostStatus)
      
      // If user is host, automatically set them as "going"
      if (hostStatus) {
        setUserAttendance('going')
        // Ensure host is added to attendees table
        await ensureHostIsAttending()
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

  const fetchAttendeesWithProfiles = async () => {
    try {
      setLoading(true)
      
      // First, get all attendees for this event
      const { data: attendeesData, error: attendeesError } = await supabase
        .from('event_attendees')
        .select('*')
        .eq('event_id', event.id)

      if (attendeesError) throw attendeesError

      // Then, get all user profiles for these attendees
      const userIds = attendeesData?.map(a => a.user_id) || []
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, bio, phone_number')
          .in('id', userIds)

        if (profilesError) throw profilesError

        // Combine attendees with their profiles
        const attendeesWithProfiles = attendeesData?.map(attendee => ({
          ...attendee,
          user: profilesData?.find(profile => profile.id === attendee.user_id)
        })) || []

        setAttendees(attendeesWithProfiles)
        setProfilesLoaded(true)

        // Find current user's attendance status (only if not host)
        const { data: { user } } = await supabase.auth.getUser()
        if (user && !isHost) {
          const userAttendance = attendeesWithProfiles.find(a => a.user_id === user.id)
          setUserAttendance(userAttendance?.status || null)
        }
      } else {
        setAttendees([])
        setProfilesLoaded(true)
      }
    } catch (error) {
      console.error('Error fetching attendees:', error)
      setAttendees([])
      setProfilesLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchHostProfile = async () => {
    try {
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

  const handleAttendanceChange = async (status: 'going' | 'maybe' | 'not_going') => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Remove existing attendance record
      await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id)

      // Add new attendance record
      const { error } = await supabase
        .from('event_attendees')
        .insert({
          event_id: event.id,
          user_id: user.id,
          status: status
        })

      if (error) throw error

      setUserAttendance(status)
      
      // Refresh attendees list
      await fetchAttendeesWithProfiles()
      
      // No alert for attendance changes
    } catch (error) {
      console.error('Error updating attendance:', error)
      Alert.alert('Error', 'Failed to update attendance')
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

  const getMaybeCount = () => {
    return attendees.filter(a => a.status === 'maybe').length
  }

  const getNotGoingCount = () => {
    return attendees.filter(a => a.status === 'not_going').length
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
            <Ionicons name="person" size={24} color="#7f8c8d" />
          )}
        </View>
        <View style={styles.attendeeInfo}>
          <View style={styles.attendeeNameRow}>
            <Text style={styles.attendeeName}>{user.full_name || 'Unknown'}</Text>
            {user.id === event.host_id && (
              <View style={styles.hostBadge}>
                <Ionicons name="star" size={12} color="white" />
                <Text style={styles.hostBadgeText}>Host</Text>
              </View>
            )}
          </View>
          <Text style={styles.attendeeStatus}>
            {attendee.status === 'going' ? 'Going' : 
             attendee.status === 'maybe' ? 'Maybe' : 'Not Going'}
          </Text>
        </View>
        <View style={[
          styles.statusIndicator,
          attendee.status === 'going' ? styles.goingIndicator :
          attendee.status === 'maybe' ? styles.maybeIndicator : styles.notGoingIndicator
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
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Event Image */}
        {event.image_url && (
          <Image source={{ uri: event.image_url }} style={styles.eventImage} />
        )}

        {/* Event Content */}
        <View style={styles.content}>
          {/* Title and Privacy */}
          <View style={styles.titleRow}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            {event.privacy === 'friends_only' && (
              <View style={styles.privacyBadge}>
                <Ionicons name="lock-closed" size={16} color="#e74c3c" />
                <Text style={styles.privacyText}>Friends Only</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {event.description && (
            <Text style={styles.eventDescription}>{event.description}</Text>
          )}

          {/* Host Info */}
          {hostProfile && (
            <View style={styles.hostSection}>
              <Text style={styles.sectionTitle}>Hosted by</Text>
              <TouchableOpacity 
                style={styles.hostInfo}
                onPress={() => handleUserPress(hostProfile)}
              >
                <View style={styles.hostAvatar}>
                  {hostProfile.avatar_url ? (
                    <Image source={{ uri: hostProfile.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={24} color="#7f8c8d" />
                  )}
                </View>
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostName}>{hostProfile.full_name || 'Unknown'}</Text>
                  {isHost && (
                    <View style={styles.hostBadge}>
                      <Ionicons name="star" size={12} color="white" />
                      <Text style={styles.hostBadgeText}>You</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Event Details */}
          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color="#3498db" />
              <Text style={styles.detailText}>{formatDate(event.event_date)}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color="#f39c12" />
              <Text style={styles.detailText}>
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color="#e74c3c" />
              <Text style={styles.detailText}>{event.location}</Text>
            </View>
            
            {event.max_attendees && (
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={20} color="#7f8c8d" />
                <Text style={styles.detailText}>
                  Max {event.max_attendees} attendees
                </Text>
              </View>
            )}
          </View>

          {/* Attendance Actions */}
          {!isHost && (
            <View style={styles.attendanceSection}>
              <Text style={styles.sectionTitle}>Your Attendance</Text>
              {isEventFull() ? (
                <View style={styles.eventFullContainer}>
                  <View style={styles.eventFullHeader}>
                    <Ionicons name="people" size={24} color="#e74c3c" />
                    <Text style={styles.eventFullTitle}>Event is Full</Text>
                  </View>
                  <Text style={styles.eventFullMessage}>
                    This event has reached its maximum capacity. Contact the host if you'd like to join:
                  </Text>
                  {hostProfile?.phone_number && (
                    <TouchableOpacity style={styles.contactHostButton}>
                      <Ionicons name="call" size={16} color="#3498db" />
                      <Text style={styles.contactHostText}>
                        {hostProfile.phone_number}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!hostProfile?.phone_number && (
                    <Text style={styles.noContactText}>
                      Host contact information not available
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.attendanceButtons}>
                  <TouchableOpacity
                    style={[
                      styles.attendanceButton,
                      userAttendance === 'going' && styles.attendanceButtonActive
                    ]}
                    onPress={() => handleAttendanceChange('going')}
                  >
                    <Ionicons 
                      name="checkmark-circle" 
                      size={20} 
                      color={userAttendance === 'going' ? 'white' : '#27ae60'} 
                    />
                    <Text style={[
                      styles.attendanceButtonText,
                      userAttendance === 'going' && styles.attendanceButtonTextActive
                    ]}>
                      Going
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.attendanceButton,
                      userAttendance === 'maybe' && styles.attendanceButtonActive
                    ]}
                    onPress={() => handleAttendanceChange('maybe')}
                  >
                    <Ionicons 
                      name="help-circle" 
                      size={20} 
                      color={userAttendance === 'maybe' ? 'white' : '#f39c12'} 
                    />
                    <Text style={[
                      styles.attendanceButtonText,
                      userAttendance === 'maybe' && styles.attendanceButtonTextActive
                    ]}>
                      Maybe
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.attendanceButton,
                      userAttendance === 'not_going' && styles.attendanceButtonActive
                    ]}
                    onPress={() => handleAttendanceChange('not_going')}
                  >
                    <Ionicons 
                      name="close-circle" 
                      size={20} 
                      color={userAttendance === 'not_going' ? 'white' : '#e74c3c'} 
                    />
                    <Text style={[
                      styles.attendanceButtonText,
                      userAttendance === 'not_going' && styles.attendanceButtonTextActive
                    ]}>
                      Not Going
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Host Status */}
          {isHost && (
            <View style={styles.hostStatusContainer}>
              <View style={styles.hostStatusHeader}>
                <Ionicons name="star" size={20} color="#f39c12" />
                <Text style={styles.hostStatusTitle}>You are the host</Text>
              </View>
              <Text style={styles.hostStatusText}>
                You are automatically marked as going to this event.
              </Text>
            </View>
          )}

          {/* Attendees Section - Only show going and maybe */}
          <View style={styles.attendeesContainer}>
            <View style={styles.attendeesHeader}>
              <Text style={styles.attendeesTitle}>Who's Going</Text>
              <View style={styles.attendeeStats}>
                <Text style={styles.attendeeStatsText}>
                  {getGoingCount()} going
                  {getMaybeCount() > 0 && `, ${getMaybeCount()} maybe`}
                  {event.max_attendees && ` out of ${event.max_attendees} max`}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading attendees...</Text>
              </View>
            ) : profilesLoaded ? (
              <View style={styles.attendeesList}>
                {attendees.filter(a => a.status !== 'not_going').length > 0 ? (
                  attendees
                    .filter(a => a.status !== 'not_going') // Filter out "not going" attendees
                    .map(renderAttendee)
                ) : (
                  <Text style={styles.noAttendeesText}>No attendees yet</Text>
                )}
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Profile Modal */}
      <ProfileModal
        isVisible={showProfileModal}
        onClose={() => {
          setShowProfileModal(false)
          setSelectedUser(null)
        }}
        user={selectedUser}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
    color: '#e74c3c',
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
    color: '#2c3e50',
    flex: 1,
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
    color: '#7f8c8d',
    lineHeight: 24,
    marginBottom: 20,
  },
  hostSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
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
    color: '#2c3e50',
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
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 16,
    color: '#2c3e50',
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
    borderColor: '#e1e8ed',
    backgroundColor: 'white',
    marginHorizontal: 4,
  },
  attendanceButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  attendanceButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
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
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
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
    color: '#2c3e50',
  },
  attendeeStats: {
    flex: 1,
    alignItems: 'flex-end',
  },
  attendeeStatsText: {
    fontSize: 14,
    color: '#7f8c8d',
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
    backgroundColor: '#f8f9fa',
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
    color: '#2c3e50',
    marginRight: 8,
  },
  attendeeStatus: {
    fontSize: 14,
    color: '#7f8c8d',
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
    color: '#7f8c8d',
  },
  noAttendeesText: {
    fontSize: 16,
    color: '#7f8c8d',
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
})
