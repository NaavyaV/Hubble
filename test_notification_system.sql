-- Test SQL to verify notification system and Edge Function
-- Run this single command to test the entire notification flow

-- Step 1: Insert a test notification into the queue
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
  (SELECT id FROM profiles WHERE otp_verified = true LIMIT 1), -- Get any verified user
  NULL, -- No specific event
  'test_notification',
  'Test Notification',
  'This is a test notification to verify the system works',
  '{"test": true}'::jsonb,
  NOW(), -- Schedule immediately
  0, -- No retries yet
  3  -- Max 3 retries
);

-- Step 2: Check if the notification was inserted
SELECT 
  id,
  user_id,
  type,
  title,
  body,
  scheduled_for,
  retry_count,
  max_retries,
  next_retry_at,
  created_at
FROM notification_queue 
WHERE type = 'test_notification'
ORDER BY created_at DESC 
LIMIT 1;

-- Step 3: Verify the trigger fired (check logs)
-- The trigger should have automatically called the Edge Function
-- Check your Supabase Edge Function logs to see if it was called

-- Step 4: After a few seconds, check if notification was processed
-- (Run this again after 10-30 seconds to see the result)
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM notification_queue WHERE type = 'test_notification') 
    THEN 'Still in queue - check Edge Function logs'
    WHEN EXISTS (SELECT 1 FROM notification_log WHERE type = 'test_notification')
    THEN 'Successfully processed and logged'
    ELSE 'Not found - may have failed or been removed'
  END as status;

-- Step 5: Clean up test data (run this after testing)
-- DELETE FROM notification_queue WHERE type = 'test_notification';
-- DELETE FROM notification_log WHERE type = 'test_notification';
