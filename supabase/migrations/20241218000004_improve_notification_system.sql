-- Add retry fields to notification_queue table
ALTER TABLE notification_queue 
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN max_retries INTEGER DEFAULT 3,
ADD COLUMN last_attempt_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN next_retry_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_notification_queue_retry 
ON notification_queue(next_retry_at) 
WHERE retry_count < max_retries;

-- Update the trigger function to use correct secret names
CREATE OR REPLACE FUNCTION trigger_process_notifications_immediate()
RETURNS TRIGGER AS $$
DECLARE
  api_url text;
  service_role_key text;
BEGIN
  -- Get Supabase API URL from secrets
  api_url := current_setting('app.SUPABASE_URL', true);
  
  -- Get service role key from secrets
  service_role_key := current_setting('app.SUPABASE_SERVICE_ROLE_KEY', true);
  
  -- If secrets are not available, use environment variables
  IF api_url IS NULL OR api_url = '' THEN
    -- Try to get from environment variable
    api_url := current_setting('app.SUPABASE_URL', true);
  END IF;
  
  IF service_role_key IS NULL OR service_role_key = '' THEN
    -- Fallback to anon key if service role key is not available
    service_role_key := current_setting('app.SUPABASE_ANON_KEY', true);
  END IF;
  
  -- Process notifications immediately (no delay)
  IF EXISTS (
    SELECT 1 FROM notification_queue 
    WHERE scheduled_for <= NOW()
    AND (retry_count < max_retries OR retry_count IS NULL)
    LIMIT 1
  ) THEN
    -- Call the Edge Function to process notifications
    PERFORM
      net.http_post(
        url := api_url || '/functions/v1/process-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
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

-- Drop existing trigger
DROP TRIGGER IF EXISTS notification_queue_trigger ON notification_queue;

-- Create new immediate trigger
CREATE TRIGGER notification_queue_trigger
  AFTER INSERT ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_process_notifications_immediate();
