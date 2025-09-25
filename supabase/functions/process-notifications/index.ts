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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get pending notifications
    const { data: notifications, error } = await supabaseClient
      .from('notification_queue')
      .select('*')
      .eq('processed', false)
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
        // Get user's notification token
        const { data: tokenData } = await supabaseClient
          .from('notification_tokens')
          .select('token')
          .eq('user_id', notification.user_id)
          .single()

        if (!tokenData?.token) {
          console.log(`No token found for user ${notification.user_id}`)
          continue
        }

        // Send push notification
        const message = {
          to: tokenData.token,
          sound: 'default',
          title: notification.title,
          body: notification.body,
          data: notification.data,
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
          // Mark as processed
          await supabaseClient
            .from('notification_queue')
            .update({ processed: true })
            .eq('id', notification.id)

          // Log the notification
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

    return new Response(JSON.stringify({ 
      message: `Processed ${results.length} notifications`,
      results 
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
