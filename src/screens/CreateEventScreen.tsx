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

interface CreateEventScreenProps {
  onBack: () => void
  onEventCreated: () => void
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

export default function CreateEventScreen({ onBack, onEventCreated }: CreateEventScreenProps) {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [maxAttendees, setMaxAttendees] = useState('')
  const [eventDate, setEventDate] = useState(new Date())
  const [startTime, setStartTime] = useState(new Date())
  const [endTime, setEndTime] = useState(new Date())
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
    navigation.navigate('EventInvite', {
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

      // If it's an invite-only event, create invitations for selected users
      if (privacy === 'invite_only' && invitedUsers.length > 0) {
        const invitations = invitedUsers.map(userId => ({
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
        } else {
          // Send push notifications to invited users (excluding the host)
          for (const userId of invitedUsers) {
            // Skip notification if the user is the host
            if (userId === user.id) {
              continue
            }
            
            try {
              await NotificationService.sendNotification({
                type: 'event_invitation',
                eventId: event.id,
                userId: userId,
                title: 'Event Invitation',
                body: `You've been invited to "${event.title}" by ${profileData?.full_name || 'a friend'}`,
                data: {
                  eventId: event.id,
                  hostId: user.id
                }
              })
            } catch (error) {
              console.error('Error sending invitation notification:', error)
            }
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
            setTitle('')
            setDescription('')
            setLocation('')
            setMaxAttendees('')
            setEventDate(new Date())
            setStartTime(new Date())
            setEndTime(new Date())
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
            {/* Event Image */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Event Image (Optional)</Text>
              <TouchableOpacity style={[styles.imageButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={32} color={theme.textSecondary} />
                    <Text style={[styles.imagePlaceholderText, { color: theme.textSecondary }]}>Tap to add image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Privacy Settings */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Privacy</Text>
              <View style={[styles.privacyContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    { backgroundColor: theme.surface, borderBottomColor: theme.border },
                    privacy === 'public' && { backgroundColor: theme.primaryLight }
                  ]}
                  onPress={() => setPrivacy('public')}
                >
                  <Ionicons
                    name={privacy === 'public' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'public' ? theme.primary : theme.textSecondary}
                  />
                  <Text style={[
                    styles.privacyText,
                    { color: theme.text },
                    privacy === 'public' && { color: theme.primaryDark }
                  ]}>
                    Public
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    { backgroundColor: theme.surface },
                    privacy === 'invite_only' && { backgroundColor: theme.primaryLight }
                  ]}
                  onPress={() => {
                    setPrivacy('invite_only')
                    setMaxAttendees('') // Clear max attendees when switching to invite-only
                  }}
                >
                  <Ionicons
                    name={privacy === 'invite_only' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'invite_only' ? theme.primary : theme.textSecondary}
                  />
                  <Text style={[
                    styles.privacyText,
                    { color: theme.text },
                    privacy === 'invite_only' && { color: theme.primaryDark }
                  ]}>
                    Invite Only
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
                  themeVariant={theme.mode === 'dark' ? 'dark' : 'light'}
                />
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.label, { color: theme.text }]}>Max Attendees</Text>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      backgroundColor: privacy === 'invite_only' ? `${theme.inputBackground}80` : theme.inputBackground, 
                      borderColor: privacy === 'invite_only' ? `${theme.inputBorder}80` : theme.inputBorder, 
                      color: privacy === 'invite_only' ? `${theme.inputText}80` : theme.inputText 
                    }
                  ]}
                  placeholder={privacy === 'invite_only' ? "Not needed for invite-only" : "Optional"}
                  placeholderTextColor={privacy === 'invite_only' ? `${theme.inputPlaceholder}80` : theme.inputPlaceholder}
                  value={privacy === 'invite_only' ? '' : maxAttendees}
                  onChangeText={(text) => {
                    if (privacy !== 'invite_only') {
                      setMaxAttendees(text)
                    }
                  }}
                  keyboardType="numeric"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={privacy !== 'invite_only'}
                />
                {privacy === 'invite_only' && (
                  <Text style={[styles.disabledHint, { color: theme.textSecondary }]}>
                    Max attendees not needed - only invited people can attend
                  </Text>
                )}
              </View>
            </View>

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
                  themeVariant={theme.mode === 'dark' ? 'dark' : 'light'}
                />
              )}
            </View>

            {/* End Time */}
            <View style={styles.inputGroup}>
              <View style={styles.endTimeHeader}>
                <Text style={[styles.label, { color: theme.text }]}>End Time</Text>
                <Switch
                  value={hasEndTime}
                  onValueChange={setHasEndTime}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={hasEndTime ? theme.buttonText : theme.textSecondary}
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
                      themeVariant={theme.mode === 'dark' ? 'dark' : 'light'}
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
                {predefinedTags.map((tag) => (
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
  privacyContainer: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  privacyText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
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
  imageButton: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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