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
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'

interface EditEventScreenProps {
  route: { params: { event: any } }
  navigation: any
}

export default function EditEventScreen({ route, navigation }: EditEventScreenProps) {
  const { event } = route.params
  const [title, setTitle] = useState(event.title || '')
  const [description, setDescription] = useState(event.description || '')
  const [location, setLocation] = useState(event.location || '')
  const [maxAttendees, setMaxAttendees] = useState(event.max_attendees ? String(event.max_attendees) : '')
  const [eventDate, setEventDate] = useState(new Date(event.event_date))
  const [startTime, setStartTime] = useState(new Date(`2000-01-01T${event.start_time}`))
  const [endTime, setEndTime] = useState(new Date(`2000-01-01T${event.end_time || event.start_time}`))
  const [hasEndTime, setHasEndTime] = useState(!!event.end_time)
  const [privacy, setPrivacy] = useState<'public' | 'friends_only'>(event.privacy || 'public')
  const [imageUri, setImageUri] = useState<string | null>(event.image_url || null)
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)
  const [invitedUsers, setInvitedUsers] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    fetchCurrentUser()
    fetchInvitedUsers()
  }, [])

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  const fetchInvitedUsers = async () => {
    try {
      const { data: invitations } = await supabase
        .from('event_invitations')
        .select('user_id')
        .eq('event_id', event.id)
      
      const userIds = invitations?.map(inv => inv.user_id) || []
      setInvitedUsers(userIds)
    } catch (error) {
      console.error('Error fetching invited users:', error)
    }
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

  const toggleDatePicker = () => {
    setShowDatePicker(!showDatePicker)
  }

  const toggleStartTimePicker = () => {
    setShowStartTimePicker(!showStartTimePicker)
  }

  const toggleEndTimePicker = () => {
    setShowEndTimePicker(!showEndTimePicker)
  }

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios')
    if (selectedDate) {
      setEventDate(selectedDate)
    }
  }

  const handleStartTimeChange = (event: any, selectedTime?: Date) => {
    setShowStartTimePicker(Platform.OS === 'ios')
    if (selectedTime) {
      setStartTime(selectedTime)
    }
  }

  const handleEndTimeChange = (event: any, selectedTime?: Date) => {
    setShowEndTimePicker(Platform.OS === 'ios')
    if (selectedTime) {
      setEndTime(selectedTime)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
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

  const handleInviteUsers = () => {
    navigation.navigate('EventInvite', {
      invitedUsers: invitedUsers,
      isEditMode: true,
      eventId: event.id,
    })
  }

  const handleUpdateEvent = async () => {
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
        Alert.alert('Error', 'You must be logged in')
        return
      }

      // Ensure user owns the event
      if (user.id !== event.host_id) {
        Alert.alert('Error', 'You can only edit events you host')
        return
      }

      // Upload image if needed
      let imageUrl = event.image_url
      if (imageUri && !imageUri.startsWith('http')) {
        try {
          const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg'
          const fileName = `event-${Date.now()}.${fileExt}`
          const filePath = `event-images/${fileName}`
          const contentType = guessContentTypeFromUri(imageUri)

          imageUrl = await uploadBytesToBucket({
            bucket: 'event-images',
            filePath,
            uri: imageUri,
            contentType,
          })
        } catch (error) {
          console.warn('Image upload failed:', error)
          Alert.alert('Warning', 'Image upload failed, but event will be updated without the new image')
        }
      }

      const { error } = await supabase
        .from('events')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim(),
          event_date: eventDate.toISOString().split('T')[0],
          start_time: startTime.toTimeString().slice(0, 5),
          end_time: hasEndTime ? endTime.toTimeString().slice(0, 5) : null,
          max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
          image_url: imageUrl,
          privacy: privacy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('host_id', user.id)

      if (error) throw error

      Alert.alert('Success', 'Event updated successfully!')
      navigation.goBack()
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const canChangeToPrivate = () => {
    return event.privacy === 'public'
  }

  const canChangeToPublic = () => {
    return event.privacy === 'friends_only'
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#2c3e50" />
            </TouchableOpacity>
            <Text style={styles.title}>Edit Event</Text>
            <View style={styles.placeholder} />
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
                    privacy === 'public' && styles.privacyOptionSelected,
                    !canChangeToPublic() && styles.privacyOptionDisabled
                  ]}
                  onPress={() => canChangeToPublic() && setPrivacy('public')}
                  disabled={!canChangeToPublic()}
                >
                  <Ionicons
                    name={privacy === 'public' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'public' ? '#3498db' : '#7f8c8d'}
                  />
                  <Text style={[
                    styles.privacyText,
                    privacy === 'public' && styles.privacyTextSelected,
                    !canChangeToPublic() && styles.privacyTextDisabled
                  ]}>
                    Public
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    privacy === 'friends_only' && styles.privacyOptionSelected,
                    !canChangeToPrivate() && styles.privacyOptionDisabled
                  ]}
                  onPress={() => canChangeToPrivate() && setPrivacy('friends_only')}
                  disabled={!canChangeToPrivate()}
                >
                  <Ionicons
                    name={privacy === 'friends_only' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'friends_only' ? '#3498db' : '#7f8c8d'}
                  />
                  <Text style={[
                    styles.privacyText,
                    privacy === 'friends_only' && styles.privacyTextSelected,
                    !canChangeToPrivate() && styles.privacyTextDisabled
                  ]}>
                    Friends Only
                  </Text>
                </TouchableOpacity>
              </View>
              {!canChangeToPublic() && (
                <Text style={styles.disabledNote}>
                  Cannot change from private to public after event creation
                </Text>
              )}
              {!canChangeToPrivate() && (
                <Text style={styles.disabledNote}>
                  Cannot change from public to private after event creation
                </Text>
              )}
            </View>

            {/* Invite People (only for friends only events) */}
            {privacy === 'friends_only' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invite People</Text>
                <TouchableOpacity style={styles.inviteButton} onPress={handleInviteUsers}>
                  <Ionicons name="people" size={20} color="#3498db" />
                  <Text style={styles.inviteButtonText}>
                    {invitedUsers.length > 0 
                      ? `${invitedUsers.length} people invited` 
                      : 'Select people to invite'
                    }
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
                </TouchableOpacity>
                <Text style={styles.inviteNote}>
                  You can add more people but cannot remove those already invited
                </Text>
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
                  onChange={handleDateChange}
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
                  onChange={handleStartTimeChange}
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
                      onChange={handleEndTimeChange}
                    />
                  )}
                </>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleUpdateEvent}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Updating Event...' : 'Update Event'}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  placeholder: {
    width: 32,
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
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  imageButton: {
    height: 160,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    color: '#7f8c8d',
    marginTop: 8,
    fontSize: 14,
  },
  privacyContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    overflow: 'hidden',
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  privacyOptionSelected: {
    backgroundColor: '#e3f2fd',
  },
  privacyOptionDisabled: {
    opacity: 0.6,
  },
  privacyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginLeft: 12,
  },
  privacyTextSelected: {
    color: '#3498db',
  },
  privacyTextDisabled: {
    color: '#7f8c8d',
  },
  disabledNote: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 8,
    fontStyle: 'italic',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    marginBottom: 8,
  },
  inviteButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 12,
  },
  inviteNote: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#2c3e50',
    marginLeft: 8,
  },
  endTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
