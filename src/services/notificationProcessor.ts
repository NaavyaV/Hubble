import { supabase } from './supabase'
import notificationService from './notifications'

class NotificationProcessor {
  private static instance: NotificationProcessor
  private processingInterval: NodeJS.Timeout | null = null

  static getInstance(): NotificationProcessor {
    if (!NotificationProcessor.instance) {
      NotificationProcessor.instance = new NotificationProcessor()
    }
    return NotificationProcessor.instance
  }

  // Start processing notifications from the queue
  startProcessing(): void {
    if (this.processingInterval) {
      return // Already processing
    }

    // Process notifications every 30 seconds
    this.processingInterval = setInterval(async () => {
      await this.processQueuedNotifications()
    }, 30000)

    console.log('Notification processor started')
  }

  // Stop processing notifications
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
      console.log('Notification processor stopped')
    }
  }

  // Process notifications from the queue
  private async processQueuedNotifications(): Promise<void> {
    try {
      // Get pending notifications
      const { data: notifications, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('processed', false)
        .lte('scheduled_for', new Date().toISOString())
        .limit(10)

      if (error) {
        console.error('Error fetching notifications:', error)
        return
      }

      if (!notifications || notifications.length === 0) {
        return
      }

      console.log(`Processing ${notifications.length} notifications`)

      // Process each notification
      for (const notification of notifications) {
        try {
          // Get user's notification token
          const { data: tokenData } = await supabase
            .from('notification_tokens')
            .select('token')
            .eq('user_id', notification.user_id)
            .single()

          if (!tokenData?.token) {
            console.log(`No token found for user ${notification.user_id}`)
            // Mark as processed even if no token
            await this.markAsProcessed(notification.id)
            continue
          }

          // For Expo Go, always send local notifications
          if (tokenData.token === 'expo-go-local-only' || !tokenData.token.includes('ExponentPushToken')) {
            console.log('Sending local notification for Expo Go')
            await notificationService.sendNotification({
              type: notification.type as any,
              eventId: notification.event_id,
              userId: notification.user_id,
              title: notification.title,
              body: notification.body,
              data: notification.data
            })
          } else {
            // For development builds, send push notifications
            console.log('Sending push notification')
            await notificationService.sendNotification({
              type: notification.type as any,
              eventId: notification.event_id,
              userId: notification.user_id,
              title: notification.title,
              body: notification.body,
              data: notification.data
            })
          }

          // Mark as processed
          await this.markAsProcessed(notification.id)

          // Log the notification
          await this.logNotification(notification)

          console.log(`Sent notification ${notification.id} to user ${notification.user_id}`)
        } catch (error) {
          console.error(`Error processing notification ${notification.id}:`, error)
        }
      }
    } catch (error) {
      console.error('Error in notification processor:', error)
    }
  }

  // Mark notification as processed
  private async markAsProcessed(notificationId: string): Promise<void> {
    try {
      await supabase
        .from('notification_queue')
        .update({ processed: true })
        .eq('id', notificationId)
    } catch (error) {
      console.error('Error marking notification as processed:', error)
    }
  }

  // Log sent notification
  private async logNotification(notification: any): Promise<void> {
    try {
      await supabase
        .from('notification_log')
        .insert({
          user_id: notification.user_id,
          event_id: notification.event_id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data
        })
    } catch (error) {
      console.error('Error logging notification:', error)
    }
  }
}

export default NotificationProcessor.getInstance()
