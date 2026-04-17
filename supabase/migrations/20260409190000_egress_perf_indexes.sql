-- Reduce query cost on high-frequency notification and invitation paths.
create index if not exists idx_event_invitations_invited_by
  on public.event_invitations (invited_by);

create index if not exists idx_notification_log_event_id
  on public.notification_log (event_id);

create index if not exists idx_notification_queue_event_id
  on public.notification_queue (event_id);

create index if not exists idx_photo_privacy_permissions_granted_by
  on public.photo_privacy_permissions (granted_by);

-- Supports frequent queue polling pattern: processed + scheduled_for window scans.
create index if not exists idx_notification_queue_ready
  on public.notification_queue (processed, scheduled_for);
