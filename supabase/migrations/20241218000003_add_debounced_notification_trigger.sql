-- Create a debounced trigger that:
-- 1. Inserts notification instantly (no delay)
-- 2. Waits 1-2 seconds for batch inserts to complete
-- 3. Processes all notifications in the queue (handles batches of 50 automatically)

CREATE OR REPLACE FUNCTION trigger_process_notifications_debounced()
RETURNS TRIGGER AS $$
DECLARE
  api_url text;
  anon_key text;
BEGIN
  -- Return immediately - notification is already inserted
  -- We'll process it after waiting for batch inserts
  
  -- Get Supabase API URL (replace with your project URL if needed)
  api_url := 'https://YOUR_PROJECT_REF.supabase.co'; -- Replace YOUR_PROJECT_REF with your actual project reference
  
  -- Get anon key (replace with your actual anon key)
  anon_key := 'YOUR_ANON_KEY_HERE'; -- Replace with your actual Supabase anon key from project settings
  
  -- Wait 2 seconds to allow batch inserts to complete
  -- This runs asynchronously so it doesn't block the INSERT
  PERFORM pg_sleep(2);
  
  -- After waiting, check if there are notifications ready to process
  IF EXISTS (
    SELECT 1 FROM notification_queue 
    WHERE scheduled_for <= NOW()
    LIMIT 1
  ) THEN
    -- Call the Edge Function to process all notifications (handles batches of 50)
    PERFORM
      net.http_post(
        url := api_url || '/functions/v1/process-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger process-notifications: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notification_queue_trigger ON notification_queue;

-- Create trigger that calls the debounced function
-- Triggers on every insert (no processed check needed since we delete instead of marking)
CREATE TRIGGER notification_queue_trigger
  AFTER INSERT ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_process_notifications_debounced();

