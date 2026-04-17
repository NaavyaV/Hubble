-- Fix auth_rls_initplan: wrap auth.uid() in (select auth.uid()) so the planner
-- evaluates it once per statement instead of once per row.
-- Affects every RLS policy that references auth.uid() directly.

BEGIN;

-- ============================================================
-- dining_going
-- ============================================================
DROP POLICY IF EXISTS "dining_going_select_visible" ON public.dining_going;
CREATE POLICY "dining_going_select_visible"
  ON public.dining_going FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR visibility = 'everyone'
    OR (
      visibility = 'friends_only'
      AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
        AND (
          (f.user_id = (select auth.uid()) AND f.friend_id = dining_going.user_id)
          OR (f.friend_id = (select auth.uid()) AND f.user_id = dining_going.user_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "dining_going_insert_own" ON public.dining_going;
CREATE POLICY "dining_going_insert_own"
  ON public.dining_going FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "dining_going_update_own" ON public.dining_going;
CREATE POLICY "dining_going_update_own"
  ON public.dining_going FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "dining_going_delete_own" ON public.dining_going;
CREATE POLICY "dining_going_delete_own"
  ON public.dining_going FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- event_attendees
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.event_attendees;
CREATE POLICY "Users can manage their own attendance"
  ON public.event_attendees FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "event_attendees_insert_authenticated" ON public.event_attendees;
CREATE POLICY "event_attendees_insert_authenticated"
  ON public.event_attendees FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- event_invitations
-- ============================================================
DROP POLICY IF EXISTS "Event hosts can manage invitations" ON public.event_invitations;
CREATE POLICY "Event hosts can manage invitations"
  ON public.event_invitations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_invitations.event_id
      AND e.host_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "event_invitations_select_own_or_hosted" ON public.event_invitations;
CREATE POLICY "event_invitations_select_own_or_hosted"
  ON public.event_invitations FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_invitations.event_id
      AND e.host_id = (select auth.uid())
    )
  );

-- ============================================================
-- event_photos
-- ============================================================
DROP POLICY IF EXISTS "Attendees can view attendees_only photos" ON public.event_photos;
CREATE POLICY "Attendees can view attendees_only photos"
  ON public.event_photos FOR SELECT TO authenticated
  USING (
    privacy_level = 'attendees_only'
    AND EXISTS (
      SELECT 1 FROM public.event_attendees
      WHERE event_attendees.event_id = event_photos.event_id
      AND event_attendees.user_id = (select auth.uid())
      AND event_attendees.status = 'going'
    )
  );

DROP POLICY IF EXISTS "Friends can view friends_only photos" ON public.event_photos;
CREATE POLICY "Friends can view friends_only photos"
  ON public.event_photos FOR SELECT TO authenticated
  USING (
    privacy_level = 'friends_only'
    AND EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (
        (friendships.user_id = (select auth.uid()) AND friendships.friend_id = event_photos.uploaded_by AND friendships.status = 'accepted')
        OR (friendships.friend_id = (select auth.uid()) AND friendships.user_id = event_photos.uploaded_by AND friendships.status = 'accepted')
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete their own photos" ON public.event_photos;
CREATE POLICY "Users can delete their own photos"
  ON public.event_photos FOR DELETE TO authenticated
  USING ((select auth.uid()) = uploaded_by);

DROP POLICY IF EXISTS "Users can update their own photos" ON public.event_photos;
CREATE POLICY "Users can update their own photos"
  ON public.event_photos FOR UPDATE TO authenticated
  USING ((select auth.uid()) = uploaded_by);

DROP POLICY IF EXISTS "Users can upload photos for events they attended or hosted" ON public.event_photos;
CREATE POLICY "Users can upload photos for events they attended or hosted"
  ON public.event_photos FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = uploaded_by
    AND (
      EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = event_photos.event_id
        AND events.host_id = (select auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.event_attendees
        WHERE event_attendees.event_id = event_photos.event_id
        AND event_attendees.user_id = (select auth.uid())
        AND event_attendees.status = 'going'
      )
    )
  );

DROP POLICY IF EXISTS "Users can view their own photos" ON public.event_photos;
CREATE POLICY "Users can view their own photos"
  ON public.event_photos FOR SELECT TO authenticated
  USING ((select auth.uid()) = uploaded_by);

-- ============================================================
-- events
-- ============================================================
DROP POLICY IF EXISTS "events_delete_own" ON public.events;
CREATE POLICY "events_delete_own"
  ON public.events FOR DELETE TO authenticated
  USING (host_id = (select auth.uid()));

DROP POLICY IF EXISTS "events_insert_authenticated" ON public.events;
CREATE POLICY "events_insert_authenticated"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (host_id = (select auth.uid()) AND (select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "events_select_public_or_invited" ON public.events;
CREATE POLICY "events_select_public_or_invited"
  ON public.events FOR SELECT TO authenticated
  USING (
    privacy = 'public'
    OR host_id = (select auth.uid())
    OR can_user_see_event(id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "events_update_own" ON public.events;
CREATE POLICY "events_update_own"
  ON public.events FOR UPDATE TO authenticated
  USING (host_id = (select auth.uid()))
  WITH CHECK (host_id = (select auth.uid()));

-- ============================================================
-- friendships
-- ============================================================
DROP POLICY IF EXISTS "Friendships delete own" ON public.friendships;
CREATE POLICY "Friendships delete own"
  ON public.friendships FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id OR (select auth.uid()) = friend_id);

DROP POLICY IF EXISTS "Friendships insert authenticated" ON public.friendships;
CREATE POLICY "Friendships insert authenticated"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id OR (select auth.uid()) = friend_id);

DROP POLICY IF EXISTS "Friendships select own" ON public.friendships;
CREATE POLICY "Friendships select own"
  ON public.friendships FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id OR (select auth.uid()) = friend_id);

DROP POLICY IF EXISTS "Friendships update own" ON public.friendships;
CREATE POLICY "Friendships update own"
  ON public.friendships FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id OR (select auth.uid()) = friend_id);

-- ============================================================
-- notification_log
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own notification log" ON public.notification_log;
CREATE POLICY "Users can view their own notification log"
  ON public.notification_log FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "notification_log_select_own" ON public.notification_log;
CREATE POLICY "notification_log_select_own"
  ON public.notification_log FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- notification_preferences
-- ============================================================
DROP POLICY IF EXISTS "Users can delete their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can delete their own notification preferences"
  ON public.notification_preferences FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- notification_queue
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own queued notifications" ON public.notification_queue;
CREATE POLICY "Users can view their own queued notifications"
  ON public.notification_queue FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "notification_queue_select_own" ON public.notification_queue;
CREATE POLICY "notification_queue_select_own"
  ON public.notification_queue FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- notification_tokens
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own notification tokens" ON public.notification_tokens;
CREATE POLICY "Users can manage their own notification tokens"
  ON public.notification_tokens FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- org_blocks
-- ============================================================
DROP POLICY IF EXISTS "Users can create their own org blocks" ON public.org_blocks;
CREATE POLICY "Users can create their own org blocks"
  ON public.org_blocks FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own org blocks" ON public.org_blocks;
CREATE POLICY "Users can delete their own org blocks"
  ON public.org_blocks FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own org blocks" ON public.org_blocks;
CREATE POLICY "Users can view their own org blocks"
  ON public.org_blocks FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- org_event_attendees
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.org_event_attendees;
CREATE POLICY "Users can manage their own attendance"
  ON public.org_event_attendees FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "org_event_attendees_insert_authenticated" ON public.org_event_attendees;
CREATE POLICY "org_event_attendees_insert_authenticated"
  ON public.org_event_attendees FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- org_events
-- ============================================================
DROP POLICY IF EXISTS "Org owners can manage their events" ON public.org_events;
CREATE POLICY "Org owners can manage their events"
  ON public.org_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.org_ownership_id = org_events.org_id
    )
  );

DROP POLICY IF EXISTS "org_events_select_public" ON public.org_events;
CREATE POLICY "org_events_select_public"
  ON public.org_events FOR SELECT TO authenticated
  USING (
    privacy = 'public'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.org_ownership_id = org_events.org_id
    )
    OR EXISTS (
      SELECT 1 FROM public.org_event_attendees
      WHERE org_event_attendees.event_id = org_events.id
      AND org_event_attendees.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- org_followers
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own follows" ON public.org_followers;
CREATE POLICY "Users can manage their own follows"
  ON public.org_followers FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- organizations
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Owners can update their organizations" ON public.organizations;
CREATE POLICY "Owners can update their organizations"
  ON public.organizations FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ============================================================
-- photo_privacy_permissions
-- ============================================================
DROP POLICY IF EXISTS "Photo uploaders can view permissions for their photos" ON public.photo_privacy_permissions;
CREATE POLICY "Photo uploaders can view permissions for their photos"
  ON public.photo_privacy_permissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_photos
      WHERE event_photos.id = photo_privacy_permissions.photo_id
      AND event_photos.uploaded_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can grant permissions for their photos" ON public.photo_privacy_permissions;
CREATE POLICY "Users can grant permissions for their photos"
  ON public.photo_privacy_permissions FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = granted_by
    AND EXISTS (
      SELECT 1 FROM public.event_photos
      WHERE event_photos.id = photo_privacy_permissions.photo_id
      AND event_photos.uploaded_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can revoke permissions for their photos" ON public.photo_privacy_permissions;
CREATE POLICY "Users can revoke permissions for their photos"
  ON public.photo_privacy_permissions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_photos
      WHERE event_photos.id = photo_privacy_permissions.photo_id
      AND event_photos.uploaded_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.photo_privacy_permissions;
CREATE POLICY "Users can view their own permissions"
  ON public.photo_privacy_permissions FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- profiles
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view all verified profiles except blockers" ON public.profiles;
CREATE POLICY "Users can view all verified profiles except blockers"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    otp_verified = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE ub.blocker_id = profiles.id
      AND ub.blocked_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- ============================================================
-- rate_limits
-- ============================================================
DROP POLICY IF EXISTS "rate_limits_select_own" ON public.rate_limits;
CREATE POLICY "rate_limits_select_own"
  ON public.rate_limits FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- reports
-- ============================================================
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reported_by);

DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;
CREATE POLICY "Users can view their own reports"
  ON public.reports FOR SELECT TO authenticated
  USING ((select auth.uid()) = reported_by);

-- ============================================================
-- user_blocks
-- ============================================================
DROP POLICY IF EXISTS "Users can create their own blocks" ON public.user_blocks;
CREATE POLICY "Users can create their own blocks"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete their own blocks"
  ON public.user_blocks FOR DELETE TO authenticated
  USING ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Users can view blocks they are involved in" ON public.user_blocks;
CREATE POLICY "Users can view blocks they are involved in"
  ON public.user_blocks FOR SELECT TO authenticated
  USING ((select auth.uid()) = blocker_id OR (select auth.uid()) = blocked_id);

-- ============================================================
-- user_mutes
-- ============================================================
DROP POLICY IF EXISTS "Users can create their own mutes" ON public.user_mutes;
CREATE POLICY "Users can create their own mutes"
  ON public.user_mutes FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = muter_id);

DROP POLICY IF EXISTS "Users can delete their own mutes" ON public.user_mutes;
CREATE POLICY "Users can delete their own mutes"
  ON public.user_mutes FOR DELETE TO authenticated
  USING ((select auth.uid()) = muter_id);

DROP POLICY IF EXISTS "Users can view their own mutes" ON public.user_mutes;
CREATE POLICY "Users can view their own mutes"
  ON public.user_mutes FOR SELECT TO authenticated
  USING ((select auth.uid()) = muter_id);

COMMIT;
