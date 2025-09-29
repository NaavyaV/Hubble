import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export interface NotificationData {
  type: 'event_reminder' | 'host_update' | 'friend_request' | 'event_edited_deleted' | 'event_invitation'
  eventId?: string
  userId?: string
  title: string
  body: string
  data?: any
}

class NotificationService {
  private static instance: NotificationService
  private notificationToken: string | null = null

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  async initialize(): Promise<string | null> {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permission denied')
        return null
      }

      // For Expo Go, we'll use local notifications only
      if (Device.isDevice) {
        // Try to get push token, but don't fail if it doesn't work in Expo Go
        try {
          const token = await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
          })
          this.notificationToken = token.data
          console.log('Push token:', this.notificationToken)
          
          // Save token to Supabase
          await this.saveTokenToDatabase(this.notificationToken)
        } catch (error) {
          console.log('Push notifications not available in Expo Go, using local notifications only')
          this.notificationToken = 'expo-go-local-only'
          
          // Save a placeholder token for Expo Go
          await this.saveTokenToDatabase(this.notificationToken)
        }
        
        return this.notificationToken
      } else {
        console.log('Must use physical device for notifications')
        return null
      }
    } catch (error) {
      console.error('Error initializing notifications:', error)
      return null
    }
  }

  private async saveTokenToDatabase(token: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // First, try to update existing token
      const { error: updateError } = await supabase
        .from('notification_tokens')
        .update({
          token,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('platform', Platform.OS)

      if (updateError) {
        // If update fails, try to insert new token
        const { error: insertError } = await supabase
          .from('notification_tokens')
          .insert({
            user_id: user.id,
            token,
            platform: Platform.OS,
            updated_at: new Date().toISOString()
          })

        if (insertError) {
          console.error('Error saving notification token:', insertError)
        } else {
          console.log('Notification token saved to database')
        }
      } else {
        console.log('Notification token updated in database')
      }
    } catch (error) {
      console.error('Error saving token to database:', error)
    }
  }

  // Schedule event reminder notification
  async scheduleEventReminder(eventId: string, eventTitle: string, eventDate: Date): Promise<void> {
    try {
      const reminderTime = new Date(eventDate.getTime() - 15 * 60 * 1000) // 15 minutes before
      const now = new Date()
      
      if (reminderTime <= now) {
        console.log('Event is too soon to schedule reminder')
        return
      }

      // Use setTimeout for now as a workaround for the trigger type issue
      const delay = reminderTime.getTime() - now.getTime()
      
      setTimeout(async () => {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Event Starting Soon!',
            body: `${eventTitle} starts in 15 minutes`,
            data: { eventId, type: 'event_reminder' }
          },
          trigger: null // Send immediately when timeout fires
        })
      }, delay)

      console.log(`Scheduled reminder for event ${eventId} at ${reminderTime}`)
    } catch (error) {
      console.error('Error scheduling event reminder:', error)
    }
  }

  // Send immediate notification
  async sendNotification(notification: NotificationData): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            type: notification.type,
            eventId: notification.eventId,
            userId: notification.userId,
            ...notification.data
          }
        },
        trigger: null // Send immediately
      })
    } catch (error) {
      console.error('Error sending notification:', error)
    }
  }

  // Cancel all notifications for an event
  async cancelEventNotifications(eventId: string): Promise<void> {
    try {
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync()
      
      for (const notification of scheduledNotifications) {
        if (notification.content.data?.eventId === eventId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier)
        }
      }
    } catch (error) {
      console.error('Error canceling event notifications:', error)
    }
  }

  // Get notification token
  getToken(): string | null {
    return this.notificationToken
  }

  // Send event edit/delete notification to all attendees except host
  async sendEventEditDeleteNotification(
    eventId: string, 
    eventTitle: string, 
    hostId: string, 
    action: 'edited' | 'deleted'
  ): Promise<void> {
    try {
      // Get all attendees for this event except the host
      const { data: attendees, error } = await supabase
        .from('event_attendees')
        .select(`
          user_id,
          profiles!inner(full_name)
        `)
        .eq('event_id', eventId)
        .neq('user_id', hostId)

      if (error) {
        console.error('Error fetching attendees:', error)
        return
      }

      if (!attendees || attendees.length === 0) {
        console.log('No attendees to notify for event edit/delete')
        return
      }

      // Send notification to each attendee
      for (const attendee of attendees) {
        const actionText = action === 'edited' ? 'edited' : 'deleted'
        const emoji = action === 'edited' ? '✏️' : '🗑️'
        
        await this.sendNotification({
          type: 'event_edited_deleted',
          eventId: eventId,
          userId: attendee.user_id,
          title: `${emoji} Event ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`,
          body: `"${eventTitle}" has been ${actionText} by the host`,
          data: {
            action: action,
            eventTitle: eventTitle
          }
        })
      }

      console.log(`Sent ${action} notifications to ${attendees.length} attendees for event ${eventId}`)
    } catch (error) {
      console.error(`Error sending event ${action} notifications:`, error)
    }
  }

  // Clear all notifications
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync()
      await Notifications.cancelAllScheduledNotificationsAsync()
    } catch (error) {
      console.error('Error clearing notifications:', error)
    }
  }
}

export default NotificationService.getInstance()
