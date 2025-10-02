-- Event Photos Table
-- Stores photos uploaded for events with privacy settings

CREATE TABLE IF NOT EXISTS event_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL, -- URL to the image in storage
    thumbnail_url TEXT, -- Optional thumbnail URL for faster loading
    caption TEXT, -- Optional caption for the photo
    privacy_level TEXT NOT NULL CHECK (privacy_level IN ('public', 'attendees_only', 'friends_only')) DEFAULT 'attendees_only',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON event_photos(event_id);
CREATE INDEX IF NOT EXISTS idx_event_photos_uploaded_by ON event_photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_event_photos_privacy_level ON event_photos(privacy_level);
CREATE INDEX IF NOT EXISTS idx_event_photos_created_at ON event_photos(created_at);

-- Photo Privacy Permissions Table
-- Stores specific user permissions for non-public photos
CREATE TABLE IF NOT EXISTS photo_privacy_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    photo_id UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_type TEXT NOT NULL CHECK (permission_type IN ('friend', 'attendee', 'specific_user')),
    granted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(photo_id, user_id)
);

-- Index for faster permission queries
CREATE INDEX IF NOT EXISTS idx_photo_permissions_photo_id ON photo_privacy_permissions(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_permissions_user_id ON photo_privacy_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_permissions_type ON photo_privacy_permissions(permission_type);

-- Function to automatically grant photo access to event attendees
CREATE OR REPLACE FUNCTION grant_photo_access_to_attendees()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run for attendees_only privacy level
    IF NEW.privacy_level = 'attendees_only' THEN
        -- Insert permissions for all attendees who went to the event
        INSERT INTO photo_privacy_permissions (photo_id, user_id, permission_type, granted_by)
        SELECT 
            NEW.id,
            ea.user_id,
            'attendee',
            NEW.uploaded_by
        FROM event_attendees ea
        WHERE ea.event_id = NEW.event_id 
        AND ea.status = 'going'
        AND ea.user_id != NEW.uploaded_by -- Don't grant permission to self
        ON CONFLICT (photo_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically grant access to attendees
CREATE TRIGGER trigger_grant_photo_access_to_attendees
    AFTER INSERT ON event_photos
    FOR EACH ROW
    EXECUTE FUNCTION grant_photo_access_to_attendees();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER trigger_update_event_photos_updated_at
    BEFORE UPDATE ON event_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_privacy_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view photos they uploaded
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

-- Policy: Users can view their own permissions
CREATE POLICY "Users can view their own permissions" ON photo_privacy_permissions
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Photo uploaders can view permissions for their photos
CREATE POLICY "Photo uploaders can view permissions for their photos" ON photo_privacy_permissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM event_photos 
            WHERE id = photo_id 
            AND uploaded_by = auth.uid()
        )
    );

-- Policy: Users can grant permissions for their photos
CREATE POLICY "Users can grant permissions for their photos" ON photo_privacy_permissions
    FOR INSERT WITH CHECK (
        auth.uid() = granted_by AND
        EXISTS (
            SELECT 1 FROM event_photos 
            WHERE id = photo_id 
            AND uploaded_by = auth.uid()
        )
    );

-- Policy: Users can revoke permissions for their photos
CREATE POLICY "Users can revoke permissions for their photos" ON photo_privacy_permissions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM event_photos 
            WHERE id = photo_id 
            AND uploaded_by = auth.uid()
        )
    );
