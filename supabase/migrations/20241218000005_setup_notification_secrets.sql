-- Set up Supabase secrets for the notification system
-- These should be configured in your Supabase dashboard under Settings > API

-- Note: You need to manually set these secrets in your Supabase dashboard:
-- 1. Go to Settings > API in your Supabase dashboard
-- 2. Set the following secrets:
--    - SUPABASE_URL: Your Supabase project URL
--    - SUPABASE_SERVICE_ROLE_KEY: Your service role key
--    - SUPABASE_ANON_KEY: Your anon key
--    - SUPABASE_DB_URL: Your database URL

-- This migration just documents the required secrets
-- The actual secret values should be set through the Supabase dashboard

-- Example of how to set secrets (run these in SQL Editor if needed):
-- ALTER DATABASE postgres SET app.SUPABASE_URL = 'https://your-project-ref.supabase.co';
-- ALTER DATABASE postgres SET app.SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key';
-- ALTER DATABASE postgres SET app.SUPABASE_ANON_KEY = 'your-anon-key';
-- ALTER DATABASE postgres SET app.SUPABASE_DB_URL = 'your-database-url';
