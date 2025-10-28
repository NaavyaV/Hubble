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

    // Get all users with notification tokens
    const { data: tokens, error } = await supabaseClient
      .from('notification_tokens')
      .select('user_id, token')
      .not('token', 'is', null)

    if (error) {
      console.error('Error fetching tokens:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send silent push notification to all users
    const results = []
    for (const tokenData of tokens) {
      try {
        const message = {
          to: tokenData.token,
          content_available: 1, // Silent push notification
          data: {
            type: 'process_queue',
            contentAvailable: 1,
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
          results.push({ userId: tokenData.user_id, status: 'sent' })
        } else {
          console.error(`Failed to send silent notification to user ${tokenData.user_id}:`, await response.text())
          results.push({ userId: tokenData.user_id, status: 'failed' })
        }
      } catch (error) {
        console.error(`Error sending silent notification to user ${tokenData.user_id}:`, error)
        results.push({ userId: tokenData.user_id, status: 'error' })
      }
    }

    return new Response(JSON.stringify({ 
      message: `Sent silent notifications to ${results.length} users`,
      results 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in send-silent-notification function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
