// @ts-nocheck
// Deno Edge Function - these imports work in Deno runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    // Log which key we're using (without exposing the full key)
    console.log(`Using ${serviceRoleKey ? 'SERVICE_ROLE' : 'ANON'} key for database access`)
    
    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey || anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get pending notifications (limit 50 per batch, will process all if called multiple times)
    const { data: notifications, error } = await supabaseClient
      .from('notification_queue')
      .select('*')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50)

    if (error) {
      console.error('Error fetching notifications:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No notifications to process' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Process each notification
    const results = []
    for (const notification of notifications) {
      try {
        // Check user's notification preferences first
        const { data: preferences } = await supabaseClient
          .from('notification_preferences')
          .select('push_notifications, event_reminders, going_status_updates, friend_requests, event_invitations, event_deletions')
          .eq('user_id', notification.user_id)
          .maybeSingle()

        // Check if user has this type of notification enabled
        let notificationEnabled = true
        if (preferences) {
          switch (notification.type) {
            case 'event_reminder':
              notificationEnabled = preferences.push_notifications && preferences.event_reminders
              break
            case 'host_update':
            case 'going_status_updates':
              notificationEnabled = preferences.push_notifications && preferences.going_status_updates
              break
            case 'friend_request':
              notificationEnabled = preferences.push_notifications && preferences.friend_requests
              break
            case 'event_invitation':
              notificationEnabled = preferences.push_notifications && preferences.event_invitations
              break
            case 'event_edited_deleted':
            case 'event_deleted':
              notificationEnabled = preferences.push_notifications && preferences.event_deletions
              break
            default:
              notificationEnabled = preferences.push_notifications
          }
        }

        if (!notificationEnabled) {
          console.log(`Notification disabled for user ${notification.user_id}, type: ${notification.type}`)
          // Remove from queue since we're not sending it
          await supabaseClient
            .from('notification_queue')
            .delete()
            .eq('id', notification.id)
          results.push({ id: notification.id, status: 'disabled' })
          continue
        }

        // Get user's notification token
        console.log(`Fetching token for user ${notification.user_id}`)
        const { data: tokenData, error: tokenError } = await supabaseClient
          .from('notification_tokens')
          .select('token, platform')
          .eq('user_id', notification.user_id)
          .limit(1)

        if (tokenError) {
          console.error(`Error fetching token for user ${notification.user_id}:`, tokenError)
          console.error(`Token error details:`, JSON.stringify(tokenError, null, 2))
          results.push({ id: notification.id, status: 'error', error: tokenError.message })
          continue
        }

        console.log(`Token query result for user ${notification.user_id}:`, tokenData ? `Found ${tokenData.length} token(s)` : 'No result')

        if (!tokenData || tokenData.length === 0 || !tokenData[0]?.token) {
          console.log(`No token found for user ${notification.user_id}`)
          // Remove from queue since we can't send it
          await supabaseClient
            .from('notification_queue')
            .delete()
            .eq('id', notification.id)
          results.push({ id: notification.id, status: 'no_token' })
          continue
        }

        const token = tokenData[0].token
        console.log(`Using token for user ${notification.user_id}: ${token.substring(0, 20)}...`)

        // Send actual notification with title and body
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
        
        console.log(`Sending notification to token: ${token.substring(0, 20)}...`)

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
          // Delete the notification from queue (remove it from the table)
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

          results.push({ id: notification.id, status: 'sent' })
        } else {
          console.error(`Failed to send notification ${notification.id}:`, await response.text())
          results.push({ id: notification.id, status: 'failed' })
        }
      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error)
        results.push({ id: notification.id, status: 'error' })
      }
    }

    // Check if there are more notifications to process (handling batches > 50)
    let hasMore = false
    if (results.length === 50) {
      // Check if there are more notifications ready to process
      const { count } = await supabaseClient
        .from('notification_queue')
        .select('*', { count: 'exact', head: true })
        .lte('scheduled_for', new Date().toISOString())
      
      hasMore = (count || 0) > 0
    }

    const response = {
      message: `Processed ${results.length} notifications`,
      results,
      hasMore
    }

    // If there are more notifications, process them immediately (recursive processing)
    if (hasMore) {
      console.log('More notifications in queue, processing next batch immediately...')
      // Process the next batch by calling the Edge Function again
      // The Edge Function will handle up to 50 more and continue until queue is empty
      try {
        const selfUrl = `${supabaseUrl}/functions/v1/process-notifications`
        await fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey || anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })
      } catch (error) {
        console.error('Error triggering recursive processing:', error)
      }
    }

    return new Response(JSON.stringify(response), {
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
