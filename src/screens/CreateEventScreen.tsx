import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import RNModal from 'react-native-modal'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { useTheme } from '../context/ThemeContext'
import { ImageWithFallback } from '../components'
import { uploadVersionedAsset } from '../utils/imageAsset'
import { validateEventTimes, isMidnightSpanningEvent, formatEventTimeDisplay, getEventStartDate, parseLocalDate } from '../utils/eventTimeUtils'
import NotificationService from '../services/notifications'
import { buildEventInvitationNotification, buildBatchNotifications, buildOrgEventCreatedNotification, buildEventEditDeleteNotification } from '../utils/notificationTemplates'
import EventInviteScreen from './EventInviteScreen'
import { validateContentWithAlert } from '../utils/contentFilter'
import {
  MAX_EVENT_TITLE_LENGTH,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_LOCATION_LENGTH,
} from '../constants/validation'
import {
  type InviteThemeKey,
  getInviteThemeGradient,
  nextInviteThemeKey,
  normalizeInviteThemeKey,
} from '../utils/inviteEventTheme'

interface CreateEventScreenProps {
  onBack: () => void
  onEventCreated: (event?: any) => void
  isOrgEvent?: boolean
  orgId?: string
  // Edit mode props
  eventId?: string
  existingEvent?: any
  isEditMode?: boolean
}


export default function CreateEventScreen({ onBack, onEventCreated, isOrgEvent = false, orgId, eventId, existingEvent, isEditMode = false }: CreateEventScreenProps) {
  const { theme, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const fadeOpacity = useRef(new Animated.Value(0)).current
  const scheduleDismissToExitRef = useRef(false)
  const eventDateBeforePickerRef = useRef<Date | null>(null)

  const closeWithFade = useCallback(() => {
    Animated.timing(fadeOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onBack()
    })
  }, [fadeOpacity, onBack])

  useEffect(() => {
    Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: 165,
      useNativeDriver: true,
    }).start()
  }, [fadeOpacity])
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
  const [maxGuestCount, setMaxGuestCount] = useState(0)
  const [eventDate, setEventDate] = useState(new Date())
  const initialStart = getRoundedToNextFiveMinutes()
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(getRoundedEndTimeFrom(initialStart))
  const [hasEndTime, setHasEndTime] = useState(false)
  const [scheduleStep, setScheduleStep] = useState<'choose' | 'form'>(isEditMode ? 'form' : 'choose')
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(true)
  const [timingMode, setTimingMode] = useState<'now' | 'later' | null>(isEditMode ? 'later' : null)
  const [durationHours, setDurationHours] = useState(1)
  const [nowUseEndTime, setNowUseEndTime] = useState(false)
  const [privacy, setPrivacy] = useState<'public' | 'invite_only'>(isOrgEvent ? 'public' : 'public')
  const [invitedUsers, setInvitedUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [inviteThemeKey, setInviteThemeKey] = useState<InviteThemeKey>('default')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Load existing event data when in edit mode
  useEffect(() => {
    if (isEditMode && existingEvent) {
      setTitle(existingEvent.title || '')
      setDescription(existingEvent.description || '')
      setLocation(existingEvent.location || '')
      setMaxGuestCount(
        existingEvent.max_attendees != null && existingEvent.max_attendees > 0
          ? Number(existingEvent.max_attendees)
          : 0
      )
      setEventDate(parseLocalDate(existingEvent.event_date))
      
      // Parse start time
      const [startHours, startMinutes] = existingEvent.start_time.split(':').map(Number)
      const startDate = new Date()
      startDate.setHours(startHours, startMinutes, 0, 0)
      setStartTime(startDate)
      
      // Parse end time if exists
      if (existingEvent.end_time) {
        const [endHours, endMinutes] = existingEvent.end_time.split(':').map(Number)
        const endDate = new Date()
        endDate.setHours(endHours, endMinutes, 0, 0)
        setEndTime(endDate)
        setHasEndTime(true)
      } else {
        setHasEndTime(false)
      }
      
      setPrivacy(existingEvent.privacy || 'public')
      
      // Set image if exists
      if (existingEvent.image_url) {
        setImageUri(existingEvent.image_url)
      }
      setInviteThemeKey(normalizeInviteThemeKey(existingEvent.invite_theme_color))
      
      // Load existing invited users for private events
      if (existingEvent.privacy === 'invite_only' && !isOrgEvent) {
        loadExistingInvitedUsers()
      }
    }
  }, [isEditMode, existingEvent])

  const loadExistingInvitedUsers = async () => {
    if (!eventId) return
    
    try {
      const { data: invitations } = await supabase
        .from('event_invitations')
        .select('user_id')
        .eq('event_id', eventId)
      
      if (invitations) {
        setInvitedUsers(invitations.map(inv => inv.user_id))
      }
    } catch (error) {
      console.error('Error loading existing invited users:', error)
    }
  }

  const adjustDuration = (delta: number) => {
    setDurationHours((h) => {
      const next = Math.round((h + delta) * 2) / 2
      return Math.max(0.5, next)
    })
  }

  const handleScheduleNow = () => {
    const n = new Date()
    setTimingMode('now')
    setScheduleStep('form')
    setEventDate(n)
    setStartTime(new Date(n.getTime()))
    setNowUseEndTime(false)
    setDurationHours(1)
    setHasEndTime(false)
  }

  const handleScheduleLater = () => {
    setTimingMode('later')
    setScheduleStep('form')
  }

  const handleInviteUsers = () => {
    setShowInviteModal(true)
  }

  const handleInvitesUpdated = (newInvitedUsers: string[]) => {
        setInvitedUsers(newInvitedUsers)
    setShowInviteModal(false)
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
        allowsEditing: false,
        // JPEG quality only (no native image-manipulator — works in Expo Go and all dev clients)
        quality: 0.72,
      })

      if (!result.canceled) {
        setImageUri(result.assets[0].uri)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  // Helper function to format date as YYYY-MM-DD using local timezone (not UTC)
  const formatDateForDatabase = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

  const toggleStartTimePicker = () => {
    setShowStartTimePicker(!showStartTimePicker)
  }

  const toggleEndTimePicker = () => {
    setShowEndTimePicker(!showEndTimePicker)
  }

  const handleSaveEvent = async () => {
    if (!title.trim() || !location.trim()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    // Security: Validate input lengths
    if (title.trim().length > MAX_EVENT_TITLE_LENGTH) {
      Alert.alert('Error', `Event title must be ${MAX_EVENT_TITLE_LENGTH} characters or less`)
      return
    }
    if (description.trim().length > MAX_EVENT_DESCRIPTION_LENGTH) {
      Alert.alert('Error', `Event description must be ${MAX_EVENT_DESCRIPTION_LENGTH} characters or less`)
      return
    }
    if (location.trim().length > MAX_LOCATION_LENGTH) {
      Alert.alert('Error', `Location must be ${MAX_LOCATION_LENGTH} characters or less`)
      return
    }

    // Validate content for objectionable language
    if (!validateContentWithAlert(title.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }
    if (description.trim() && !validateContentWithAlert(description.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }

    const isNowCreate = !isEditMode && timingMode === 'now'
    if (isNowCreate) {
      if (nowUseEndTime) {
        const now = new Date()
        const endCandidate = new Date(now)
        endCandidate.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0)
        if (endCandidate.getTime() <= now.getTime()) {
          Alert.alert('Invalid end time', 'End time must be after now.')
          return
        }
        const startTimeStr = now.toTimeString().split(' ')[0].substring(0, 5)
        const endTimeStr = endCandidate.toTimeString().split(' ')[0].substring(0, 5)
        const validation = validateEventTimes(startTimeStr, endTimeStr)
        if (!validation.isValid) {
          Alert.alert('Invalid Times', validation.errorMessage || 'Please check your event times')
          return
        }
      } else if (durationHours < 0.5) {
        Alert.alert('Duration', 'Duration must be at least 30 minutes.')
        return
      }
    } else if (hasEndTime) {
      const startTimeStr = startTime.toTimeString().split(' ')[0].substring(0, 5)
      const endTimeStr = endTime.toTimeString().split(' ')[0].substring(0, 5)

      const validation = validateEventTimes(startTimeStr, endTimeStr)
      if (!validation.isValid) {
        Alert.alert('Invalid Times', validation.errorMessage || 'Please check your event times')
        return
      }
    }

    // If editing, show confirmation about attendees
    if (isEditMode && eventId) {
      await handleEditEvent()
      return
    }

    // Otherwise, create new event
    await handleCreateEvent()
  }

  const handleEditEvent = async () => {
    if (!eventId) return

    try {
      const user = await getCachedUser()
      if (!user) {
        Alert.alert('Error', 'You must be logged in to edit an event')
        return
      }

      // Check if this is an org event
      const isOrgEvent = (existingEvent as any).isOrgEvent || (!existingEvent.host_id && (existingEvent as any).org_id)
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'

      // Get all users currently marked as "going"
      // For personal events, exclude the host; for org events, get all going attendees
      let goingAttendeesQuery = supabase
        .from(attendeesTable)
        .select('user_id')
        .eq('event_id', eventId)
        .eq('status', 'going')
      
      if (!isOrgEvent) {
        // Exclude host for personal events
        goingAttendeesQuery = goingAttendeesQuery.neq('user_id', user.id)
      }
      
      const { data: goingAttendees } = await goingAttendeesQuery

      const goingUserIds = (goingAttendees || []).map(a => a.user_id)
      const goingCount = goingUserIds.length

      if (goingCount > 0) {
        // Show confirmation alert
        const actionText = existingEvent.privacy === 'invite_only' 
          ? 'moved to invited' 
          : 'removed from going'
        Alert.alert(
          'Edit Event',
          `All people currently going will be ${actionText} and will be notified that the event was edited. Do you want to continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Update Event',
              style: 'default',
              onPress: async () => {
                await performEditEvent(goingUserIds, isOrgEvent)
              }
            }
          ]
        )
      } else {
        // No one is going, proceed with edit
        await performEditEvent([], isOrgEvent)
      }
    } catch (error) {
      console.error('Error preparing edit:', error)
      Alert.alert('Error', 'Failed to prepare event edit')
    }
  }

  const performEditEvent = async (goingUserIds: string[], isOrgEvent: boolean) => {
    setLoading(true)
    try {
      const user = await getCachedUser()
      if (!user || !eventId) {
        Alert.alert('Error', 'You must be logged in to edit an event')
        return
      }

      let imageUrl = existingEvent.image_url || null
      let coverPath = existingEvent.cover_path || null
      let coverVersion = existingEvent.cover_version || null
      
      // Upload new image if changed
      if (imageUri && imageUri !== existingEvent.image_url && !imageUri.startsWith('http')) {
        try {
          const uploaded = await uploadVersionedAsset({
            uri: imageUri,
            bucket: 'event-images',
            entityType: 'event-covers',
            entityId: eventId,
            currentVersion: existingEvent.cover_version || 0,
            purpose: 'cover',
          })
          imageUrl = uploaded.publicUrl
          coverPath = uploaded.path
          coverVersion = uploaded.version
        } catch (error) {
          console.warn('Image upload failed:', error)
          // Continue with existing image if upload fails
        }
      }

      // Get user's college_id from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('college_id')
        .eq('id', user.id)
        .single()

      // Update event
      if (isOrgEvent) {
        const { error: updateError } = await supabase
          .from('org_events')
          .update({
            college_id: profileData?.college_id || null,
            title: title.trim(),
            description: description.trim() || null,
            event_date: formatDateForDatabase(eventDate),
            start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxGuestCount > 0 ? maxGuestCount : null,
            image_url: imageUrl,
            cover_path: coverPath,
            cover_version: coverVersion ?? undefined,
            invite_theme_color: inviteThemeKey === 'default' ? null : inviteThemeKey,
            tags: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId)

        if (updateError) throw updateError
      } else {
        const { error: updateError } = await supabase
          .from('events')
          .update({
            college_id: profileData?.college_id || null,
            title: title.trim(),
            description: description.trim() || null,
            event_date: formatDateForDatabase(eventDate),
            start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxGuestCount > 0 ? maxGuestCount : null,
            image_url: imageUrl,
            cover_path: coverPath,
            cover_version: coverVersion ?? undefined,
            invite_theme_color: inviteThemeKey === 'default' ? null : inviteThemeKey,
            tags: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId)

        if (updateError) throw updateError
      }

      // Handle attendees based on privacy
      const attendeesTable = isOrgEvent ? 'org_event_attendees' : 'event_attendees'
      
      if (goingUserIds.length > 0) {
        // Send notifications to affected users BEFORE deleting/moving attendees
        // Use buildBatchNotifications directly since we already have the user IDs
        const notificationData = buildBatchNotifications(
          goingUserIds,
          buildEventEditDeleteNotification,
          {
            eventId: isOrgEvent ? null : eventId,
            eventTitle: title.trim(),
            action: 'edited',
            additionalData: {
              isOrgEvent: isOrgEvent,
              ...(isOrgEvent ? { orgEventId: eventId } : {})
            }
          }
        )

        const { error: notificationError } = await supabase
          .from('notification_queue')
          .insert(notificationData)

        if (notificationError) {
          console.error('Error queuing edit notifications:', notificationError)
          // Don't fail the edit if notifications fail
        }

        if (existingEvent.privacy === 'invite_only') {
          // For private events: move going people to invited
          // Remove from attendees
          await supabase
            .from(attendeesTable)
            .delete()
            .eq('event_id', eventId)
            .in('user_id', goingUserIds)
            .eq('status', 'going')

          // Add to invitations (only for personal events)
          if (!isOrgEvent) {
            const invitations = goingUserIds.map(userId => ({
              event_id: eventId,
              user_id: userId,
              invited_by: user.id
            }))

            // Use upsert to avoid duplicates
            await supabase
              .from('event_invitations')
              .upsert(invitations, { onConflict: 'event_id,user_id' })
          }
        } else {
          // For public events: remove from going list
          await supabase
            .from(attendeesTable)
            .delete()
            .eq('event_id', eventId)
            .in('user_id', goingUserIds)
            .eq('status', 'going')
        }
      }

      Alert.alert('Success', 'Event updated successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Fetch updated event and pass to callback
            fetchUpdatedEvent()
          }
        }
      ])
    } catch (error: any) {
      console.error('Error editing event:', error)
      Alert.alert('Error', 'Failed to update event. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchUpdatedEvent = async () => {
    if (!eventId) return

    try {
      const isOrgEvent = (existingEvent as any).isOrgEvent || (!existingEvent.host_id && (existingEvent as any).org_id)
      
      if (isOrgEvent) {
        const { data: updatedEvent } = await supabase
          .from('org_events')
          .select(`
            *,
            attendees:org_event_attendees(
              id,
              user_id,
              status
            )
          `)
          .eq('id', eventId)
          .single()
        
        if (updatedEvent) {
          onEventCreated({ ...updatedEvent, isOrgEvent: true })
        }
      } else {
        const { data: updatedEvent } = await supabase
          .from('events')
          .select(`
            *,
            attendees:event_attendees(
              id,
              user_id,
              status
            )
          `)
          .eq('id', eventId)
          .single()
        
        if (updatedEvent) {
          onEventCreated(updatedEvent)
        }
      }
    } catch (error) {
      console.error('Error fetching updated event:', error)
      onEventCreated()
    }
  }

  const handleCreateEvent = async () => {
    setLoading(true)
    try {
      // Security: Validate input lengths
      if (title.trim().length > MAX_EVENT_TITLE_LENGTH) {
        Alert.alert('Error', `Event title must be ${MAX_EVENT_TITLE_LENGTH} characters or less`)
        setLoading(false)
        return
      }
      if (description.trim().length > MAX_EVENT_DESCRIPTION_LENGTH) {
        Alert.alert('Error', `Event description must be ${MAX_EVENT_DESCRIPTION_LENGTH} characters or less`)
        setLoading(false)
        return
      }
      if (location.trim().length > MAX_LOCATION_LENGTH) {
        Alert.alert('Error', `Location must be ${MAX_LOCATION_LENGTH} characters or less`)
        setLoading(false)
        return
      }

      const user = await getCachedUser()
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create an event')
        setLoading(false)
        return
      }

      let imageUrl = null

      // Get user's college_id from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('college_id')
        .eq('id', user.id)
        .single()

      let insertEventDate = eventDate
      let insertStartTime = startTime
      let insertEndTime: Date | null = null
      let insertHasEnd = false

      if (!isEditMode && timingMode === 'now') {
        const now = new Date()
        insertEventDate = now
        insertStartTime = new Date(now.getTime())
        if (nowUseEndTime) {
          const end = new Date(now)
          end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0)
          if (end.getTime() <= insertStartTime.getTime()) {
            Alert.alert('Invalid end time', 'End time must be after now.')
            setLoading(false)
            return
          }
          insertEndTime = end
          insertHasEnd = true
        } else {
          insertEndTime = new Date(insertStartTime.getTime() + durationHours * 60 * 60 * 1000)
          insertHasEnd = true
        }
      } else {
        insertHasEnd = hasEndTime
        if (hasEndTime) insertEndTime = endTime
      }

      // Create event - use org_events table for org events, events table for personal events
      let event
      if (isOrgEvent && orgId) {
        // Create org event
        const { data: orgEvent, error: orgEventError } = await supabase
          .from('org_events')
          .insert({
            org_id: orgId,
            college_id: profileData?.college_id || null,
            title: title.trim(),
            description: description.trim() || null,
            event_date: formatDateForDatabase(insertEventDate),
            start_time: insertStartTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: insertHasEnd && insertEndTime ? insertEndTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxGuestCount > 0 ? maxGuestCount : null,
            image_url: imageUrl,
            invite_theme_color: inviteThemeKey === 'default' ? null : inviteThemeKey,
            privacy: 'public',
            tags: null,
          })
          .select()
          .single()

        if (orgEventError) throw orgEventError
        event = orgEvent
      } else {
        // Create personal event
        const { data: personalEvent, error: eventError } = await supabase
          .from('events')
          .insert({
            host_id: user.id,
            college_id: profileData?.college_id || null,
            title: title.trim(),
            description: description.trim() || null,
            event_date: formatDateForDatabase(insertEventDate),
            start_time: insertStartTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: insertHasEnd && insertEndTime ? insertEndTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxGuestCount > 0 ? maxGuestCount : null,
            image_url: imageUrl,
            invite_theme_color: inviteThemeKey === 'default' ? null : inviteThemeKey,
            privacy: privacy,
            tags: null,
          })
          .select()
          .single()

        if (eventError) throw eventError
        event = personalEvent
      }

      // Upload event cover after insert to preserve deterministic eventId-based pathing.
      if (imageUri && event?.id) {
        try {
          const uploaded = await uploadVersionedAsset({
            uri: imageUri,
            bucket: 'event-images',
            entityType: 'event-covers',
            entityId: event.id,
            currentVersion: 0,
            purpose: 'cover',
          })
          imageUrl = uploaded.publicUrl
          await supabase
            .from(isOrgEvent ? 'org_events' : 'events')
            .update({
              image_url: uploaded.publicUrl,
              cover_path: uploaded.path,
              cover_version: uploaded.version,
              updated_at: new Date().toISOString(),
            })
            .eq('id', event.id)
          event = {
            ...event,
            image_url: uploaded.publicUrl,
            cover_path: uploaded.path,
            cover_version: uploaded.version,
          }
        } catch (error) {
          console.warn('Image upload failed:', error)
        }
      }

      // Get host's profile for custom notification text (only for personal events)
      let hostName = 'Someone'
      if (!isOrgEvent) {
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        hostName = hostProfile?.full_name || 'Someone'
      } else {
        // For org events, get org name
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single()

        hostName = orgData?.name || 'Organization'
      }

      // Handle notifications for both private and public events
      // IMPORTANT: Only send ONE notification per user using the notification template
      if (invitedUsers.length > 0) {
        // Filter out the host from invited users to prevent self-notifications
        const usersToNotify = invitedUsers.filter(userId => userId !== user.id)

        // Create invitation records for BOTH public and private events (only for personal events)
        // This ensures event_invitations table is the single source of truth for all invitations
        // NOTE: This does NOT send notifications - notifications are sent separately below
        if (!isOrgEvent) {
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
          } else {
            if (__DEV__) {
              console.log(`Created ${invitations.length} invitation records for event ${event.id}`)
            }
          }
        }

        // Queue notifications for selected users (excluding the host)
        // This is the ONLY place where invitation notifications are sent
        if (usersToNotify.length > 0) {
          // Filter out muted users
          const { data: mutedData } = await supabase
            .from('user_mutes')
            .select('muter_id')
            .eq('muted_id', user.id)
            .in('muter_id', usersToNotify)
          
          const mutedUserIds = new Set((mutedData || []).map(m => m.muter_id))
          const filteredUsers = usersToNotify.filter(id => !mutedUserIds.has(id))
          
          if (filteredUsers.length > 0) {
            // Use centralized notification builder - this is the single source of notification data
            const notificationData = buildBatchNotifications(
              filteredUsers,
              buildEventInvitationNotification,
              {
                eventId: event.id,
                hostName: hostName,
                eventTitle: event.title,
                privacy: privacy,
                additionalData: {
                  hostId: user.id
                }
              }
            )

            const { error: notificationError } = await supabase
              .from('notification_queue')
              .insert(notificationData)

            if (notificationError) {
              console.error('Error queuing notifications:', notificationError)
              // Don't fail the entire event creation if notifications fail
            } else {
              if (__DEV__) {
                console.log(`Queued ${filteredUsers.length} notifications for event ${event.id}`)
              }
            }
            
            // The Edge Function will be triggered automatically by the database trigger
            // after a 2-second debounce period to allow batch inserts
          }
        }
      }

      // For org events, notify all followers who have notifications enabled
      if (isOrgEvent && orgId) {
        try {
          // Get all followers with notifications enabled
          const { data: followers, error: followersError } = await supabase
            .from('org_followers')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('notification_enabled', true)

          if (followersError) {
            console.error('Error fetching org followers:', followersError)
          } else if (followers && followers.length > 0) {
            // Get users who have blocked this org
            const { data: blockedUsers } = await supabase
              .from('org_blocks')
              .select('user_id')
              .eq('org_id', orgId)

            const blockedUserIds = new Set((blockedUsers || []).map(b => b.user_id))
            
            // Get users who have muted the org owner (host)
            // For org events, we need to get the org owner to check mutes
            const { data: orgData } = await supabase
              .from('organizations')
              .select('owner_id')
              .eq('id', orgId)
              .single()
            
            let mutedUserIds = new Set<string>()
            if (orgData?.owner_id) {
              const { data: mutedData } = await supabase
                .from('user_mutes')
                .select('muter_id')
                .eq('muted_id', orgData.owner_id)
                .in('muter_id', followers.map(f => f.user_id))
              
              mutedUserIds = new Set((mutedData || []).map(m => m.muter_id))
            }
            
            // Filter out blocked users and muted users
            const usersToNotify = followers
              .map(f => f.user_id)
              .filter(userId => !blockedUserIds.has(userId) && !mutedUserIds.has(userId))

            if (usersToNotify.length > 0) {
              // Use centralized notification builder
              // For org events, set eventId to null to avoid foreign key constraint violation
              // (since org events are in org_events table, not events table)
              const notificationData = buildBatchNotifications(
                usersToNotify,
                buildOrgEventCreatedNotification,
                {
                  eventId: null, // Set to null for org events
                  hostName: hostName,
                  eventTitle: event.title,
                  additionalData: {
                    orgId: orgId,
                    orgEventId: event.id, // Store org event ID in data instead
                    ownerId: orgData?.owner_id, // Include owner ID for mute checking
                    owner_id: orgData?.owner_id // Also include with underscore for compatibility
                  }
                }
              )

              const { error: notificationError } = await supabase
                .from('notification_queue')
                .insert(notificationData)

              if (notificationError) {
                console.error('Error queuing org event notifications:', notificationError)
              } else {
                if (__DEV__) {
                  console.log(`Queued ${usersToNotify.length} notifications for org event ${event.id}`)
                }
              }
            }
          }
        } catch (error) {
          console.error('Error notifying org followers:', error)
          // Don't fail event creation if notification fails
        }
      }

      // Automatically add host as going to their own event (but NOT for org events)
      // Org events don't have hosts, so skip this
      if (!isOrgEvent) {
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
      }

      // Schedule event reminder for all going attendees (including host)
      // Calculate event date/time for reminder scheduling using local timezone
      const eventDateTime = getEventStartDate(event.event_date, event.start_time)
      
      // Small delay to ensure host is in the database before querying attendees
      setTimeout(async () => {
        await NotificationService.scheduleEventReminder(event.id, event.title, eventDateTime)
      }, 500)

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
            setMaxGuestCount(0)
            setEventDate(new Date())
            setStartTime(roundedStart)
            setEndTime(roundedEnd)
            setHasEndTime(false)
            setImageUri(null)
            setPrivacy('public')
            setScheduleStep('choose')
            setScheduleSheetOpen(true)
            setTimingMode(null)
            setDurationHours(1)
            setNowUseEndTime(false)
            setInvitedUsers([])
            // Pass the created event to the callback so it can be added immediately
            onEventCreated(event)
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

  const showForm = isEditMode || scheduleStep === 'form'
  const isNowFlow = !isEditMode && timingMode === 'now'

  const appleTitle = [
    styles.appleField,
    styles.appleTitle,
    { backgroundColor: theme.surface, color: theme.text },
  ]
  const appleBody = [
    styles.appleField,
    styles.appleBody,
    { backgroundColor: theme.surface, color: theme.text },
  ]
  const appleLine = [styles.appleField, { backgroundColor: theme.surface, color: theme.text }]

  const rootBg =
    isEditMode || scheduleStep === 'form' ? theme.background : 'transparent'
  const formInviteBackdrop =
    showForm && inviteThemeKey !== 'default'
      ? getInviteThemeGradient(inviteThemeKey, isDark)
      : null

  return (
    <Animated.View style={[styles.animatedRoot, { opacity: fadeOpacity }]}>
      {formInviteBackdrop ? (
        <LinearGradient
          colors={formInviteBackdrop}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.formBackdropFill}
        />
      ) : null}
      <SafeAreaView
        style={[
          styles.container,
          {
            backgroundColor:
              showForm && formInviteBackdrop ? 'transparent' : rootBg,
          },
        ]}
        edges={['bottom', 'left', 'right']}
      >
      {showForm ? (
        <TouchableOpacity
          onPress={closeWithFade}
          style={[
            styles.floatingClose,
            {
              top: insets.top + 4,
              backgroundColor: theme.surface,
              shadowColor: theme.shadow,
            },
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={theme.text} />
        </TouchableOpacity>
      ) : null}

      <RNModal
        isVisible={!isEditMode && scheduleStep === 'choose' && scheduleSheetOpen}
        onBackdropPress={() => {
          scheduleDismissToExitRef.current = true
          setScheduleSheetOpen(false)
        }}
        onModalHide={() => {
          if (scheduleDismissToExitRef.current) {
            scheduleDismissToExitRef.current = false
            onBack()
          }
        }}
        style={styles.scheduleRNModal}
        backdropColor="#000"
        animationIn="slideInUp"
        animationOut="fadeOut"
        animationInTiming={280}
        animationOutTiming={220}
        backdropTransitionInTiming={220}
        backdropTransitionOutTiming={220}
        useNativeDriver
        useNativeDriverForBackdrop={false}
        propagateSwipe={false}
        avoidKeyboard={false}
        hideModalContentWhileAnimating={false}
        coverScreen
        backdropOpacity={0.38}
      >
        <View style={[styles.scheduleSheetWrap, { backgroundColor: theme.card, paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          <TouchableOpacity
            style={styles.scheduleSheetClose}
            onPress={() => {
              scheduleDismissToExitRef.current = true
              setScheduleSheetOpen(false)
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.scheduleQuestion, { color: theme.text }]}>When is this?</Text>
          <View style={styles.scheduleCirclesRow}>
            <Pressable style={styles.scheduleOption} onPress={handleScheduleLater}>
              <View
                style={[
                  styles.scheduleCircle,
                  { backgroundColor: isDark ? theme.surface : theme.background },
                ]}
              >
                <Ionicons name="calendar-outline" size={32} color={theme.primary} />
              </View>
              <Text style={[styles.scheduleLabel, { color: theme.textSecondary }]}>Later</Text>
            </Pressable>
            <Pressable style={styles.scheduleOption} onPress={handleScheduleNow}>
              <View
                style={[
                  styles.scheduleCircle,
                  { backgroundColor: isDark ? theme.surface : theme.background },
                ]}
              >
                <Ionicons name="flash" size={32} color={theme.primary} />
              </View>
              <Text style={[styles.scheduleLabel, { color: theme.textSecondary }]}>Now</Text>
            </Pressable>
          </View>
        </View>
      </RNModal>

      {showForm ? (
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollInner,
            { paddingTop: insets.top + 36 },
          ]}
        >
          <View style={styles.form}>
            {/* Cover: hero first; compact color + photo row (~50% width, Apple Invites–style) */}
            <View style={styles.inputGroup}>
              {imageUri ? (
                <View style={styles.coverHeroWrap}>
                  <ImageWithFallback source={{ uri: imageUri }} style={styles.coverHeroImage} resizeMode="cover" />
                  <LinearGradient
                    colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.5)']}
                    style={styles.coverHeroScrim}
                  />
                  <TouchableOpacity
                    style={styles.coverRemoveInside}
                    onPress={() => setImageUri(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={[styles.coverRemoveInsideText, { marginLeft: 6 }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.coverCompactRow}>
                <Pressable
                  style={[
                    styles.colorChipOuter,
                    {
                      borderColor: !isDark ? 'rgba(255,255,255,0.88)' : theme.surface,
                    },
                  ]}
                  onPress={() => setInviteThemeKey((k) => nextInviteThemeKey(k))}
                  accessibilityLabel="Cycle invite background color"
                >
                  <LinearGradient
                    colors={getInviteThemeGradient(inviteThemeKey, isDark)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.colorChipGradientInner}
                  />
                </Pressable>
                <TouchableOpacity
                  style={[styles.choosePhotoCapsule, { backgroundColor: theme.surface }]}
                  onPress={pickImage}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.choosePhotoCapsuleText, { color: theme.text }]} numberOfLines={1}>
                    {imageUri ? 'Change photo' : 'Choose photo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Title</Text>
              <TextInput
                style={appleTitle}
                placeholder="What's the event?"
                placeholderTextColor={theme.inputPlaceholder}
                value={title}
                onChangeText={setTitle}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Notes</Text>
              <TextInput
                style={appleBody}
                placeholder="Add details (optional)"
                placeholderTextColor={theme.inputPlaceholder}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Where</Text>
              <TextInput
                style={appleLine}
                placeholder="Place or address"
                placeholderTextColor={theme.inputPlaceholder}
                value={location}
                onChangeText={setLocation}
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {!isOrgEvent && !isEditMode && (
            <View style={styles.inputGroup}>
              <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Privacy</Text>
              <View style={styles.privacyButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.privacyButton,
                    {
                      backgroundColor: privacy === 'public' ? theme.primary : theme.surface,
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
                    }
                  ]}
                  onPress={() => {
                    setPrivacy('invite_only')
                    setMaxGuestCount(0)
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
            </View>
            )}

            {!isOrgEvent && isEditMode && (
              <View style={styles.inputGroup}>
                <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Privacy</Text>
                <View style={[styles.privacyDisplay, { backgroundColor: theme.surface }]}>
                  <Ionicons
                    name={privacy === 'public' ? 'globe' : 'lock-closed'}
                    size={20}
                    color={theme.primary}
                  />
                  <Text style={[styles.privacyDisplayText, { color: theme.text }]}>
                    {privacy === 'public' ? 'Public' : 'Private (Invite Only)'}
                  </Text>
                </View>
              </View>
            )}

            {!isOrgEvent && privacy === 'invite_only' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Invitations</Text>
                <TouchableOpacity
                  style={[styles.inviteButton, { backgroundColor: theme.surface }]}
                  onPress={handleInviteUsers}
                >
                  <Ionicons name="people" size={20} color={theme.primary} />
                  <Text style={[styles.inviteButtonText, { color: theme.text }]}>
                    {invitedUsers.length === 0
                      ? 'Invite friends'
                      : `${invitedUsers.length} friend${invitedUsers.length === 1 ? '' : 's'} invited`}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {!isOrgEvent && privacy === 'public' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Notify friends</Text>
                <TouchableOpacity
                  style={[styles.inviteButton, { backgroundColor: theme.surface }]}
                  onPress={handleInviteUsers}
                >
                  <Ionicons name="notifications" size={20} color={theme.primary} />
                  <Text style={[styles.inviteButtonText, { color: theme.text }]}>
                    {invitedUsers.length === 0
                      ? 'Choose who to notify'
                      : `${invitedUsers.length} friend${invitedUsers.length === 1 ? '' : 's'} to notify`}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {!isNowFlow ? (
            <View style={styles.inputGroup}>
              <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Date</Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, { backgroundColor: theme.surface }]}
                onPress={() => {
                  eventDateBeforePickerRef.current = new Date(eventDate.getTime())
                  setShowDatePicker(true)
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar" size={20} color={theme.primary} />
                <Text style={[styles.dateTimeText, { color: theme.text }]}>{formatDate(eventDate)}</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' ? (
                <Modal
                  visible={showDatePicker}
                  transparent
                  animationType="fade"
                  onRequestClose={() => {
                    const snap = eventDateBeforePickerRef.current
                    if (snap) setEventDate(new Date(snap.getTime()))
                    setShowDatePicker(false)
                  }}
                >
                  <View style={styles.dateModalRoot}>
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() => {
                        const snap = eventDateBeforePickerRef.current
                        if (snap) setEventDate(new Date(snap.getTime()))
                        setShowDatePicker(false)
                      }}
                    />
                    <View
                      style={[
                        styles.dateModalSheet,
                        {
                          backgroundColor: theme.card,
                          zIndex: 2,
                          elevation: 10,
                          paddingBottom: Math.max(insets.bottom, 12),
                        },
                      ]}
                    >
                      <View style={styles.dateModalToolbar}>
                        <TouchableOpacity
                          style={[styles.dateModalCircleBtn, { backgroundColor: theme.surface }]}
                          onPress={() => {
                            const snap = eventDateBeforePickerRef.current
                            if (snap) setEventDate(new Date(snap.getTime()))
                            setShowDatePicker(false)
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={20} color={theme.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dateModalDoneSmall, { backgroundColor: theme.primary }]}
                          onPress={() => setShowDatePicker(false)}
                        >
                          <Text style={[styles.dateModalDoneSmallText, { color: theme.buttonText }]}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={eventDate}
                        mode="date"
                        display="inline"
                        onChange={(_, selectedDate) => {
                          if (selectedDate) setEventDate(selectedDate)
                        }}
                        minimumDate={new Date()}
                        themeVariant={isDark ? 'dark' : 'light'}
                        style={styles.datePickerInlineIOS}
                      />
                    </View>
                  </View>
                </Modal>
              ) : showDatePicker ? (
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false)
                    if (event.type === 'dismissed') return
                    if (selectedDate) setEventDate(selectedDate)
                  }}
                  minimumDate={new Date()}
                />
              ) : null}
            </View>
            ) : null}

            {privacy === 'public' && (
            <View style={styles.inputGroup}>
              <View style={[styles.maxGuestsRow, { backgroundColor: theme.surface }]}>
                <Text style={[styles.maxGuestsLabelSide, { color: theme.textSecondary }]}>Max guests</Text>
                <View style={styles.maxGuestsFieldSlot}>
                  <TextInput
                    style={[
                      styles.maxGuestsField,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    placeholder="optional"
                    placeholderTextColor={theme.inputPlaceholder}
                    value={maxGuestCount === 0 ? '' : String(maxGuestCount)}
                    onChangeText={(t) => {
                      const d = t.replace(/[^0-9]/g, '')
                      if (d === '') {
                        setMaxGuestCount(0)
                        return
                      }
                      const n = parseInt(d, 10)
                      if (!Number.isNaN(n)) setMaxGuestCount(Math.min(99999, n))
                    }}
                    keyboardType="number-pad"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.maxGuestsCounter}>
                  <TouchableOpacity
                    style={[styles.maxGuestsCounterBtn, { marginLeft: 0 }]}
                    onPress={() => setMaxGuestCount((n) => Math.max(0, n - 1))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="remove"
                      size={22}
                      color={maxGuestCount === 0 ? theme.border : theme.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.maxGuestsCounterBtn}
                    onPress={() => setMaxGuestCount((n) => n + 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add" size={22} color={theme.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            )}

            {isNowFlow ? (
              <>
                <View style={[styles.inputGroup, nowUseEndTime && styles.dimmedBlock]}>
                  <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Duration</Text>
                  <View style={[styles.durationRow, { backgroundColor: theme.surface }]}>
                    <TouchableOpacity
                      onPress={() => adjustDuration(-0.5)}
                      style={styles.durationBtn}
                      disabled={nowUseEndTime}
                    >
                      <Ionicons name="remove" size={24} color={nowUseEndTime ? theme.border : theme.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.durationValue, { color: theme.text }]}>
                      {durationHours % 1 === 0 ? durationHours.toFixed(0) : durationHours.toFixed(1)} h
                    </Text>
                    <TouchableOpacity
                      onPress={() => adjustDuration(0.5)}
                      style={styles.durationBtn}
                      disabled={nowUseEndTime}
                    >
                      <Ionicons name="add" size={24} color={nowUseEndTime ? theme.border : theme.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.endTimeHeader}>
                    <Text style={[styles.labelMinimal, { color: theme.textSecondary, flex: 1 }]}>End time instead</Text>
                    <Switch
                      value={nowUseEndTime}
                      onValueChange={(v) => {
                        setNowUseEndTime(v)
                        if (v) {
                          const n = new Date()
                          const def = new Date(n.getTime() + 60 * 60 * 1000)
                          setEndTime(def)
                        }
                      }}
                      trackColor={{ false: theme.border, true: theme.primary }}
                      thumbColor={nowUseEndTime ? theme.buttonText : theme.textSecondary}
                      ios_backgroundColor={theme.border}
                    />
                  </View>
                </View>

                {nowUseEndTime ? (
                  <View style={[styles.inputGroup, styles.nowEndPickWrap]}>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, { backgroundColor: theme.surface }]}
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
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {/* Start Time */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.labelMinimal, { color: theme.textSecondary }]}>Start time</Text>
                  <TouchableOpacity
                    style={[styles.dateTimeButton, { backgroundColor: theme.surface }]}
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

                <View style={[styles.inputGroup, styles.endTimeGroup]}>
                  <View style={styles.endTimeHeader}>
                    <Text style={[styles.labelMinimal, { color: theme.textSecondary, flex: 1 }]}>End time</Text>
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
                        style={[styles.dateTimeButton, { backgroundColor: theme.surface }]}
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
              </>
            )}

            <TouchableOpacity
              style={[
                styles.createButton,
                { backgroundColor: theme.buttonPrimary },
                loading && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleSaveEvent}
              disabled={loading}
            >
              <Text style={[styles.createButtonText, { color: theme.buttonText }]}>
                {loading 
                  ? (isEditMode ? 'Updating...' : 'Creating...') 
                  : (isEditMode ? 'Update Event' : 'Create Event')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      ) : null}

      {/* Event Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <EventInviteScreen
          invitedUsers={invitedUsers}
          isEditMode={false}
          onInvitesUpdated={handleInvitesUpdated}
          onClose={() => setShowInviteModal(false)}
        />
      </Modal>
    </SafeAreaView>
    </Animated.View>
  )
}


const styles = StyleSheet.create({
  animatedRoot: {
    flex: 1,
    position: 'relative',
  },
  formBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  container: {
    flex: 1,
    zIndex: 1,
  },
  floatingClose: {
    position: 'absolute',
    right: 14,
    zIndex: 40,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
  },
  form: {
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 28,
  },
  inputGroup: {
    marginBottom: 20,
  },
  endTimeGroup: {
    marginBottom: 12,
  },
  nowEndPickWrap: {
    marginTop: -4,
    marginBottom: 16,
  },
  maxGuestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  maxGuestsLabelSide: {
    flexShrink: 0,
    marginRight: 10,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  maxGuestsFieldSlot: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    alignItems: 'center',
  },
  maxGuestsField: {
    width: '75%',
    maxWidth: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 0,
    textAlign: 'center',
  },
  maxGuestsCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  maxGuestsCounterBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginLeft: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  labelMinimal: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  appleField: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    borderWidth: 0,
  },
  appleTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  appleBody: {
    minHeight: 130,
    paddingTop: 12,
    paddingBottom: 14,
    fontSize: 17,
    lineHeight: 24,
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
  scheduleRNModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  scheduleSheetWrap: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 28,
  },
  scheduleSheetClose: {
    position: 'absolute',
    right: 14,
    top: 10,
    zIndex: 2,
    padding: 6,
  },
  scheduleQuestion: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 22,
    letterSpacing: -0.3,
    marginTop: 8,
  },
  scheduleCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  scheduleOption: {
    alignItems: 'center',
    minWidth: 120,
  },
  scheduleCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  coverCompactRow: {
    width: '50%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  colorChipOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3.5,
    overflow: 'hidden',
  },
  colorChipGradientInner: {
    flex: 1,
    borderRadius: 16,
  },
  choosePhotoCapsule: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choosePhotoCapsuleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  coverRemoveInside: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  coverRemoveInsideText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  coverHeroWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: '#111',
  },
  coverHeroImage: {
    width: '100%',
    height: '100%',
  },
  coverHeroScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  inviteColorPreview: {
    width: '100%',
    height: 112,
    borderRadius: 14,
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  durationBtn: {
    padding: 14,
  },
  durationValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  dimmedBlock: {
    opacity: 0.38,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  privacyButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  privacyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 0,
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
  privacyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 0,
    marginTop: 4,
  },
  privacyDisplayText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 0,
    marginTop: 4,
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
    borderRadius: 24,
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
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 0,
  },
  dateTimeText: {
    fontSize: 16,
    marginLeft: 12,
  },
  dateModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dateModalSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 4,
  },
  dateModalToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dateModalCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateModalDoneSmall: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dateModalDoneSmallText: {
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerInlineIOS: {
    width: '100%',
    height: 360,
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
    borderRadius: 8,
    borderWidth: 0,
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