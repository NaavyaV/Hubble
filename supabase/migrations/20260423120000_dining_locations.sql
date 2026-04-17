-- UTD dining hours mirrored from https://utd-dining.vercel.app/api/dining
-- Refreshed by Edge Function sync-utd-daily (Supabase Dashboard cron or external HTTP POST with x-cron-secret).

create table if not exists public.dining_locations (
  id uuid primary key default gen_random_uuid(),
  college text not null,
  day_key text not null check (day_key in ('sunday','monday','tuesday','wednesday','thursday','friday','saturday')),
  day_label text,
  building text not null,
  venue text not null,
  hours text not null,
  refreshed_at timestamptz not null default now(),
  unique (college, day_key, building, venue)
);

create index if not exists dining_locations_college_day_idx on public.dining_locations (college, day_key);
create index if not exists dining_locations_refreshed_idx on public.dining_locations (refreshed_at);

alter table public.dining_locations enable row level security;

drop policy if exists "Dining locations are publicly readable" on public.dining_locations;
create policy "Dining locations are publicly readable"
  on public.dining_locations
  for select
  to anon, authenticated
  using (true);

comment on table public.dining_locations is 'Campus dining venues and hours; synced from UTD dining API.';
