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
  Modal,
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
import { buildEventInvitationNotification, buildBatchNotifications, buildOrgEventCreatedNotification, buildEventEditDeleteNotification } from '../utils/notificationTemplates'
import EventInviteScreen from './EventInviteScreen'
import { validateContentWithAlert } from '../utils/contentFilter'
import {
  MAX_EVENT_TITLE_LENGTH,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_LOCATION_LENGTH,
} from '../constants/validation'

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
  const [privacy, setPrivacy] = useState<'public' | 'invite_only'>(isOrgEvent ? 'public' : 'public')
  const [invitedUsers, setInvitedUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
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
      setMaxAttendees(existingEvent.max_attendees ? existingEvent.max_attendees.toString() : '')
      setEventDate(new Date(existingEvent.event_date))
      
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
      
      setSelectedTags(existingEvent.tags || [])
      setPrivacy(existingEvent.privacy || 'public')
      
      // Set image if exists
      if (existingEvent.image_url) {
        setImageUri(existingEvent.image_url)
      }
      
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

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
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
      const { data: { user } } = await supabase.auth.getUser()
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !eventId) {
        Alert.alert('Error', 'You must be logged in to edit an event')
        return
      }

      let imageUrl = existingEvent.image_url || null
      
      // Upload new image if changed
      if (imageUri && imageUri !== existingEvent.image_url && !imageUri.startsWith('http')) {
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
            event_date: eventDate.toISOString().split('T')[0],
            start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
            image_url: imageUrl,
            tags: selectedTags.length > 0 ? selectedTags : null,
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
            event_date: eventDate.toISOString().split('T')[0],
            start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
            image_url: imageUrl,
            tags: selectedTags.length > 0 ? selectedTags : null,
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

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create an event')
        setLoading(false)
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
            event_date: eventDate.toISOString().split('T')[0],
            start_time: startTime.toTimeString().split(' ')[0].substring(0, 5),
            end_time: hasEndTime ? endTime.toTimeString().split(' ')[0].substring(0, 5) : null,
            location: location.trim(),
            max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
            image_url: imageUrl,
            privacy: 'public',
            tags: selectedTags.length > 0 ? selectedTags : null,
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
        event = personalEvent
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
      // Calculate event date/time for reminder scheduling
      const eventDateTime = new Date(event.event_date)
      const [hours, minutes] = event.start_time.split(':').map(Number)
      eventDateTime.setHours(hours, minutes, 0, 0)
      
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
            setMaxAttendees('')
            setEventDate(new Date())
            setStartTime(roundedStart)
            setEndTime(roundedEnd)
            setHasEndTime(false)
            setImageUri(null)
            setSelectedTags([])
            setPrivacy('public')
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Slim Sticky Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {isEditMode ? 'Edit Event' : 'Create Event'}
        </Text>
        <TouchableOpacity
          onPress={onBack}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
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

            {/* Privacy Settings - Hidden for org events and edit mode */}
            {!isOrgEvent && !isEditMode && (
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
            )}

            {/* Privacy Display (Read-only) - Show in edit mode */}
            {!isOrgEvent && isEditMode && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Privacy</Text>
                <View style={[styles.privacyDisplay, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons
                    name={privacy === 'public' ? 'globe' : 'lock-closed'}
                    size={20}
                    color={theme.primary}
                  />
                  <Text style={[styles.privacyDisplayText, { color: theme.text }]}>
                    {privacy === 'public' ? 'Public' : 'Private (Invite Only)'}
                  </Text>
                </View>
                <Text style={[styles.privacyDescription, { color: theme.textSecondary }]}>
                  Privacy cannot be changed when editing an event
                </Text>
              </View>
            )}

            {/* Invitation Section - Only show when invite only is selected and not org event */}
            {!isOrgEvent && privacy === 'invite_only' && (
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

            {/* Notify Friends Section - Only show when public is selected and not org event */}
            {!isOrgEvent && privacy === 'public' && (
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
    position: 'relative',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    padding: 4,
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
  privacyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
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