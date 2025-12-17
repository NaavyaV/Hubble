import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import {
  buildEventReminderNotification,
  buildEventEditDeleteNotification,
  buildBatchNotifications
} from '../utils/notificationTemplates'

// Helper function to trigger the Edge Function to process notifications
export async function triggerProcessNotifications(): Promise<void> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      if (__DEV__) {
        console.log('No Supabase URL configured, skipping Edge Function trigger')
      }
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/process-notifications`
    
    if (__DEV__) {
      console.log('Triggering Edge Function to process notifications:', edgeFunctionUrl)
    }
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (response.ok) {
      const result = await response.json()
      if (__DEV__) {
        console.log('Edge Function triggered successfully:', result)
      }
    } else {
      const errorText = await response.text()
      if (__DEV__) {
        console.log('Edge Function trigger failed:', errorText)
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error triggering Edge Function:', error)
    }
    // Don't throw - notification is still queued and will be processed eventually
  }
}

// Process background notifications silently
async function processBackgroundNotification(data: any) {
  try {
    // Use safe logging to avoid nativejs logger issues
    if (__DEV__) {
      console.log('Processing background notification:', data)
    }
    
    // If there are queued notifications, process them
    if (data.type === 'process_queue') {
      await processQueuedNotifications()
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error processing background notification:', error)
    }
  }
}

// Process queued notifications from database
async function processQueuedNotifications() {
  try {
    const { data: notifications, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('processed', false)
      .lte('scheduled_for', new Date().toISOString())
      .limit(10)

    if (error) {
      if (__DEV__) {
        console.error('Error fetching notifications:', error)
      }
      return
    }

    if (!notifications || notifications.length === 0) {
      return
    }

    if (__DEV__) {
      console.log(`Processing ${notifications.length} notifications`)
    }

    // Process each notification
    for (const notification of notifications) {
      try {
        // Send the notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notification.title,
            body: notification.body,
            data: {
              type: notification.type,
              eventId: notification.event_id,
              userId: notification.user_id,
              ...notification.data
            }
          },
          trigger: null // Send immediately
        })

        // Mark as processed
        await supabase
          .from('notification_queue')
          .update({ processed: true })
          .eq('id', notification.id)

        if (__DEV__) {
          console.log(`Sent notification ${notification.id} to user ${notification.user_id}`)
        }
      } catch (error) {
        if (__DEV__) {
          console.error(`Error processing notification ${notification.id}:`, error)
        }
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error in processQueuedNotifications:', error)
    }
  }
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Handle silent push notifications (content-available: 1)
    if (notification.request.content.data?.contentAvailable === 1) {
      // Process background notification without showing alert
      await processBackgroundNotification(notification.request.content.data)
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      }
    }
    
    // Handle regular notifications
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }
  },
})

export interface NotificationData {
  type: 'event_reminder' | 'host_update' | 'friend_request' | 'event_edited_deleted' | 'event_invitation' | 'event_deleted' | 'going_status_updates'
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
      // Add a small delay to ensure all modules are loaded
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Request permissions with better error handling
      let finalStatus = 'undetermined'
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync()
        finalStatus = existingStatus

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync()
          finalStatus = status
        }
      } catch (permissionError) {
        if (__DEV__) {
          console.log('Error getting notification permissions:', permissionError)
        }
        return null
      }

      if (finalStatus !== 'granted') {
        if (__DEV__) {
          console.log('Notification permission denied')
        }
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
          if (__DEV__) {
            console.log('Push token obtained:', this.notificationToken)
          }
          
          // Save token to Supabase
          await this.saveTokenToDatabase(this.notificationToken)
        } catch (error) {
          if (__DEV__) {
            console.log('Push notifications not available in Expo Go, using local notifications only')
          }
          this.notificationToken = 'expo-go-local-only'
          
          // Save a placeholder token for Expo Go
          await this.saveTokenToDatabase(this.notificationToken)
        }
        
        return this.notificationToken
      } else {
        if (__DEV__) {
          console.log('Must use physical device for notifications')
        }
        return null
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error initializing notifications:', error)
      }
      return null
    }
  }

  private async saveTokenToDatabase(token: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (__DEV__) {
          console.log('No user found, cannot save notification token')
        }
        return
      }

      if (__DEV__) {
        console.log(`Saving notification token for user ${user.id}: ${token.substring(0, 20)}...`)
      }

      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from('notification_tokens')
        .upsert({
          user_id: user.id,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform'
        })

      if (error) {
        if (__DEV__) {
          console.error('Error saving notification token:', error)
        }
        throw error
      } else {
        if (__DEV__) {
          console.log('Notification token saved/updated in database successfully')
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error saving token to database:', error)
      }
      throw error
    }
  }

  // Schedule event reminder notification for all going attendees
  async scheduleEventReminder(eventId: string, eventTitle: string, eventDate: Date): Promise<void> {
    try {
      const reminderTime = new Date(eventDate.getTime() - 15 * 60 * 1000) // 15 minutes before
      const now = new Date()
      
      if (reminderTime <= now) {
        if (__DEV__) {
          console.log('Event is too soon to schedule reminder')
        }
        return
      }

      // Get all attendees with 'going' status
      const { data: attendees } = await supabase
        .from('event_attendees')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('status', 'going')

      if (!attendees || attendees.length === 0) {
        if (__DEV__) {
          console.log('No going attendees to schedule reminders for')
        }
        return
      }

      // Batch insert all reminder notifications using centralized builder
      const notificationData = buildBatchNotifications(
        attendees.map(a => a.user_id),
        buildEventReminderNotification,
        {
          eventId: eventId,
          eventTitle: eventTitle,
          scheduledFor: reminderTime
        }
      )

      const { error: insertError } = await supabase
        .from('notification_queue')
        .insert(notificationData)

      if (insertError) {
        throw insertError
      }

      if (__DEV__) {
        console.log(`Scheduled reminders for event ${eventId} at ${reminderTime}`)
      }

      // Note: Edge Function will be triggered automatically by the database trigger
      // after a 2-second debounce period to allow batch inserts
    } catch (error) {
      if (__DEV__) {
        console.error('Error scheduling event reminder:', error)
      }
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
    action: 'edited' | 'deleted',
    isOrgEvent: boolean = false
  ): Promise<void> {
    try {
      let attendeesQuery
      if (isOrgEvent) {
        // For org events, fetch attendees from org_event_attendees
        // Don't exclude anyone since orgs don't have individual hosts
        attendeesQuery = supabase
          .from('org_event_attendees')
          .select('user_id')
          .eq('event_id', eventId)
      } else {
        // For personal events, fetch from event_attendees and exclude host
        attendeesQuery = supabase
          .from('event_attendees')
          .select('user_id')
          .eq('event_id', eventId)
          .neq('user_id', hostId)
      }

      const { data: attendees, error } = await attendeesQuery

      if (error) {
        console.error('Error fetching attendees:', error)
        return
      }

      if (!attendees || attendees.length === 0) {
        console.log('No attendees to notify for event edit/delete')
        return
      }

      // Batch insert all notifications using centralized builder
      // For org events, set event_id to null to avoid foreign key constraint violation
      // (since org events are in org_events table, not events table)
      const notificationData = buildBatchNotifications(
        attendees.map(a => a.user_id),
        buildEventEditDeleteNotification,
        {
          eventId: isOrgEvent ? null : eventId, // Set to null for org events
          eventTitle: eventTitle,
          action: action,
          isOrgEvent: isOrgEvent,
          additionalData: {
            ...(isOrgEvent ? { orgEventId: eventId } : {}) // Store org event ID in data instead
          }
        }
      )

      const { error: insertError } = await supabase
        .from('notification_queue')
        .insert(notificationData)

      if (insertError) {
        throw insertError
      }

      if (__DEV__) {
        console.log(`Queued ${action} notifications for ${attendees.length} attendees for event ${eventId}`)
      }

      // Note: Edge Function will be triggered automatically by the database trigger
      // after a 2-second debounce period to allow batch inserts
    } catch (error) {
      if (__DEV__) {
        console.error(`Error queuing event ${action} notifications:`, error)
      }
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

  // Refresh notification token (useful for token expiration)
  async refreshToken(): Promise<string | null> {
    try {
      if (Device.isDevice) {
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })
        this.notificationToken = token.data
        await this.saveTokenToDatabase(this.notificationToken)
        return this.notificationToken
      }
      return null
    } catch (error) {
      if (__DEV__) {
        console.error('Error refreshing notification token:', error)
      }
      return null
    }
  }

  // Remove token from database (for logout)
  async removeToken(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('notification_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', Platform.OS)

      this.notificationToken = null
    } catch (error) {
      if (__DEV__) {
        console.error('Error removing notification token:', error)
      }
    }
  }

  // Set token directly (for loading existing tokens)
  setToken(token: string): void {
    this.notificationToken = token
  }
}

export default NotificationService.getInstance()
