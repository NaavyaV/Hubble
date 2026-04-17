-- Security hardening: tighten notification RLS, set search_path on functions,
-- move extensions out of public.

BEGIN;

-- ============================================================
-- 1. Tighten notification_queue RLS (currently INSERT/UPDATE/DELETE = true)
-- ============================================================

-- Remove overly permissive INSERT (was: WITH CHECK (true))
DROP POLICY IF EXISTS "notification_queue_insert_allow_authenticated" ON public.notification_queue;

-- Remove overly permissive UPDATE (was: USING (true) WITH CHECK (true))
DROP POLICY IF EXISTS "notification_queue_update_own" ON public.notification_queue;

-- Remove overly permissive DELETE (was: USING (true))
DROP POLICY IF EXISTS "notification_queue_delete_processed" ON public.notification_queue;

-- ============================================================
-- 2. Tighten notification_log RLS (INSERT was: WITH CHECK (true))
-- ============================================================

DROP POLICY IF EXISTS "notification_log_insert_allow_authenticated" ON public.notification_log;

-- ============================================================
-- 3. Set search_path on all flagged functions
--    Using ALTER FUNCTION ... SET search_path = pg_catalog, public;
-- ============================================================

ALTER FUNCTION public.create_user_notification_preferences()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_notification_preferences_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.notify_event_deletion()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.grant_photo_access_to_attendees()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_bidirectional_block(uuid, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.validate_email_domain(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_blockers(uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.is_blocked_by(uuid, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.prevent_notification_from_muted()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.cleanup_event_image_on_delete()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.handle_user_deletion()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.prevent_friend_request_from_blocked()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.cleanup_org_event_image_on_delete()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_reports_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.prevent_notification_from_blocked()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.validate_profile_email_domain()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.schedule_host_notification()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_user_completely(uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_past_events()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_profile_on_email_mismatch()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.notify_friend_request()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.extract_file_path_from_storage_url(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_auth_user_on_profile_delete()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.is_user_blocked_by(uuid, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_event_image_via_http(text, text, text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.check_rate_limit(uuid, text, integer, integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.cleanup_old_rate_limits()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_event_image_from_storage(text, text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.call_process_notifications()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.extract_file_path_from_url(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_event_images_on_delete()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.delete_org_event_images_on_delete()
  SET search_path = pg_catalog, public;

-- app_private schema
ALTER FUNCTION app_private.get_config()
  SET search_path = pg_catalog, public, app_private;

-- Note: http and pg_net extensions do not support SET SCHEMA.
-- Document this as a known exception; they must remain in public.

COMMIT;
