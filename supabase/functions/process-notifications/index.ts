// @ts-nocheck
// Deno Edge Function - these imports work in Deno runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationQueue {
  id: string
  user_id: string
  event_id: string | null
  type: string
  title: string
  body: string
  data: Record<string, any>
  scheduled_for: string
  retry_count?: number
  max_retries?: number
  next_retry_at?: string | null
}

interface NotificationPreferences {
  push_notifications: boolean
  event_reminders: boolean
  going_status_updates: boolean
  friend_requests: boolean
  event_invitations: boolean
  event_deletions: boolean
}

async function processNotification(
  notification: NotificationQueue,
  supabaseClient: any
): Promise<{ id: string; status: string; error?: string; retry_count?: number; next_retry_at?: string }> {
  try {
    // Check user's notification preferences
    const { data: preferences } = await supabaseClient
      .from('notification_preferences')
      .select('push_notifications, event_reminders, going_status_updates, friend_requests, event_invitations, event_deletions')
      .eq('user_id', notification.user_id)
      .maybeSingle()

    // Check if user has this type of notification enabled
    let notificationEnabled = true
    if (preferences) {
      const prefs = preferences as NotificationPreferences
      switch (notification.type) {
        case 'event_reminder':
          notificationEnabled = prefs.push_notifications && prefs.event_reminders
          break
        case 'host_update':
        case 'going_status_updates':
          notificationEnabled = prefs.push_notifications && prefs.going_status_updates
          break
        case 'friend_request':
          notificationEnabled = prefs.push_notifications && prefs.friend_requests
          break
        case 'event_invitation':
          notificationEnabled = prefs.push_notifications && prefs.event_invitations
          break
        case 'event_edited_deleted':
        case 'event_deleted':
          notificationEnabled = prefs.push_notifications && prefs.event_deletions
          break
        default:
          notificationEnabled = prefs.push_notifications
      }
    }

    if (!notificationEnabled) {
      console.log(`Notification disabled for user ${notification.user_id}, type: ${notification.type}`)
      await supabaseClient
        .from('notification_queue')
        .delete()
        .eq('id', notification.id)
      return { id: notification.id, status: 'disabled' }
    }

    // Get user's notification token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('notification_tokens')
      .select('token, platform')
      .eq('user_id', notification.user_id)
      .limit(1)

    if (tokenError) {
      console.error(`Error fetching token for user ${notification.user_id}:`, tokenError)
      return { id: notification.id, status: 'error', error: tokenError.message }
    }

    if (!tokenData || tokenData.length === 0 || !tokenData[0]?.token) {
      console.log(`No token found for user ${notification.user_id}`)
      await supabaseClient
        .from('notification_queue')
        .delete()
        .eq('id', notification.id)
      return { id: notification.id, status: 'no_token' }
    }

    const token = tokenData[0].token

    // Send notification via Expo Push Notification service
    const message = {
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: {
        type: notification.type,
        eventId: notification.event_id,
        userId: notification.user_id,
        notificationId: notification.id,
        ...notification.data,
      },
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (response.ok) {
      // Delete the notification from queue
      await supabaseClient
        .from('notification_queue')
        .delete()
        .eq('id', notification.id)

      // Log the notification for audit purposes
      await supabaseClient
        .from('notification_log')
        .insert({
          user_id: notification.user_id,
          event_id: notification.event_id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        })

      return { id: notification.id, status: 'sent' }
    } else {
      const errorText = await response.text()
      console.error(`Failed to send notification ${notification.id}:`, errorText)
      
      // Handle retry logic with exponential backoff
      const currentRetryCount = notification.retry_count || 0
      const maxRetries = notification.max_retries || 3
      
      if (currentRetryCount < maxRetries) {
        // Calculate exponential backoff: 2^retry_count minutes (1, 2, 4, 8 minutes)
        const backoffMinutes = Math.pow(2, currentRetryCount)
        const nextRetryAt = new Date(Date.now() + (backoffMinutes * 60 * 1000))
        
        await supabaseClient
          .from('notification_queue')
          .update({
            retry_count: currentRetryCount + 1,
            last_attempt_at: new Date().toISOString(),
            next_retry_at: nextRetryAt.toISOString()
          })
          .eq('id', notification.id)
        
        console.log(`Notification ${notification.id} failed, scheduled retry ${currentRetryCount + 1}/${maxRetries} in ${backoffMinutes} minutes`)
        return { 
          id: notification.id, 
          status: 'retry_scheduled', 
          retry_count: currentRetryCount + 1, 
          next_retry_at: nextRetryAt.toISOString() 
        }
      } else {
        // Max retries reached, remove from queue
        console.log(`Notification ${notification.id} exceeded max retries (${maxRetries}), removing from queue`)
        await supabaseClient
          .from('notification_queue')
          .delete()
          .eq('id', notification.id)
        return { id: notification.id, status: 'max_retries_exceeded' }
      }
    }
  } catch (error) {
    console.error(`Error processing notification ${notification.id}:`, error)
    
    // Handle retry logic for processing errors
    const currentRetryCount = notification.retry_count || 0
    const maxRetries = notification.max_retries || 3
    
    if (currentRetryCount < maxRetries) {
      const backoffMinutes = Math.pow(2, currentRetryCount)
      const nextRetryAt = new Date(Date.now() + (backoffMinutes * 60 * 1000))
      
      await supabaseClient
        .from('notification_queue')
        .update({
          retry_count: currentRetryCount + 1,
          last_attempt_at: new Date().toISOString(),
          next_retry_at: nextRetryAt.toISOString()
        })
        .eq('id', notification.id)
      
      console.log(`Notification ${notification.id} processing error, scheduled retry ${currentRetryCount + 1}/${maxRetries} in ${backoffMinutes} minutes`)
      return { 
        id: notification.id, 
        status: 'retry_scheduled', 
        retry_count: currentRetryCount + 1, 
        next_retry_at: nextRetryAt.toISOString() 
      }
    } else {
      // Max retries reached, remove from queue
      console.log(`Notification ${notification.id} exceeded max retries (${maxRetries}) due to processing error, removing from queue`)
      await supabaseClient
        .from('notification_queue')
        .delete()
        .eq('id', notification.id)
      return { id: notification.id, status: 'max_retries_exceeded' }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role key to bypass RLS for system operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing required environment variables')
    }
    
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const allResults = []
    let hasMore = true
    const batchSize = 50

    // Process all notifications in batches until queue is empty
    while (hasMore) {
      const now = new Date().toISOString()
      const { data: notifications, error } = await supabaseClient
        .from('notification_queue')
        .select('*')
        .or(`scheduled_for.lte.${now},next_retry_at.lte.${now}`)
        .limit(batchSize)

      if (error) {
        console.error('Error fetching notifications:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!notifications || notifications.length === 0) {
        hasMore = false
        break
      }

      // Process all notifications in this batch
      const batchResults = await Promise.all(
        notifications.map((notification: NotificationQueue) => 
          processNotification(notification, supabaseClient)
        )
      )

      allResults.push(...batchResults)

      // If we got fewer than batchSize, we've processed everything
      if (notifications.length < batchSize) {
        hasMore = false
      }
    }

    return new Response(JSON.stringify({
      message: `Processed ${allResults.length} notifications`,
      results: allResults,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in process-notifications function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
