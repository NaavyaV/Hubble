import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const UTD_COLLEGE = 'University of Texas at Dallas'
const API_URL = 'https://utd-dining.vercel.app/api/dining'

type ApiLocation = { building: string; venue: string; hours: string }
type ApiDay = { label: string; locations: ApiLocation[] }

type Schedule = Record<string, ApiDay>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
      },
    })
  }

  const expected = Deno.env.get('CRON_SECRET')
  const header = req.headers.get('x-cron-secret') ?? ''
  if (!expected || header !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const apiRes = await fetch(API_URL)
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'Dining API failed', status: apiRes.status }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = (await apiRes.json()) as { schedule?: Schedule }
  const schedule = body.schedule
  if (!schedule || typeof schedule !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid API payload' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const refreshedAt = new Date().toISOString()
  const rows: {
    college: string
    day_key: string
    day_label: string | null
    building: string
    venue: string
    hours: string
    refreshed_at: string
  }[] = []

  for (const [dayKey, dayData] of Object.entries(schedule)) {
    if (!dayData || !Array.isArray(dayData.locations)) continue
    for (const loc of dayData.locations) {
      rows.push({
        college: UTD_COLLEGE,
        day_key: dayKey,
        day_label: dayData.label ?? null,
        building: loc.building,
        venue: loc.venue,
        hours: loc.hours,
        refreshed_at: refreshedAt,
      })
    }
  }

  const { error: delErr } = await supabase.from('dining_locations').delete().eq('college', UTD_COLLEGE)
  if (delErr) {
    return new Response(JSON.stringify({ error: delErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const chunk = 150
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    const { error: insErr } = await supabase.from('dining_locations').insert(slice)
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message, at: i }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ ok: true, count: rows.length, refreshed_at: refreshedAt }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
