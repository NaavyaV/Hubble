# Hubble - Mobile App Context

## Overview
**Hubble** is a React Native mobile application designed to connect students at the University of Texas at Dallas through social events and hangouts. The app serves as a mini social media platform specifically tailored for college students to discover, create, and participate in local events and activities.

## Core Mission
To facilitate meaningful connections among UTD students by providing a simple, intuitive platform for organizing and discovering social events, hangouts, and activities within the campus community.

## Key Features

### Primary Features
1. **Event Hosting**
   - Create and publish events with detailed information
   - Set event parameters (date, time, location, capacity)
   - Upload optional event photos/descriptors
   - Manage event details and attendee lists

2. **Event Discovery**
   - Browse through available events
   - Filter events by date, location, or type
   - View event details and attendee information
   - Indicate attendance status (going/maybe/not going)

3. **Social Features**
   - Friend system for connecting with other students
   - Direct messaging capabilities
   - User profiles and social interactions

### Event Structure
Each event contains the following information:
- **Date**: Specific date of the event
- **Time**: Start time and end time (end time can be marked as TBD)
- **Location**: Physical location or venue
- **Capacity**: Maximum number of attendees allowed
- **Media**: Optional photo/descriptor image
- **Attendee Management**: 
  - List of confirmed attendees
  - Count of people going
  - Count of people who may be going
  - Private "not going" status (not publicly displayed)

## Technical Specifications

### Platform
- **Framework**: React Native
- **Target Platforms**: iOS and Android
- **Development Environment**: Cross-platform mobile development

### Backend & Database
- **Backend**: Supabase (PostgreSQL + Real-time + Auth + Storage)
- **Database**: PostgreSQL with real-time subscriptions
- **Authentication**: Supabase Auth with email/password and social providers
- **File Storage**: Supabase Storage for event images and user avatars
- **Real-time**: Supabase real-time subscriptions for live updates
- **API**: Auto-generated REST and GraphQL APIs

### Architecture Considerations
- **State Management**: Redux Toolkit or Zustand for global state
- **Navigation**: React Navigation for screen transitions
- **Data Persistence**: Supabase client with offline-first approach
- **Image Handling**: Supabase Storage integration with camera/image picker
- **Date/Time Management**: Native date/time pickers
- **Location Services**: GPS integration for location-based features
- **Real-time Updates**: Supabase real-time subscriptions for live event updates

## Current Database Schema (Supabase)

### Core Tables

#### 1. **profiles** (User Profiles)
- `id` (uuid, PK) - References auth.users(id)
- `username` (text, unique, nullable)
- `full_name` (text, nullable)
- `avatar_url` (text, nullable)
- `bio` (text, nullable)
- `major` (text, nullable)
- `graduating_year` (text, nullable)
- `phone_number` (text, nullable)
- `college_id` (uuid, FK → colleges.id)
- `phone_visibility` (text, default: 'private') - 'public', 'friends_only', 'private'
- `phone_visible_when_hosting` (boolean, default: false)
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 2. **colleges** (College/University Information)
- `id` (uuid, PK, default: gen_random_uuid())
- `name` (text, NOT NULL)
- `short_name` (text, NOT NULL)
- `logo_url` (text, nullable)
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 3. **events** (Event Information)
- `id` (uuid, PK, default: gen_random_uuid())
- `host_id` (uuid, FK → profiles.id)
- `title` (text, NOT NULL)
- `description` (text, nullable)
- `event_date` (date, NOT NULL)
- `start_time` (time without time zone, NOT NULL)
- `end_time` (time without time zone, nullable)
- `location` (text, NOT NULL)
- `max_attendees` (integer, nullable)
- `image_url` (text, nullable)
- `privacy` (text, default: 'public') - 'public', 'friends_only'
- `tags` (text[], default: '{}')
- `college_id` (uuid, FK → colleges.id)
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 4. **event_attendees** (Attendance Tracking)
- `id` (uuid, PK, default: gen_random_uuid())
- `event_id` (uuid, FK → events.id)
- `user_id` (uuid, FK → profiles.id)
- `status` (text, NOT NULL) - 'going', 'maybe', 'not_going'
- `created_at` (timestamp with time zone, default: now())
- **Unique Constraint**: (event_id, user_id)

#### 5. **event_invitations** (Private Event Invitations)
- `id` (uuid, PK, default: gen_random_uuid())
- `event_id` (uuid, FK → events.id)
- `user_id` (uuid, FK → profiles.id)
- `invited_by` (uuid, FK → profiles.id)
- `created_at` (timestamp with time zone, default: now())
- **Unique Constraint**: (event_id, user_id)

#### 6. **friendships** (Friend Relationships)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id)
- `friend_id` (uuid, FK → profiles.id)
- `status` (text, NOT NULL) - 'pending', 'accepted', 'blocked'
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())
- **Unique Constraint**: (user_id, friend_id)

### Photo Management Tables

#### 7. **event_photos** (Event Photos)
- `id` (uuid, PK, default: gen_random_uuid())
- `event_id` (uuid, FK → events.id)
- `uploaded_by` (uuid, FK → profiles.id)
- `image_url` (text, NOT NULL)
- `thumbnail_url` (text, nullable)
- `caption` (text, nullable)
- `privacy_level` (text, NOT NULL, default: 'attendees_only') - 'public', 'attendees_only', 'friends_only'
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 8. **photo_privacy_permissions** (Photo Access Permissions)
- `id` (uuid, PK, default: gen_random_uuid())
- `photo_id` (uuid, FK → event_photos.id)
- `user_id` (uuid, FK → profiles.id)
- `permission_type` (text, NOT NULL) - 'friend', 'attendee', 'specific_user'
- `granted_by` (uuid, FK → profiles.id)
- `created_at` (timestamp with time zone, default: now())
- **Unique Constraint**: (photo_id, user_id)

### Notification System Tables

#### 9. **notification_preferences** (User Notification Settings)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id, unique)
- `push_notifications` (boolean, default: true)
- `event_reminders` (boolean, default: true)
- `going_status_updates` (boolean, default: true)
- `friend_requests` (boolean, default: true)
- `event_invitations` (boolean, default: true)
- `event_deletions` (boolean, default: true)
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 10. **notification_tokens** (Push Notification Tokens)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id)
- `token` (text, NOT NULL)
- `platform` (text, NOT NULL) - 'ios', 'android'
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())
- **Unique Constraint**: (user_id, platform)

#### 11. **notification_queue** (Pending Notifications)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id)
- `event_id` (uuid, FK → events.id, nullable)
- `type` (text, NOT NULL)
- `title` (text, NOT NULL)
- `body` (text, NOT NULL)
- `data` (jsonb, nullable)
- `scheduled_for` (timestamp with time zone, NOT NULL)
- `processed` (boolean, default: false)
- `created_at` (timestamp with time zone, default: now())

#### 12. **notification_log** (Sent Notifications)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id)
- `event_id` (uuid, FK → events.id, nullable)
- `type` (text, NOT NULL)
- `title` (text, NOT NULL)
- `body` (text, NOT NULL)
- `data` (jsonb, nullable)
- `sent_at` (timestamp with time zone, default: now())

### Views

#### 1. **user_friends_view** (Friend List View)
- `user_id` (uuid)
- `friend_id` (uuid)
- `full_name` (text)
- `avatar_url` (text)
- `phone_number` (text)
- `major` (text)
- `graduating_year` (text)
- `bio` (text)

### Storage Buckets

#### 1. **photos** (Event and Profile Photos)
- Public bucket for all images
- No file size limit
- No MIME type restrictions
- RLS policies for secure access

### Row Level Security (RLS) Policies

#### **Core Tables**
- **profiles**: Users can view all profiles, update their own
- **colleges**: Public read access, admin write access
- **events**: Public read access, authenticated users can create/update their own
- **event_attendees**: Users can view all attendees, manage their own attendance
- **event_invitations**: Users can view invitations for events they can see, hosts can manage
- **friendships**: Users can view their own friendships, manage their own relationships

#### **Photo Management**
- **event_photos**: Complex privacy-based access (public, attendees_only, friends_only)
- **photo_privacy_permissions**: Users can view their own permissions, photo uploaders can manage

#### **Notification System**
- **notification_preferences**: Users can view/update their own preferences
- **notification_tokens**: Users can manage their own tokens
- **notification_queue**: System-managed, users can view their own queued notifications
- **notification_log**: Users can view their own notification history

### Foreign Key Relationships
- `profiles.college_id` → `colleges.id`
- `events.host_id` → `profiles.id`
- `events.college_id` → `colleges.id`
- `event_attendees.event_id` → `events.id`
- `event_attendees.user_id` → `profiles.id`
- `event_invitations.event_id` → `events.id`
- `event_invitations.user_id` → `profiles.id`
- `event_invitations.invited_by` → `profiles.id`
- `friendships.user_id` → `profiles.id`
- `friendships.friend_id` → `profiles.id`
- `event_photos.event_id` → `events.id`
- `event_photos.uploaded_by` → `profiles.id`
- `photo_privacy_permissions.photo_id` → `event_photos.id`
- `photo_privacy_permissions.user_id` → `profiles.id`
- `photo_privacy_permissions.granted_by` → `profiles.id`
- `notification_preferences.user_id` → `profiles.id`
- `notification_tokens.user_id` → `profiles.id`
- `notification_queue.user_id` → `profiles.id`
- `notification_queue.event_id` → `events.id`
- `notification_log.user_id` → `profiles.id`
- `notification_log.event_id` → `events.id`

## Key Components

### Core Screens (Implemented)
1. **Event Creation Screen** ✅
   - Form inputs for all event details
   - Image upload to Supabase Storage
   - Date/time picker components
   - Location input/selection
   - Real-time validation
   - Host auto-attendance on creation

2. **Event Discovery Screen** ✅
   - Event list/grid view with Supabase queries
   - Search and filter functionality
   - Event card components
   - Attendance status indicators
   - Real-time updates for new events
   - Auto-refresh on tab focus

3. **Event Detail Screen** ✅
   - Full event information display
   - Real-time attendee list and counts
   - Attendance action buttons with instant updates
   - Event management options (for hosts)
   - Photo gallery integration

4. **User Profile Screen** ✅
   - User information display
   - Event history with Supabase queries
   - Settings and preferences
   - Avatar management with Supabase Storage
   - Phone visibility settings

5. **Authentication Screens** ✅
   - Login/Register with Supabase Auth
   - Social login integration
   - Password reset functionality
   - Profile setup

### Additional Screens (Implemented)
6. **Photo Gallery Screens** ✅
   - Event photo gallery with privacy controls
   - General photo gallery
   - Photo viewer with full-screen display
   - Privacy-based photo access

7. **Friends Management** ✅
   - Friends list screen
   - Friend request system
   - User profile modals

8. **Settings Screens** ✅
   - Notification settings
   - Phone visibility settings
   - Profile editing

### Notification System (Implemented)
9. **Notification Processing** ✅
   - Background notification processor
   - Event reminder scheduling
   - Host notification delays
   - Push notification tokens
   - Notification preferences

## Supabase Integration Features

### Authentication
- **Email/Password**: Standard authentication flow
- **Social Providers**: Google, Apple, GitHub integration
- **Row Level Security (RLS)**: Secure data access based on user permissions
- **Session Management**: Automatic token refresh and session handling

### Real-time Capabilities
- **Live Event Updates**: Real-time notifications for new events
- **Attendance Changes**: Instant updates when users change attendance status
- **Event Modifications**: Live updates when hosts modify event details
- **User Presence**: Show when users are online/active

### Storage & Media
- **Event Images**: Secure storage and CDN delivery
- **User Avatars**: Profile picture management
- **Image Optimization**: Automatic resizing and compression
- **Access Control**: Secure file access with RLS policies

### Database Features
- **Full-text Search**: Advanced search capabilities for events
- **Geospatial Queries**: Location-based event filtering
- **Aggregations**: Real-time attendee counts and statistics
- **Triggers**: Automated database operations and notifications

## Design Guidelines

### Visual Theme
- **Style**: Simple, minimalistic, yet bold
- **Color Palette**: Light theme with subtle, non-overpowering colors
- **Typography**: Clean, readable fonts
- **Layout**: Card-based design for events
- **Icons**: Simple, intuitive iconography

### User Experience Principles
- **Simplicity**: Easy-to-use interface with minimal learning curve
- **Clarity**: Clear information hierarchy and visual feedback
- **Efficiency**: Quick event creation and discovery
- **Accessibility**: Inclusive design for all users
- **Performance**: Smooth, responsive interactions with real-time updates

### Color Scheme Suggestions
- **Primary**: Soft blues or greens (#4A90E2, #7ED321)
- **Secondary**: Warm grays (#F5F5F5, #E8E8E8)
- **Accent**: Vibrant but not overwhelming (#FF6B6B, #4ECDC4)
- **Text**: Dark grays (#333333, #666666)
- **Background**: Off-white or very light gray (#FAFAFA)

## User Flows

### Authentication Flow
1. User opens app for first time
2. Chooses to sign up or log in
3. Completes authentication via Supabase Auth
4. Sets up profile information
5. Gains access to main app features

### Event Creation Flow
1. User taps "Create Event" button
2. Fills out event form (title, description, date, time, location, capacity)
3. Uploads event photo to Supabase Storage
4. Reviews event details
5. Publishes event to Supabase database
6. Event appears in real-time for other users

### Event Discovery Flow
1. User opens app to main feed
2. App fetches events from Supabase with real-time subscription
3. Browses through available events
4. Taps on event of interest
5. Views detailed event information
6. Indicates attendance status (updates Supabase in real-time)
7. Returns to feed or explores more events

### Attendance Management Flow
1. User views event details
2. Sees current attendee count and list (real-time data)
3. Selects attendance status (Going/Maybe/Not Going)
4. Status updates in Supabase with real-time propagation
5. Host and other users see updated attendance information instantly

## Future Enhancements

### Phase 2 Features
- **Friend System**: Add/remove friends with Supabase relationships
- **Direct Messaging**: Real-time chat using Supabase real-time
- **Event Categories**: Organize events by type with database filtering
- **Push Notifications**: Supabase Edge Functions for notification triggers
- **Event Recommendations**: AI-powered suggestions using Supabase ML

### Phase 3 Features
- **Group Chats**: Event-specific messaging with Supabase real-time
- **Event Recurring**: Database triggers for repeat events
- **Campus Integration**: Connect with UTD systems via Supabase Edge Functions
- **Analytics**: Real-time metrics using Supabase analytics
- **Advanced Search**: Full-text search with PostgreSQL

## Success Metrics
- **User Engagement**: Daily active users, event creation rate
- **Event Success**: Attendance rates, event completion
- **Social Connection**: Friend connections, repeat interactions
- **User Satisfaction**: App ratings, user feedback
- **Real-time Performance**: Live update response times

## Technical Requirements
- **Minimum iOS Version**: iOS 12.0+
- **Minimum Android Version**: Android 7.0 (API level 24)
- **Device Compatibility**: Smartphones and tablets
- **Offline Capability**: Supabase offline-first with sync capabilities
- **Performance**: Smooth 60fps animations, quick load times
- **Real-time Latency**: Sub-second updates for live features

## Development Phases

### Phase 1: Core MVP ✅ COMPLETED
- ✅ Supabase project setup and configuration
- ✅ User authentication and profile management
- ✅ Event creation and management with Supabase
- ✅ Event discovery and browsing with real-time updates
- ✅ Basic attendance tracking with live updates
- ✅ Simple, clean UI implementation
- ✅ Photo upload and management
- ✅ Host auto-attendance feature
- ✅ Events auto-refresh feature

### Phase 2: Social Features ✅ COMPLETED
- ✅ Enhanced user profiles with Supabase Storage
- ✅ Friend system implementation with database relationships
- ✅ Photo gallery with privacy controls
- ✅ User profile modals and management
- ✅ Phone visibility settings
- ✅ College/university integration

### Phase 3: Notification System ✅ COMPLETED
- ✅ Complete notification architecture (4 tables)
- ✅ Event reminder scheduling (15 minutes before)
- ✅ Host notifications with user names
- ✅ Delayed notifications (2-minute delay)
- ✅ Push notification token management
- ✅ Notification preferences system
- ✅ Background notification processing

### Phase 4: Advanced Features (Future)
- Real-time messaging capabilities
- Advanced filtering and search with PostgreSQL
- Supabase Edge Functions for server-side processing
- Performance optimizations and caching
- Event categories and tags
- Advanced analytics

## Supabase Configuration

### Environment Setup
```javascript
// Supabase configuration
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

// Initialize Supabase client
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Key Dependencies
- `@supabase/supabase-js`: Main Supabase client
- `@react-native-async-storage/async-storage`: For offline storage
- `react-native-url-polyfill`: URL polyfill for React Native
- `@supabase/auth-ui-react-native`: Pre-built auth components

## Database Analysis Results

### Current Database Status
- **Total Tables**: 12 core tables + 1 view
- **Total Columns**: 89 columns across all tables
- **Storage Buckets**: 1 unified bucket (photos)
- **RLS Policies**: Comprehensive policies across all tables
- **Foreign Keys**: 20 relationships
- **Indexes**: 35+ indexes for optimal performance

### Database Health
✅ **Well Structured**: All tables have proper relationships and constraints
✅ **RLS Enabled**: Security policies are in place for all tables
✅ **Storage Configured**: Unified photos bucket with RLS policies
✅ **Performance Optimized**: Comprehensive indexing strategy
✅ **Notification System**: Complete 4-table notification architecture
✅ **Photo Management**: Advanced privacy system with permissions

### Current Data Usage
- **profiles**: 5 users
- **events**: 2 events
- **event_attendees**: 4 attendance records
- **event_photos**: 4 photos
- **notification_queue**: 10 pending notifications
- **notification_preferences**: 2 user preferences
- **friendships**: 1 friendship
- **colleges**: 1 college (UTD)

### Recommendations
1. **Database is Well-Designed**: Comprehensive schema with proper relationships
2. **Notification System**: Complete implementation with queue and logging
3. **Photo Privacy**: Advanced system but currently unused (0 records in photo_privacy_permissions)
4. **Event Invitations**: Table exists but unused (0 records)
5. **Consider Cleanup**: Remove unused tables or implement their functionality
6. **Storage**: Unified bucket approach is efficient
7. **Indexes**: Well-optimized for common queries

## Notes
- Focus on UTD student community initially
- Ensure privacy and safety features with RLS policies
- Consider moderation tools for event content
- Plan for scalability as user base grows with Supabase auto-scaling
- Maintain simple, intuitive user experience throughout development
- Leverage Supabase real-time capabilities for engaging user experience
- Implement proper error handling for network connectivity issues
- Do not start / kill the app in terminal, I as the human user will take care of that. Only let me know when / if I need to restart it.
- When giving me sql scripts, don't make a new file for it; give it to me in chat.


## Notification Requirements

### Notification Types
1. **Event Reminders**: Notify all going users 15 minutes before each event starts
2. **Host Notifications**: Notify host when a user updates going status (with 2-minute delay to prevent misclick notifications)
3. **Friend Request Notifications**: Notify a user when friend request is sent/accepted
4. **Event Deletion Notifications**: Notify a user when an event they're going to is deleted
5. **Event Invitation Notifications**: Notify a user when they're invited to an event

### Implementation Strategy
- Use Expo Notifications for local notifications
- Implement Supabase Edge Functions for server-side notification triggers
- Create notification service for managing scheduled notifications
- Use background tasks for delayed notifications (2-minute host notification delay)
- Test in Expo Go for local notifications, create development build for push notifications

## Notification Implementation Status

### ✅ Completed
1. **Expo Notifications Setup**: Installed expo-notifications, expo-device, expo-constants
2. **App Configuration**: Updated app.json with notification settings and permissions
3. **Notification Service**: Created comprehensive notification service with scheduling
4. **Database Schema**: Added 4 notification tables (preferences, tokens, queue, log)
5. **Database Triggers**: Implemented automatic triggers for all notification types
6. **App Integration**: Updated App.tsx to initialize notifications on user login
7. **Event Reminders**: Integrated event reminder scheduling in HostScreen
8. **Notification Processing**: Created background processor for queued notifications
9. **Host Auto-Attendance**: Hosts automatically marked as "going" when creating events
10. **Events Auto-Refresh**: Events automatically refresh when tab is focused
11. **Enhanced Notifications**: All notifications include user names and event titles
12. **Delayed Host Notifications**: 2-minute delay to prevent misclick notifications

### 🔄 In Progress
- Testing notifications in Expo Go environment
- Implementing notification preferences UI

### 📋 Next Steps
1. Test local notifications in Expo Go
2. Create development build for push notification testing
3. Implement Supabase Edge Functions for server-side processing
4. Add notification settings/preferences UI
5. Test all notification types end-to-end

### 🛠 Technical Implementation
- **Local Notifications**: ✅ Working in Expo Go
- **Push Notifications**: ⚠️ Requires development build
- **Database Triggers**: ✅ Automatic notification queuing
- **Background Processing**: ✅ 30-second interval processing
- **Event Reminders**: ✅ 15-minute advance scheduling
- **Delayed Notifications**: ✅ 2-minute host notification delay
- **Auto-Attendance**: ✅ Hosts automatically marked as going
- **Auto-Refresh**: ✅ Events refresh on tab focus

### 📱 Testing Strategy
1. **Expo Go**: Test local notifications and basic functionality
2. **Development Build**: Test push notifications and background processing
3. **Physical Device**: Test on real device for full notification experience
4. **Database**: Verify triggers and notification queue processing


## Updated Notification Requirements

### Enhanced Notification Types
1. **Event Reminders**: Notify all going users 15 minutes before each event starts (automatically scheduled when event is created)
2. **Host Notifications**: Notify host when a user updates going status with SPECIFIC USER NAME (with 2-minute delay to prevent misclick notifications)
3. **Friend Request Notifications**: Notify a user when friend request is sent/accepted
4. **Event Deletion Notifications**: Notify a user when an event they're going to is deleted (includes event title)
5. **Event Invitation Notifications**: Notify a user when they're invited to an event (includes inviter name and event title)

### Implementation Updates
- **Database Triggers**: Automatic notification scheduling when events are created
- **User Names**: All notifications now include specific user names instead of generic "someone"
- **Event Titles**: Notifications include event titles for better context
- **Automatic Scheduling**: Event reminders are automatically scheduled for all going users when an event is created
- **Enhanced Data**: Notifications include rich data with user names, event titles, and timestamps

### Technical Implementation
- **Database Functions**: Updated to include user names and event titles
- **Automatic Triggers**: Event reminders are scheduled automatically via database triggers
- **Enhanced Notifications**: All notifications now provide specific context about who and what
- **Improved UX**: Users get more informative notifications with names and titles


## Host Auto-Attendance Feature

### Implementation
- **Automatic Host Attendance**: When a host creates an event, they are automatically marked as "going"
- **No Self-Notifications**: Hosts don't receive notifications when they mark themselves as going
- **Immediate Attendance**: Host appears in the attendee list immediately after event creation
- **Event Reminders**: Hosts receive event reminder notifications like other attendees

### Technical Details
- **Database Insert**: Host attendance is automatically inserted into event_attendees table
- **Trigger Logic**: Updated to exclude self-notifications for hosts
- **User Experience**: Hosts see themselves as going without manual action
- **Consistent Behavior**: All attendees (including host) are treated equally for reminders

### Benefits
- **Better UX**: Hosts don't need to manually mark themselves as going
- **Consistent Data**: All events have the host as an attendee
- **Automatic Reminders**: Hosts get event reminders like other attendees
- **Reduced Friction**: One less step in the event creation process


## Events Auto-Refresh Feature

### Implementation
- **Tab Focus Refresh**: Events are automatically refreshed every time the Events tab is opened or visited
- **Real-time Updates**: Users always see the latest events without manual refresh
- **Automatic Loading**: No user action required - happens automatically on tab focus
- **Console Logging**: Debug logging to track when refresh occurs

### Technical Details
- **useFocusEffect**: React Navigation hook that triggers when tab is focused
- **Automatic fetchEvents()**: Calls the existing fetch events function
- **No Duplicate Loading**: Prevents unnecessary API calls when already loading
- **Seamless UX**: Users don't need to pull-to-refresh manually

### Benefits
- **Always Current**: Events list is always up-to-date
- **Better UX**: No manual refresh needed
- **Real-time Feel**: App feels more responsive and current
- **Reduced Friction**: One less step for users to see latest events

### User Experience
- **Tab Switch**: Switch to Events tab → Events automatically refresh
- **App Resume**: Return to app → Events automatically refresh
- **Navigation**: Navigate back to Events → Events automatically refresh
- **Consistent**: Same behavior every time the tab is accessed

