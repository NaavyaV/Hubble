-- Add phone number privacy settings to profiles table
ALTER TABLE profiles 
ADD COLUMN phone_visibility TEXT DEFAULT 'private' CHECK (phone_visibility IN ('public', 'friends_only', 'private')),
ADD COLUMN phone_visible_when_hosting BOOLEAN DEFAULT false;

-- Update existing users to have private phone visibility by default
UPDATE profiles 
SET phone_visibility = 'private', phone_visible_when_hosting = false 
WHERE phone_visibility IS NULL;

-- Add comment to explain the new columns
COMMENT ON COLUMN profiles.phone_visibility IS 'Controls who can see the phone number: public, friends_only, or private';
COMMENT ON COLUMN profiles.phone_visible_when_hosting IS 'Whether phone number is visible when hosting events (only applies if phone_visibility is private)';
