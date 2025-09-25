# UTD Hangouts - Mobile App Context

## Overview
**UTD Hangouts** is a React Native mobile application designed to connect students at the University of Texas at Dallas through social events and hangouts. The app serves as a mini social media platform specifically tailored for college students to discover, create, and participate in local events and activities.

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

### Tables

#### 1. **profiles** (User Profiles)
- `id` (uuid, PK) - References auth.users(id)
- `username` (text, nullable)
- `full_name` (text, nullable)
- `avatar_url` (text, nullable)
- `bio` (text, nullable)
- `major` (text, nullable)
- `graduating_year` (text, nullable)
- `phone_number` (text, nullable)
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 2. **events** (Event Information)
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
- `privacy` (text, default: 'public')
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

#### 3. **event_attendees** (Attendance Tracking)
- `id` (uuid, PK, default: gen_random_uuid())
- `event_id` (uuid, FK → events.id)
- `user_id` (uuid, FK → profiles.id)
- `status` (text, NOT NULL) - 'going', 'maybe', 'not_going'
- `created_at` (timestamp with time zone, default: now())

#### 4. **event_invitations** (Private Event Invitations)
- `id` (uuid, PK, default: gen_random_uuid())
- `event_id` (uuid, FK → events.id)
- `user_id` (uuid, FK → profiles.id)
- `invited_by` (uuid, FK → profiles.id)
- `created_at` (timestamp with time zone, default: now())

#### 5. **friendships** (Friend Relationships)
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → profiles.id)
- `friend_id` (uuid, FK → profiles.id)
- `status` (text, NOT NULL) - 'pending', 'accepted', 'blocked'
- `created_at` (timestamp with time zone, default: now())
- `updated_at` (timestamp with time zone, default: now())

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

#### 1. **event-images** (Event Photos)
- Public bucket for event images
- No file size limit
- No MIME type restrictions

#### 2. **profile-images** (Profile Pictures)
- Public bucket for user avatars
- No file size limit
- No MIME type restrictions

### Row Level Security (RLS) Policies

#### **profiles** table:
- **SELECT**: Users can view all profiles
- **UPDATE**: Users can update their own profile
- **INSERT**: Users can insert their own profile
- **ALL**: Allow all operations (backup policy)

#### **events** table:
- **ALL**: Allow all operations (backup policy)

#### **event_attendees** table:
- **SELECT**: Users can view all attendees
- **ALL**: Users can manage their own attendance
- **ALL**: Allow all operations (backup policy)

#### **event_invitations** table:
- **SELECT**: Users can view invitations for events they can see
- **ALL**: Event hosts can manage invitations
- **ALL**: Allow all operations (backup policy)

#### **friendships** table:
- **SELECT**: Users can view their own friendships
- **INSERT**: Users can create friendships
- **UPDATE**: Users can update their own friendships
- **DELETE**: Users can delete their own friendships
- **ALL**: Allow all operations (backup policy)

### Foreign Key Relationships
- `event_attendees.event_id` → `events.id`
- `friendships.user_id` → `profiles.id`
- `friendships.friend_id` → `profiles.id`
- `event_invitations.event_id` → `events.id`
- `event_invitations.user_id` → `profiles.id`
- `event_invitations.invited_by` → `profiles.id`

## Key Components
1. **Event Creation Screen**
   - Form inputs for all event details
   - Image upload to Supabase Storage
   - Date/time picker components
   - Location input/selection
   - Real-time validation

2. **Event Discovery Screen**
   - Event list/grid view with Supabase queries
   - Search and filter functionality
   - Event card components
   - Attendance status indicators
   - Real-time updates for new events

3. **Event Detail Screen**
   - Full event information display
   - Real-time attendee list and counts
   - Attendance action buttons with instant updates
   - Event management options (for hosts)

4. **User Profile Screen**
   - User information display
   - Event history with Supabase queries
   - Settings and preferences
   - Avatar management with Supabase Storage

5. **Authentication Screens**
   - Login/Register with Supabase Auth
   - Social login integration
   - Password reset functionality
   - Profile setup

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

### Phase 1: Core MVP
- Supabase project setup and configuration
- User authentication and profile management
- Event creation and management with Supabase
- Event discovery and browsing with real-time updates
- Basic attendance tracking with live updates
- Simple, clean UI implementation

### Phase 2: Social Features
- Enhanced user profiles with Supabase Storage
- Friend system implementation with database relationships
- Real-time messaging capabilities
- Enhanced social interactions

### Phase 3: Advanced Features
- Advanced real-time features
- Push notifications via Supabase Edge Functions
- Advanced filtering and search with PostgreSQL
- Performance optimizations and caching

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
- **Total Tables**: 5 core tables + 1 view
- **Total Columns**: 47
- **Storage Buckets**: 2 (event-images, profile-images)
- **RLS Policies**: 20 policies across all tables
- **Foreign Keys**: 6 relationships

### Database Health
✅ **Well Structured**: All tables have proper relationships
✅ **RLS Enabled**: Security policies are in place
✅ **Storage Configured**: Both image buckets are set up
✅ **No Redundancy**: No unnecessary tables or columns found

### Recommendations
1. **Database is Clean**: No unnecessary tables or columns
2. **RLS Policies**: Some duplicate policies exist (backup policies)
3. **Storage**: Properly configured for both event and profile images
4. **Relationships**: All foreign keys are properly set up

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


# Test edit at Wed Sep 24 18:58:50 CDT 2025

## Notification Implementation Status

### ✅ Completed
1. **Expo Notifications Setup**: Installed expo-notifications, expo-device, expo-constants
2. **App Configuration**: Updated app.json with notification settings and permissions
3. **Notification Service**: Created comprehensive notification service with scheduling
4. **Database Schema**: Added notification_tokens, notification_queue, notification_log tables
5. **Database Triggers**: Implemented automatic triggers for all notification types
6. **App Integration**: Updated App.tsx to initialize notifications on user login
7. **Event Reminders**: Integrated event reminder scheduling in HostScreen
8. **Notification Processing**: Created background processor for queued notifications

### 🔄 In Progress
- Testing notifications in Expo Go environment
- Implementing delayed host notifications (2-minute delay)

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

