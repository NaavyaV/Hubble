-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: The automatic trigger has been removed to allow manual/batched triggering
-- This prevents multiple Edge Function calls when inserting multiple notifications
-- The app code now manually triggers the Edge Function after batch inserts
-- 
-- If you want to keep automatic triggering for single notifications, you can uncomment below:
-- However, this will call the Edge Function once per notification insert

/*
-- Create a function to trigger the Edge Function when notifications are queued
CREATE OR REPLACE FUNCTION trigger_process_notifications()
RETURNS TRIGGER AS $$
DECLARE
  api_url text;
  anon_key text;
BEGIN
  -- Get Supabase API URL (replace with your project URL if needed)
  api_url := 'https://YOUR_PROJECT_REF.supabase.co'; -- Replace YOUR_PROJECT_REF with your actual project reference
  
  -- Get anon key (replace with your actual anon key)
  anon_key := 'YOUR_ANON_KEY_HERE'; -- Replace with your actual Supabase anon key from project settings
  
  -- Call the Edge Function to process notifications
  PERFORM
    net.http_post(
      url := api_url || '/functions/v1/process-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger process-notifications: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function when notifications are added to the queue
DROP TRIGGER IF EXISTS notification_queue_trigger ON notification_queue;

CREATE TRIGGER notification_queue_trigger
  AFTER INSERT ON notification_queue
  FOR EACH ROW
  WHEN (NEW.processed = false)
  EXECUTE FUNCTION trigger_process_notifications();
*/

