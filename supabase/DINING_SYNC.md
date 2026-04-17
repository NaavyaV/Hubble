# UTD dining sync (Supabase)

## Database

- Table: `public.dining_locations` (see migration `20260423120000_dining_locations.sql`).
- Table: `public.dining_going` — who is going to which venue, arrival/departure timestamps, `visibility` (`everyone` | `friends_only`). RLS: readable if public, mutual friend (when `friends_only`), or your own row; only your rows are writable. Migration: `20260425120000_dining_going.sql`.
- **Read**: anon + authenticated (RLS select policy).
- **Write**: Edge Function uses the service role (not blocked by RLS).

## Edge Function: `sync-utd-daily`

Source: `supabase/functions/sync-utd-daily/index.ts`.

1. In [Supabase Dashboard](https://supabase.com/dashboard) → **Project Settings → Edge Functions → Secrets**, add:
   - `CRON_SECRET` — long random string (only you and your scheduler know it).

2. Deploy (CLI, logged in):

   ```bash
   npx supabase functions deploy sync-utd-daily --project-ref lgrpvsczgrndrdzwcncn --no-verify-jwt
   ```

3. **First run** (replace `YOUR_REF` and `YOUR_SECRET`):

   ```bash
   curl -X POST "https://YOUR_REF.supabase.co/functions/v1/sync-utd-daily" \
     -H "x-cron-secret: YOUR_SECRET" \
     -H "Content-Type: application/json"
   ```

   Expect: `{"ok":true,"count":...}`.

4. **Daily schedule** — pick one:
   - **Supabase**: Scheduled Functions / cron (if enabled for your plan), same `POST` with `x-cron-secret`.
   - **GitHub Actions**, **Vercel Cron**, etc.: HTTP `POST` once per day to the same URL and header.

Data source: [https://utd-dining.vercel.app/api/dining](https://utd-dining.vercel.app/api/dining).

## App behavior

The Hubble app loads from `dining_locations` first. If the table is empty or the query fails, it **falls back** to the live API so the Dining tab still works before the first sync.
