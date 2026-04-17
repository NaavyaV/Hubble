-- Who is going to which dining venue (UTD). RLS: see everyone rows, friends_only if mutual friend, always own row.

create table if not exists public.dining_going (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  college text not null,
  building text not null,
  venue text not null,
  plan_date date not null,
  arrival_at timestamptz not null,
  departure_at timestamptz not null,
  visibility text not null check (visibility in ('everyone', 'friends_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, college, building, venue, plan_date)
);

create index if not exists dining_going_lookup_idx
  on public.dining_going (college, plan_date, building, venue);

create index if not exists dining_going_active_idx
  on public.dining_going (college, plan_date, departure_at);

alter table public.dining_going enable row level security;

drop policy if exists "dining_going_select_visible" on public.dining_going;
create policy "dining_going_select_visible"
  on public.dining_going
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or visibility = 'everyone'
    or (
      visibility = 'friends_only'
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
        and (
          (f.user_id = auth.uid() and f.friend_id = dining_going.user_id)
          or (f.friend_id = auth.uid() and f.user_id = dining_going.user_id)
        )
      )
    )
  );

drop policy if exists "dining_going_insert_own" on public.dining_going;
create policy "dining_going_insert_own"
  on public.dining_going
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "dining_going_update_own" on public.dining_going;
create policy "dining_going_update_own"
  on public.dining_going
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dining_going_delete_own" on public.dining_going;
create policy "dining_going_delete_own"
  on public.dining_going
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.dining_going is 'User plans to be at a campus dining venue (arrival/departure, visibility).';
