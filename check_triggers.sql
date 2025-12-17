-- Check if triggers are working properly
-- Run these queries to diagnose the trigger system

-- 1. Check if the trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'notification_queue';

-- 2. Check if the trigger function exists
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_name LIKE '%notification%';

-- 3. Check recent notifications in queue
SELECT 
  id,
  type,
  title,
  scheduled_for,
  retry_count,
  created_at,
  CASE 
    WHEN scheduled_for <= NOW() THEN 'Ready to process'
    ELSE 'Scheduled for later'
  END as status
FROM notification_queue 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Check if any notifications were processed recently
SELECT 
  id,
  user_id,
  type,
  title,
  sent_at
FROM notification_log 
ORDER BY sent_at DESC 
LIMIT 5;

-- 5. Test the trigger manually by inserting another notification
INSERT INTO notification_queue (
  user_id,
  event_id,
  type,
  title,
  body,
  data,
  scheduled_for
) VALUES (
  (SELECT id FROM profiles WHERE otp_verified = true LIMIT 1),
  NULL,
  'trigger_test',
  'Trigger Test',
  'Testing if trigger fires',
  '{"test": true}'::jsonb,
  NOW()
);

-- 6. Check Edge Function logs (you'll need to check this in Supabase dashboard)
-- Go to: Edge Functions → process-notifications → Logs
-- Look for recent entries after running the insert above

-- 7. If trigger isn't working, check for errors
SELECT * FROM pg_stat_user_functions WHERE funcname LIKE '%notification%';
