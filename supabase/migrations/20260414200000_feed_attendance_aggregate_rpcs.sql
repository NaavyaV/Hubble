-- Aggregated going counts + viewer RSVP for home feed (avoids embedding full attendee rows).
create or replace function public.event_going_counts_by_ids(p_event_ids uuid[])
returns table (event_id uuid, going_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ea.event_id, count(*)::bigint
  from public.event_attendees ea
  where ea.event_id = any(p_event_ids)
    and ea.status = 'going'
  group by ea.event_id;
$$;

create or replace function public.org_event_going_counts_by_ids(p_event_ids uuid[])
returns table (event_id uuid, going_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ea.event_id, count(*)::bigint
  from public.org_event_attendees ea
  where ea.event_id = any(p_event_ids)
    and ea.status = 'going'
  group by ea.event_id;
$$;

create or replace function public.my_event_attendee_status_for_ids(p_event_ids uuid[], p_user_id uuid)
returns table (event_id uuid, status text)
language sql
stable
security invoker
set search_path = public
as $$
  select ea.event_id, ea.status::text
  from public.event_attendees ea
  where ea.user_id = p_user_id
    and ea.event_id = any(p_event_ids);
$$;

create or replace function public.my_org_event_attendee_status_for_ids(p_event_ids uuid[], p_user_id uuid)
returns table (event_id uuid, status text)
language sql
stable
security invoker
set search_path = public
as $$
  select ea.event_id, ea.status::text
  from public.org_event_attendees ea
  where ea.user_id = p_user_id
    and ea.event_id = any(p_event_ids);
$$;

grant execute on function public.event_going_counts_by_ids(uuid[]) to authenticated;
grant execute on function public.org_event_going_counts_by_ids(uuid[]) to authenticated;
grant execute on function public.my_event_attendee_status_for_ids(uuid[], uuid) to authenticated;
grant execute on function public.my_org_event_attendee_status_for_ids(uuid[], uuid) to authenticated;
