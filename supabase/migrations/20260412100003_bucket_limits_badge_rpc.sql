-- Server-side upload limits and consolidated badge count RPC.

-- 1. Storage bucket limits
UPDATE storage.buckets
  SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
  WHERE id = 'profile-images';

UPDATE storage.buckets
  SET file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
  WHERE id = 'event-images';

UPDATE storage.buckets
  SET file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
  WHERE id = 'photos';

-- 2. Single-query badge count (replaces 4 client-side queries)
CREATE OR REPLACE FUNCTION public.get_pending_invitation_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::int
  FROM public.event_invitations ei
  JOIN public.events e ON e.id = ei.event_id
  WHERE ei.user_id = p_user_id
    AND e.host_id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.event_attendees ea
      WHERE ea.event_id = ei.event_id
        AND ea.user_id = p_user_id
        AND ea.status IN ('going', 'not_going')
    )
    AND (
      e.end_time IS NULL
      OR (e.event_date + e.end_time::time) > now()
    );
$$;

-- 3. Add profiles to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
