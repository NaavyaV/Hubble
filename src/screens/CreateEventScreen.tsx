import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { validateEventTimes, isMidnightSpanningEvent, formatEventTimeDisplay } from '../utils/eventTimeUtils'
import NotificationService from '../services/notifications'
import { PREDEFINED_TAGS } from '../constants/tags'

interface CreateEventScreenProps {
  onBack: () => void
  onEventCreated: () => void
}


export default function CreateEventScreen({ onBack, onEventCreated }: CreateEventScreenProps) {
  const { theme, isDark } = useTheme()
  const navigation = useNavigation()
  const getRoundedToNextFiveMinutes = () => {
    const d = new Date()
    const minutes = d.getMinutes()
    const rounded = Math.ceil(minutes / 5) * 5
    if (rounded === 60) {
      d.setHours(d.getHours() + 1)
      d.setMinutes(0, 0, 0)
    } else {
      d.setMinutes(rounded, 0, 0)
    }
    return d
  }
  const getRoundedEndTimeFrom = (start: Date) => {
    const d = new Date(start.getTime())
    d.setHours(d.getHours() + 1)
    const minutes = d.getMinutes()
    const rounded = Math.ceil(minutes / 5) * 5
    if (rounded === 60) {
      d.setHours(d.getHours() + 1)
      d.setMinutes(0, 0, 0)
    } else {
      d.setMinutes(rounded, 0, 0)
    }
    return d
  }
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [maxAttendees, setMaxAttendees] = useState('')
  const [eventDate, setEventDate] = useState(new Date())
  const initialStart = getRoundedToNextFiveMinutes()
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(getRoundedEndTimeFrom(initialStart))
  const [hasEndTime, setHasEndTime] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [privacy, setPrivacy] = useState<'public' | 'invite_only'>('public')
  const [invitedUsers, setInvitedUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleInviteUsers = () => {
    ;(navigation as any).navigate('EventInvite', {
      invitedUsers: invitedUsers,
      isEditMode: false,
      // Pass callback to update invited users when returning
      onInvitesUpdated: (newInvitedUsers: string[]) => {
        setInvitedUsers(newInvitedUsers)
      }
    })
  }

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      if (!result.canceled) {
        setImageUri(result.assets[0].uri)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const getTimeDisplayText = () => {
    if (!hasEndTime) {
      return formatTime(startTime)
    }
    
    const startTimeStr = startTime.toTimeString().split(' ')[0].substring(0, 5)
    const endTimeStr = endTime.toTimeString().split(' ')[0].substring(0, 5)
    
    return formatEventTimeDisplay(startTimeStr, endTimeStr)
  }

  const isCurrentlyMidnightSpanning = () => {
    if (!hasEndTime) return false
    
    const startTimeStr = startTime.toTimeString().split(' ')[0].substring(0, 5)
    const endTimeStr = endTime.toTimeString().split(' ')[0].substring(0, 5)
    
    return isMidnightSpanningEvent(startTimeStr, endTimeStr)
  }

  const toggleDatePicker = () => {
    setShowDatePicker(!showDatePicker)
  }

  const toggleStartTimePicker = () => {
    setShowStartTimePicker(!showStartTimePicker)
  }

  const toggleEndTimePicker = () => {
    setShowEndTimePicker(!showEndTimePicker)
  }

  const handleCreateEvent = async () => {
    if (!title.trim() || !location.trim()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    // Validate event times if end time is provided
    if (hasEndTime) {
      const startTimeStr = startTime.toTimeString().split(' ')[0].substring(0, 5)
      const endTimeStr = endTime.toTimeString().split(' ')[0].substring(0, 5)
      
      const validation = validateEventTimes(startTimeStr, endTimeStr)
      if (!validation.isValid) {
        Alert.alert('Invalid Times', validation.errorMessage || 'Please check your event times')
        return
      }
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create an event')
        return
      }

      let imageUrl = null
      if (imageUri) {
        try {
          const contentType = guessContentTypeFromUri(imageUri)
          const filePath = `events/${Date.now()}-${Math.random().toString(36).substring(7)}.${contentType.split('/')[1]}`
          
          await uploadBytesToBucket({
            bucket: 'event-images',
            filePath,
            uri: imageUri,
            contentType
          })
          
          const { data } = supabase.storage
            .from('event-images')
            .getPublicUrl(filePath)
          
          imageUrl = data.publicUrl
        } catch (error) {
          console.warn('Image upload failed:', error)
          // Continue without image if upload fails
        }
      }

      // Get user's college_id from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('college_id')
        .eq('id', user.id)
        .single()

      // Create event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          host_id: user.id,
          college_id: profileData?.college_id || null,
          title: title.trim(),
          description: description.trim() || null,
          event_date: eventDate.toISOString().split('T')[0],
          start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
          end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
          location: location.trim(),
          max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
          image_url: imageUrl,
          privacy: privacy,
          tags: selectedTags.length > 0 ? selectedTags : null,
        })
        .select()
        .single()

      if (eventError) throw eventError

      // Get host's profile for custom notification text
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const hostName = hostProfile?.full_name || 'Someone'

      // Handle notifications for both private and public events
      if (invitedUsers.length > 0) {
        // Filter out the host from invited users to prevent self-notifications
        const usersToNotify = invitedUsers.filter(userId => userId !== user.id)

        // For invite-only events, create invitation records
        if (privacy === 'invite_only') {
          const invitations = usersToNotify.map(userId => ({
            event_id: event.id,
            user_id: userId,
            invited_by: user.id
          }))

          const { error: inviteError } = await supabase
            .from('event_invitations')
            .insert(invitations)

          if (inviteError) {
            console.error('Error creating invitations:', inviteError)
            // Don't fail the entire event creation if invitations fail
          }
        }

        // Queue notifications for selected users (excluding the host)
        if (usersToNotify.length > 0) {
          const notificationType = 'event_invitation'
          const notificationTitle = privacy === 'invite_only' ? 'Event Invitation' : 'New Event'
          
          // Create custom notification text: "X invited you to Y event"
          const notificationBody = privacy === 'invite_only'
            ? `${hostName} invited you to "${event.title}"`
            : `${hostName} created a new event: "${event.title}"`

          // Batch insert all notifications into the queue
          const notificationData = usersToNotify.map(userId => ({
            user_id: userId,
            event_id: event.id,
            type: notificationType,
            title: notificationTitle,
            body: notificationBody,
            scheduled_for: new Date().toISOString(),
            data: {
              type: notificationType,
              eventId: event.id,
              hostId: user.id,
              hostName: hostName,
              privacy: privacy,
              eventTitle: event.title
            }
          }))

          const { error: notificationError } = await supabase
            .from('notification_queue')
            .insert(notificationData)

          if (notificationError) {
            console.error('Error queuing notifications:', notificationError)
            // Don't fail the entire event creation if notifications fail
          } else {
            if (__DEV__) {
              console.log(`Queued ${usersToNotify.length} notifications for event ${event.id}`)
            }
            
            // Trigger the Edge Function to process notifications
            // The Edge Function will be triggered automatically by the database trigger
            // after a 2-second debounce period to allow batch inserts
          }
        }
      }

      // Automatically add host as going to their own event
      const { error: hostAttendanceError } = await supabase
        .from('event_attendees')
        .insert({
          event_id: event.id,
          user_id: user.id,
          status: 'going'
        })

      if (hostAttendanceError) {
        console.warn('Failed to add host as going:', hostAttendanceError)
      } else {
        console.log('Host automatically added as going to event')
      }

      Alert.alert('Success', 'Event created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Reset form
            const roundedStart = getRoundedToNextFiveMinutes()
            const roundedEnd = getRoundedEndTimeFrom(roundedStart)
            setTitle('')
            setDescription('')
            setLocation('')
            setMaxAttendees('')
            setEventDate(new Date())
            setStartTime(roundedStart)
            setEndTime(roundedEnd)
            setHasEndTime(false)
            setImageUri(null)
            setSelectedTags([])
            setPrivacy('public')
            setInvitedUsers([])
            onEventCreated()
          }
        }
      ])
    } catch (error: any) {
      console.error('Error creating event:', error)
      Alert.alert('Error', 'Failed to create event. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Slim Sticky Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Create Event</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            {/* Event Title */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Event Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Enter event title"
                placeholderTextColor={theme.inputPlaceholder}
                value={title}
                onChangeText={setTitle}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Enter event description"
                placeholderTextColor={theme.inputPlaceholder}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Location */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Location *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Enter event location"
                placeholderTextColor={theme.inputPlaceholder}
                value={location}
                onChangeText={setLocation}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Event Image */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Event Image (Optional)</Text>
              <View style={[styles.imageContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {imageUri ? (
                  <View style={styles.imagePreviewContainer}>
                    <TouchableOpacity style={styles.imagePreviewTouchable} onPress={pickImage}>
                      <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                      <View style={styles.imageOverlay}>
                        <View style={styles.imageOverlayContent}>
                          <Ionicons name="camera" size={24} color="white" />
                          <Text style={styles.imageOverlayText}>Tap to change</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.deleteImageButton, { backgroundColor: theme.error }]}
                      onPress={() => setImageUri(null)}
                    >
                      <Ionicons name="trash" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="camera" size={32} color={theme.textSecondary} />
                      <Text style={[styles.imagePlaceholderText, { color: theme.textSecondary }]}>Tap to add image</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Privacy Settings */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Privacy</Text>
              <View style={styles.privacyButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.privacyButton,
                    { 
                      backgroundColor: privacy === 'public' ? theme.primary : theme.surface, 
                      borderColor: privacy === 'public' ? theme.primary : theme.border 
                    }
                  ]}
                  onPress={() => setPrivacy('public')}
                >
                  <Ionicons
                    name={privacy === 'public' ? 'globe' : 'globe-outline'}
                    size={20}
                    color={privacy === 'public' ? theme.buttonText : theme.textSecondary}
                  />
                  <Text style={[
                    styles.privacyButtonText,
                    { color: privacy === 'public' ? theme.buttonText : theme.text }
                  ]}>
                    Public
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.privacyButton,
                    { 
                      backgroundColor: privacy === 'invite_only' ? theme.primary : theme.surface, 
                      borderColor: privacy === 'invite_only' ? theme.primary : theme.border 
                    }
                  ]}
                  onPress={() => {
                    setPrivacy('invite_only')
                    setMaxAttendees('') // Clear max attendees when switching to invite-only
                  }}
                >
                  <Ionicons
                    name={privacy === 'invite_only' ? 'lock-closed' : 'lock-closed-outline'}
                    size={20}
                    color={privacy === 'invite_only' ? theme.buttonText : theme.textSecondary}
                  />
                  <Text style={[
                    styles.privacyButtonText,
                    { color: privacy === 'invite_only' ? theme.buttonText : theme.text }
                  ]}>
                    Private
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.privacyDescription, { color: theme.textSecondary }]}>
                {privacy === 'public' 
                  ? 'Anyone can see and join this event' 
                  : 'Only invited people can see and join this event'}
              </Text>
            </View>

            {/* Invitation Section - Only show when invite only is selected */}
            {privacy === 'invite_only' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Invitations</Text>
                <TouchableOpacity
                  style={[styles.inviteButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={handleInviteUsers}
                >
                  <Ionicons name="people" size={20} color={theme.primary} />
                  <Text style={[styles.inviteButtonText, { color: theme.text }]}>
                    {invitedUsers.length === 0 
                      ? 'Invite Friends' 
                      : `${invitedUsers.length} friend${invitedUsers.length === 1 ? '' : 's'} invited`}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
                {invitedUsers.length > 0 && (
                  <Text style={[styles.inviteDescription, { color: theme.textSecondary }]}>
                    Tap to manage invitations
                  </Text>
                )}
              </View>
            )}

            {/* Notify Friends Section - Only show when public is selected */}
            {privacy === 'public' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Notify Friends</Text>
                <TouchableOpacity
                  style={[styles.inviteButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={handleInviteUsers}
                >
                  <Ionicons name="notifications" size={20} color={theme.primary} />
                  <Text style={[styles.inviteButtonText, { color: theme.text }]}>
                    {invitedUsers.length === 0 
                      ? 'Notify Friends' 
                      : `${invitedUsers.length} friend${invitedUsers.length === 1 ? '' : 's'} to notify`}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
                {invitedUsers.length > 0 && (
                  <Text style={[styles.inviteDescription, { color: theme.textSecondary }]}>
                    Tap to manage notifications
                  </Text>
                )}
              </View>
            )}

            {/* Event Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Date</Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={toggleDatePicker}
              >
                <Ionicons name="calendar" size={20} color={theme.primary} />
                <Text style={[styles.dateTimeText, { color: theme.text }]}>{formatDate(eventDate)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios')
                    if (selectedDate) {
                      setEventDate(selectedDate)
                    }
                  }}
                  minimumDate={new Date()}
                  textColor={theme.text}
                  themeVariant={isDark ? 'dark' : 'light'}
                />
              )}
            </View>

            {/* Max Attendees - Only show for public events */}
            {privacy === 'public' && (
              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={[styles.label, { color: theme.text }]}>Max Attendees</Text>
                  <TextInput
                    style={[
                      styles.input, 
                      { 
                        backgroundColor: theme.inputBackground, 
                        borderColor: theme.inputBorder, 
                        color: theme.inputText 
                      }
                    ]}
                    placeholder="Optional"
                    placeholderTextColor={theme.inputPlaceholder}
                    value={maxAttendees}
                    onChangeText={setMaxAttendees}
                    keyboardType="numeric"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                </View>
              </View>
            )}

            {/* Start Time */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Start Time</Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={toggleStartTimePicker}
              >
                <Ionicons name="time" size={20} color={theme.primary} />
                <Text style={[styles.dateTimeText, { color: theme.text }]}>{formatTime(startTime)}</Text>
              </TouchableOpacity>
              {showStartTimePicker && (
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedTime) => {
                    setShowStartTimePicker(Platform.OS === 'ios')
                    if (selectedTime) {
                      setStartTime(selectedTime)
                    }
                  }}
                  textColor={theme.text}
                  themeVariant={isDark ? 'dark' : 'light'}
                  minuteInterval={5}
                />
              )}
            </View>

            {/* End Time */}
            <View style={[styles.inputGroup, styles.endTimeGroup]}>
              <View style={styles.endTimeHeader}>
                <Text style={[styles.label, { color: theme.text, flex: 1 }]}>End Time</Text>
                <Switch
                  value={hasEndTime}
                  onValueChange={setHasEndTime}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={hasEndTime ? theme.buttonText : theme.textSecondary}
                  ios_backgroundColor={theme.border}
                />
              </View>
              {hasEndTime && (
                <>
                  <TouchableOpacity
                    style={[styles.dateTimeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={toggleEndTimePicker}
                  >
                    <Ionicons name="time" size={20} color={theme.primary} />
                    <Text style={[styles.dateTimeText, { color: theme.text }]}>{formatTime(endTime)}</Text>
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <DateTimePicker
                      value={endTime}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedTime) => {
                        setShowEndTimePicker(Platform.OS === 'ios')
                        if (selectedTime) {
                          setEndTime(selectedTime)
                        }
                      }}
                      textColor={theme.text}
                      themeVariant={isDark ? 'dark' : 'light'}
                      minuteInterval={5}
                    />
                  )}
                  {/* Midnight spanning indicator */}
                  {isCurrentlyMidnightSpanning() && (
                    <View style={[styles.midnightIndicator, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
                      <Ionicons name="moon" size={16} color={theme.primary} />
                      <Text style={[styles.midnightText, { color: theme.primary }]}>
                        Event spans to next day
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Tags</Text>
              <Text style={[styles.tagsDescription, { color: theme.textSecondary }]}>Select relevant tags for your event</Text>
              <View style={styles.tagsContainer}>
                {PREDEFINED_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.tagButton,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                      selectedTags.includes(tag) && { backgroundColor: theme.primary, borderColor: theme.primary }
                    ]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[
                      styles.tagText,
                      { color: theme.textSecondary },
                      selectedTags.includes(tag) && { color: theme.buttonText }
                    ]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.createButton,
                { backgroundColor: theme.buttonPrimary },
                loading && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleCreateEvent}
              disabled={loading}
            >
              <Text style={[styles.createButtonText, { color: theme.buttonText }]}>
                {loading ? 'Creating...' : 'Create Event'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  endTimeGroup: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  tagsDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  privacyButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  privacyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  privacyButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  privacyDescription: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  inviteDescription: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  notifyDescription: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  createButton: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageButton: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewContainer: {
    position: 'relative',
    height: '100%',
    flexDirection: 'row',
  },
  imagePreviewTouchable: {
    flex: 1,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
  },
  imageOverlayContent: {
    alignItems: 'center',
  },
  imageOverlayText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  deleteImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 14,
    marginTop: 8,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  dateTimeText: {
    fontSize: 16,
    marginLeft: 12,
  },
  endTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  midnightIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  midnightText: {
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
  disabledHint: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
})