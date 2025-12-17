-- Set up your secrets and test the notification system
-- Run these commands in your Supabase SQL Editor

-- 1. Set your secrets (replace with your actual values)
ALTER DATABASE postgres SET app.SUPABASE_URL = 'https://your-project-ref.supabase.co';
ALTER DATABASE postgres SET app.SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key';
ALTER DATABASE postgres SET app.SUPABASE_ANON_KEY = 'your-anon-key';

-- 2. Test the trigger by inserting a notification
INSERT INTO notification_queue (
  user_id,
  event_id,
  type,
  title,
  body,
  data,
  scheduled_for,
  retry_count,
  max_retries
) VALUES (
  (SELECT id FROM profiles WHERE otp_verified = true LIMIT 1),
  NULL,
  'test_notification',
  'Test Notification',
  'This is a test notification to verify the system works',
  '{"test": true}'::jsonb,
  NOW(),
  0,
  3
);

-- 3. Check if the notification was processed
-- Wait 10-30 seconds, then run this:
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM notification_queue WHERE type = 'test_notification') 
    THEN 'Still in queue - check Edge Function logs'
    WHEN EXISTS (SELECT 1 FROM notification_log WHERE type = 'test_notification')
    THEN 'Successfully processed and logged'
    ELSE 'Not found - may have failed or been removed'
  END as status;
