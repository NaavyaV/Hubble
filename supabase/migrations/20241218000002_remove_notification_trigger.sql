-- Remove the automatic notification trigger to enable manual/batched processing
-- This allows the app to batch insert notifications and trigger the Edge Function once
-- instead of calling it for each individual notification

DROP TRIGGER IF EXISTS notification_queue_trigger ON notification_queue;
DROP FUNCTION IF EXISTS trigger_process_notifications();

