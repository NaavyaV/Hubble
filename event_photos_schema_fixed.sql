-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own photos" ON event_photos;
DROP POLICY IF EXISTS "Anyone can view public photos" ON event_photos;
DROP POLICY IF EXISTS "Attendees can view attendees_only photos" ON event_photos;
DROP POLICY IF EXISTS "Friends can view friends_only photos" ON event_photos;
DROP POLICY IF EXISTS "Users can view photos with explicit permissions" ON event_photos;
DROP POLICY IF EXISTS "Users can upload photos for events they attended or hosted" ON event_photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON event_photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON event_photos;

-- Simplified RLS policies to avoid recursion
-- Policy: Users can view their own photos
CREATE POLICY "Users can view their own photos" ON event_photos
    FOR SELECT USING (auth.uid() = uploaded_by);

-- Policy: Users can view public photos
CREATE POLICY "Anyone can view public photos" ON event_photos
    FOR SELECT USING (privacy_level = 'public');

-- Policy: Event attendees can view attendees_only photos
CREATE POLICY "Attendees can view attendees_only photos" ON event_photos
    FOR SELECT USING (
        privacy_level = 'attendees_only' 
        AND EXISTS (
            SELECT 1 FROM event_attendees 
            WHERE event_id = event_photos.event_id 
            AND user_id = auth.uid() 
            AND status = 'going'
        )
    );

-- Policy: Friends can view friends_only photos (if friendship exists)
CREATE POLICY "Friends can view friends_only photos" ON event_photos
    FOR SELECT USING (
        privacy_level = 'friends_only' 
        AND EXISTS (
            SELECT 1 FROM friendships 
            WHERE (
                (user_id = auth.uid() AND friend_id = uploaded_by AND status = 'accepted')
                OR 
                (friend_id = auth.uid() AND user_id = uploaded_by AND status = 'accepted')
            )
        )
    );

-- Policy: Users can insert photos for events they attended or hosted
CREATE POLICY "Users can upload photos for events they attended or hosted" ON event_photos
    FOR INSERT WITH CHECK (
        auth.uid() = uploaded_by AND (
            -- User is the host of the event
            EXISTS (SELECT 1 FROM events WHERE id = event_id AND host_id = auth.uid())
            OR
            -- User attended the event
            EXISTS (SELECT 1 FROM event_attendees WHERE event_id = event_id AND user_id = auth.uid() AND status = 'going')
        )
    );

-- Policy: Users can update their own photos
CREATE POLICY "Users can update their own photos" ON event_photos
    FOR UPDATE USING (auth.uid() = uploaded_by);

-- Policy: Users can delete their own photos
CREATE POLICY "Users can delete their own photos" ON event_photos
    FOR DELETE USING (auth.uid() = uploaded_by);
