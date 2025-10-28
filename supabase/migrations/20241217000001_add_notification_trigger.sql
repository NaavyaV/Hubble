-- Create a function to send silent notifications when notifications are queued
CREATE OR REPLACE FUNCTION send_silent_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function to send silent push notifications
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-silent-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function when notifications are added to the queue
CREATE TRIGGER notification_queue_trigger
  AFTER INSERT ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION send_silent_notification_trigger();
