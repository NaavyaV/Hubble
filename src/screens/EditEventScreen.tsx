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
import { useTheme } from '../context/ThemeContext'
import notificationService from '../services/notifications'

interface EditEventScreenProps {
  route: { params: { event: any } }
  navigation: any
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

export default function EditEventScreen({ route, navigation }: EditEventScreenProps) {
  const { theme, isDark } = useTheme()
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
  const [selectedTags, setSelectedTags] = useState<string[]>(event.tags || [])
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

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
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
          tags: selectedTags.length > 0 ? selectedTags : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('host_id', user.id)

      if (error) throw error

      // Send notifications to all attendees except host
      await notificationService.sendEventEditDeleteNotification(
        event.id,
        title.trim(),
        user.id,
        'edited'
      )

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

  const canSavePrivacyChange = () => {
    // Allow saving if privacy hasn't changed
    if (privacy === event.privacy) return true
    
    // Allow saving if changing from public to friends_only (can always make private)
    if (event.privacy === 'public' && privacy === 'friends_only') return true
    
    // Allow saving if changing from friends_only to public (can always make public)
    if (event.privacy === 'friends_only' && privacy === 'public') return true
    
    return false
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Edit Event</Text>
        <View style={styles.placeholder} />
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

          <View style={styles.form}>
            {/* Event Image */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Event Image (Optional)</Text>
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
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Event Privacy</Text>
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
                    privacy === 'friends_only' && { backgroundColor: theme.primaryLight }
                  ]}
                  onPress={() => setPrivacy('friends_only')}
                >
                  <Ionicons
                    name={privacy === 'friends_only' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={privacy === 'friends_only' ? theme.primary : theme.textSecondary}
                  />
                  <Text style={[
                    styles.privacyText,
                    { color: theme.text },
                    privacy === 'friends_only' && { color: theme.primaryDark }
                  ]}>
                    Friends Only
                  </Text>
                </TouchableOpacity>
              </View>
              {!canSavePrivacyChange() && privacy !== event.privacy && (
                <Text style={[styles.disabledNote, { color: theme.error }]}>
                  Privacy changes are not allowed for this event
                </Text>
              )}
            </View>

            {/* Invite People (only for friends only events) */}
            {privacy === 'friends_only' && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Invite People</Text>
                <TouchableOpacity style={[styles.inviteButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={handleInviteUsers}>
                  <Ionicons name="people" size={20} color={theme.primary} />
                  <Text style={[styles.inviteButtonText, { color: theme.text }]}>
                    {invitedUsers.length > 0 
                      ? `${invitedUsers.length} people invited` 
                      : 'Select people to invite'
                    }
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <Text style={[styles.inviteNote, { color: theme.textSecondary }]}>
                  You can add more people but cannot remove those already invited
                </Text>
              </View>
            )}

            {/* Event Title */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Event Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Enter event title"
                placeholderTextColor={theme.inputPlaceholder}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Event Description */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your event..."
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Location */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Location *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Where is the event?"
                placeholderTextColor={theme.inputPlaceholder}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Max Attendees */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Max Attendees (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={theme.inputPlaceholder}
                keyboardType="numeric"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Tags */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Tags</Text>
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

            {/* Event Date */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Date</Text>
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
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                  textColor={theme.text}
                  themeVariant={isDark ? 'dark' : 'light'}
                />
              )}
            </View>

            {/* Start Time */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Start Time</Text>
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
                  onChange={handleStartTimeChange}
                  textColor={theme.text}
                  themeVariant={isDark ? 'dark' : 'light'}
                />
              )}
            </View>

            {/* End Time */}
            <View style={styles.section}>
              <View style={styles.endTimeHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>End Time</Text>
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
                      onChange={handleEndTimeChange}
                      textColor={theme.text}
                      themeVariant={isDark ? 'dark' : 'light'}
                    />
                  )}
                </>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: theme.buttonPrimary },
                (loading || !canSavePrivacyChange()) && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleUpdateEvent}
              disabled={loading || !canSavePrivacyChange()}
            >
              <Text style={[styles.submitButtonText, { color: theme.buttonText }]}>
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
    borderBottomWidth: 1,
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
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
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
  imageButton: {
    height: 160,
    borderRadius: 8,
    borderWidth: 1,
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
    marginTop: 8,
    fontSize: 14,
  },
  privacyContainer: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  privacyOptionSelected: {
    // Colors applied inline with theme
  },
  privacyOptionDisabled: {
    // Colors applied inline with theme
  },
  privacyText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  privacyTextSelected: {
    // Colors applied inline with theme
  },
  privacyTextDisabled: {
    // Colors applied inline with theme
  },
  disabledNote: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  inviteButtonText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  inviteNote: {
    fontSize: 12,
    fontStyle: 'italic',
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
  tagButtonSelected: {
    // Colors applied inline with theme
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagTextSelected: {
    // Colors applied inline with theme
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
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
  },
  endTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})