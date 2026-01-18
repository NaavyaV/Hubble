import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Dynamically import Firebase Messaging for Android only
let messaging: any = null
if (Platform.OS === 'android') {
  try {
    messaging = require('@react-native-firebase/messaging').default
  } catch (error) {
    if (__DEV__) {
      console.log('Firebase Messaging not available:', error)
    }
  }
}
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
    
    // Security: Require authentication - never fall back to anon key
    if (!session?.access_token) {
      if (__DEV__) {
        console.log('No session token available, skipping Edge Function trigger')
      }
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

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

// Helper function to filter out muted users from notification recipients
async function filterMutedUsers(recipientIds: string[], senderId?: string): Promise<string[]> {
  try {
    if (recipientIds.length === 0) return []
    
    // If senderId is provided, filter recipients who have muted the sender
    if (senderId) {
      const { data: mutedData } = await supabase
        .from('user_mutes')
        .select('muter_id')
        .eq('muted_id', senderId)
        .in('muter_id', recipientIds)
      
      const mutedRecipientIds = new Set((mutedData || []).map(m => m.muter_id))
      return recipientIds.filter(id => !mutedRecipientIds.has(id))
    }
    
    // If no senderId, return all (for system notifications)
    return recipientIds
  } catch (error) {
    console.error('Error filtering muted users:', error)
    // On error, return all recipients to avoid blocking notifications
    return recipientIds
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

      // Get push token based on platform
      if (Device.isDevice) {
        try {
          let token: string
          
          if (Platform.OS === 'android' && messaging) {
            // Use FCM for Android
            await messaging().requestPermission()
            token = await messaging().getToken()
            
            if (__DEV__) {
              console.log('FCM Token obtained:', token.substring(0, 20) + '...')
            }
          } else {
            // Use Expo Push for iOS or fallback
            const expoToken = await Notifications.getExpoPushTokenAsync({
              projectId: Constants.expoConfig?.extra?.eas?.projectId,
            })
            token = expoToken.data
            
            if (__DEV__) {
              console.log('Expo Push Token obtained:', token.substring(0, 20) + '...')
            }
          }
          
          this.notificationToken = token
          
          // Save token to Supabase
          await this.saveTokenToDatabase(this.notificationToken)
          
          return this.notificationToken
        } catch (error: any) {
          if (__DEV__) {
            console.log('Push notifications not available:', error.message)
          }
          // Try fallback to Expo Push if FCM fails
          if (Platform.OS === 'android' && messaging) {
            try {
              const expoToken = await Notifications.getExpoPushTokenAsync({
                projectId: Constants.expoConfig?.extra?.eas?.projectId,
              })
              this.notificationToken = expoToken.data
              await this.saveTokenToDatabase(this.notificationToken)
              if (__DEV__) {
                console.log('Fell back to Expo Push Token')
              }
              return this.notificationToken
            } catch (fallbackError) {
              if (__DEV__) {
                console.log('Fallback to Expo Push also failed')
              }
            }
          }
          this.notificationToken = 'local-only'
          await this.saveTokenToDatabase(this.notificationToken)
          return this.notificationToken
        }
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

      // Get event host to filter muted users
      const { data: eventData } = await supabase
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .single()
      
      const hostId = eventData?.host_id
      
      // Filter out muted users
      const attendeeIds = attendees.map(a => a.user_id)
      const filteredRecipients = await filterMutedUsers(attendeeIds, hostId)
      
      if (filteredRecipients.length === 0) {
        if (__DEV__) {
          console.log('All attendees have muted the host, skipping reminders')
        }
        return
      }
      
      // Batch insert all reminder notifications using centralized builder
      const notificationData = buildBatchNotifications(
        filteredRecipients,
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

  // Send event edit/delete notification to all going and invited users except host
  async sendEventEditDeleteNotification(
    eventId: string, 
    eventTitle: string, 
    hostId: string, 
    action: 'edited' | 'deleted',
    isOrgEvent: boolean = false
  ): Promise<void> {
    try {
      let allUserIds = new Set<string>()
      
      if (isOrgEvent) {
        // For org events, fetch ALL users with any status from org_event_attendees
        const { data: attendees, error: attendeesError } = await supabase
          .from('org_event_attendees')
          .select('user_id')
          .eq('event_id', eventId)
        
        if (attendeesError) {
          console.error('Error fetching org event attendees:', attendeesError)
        } else if (attendees) {
          attendees.forEach(a => {
            if (a.user_id && a.user_id !== hostId) {
              allUserIds.add(a.user_id)
            }
          })
        }
      } else {
        // For personal events, fetch:
        // 1. ALL attendees with any status (going, maybe, not_going) except host
        const { data: attendees, error: attendeesError } = await supabase
          .from('event_attendees')
          .select('user_id')
          .eq('event_id', eventId)
          .neq('user_id', hostId)
        
        if (attendeesError) {
          console.error('Error fetching event attendees:', attendeesError)
        } else if (attendees) {
          attendees.forEach(a => {
            if (a.user_id) {
              allUserIds.add(a.user_id)
            }
          })
        }
        
        // 2. ALL invited users (from event_invitations) who haven't responded yet
        const { data: invitations, error: invitationsError } = await supabase
          .from('event_invitations')
          .select('user_id')
          .eq('event_id', eventId)
        
        if (invitationsError) {
          console.error('Error fetching event invitations:', invitationsError)
        } else if (invitations) {
          invitations.forEach(inv => {
            if (inv.user_id && inv.user_id !== hostId) {
              allUserIds.add(inv.user_id)
            }
          })
        }
      }

      if (allUserIds.size === 0) {
        if (__DEV__) {
          console.log(`No users to notify for event ${action} (eventId: ${eventId})`)
        }
        return
      }

      // Filter out muted users and blocked users
      const userIdsArray = Array.from(allUserIds)
      
      // CRITICAL: Filter out users who have muted the host
      // If User A mutes User B, User A should not receive notifications from User B
      const filteredRecipients = await filterMutedUsers(userIdsArray, hostId)
      
      if (__DEV__) {
        console.log(`[EVENT ${action.toUpperCase()}] Filtering recipients: ${userIdsArray.length} total, ${filteredRecipients.length} after mute filter (hostId: ${hostId})`)
      }
      
      // Also filter out users who have blocked the host
      const { data: blockersData } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', hostId)
      
      const blockedIds = new Set<string>()
      if (blockersData) {
        blockersData.forEach(b => {
          if (b.blocked_id) {
            blockedIds.add(b.blocked_id)
          }
        })
      }
      
      const finalRecipients = filteredRecipients.filter(userId => !blockedIds.has(userId))
      
      if (finalRecipients.length === 0) {
        if (__DEV__) {
          console.log(`[EVENT ${action.toUpperCase()}] All users have muted or blocked the host, skipping notifications`)
        }
        return
      }
      
      if (__DEV__) {
        const mutedCount = userIdsArray.length - filteredRecipients.length
        const blockedCount = filteredRecipients.length - finalRecipients.length
        console.log(`[EVENT ${action.toUpperCase()}] Final recipients: ${finalRecipients.length} (${mutedCount} muted, ${blockedCount} blocked)`)
      }

      // Batch insert all notifications using centralized builder
      // For org events, set event_id to null to avoid foreign key constraint violation
      // (since org events are in org_events table, not events table)
      const notificationData = buildBatchNotifications(
        finalRecipients,
        buildEventEditDeleteNotification,
        {
          eventId: isOrgEvent ? null : eventId, // Set to null for org events
          eventTitle: eventTitle,
          action: action,
          additionalData: {
            isOrgEvent: isOrgEvent,
            hostId: hostId, // CRITICAL: Include hostId for mute checking in trigger
            host_id: hostId, // Also include with underscore for compatibility
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
        console.log(`Queued ${action} notifications for ${finalRecipients.length} users (${allUserIds.size} total, ${allUserIds.size - finalRecipients.length} filtered) for event ${eventId}`)
      }

      // For deleted events, notifications are queued and will be processed by the Edge Function
      // We don't wait here to avoid blocking the UI - notifications are queued first,
      // then deletion happens, ensuring notifications are sent before the event is fully deleted

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
        let token: string
        
        if (Platform.OS === 'android' && messaging) {
          // Use FCM for Android
          token = await messaging().getToken()
          if (__DEV__) {
            console.log('FCM Token refreshed:', token.substring(0, 20) + '...')
          }
        } else {
          // Use Expo Push for iOS or fallback
          const expoToken = await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
          })
          token = expoToken.data
          if (__DEV__) {
            console.log('Expo Push Token refreshed:', token.substring(0, 20) + '...')
          }
        }
        
        this.notificationToken = token
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
