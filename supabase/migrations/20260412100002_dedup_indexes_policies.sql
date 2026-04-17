-- Clean up duplicate indexes (advisor lint 0009_duplicate_index) and
-- redundant overlapping permissive policies (lint 0006_multiple_permissive_policies).

-- ============================================================
-- 1. Drop duplicate indexes (keep the one with clearer naming)
-- ============================================================

DROP INDEX IF EXISTS public.idx_attendees_event;
DROP INDEX IF EXISTS public.idx_attendees_status;
DROP INDEX IF EXISTS public.idx_attendees_user;
DROP INDEX IF EXISTS public.idx_event_invitations_event;
DROP INDEX IF EXISTS public.idx_event_invitations_user;
DROP INDEX IF EXISTS public.idx_events_date;
DROP INDEX IF EXISTS public.idx_events_host;
DROP INDEX IF EXISTS public.idx_friendships_friend;
DROP INDEX IF EXISTS public.idx_friendships_user;
DROP INDEX IF EXISTS public.idx_user_blocks_blocker_blocked;

-- ============================================================
-- 2. Consolidate overlapping permissive policies
--    The ALL policy already covers INSERT/SELECT/UPDATE/DELETE,
--    so the dedicated INSERT or SELECT policy is redundant.
-- ============================================================

-- event_attendees: ALL policy covers INSERT, so drop the extra INSERT policy
DROP POLICY IF EXISTS "event_attendees_insert_authenticated" ON public.event_attendees;

-- org_event_attendees: same pattern
DROP POLICY IF EXISTS "org_event_attendees_insert_authenticated" ON public.org_event_attendees;

-- notification_log: two identical SELECT policies (different names)
DROP POLICY IF EXISTS "notification_log_select_own" ON public.notification_log;

-- notification_queue: two identical SELECT policies (different names)
DROP POLICY IF EXISTS "notification_queue_select_own" ON public.notification_queue;
