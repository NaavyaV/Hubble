import React, { useState, useEffect } from 'react'
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
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import notificationService from '../services/notifications'
import { getSelectedUsers, clearSelectedUsers } from './EventInviteScreen'

export default function HostScreen() {
  const navigation = useNavigation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [maxAttendees, setMaxAttendees] = useState('')
  const [eventDate, setEventDate] = useState(new Date())
  const [startTime, setStartTime] = useState(new Date())
  const [endTime, setEndTime] = useState(new Date())
  const [hasEndTime, setHasEndTime] = useState(false)
  const [privacy, setPrivacy] = useState<'public' | 'friends_only'>('public')
  const [invitedUsers, setInvitedUsers] = useState<string[]>([])
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)

  // Listen for selected users from EventInviteScreen
  useFocusEffect(
    React.useCallback(() => {
      // Check if we have selected users from the global variable
      const selectedUsers = getSelectedUsers()
      if (selectedUsers && selectedUsers.length >= 0) { // Changed to >= 0 to handle empty arrays
        console.log('Received selected users from global variable:', selectedUsers)
        setInvitedUsers(selectedUsers)
        // Clear the global variable to avoid re-processing
        clearSelectedUsers()
      }
    }, [])
  )

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

  const handleInviteUsers = () => {
    ;(navigation as any).navigate('EventInvite', {
      invitedUsers,
    })
  }

  const handleSubmit = async () => {
    if (!title.trim() || !location.trim()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    if (privacy === 'friends_only' && invitedUsers.length === 0) {
      Alert.alert('Error', 'Please invite at least one person for friends-only events')
      return
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

      // Create event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          host_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          event_date: eventDate.toISOString().split('T')[0],
          start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
          end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
          location: location.trim(),
          max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
          image_url: imageUrl,
          privacy: privacy,
        })
        .select()
        .single()

      if (eventError) throw eventError

      // Automatically add host as going to their own event
      const { error: hostAttendanceError } = await supabase
        .from('event_attendees')
        .insert({
          event_id: event.id,
          user_id: user.id,
          status: 'going'
        })

      if (hostAttendanceError) {
        console.warn('Failed to add host as going:' , hostAttendanceError)
      } else {
        console.log('Host automatically added as going to event')
      }
      // Create invitations for friends-only events
      if (privacy === 'friends_only' && invitedUsers.length > 0) {
        const invitations = invitedUsers.map(userId => ({
          event_id: event.id,
          user_id: userId
        }))

        const { error: inviteError } = await supabase
          .from('event_invitations')
          .insert(invitations)

        if (inviteError) {
          console.warn('Failed to create invitations:', inviteError)
        }
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
            setPrivacy('public')
            setInvitedUsers([])
            setImageUri(null)
            setInvitedUsers([])
            setImageUri(null)
            // Navigate to events tab
            ;(navigation as any).navigate('Main', { screen: 'Events' })
          }
        }
      ])
    } catch (error) {
      console.error('Error creating event:', error)
      Alert.alert('Error', 'Failed to create event. Please try again.')
    } finally {
      setLoading(false)
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

  const toggleDatePicker = () => {
    setShowDatePicker(!showDatePicker)
  }

  const toggleStartTimePicker = () => {
    setShowStartTimePicker(!showStartTimePicker)
  }

  const toggleEndTimePicker = () => {
    setShowEndTimePicker(!showEndTimePicker)
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Event</Text>
          </View>

          <View style={styles.form}>
            {/* Event Image */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Image (Optional)</Text>
              <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={32} color="#7f8c8d" />
                    <Text style={styles.imagePlaceholderText}>Tap to add image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Privacy Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Privacy</Text>
              <View style={styles.privacyContainer}>
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    privacy === 'public' && styles.privacyOptionSelected
                  ]}
                  onPress={() => setPrivacy('public')}
                >
                  <Ionicons
                    name={privacy === 'public' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'public' ? '#3498db' : '#7f8c8d'}
                  />
                  <Text style={[
                    styles.privacyText,
                    privacy === 'public' && styles.privacyTextSelected
                  ]}>
                    Public
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    privacy === 'friends_only' && styles.privacyOptionSelected
                  ]}
                  onPress={() => setPrivacy('friends_only')}
                >
                  <Ionicons
                    name={privacy === 'friends_only' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'friends_only' ? '#3498db' : '#7f8c8d'}
                  />
                  <Text style={[
                    styles.privacyText,
                    privacy === 'friends_only' && styles.privacyTextSelected
                  ]}>
                    Friends Only
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Invite People (only for friends only events) */}
            {privacy === 'friends_only' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invite People</Text>
                <TouchableOpacity style={styles.inviteButton} onPress={handleInviteUsers}>
                  <Ionicons name="people" size={20} color="#3498db" />
                  <Text style={styles.inviteButtonText}>
                    {invitedUsers.length > 0 
                      ? `${invitedUsers.length} people selected` 
                      : 'Select people to invite'
                    }
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
                </TouchableOpacity>
              </View>
            )}

            {/* Event Title */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Enter event title"
                placeholderTextColor="#7f8c8d"
              />
            </View>

            {/* Event Description */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your event..."
                placeholderTextColor="#7f8c8d"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Location */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location *</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="Where is the event?"
                placeholderTextColor="#7f8c8d"
              />
            </View>

            {/* Max Attendees */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Max Attendees (Optional)</Text>
              <TextInput
                style={styles.input}
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                placeholder="Leave empty for unlimited"
                placeholderTextColor="#7f8c8d"
                keyboardType="numeric"
              />
            </View>

            {/* Event Date */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date</Text>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={toggleDatePicker}
              >
                <Ionicons name="calendar" size={20} color="#3498db" />
                <Text style={styles.dateTimeText}>{formatDate(eventDate)}</Text>
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
                />
              )}
            </View>

            {/* Start Time */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Start Time</Text>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={toggleStartTimePicker}
              >
                <Ionicons name="time" size={20} color="#3498db" />
                <Text style={styles.dateTimeText}>{formatTime(startTime)}</Text>
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
                />
              )}
            </View>

            {/* End Time */}
            <View style={styles.section}>
              <View style={styles.endTimeHeader}>
                <Text style={styles.sectionTitle}>End Time</Text>
                <Switch
                  value={hasEndTime}
                  onValueChange={setHasEndTime}
                  trackColor={{ false: '#e1e8ed', true: '#3498db' }}
                  thumbColor={hasEndTime ? '#ffffff' : '#f4f3f4'}
                />
              </View>
              {hasEndTime && (
                <>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={toggleEndTimePicker}
                  >
                    <Ionicons name="time" size={20} color="#3498db" />
                    <Text style={styles.dateTimeText}>{formatTime(endTime)}</Text>
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
                    />
                  )}
                </>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Creating Event...' : 'Create Event'}
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
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
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
  form: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2c3e50',
  },
  textArea: {
    height: 100,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 12,
  },
  endTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imageButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    height: 120,
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
    color: '#7f8c8d',
    marginTop: 8,
  },
  privacyContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  privacyOptionSelected: {
    // Add any selected styling if needed
  },
  privacyText: {
    fontSize: 16,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  privacyTextSelected: {
    color: '#3498db',
    fontWeight: '600',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inviteButtonText: {
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 12,
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
})
