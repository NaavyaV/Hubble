-- Bounded event photo previews for home feed (reduces egress vs unbounded event_photos scans).
create or replace function public.event_photo_previews(p_event_ids uuid[], p_per_event int default 12)
returns table (event_id uuid, image_url text)
language sql
stable
security invoker
set search_path = public
as $$
  select ep.event_id, ep.image_url
  from (
    select
      ep0.event_id,
      ep0.image_url,
      row_number() over (
        partition by ep0.event_id
        order by ep0.created_at desc
      ) as rn
    from public.event_photos ep0
    where ep0.event_id = any(p_event_ids)
  ) ep
  where ep.rn <= greatest(1, least(coalesce(p_per_event, 12), 50));
$$;

grant execute on function public.event_photo_previews(uuid[], int) to authenticated;
