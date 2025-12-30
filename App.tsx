import React, { useState, useEffect, useRef, useCallback } from 'react'
import { NavigationContainer, CommonActions } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import * as Updates from 'expo-updates'
import * as Notifications from 'expo-notifications'
import { supabase } from './src/services/supabase'
import { User, EventWithAttendees } from './src/types'
import notificationService from './src/services/notifications'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { OrgModeProvider, useOrgMode } from './src/context/OrgModeContext'
import { isEventEnded } from './src/utils/eventTimeUtils'

// Import screens
import AuthScreen from './src/screens/AuthScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import EventsListScreen from './src/screens/EventsListScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import EventDetailScreen from './src/screens/EventDetailScreen'
import EditProfileScreen from './src/screens/EditProfileScreen'
import MyEventsScreen from './src/screens/MyEventsScreen'
import CreateEventScreen from './src/screens/CreateEventScreen'
import SocialScreen from './src/screens/SocialScreen'
import EventInviteScreen from './src/screens/EventInviteScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen'
import PhoneVisibilityScreen from './src/screens/PhoneVisibilityScreen'
import EventPhotoGalleryScreen from './src/screens/EventPhotoGalleryScreen'
import PhotoViewerScreen from './src/screens/PhotoViewerScreen'
import GeneralPhotoGalleryScreen from './src/screens/GeneralPhotoGalleryScreen'
import LeaderboardScreen from './src/screens/LeaderboardScreen'
import AccountVerificationScreen from './src/screens/AccountVerificationScreen'
import ResetPasswordScreen from './src/screens/ResetPasswordScreen'
import OrgEventsScreen from './src/screens/OrgEventsScreen'
import OrgFollowersScreen from './src/screens/OrgFollowersScreen'
import OrgSettingsScreen from './src/screens/OrgSettingsScreen'
import OrgEditScreen from './src/screens/OrgEditScreen'
import { CustomTabBar } from './src/components'

type RootStackParamList = {
  Auth: undefined
  Onboarding: undefined
  AccountVerification: { email: string; userId?: string }
  ResetPassword: undefined
  Main: undefined
  EventDetail: { event: EventWithAttendees }
  EditProfile: undefined
  MyEvents: undefined
  CreateEvent: undefined
  EventInvite: { invitedUsers: string[] }
  Settings: undefined
  NotificationSettings: undefined
  PhoneVisibility: undefined
  EventPhotoGallery: { event: any, eventImages: string[] }
  PhotoViewer: { photo: any, event: any, hostProfile: any }
  GeneralPhotoGallery: undefined
  OrgEdit: undefined
}

type MainTabParamList = {
  MyEvents: undefined
  ComingEvents: undefined
  Leaderboard: undefined
  Social: undefined
  Profile: undefined
  OrgEvents: undefined
  OrgFollowers: undefined
  OrgSettings: undefined
}

const Stack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

function MainTabNavigator() {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const { isOrgMode, targetTab, setTargetTab } = useOrgMode()
  const [pendingCount, setPendingCount] = useState(0)
  const [eventInvitationsCount, setEventInvitationsCount] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    // Initialize notifications ONLY after app has loaded and user exists
    // This runs after MainTabNavigator mounts, which means app has booted
    const initializeNotifications = async () => {
      try {
        // Wait for app to fully load before initializing notifications
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Get current user
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) {
          if (__DEV__) {
            console.log('No user found, skipping notification initialization')
          }
          return
        }

        // Check if OTP is verified before initializing notifications
        const { data: profile } = await supabase
          .from('profiles')
          .select('otp_verified')
          .eq('id', currentUser.id)
          .maybeSingle()

        // Only initialize if OTP is verified (user is fully authenticated)
        if (!profile?.otp_verified) {
          if (__DEV__) {
            console.log('OTP not verified, skipping notification initialization')
          }
          return
        }

        // Step 1: Check user's notification preferences (create defaults if missing)
        let preferences = null
        const { data: existingPrefs, error: prefError } = await supabase
          .from('notification_preferences')
          .select('push_notifications')
          .eq('user_id', currentUser.id)
          .maybeSingle()

        if (prefError && prefError.code !== 'PGRST116') {
          if (__DEV__) {
            console.error('Error fetching notification preferences:', prefError)
          }
          return
        }

        // If no preferences exist, create default preferences (all enabled)
        if (!existingPrefs) {
          if (__DEV__) {
            console.log('No notification preferences found, creating defaults...')
          }
          
          const defaultPreferences = {
            user_id: currentUser.id,
            push_notifications: true,
            event_reminders: true,
            going_status_updates: true,
            friend_requests: true,
            event_invitations: true,
            event_deletions: true,
          }

          const { data: newPrefs, error: createPrefError } = await supabase
            .from('notification_preferences')
            .upsert(defaultPreferences, {
              onConflict: 'user_id'
            })
            .select('push_notifications')
            .single()

          if (createPrefError) {
            if (__DEV__) {
              console.error('Error creating default notification preferences:', createPrefError)
            }
            return
          }

          preferences = newPrefs
        } else {
          preferences = existingPrefs
        }

        // If push_notifications is false, skip initialization
        if (!preferences || !preferences.push_notifications) {
          if (__DEV__) {
            console.log('Push notifications disabled in preferences')
          }
          return
        }

        // Step 2: Check if user already has a token
        const { data: existingToken, error: tokenError } = await supabase
          .from('notification_tokens')
          .select('token')
          .eq('user_id', currentUser.id)
          .eq('platform', Platform.OS)
          .maybeSingle()

        if (tokenError) {
          if (__DEV__) {
            console.error('Error checking existing token:', tokenError)
          }
          return
        }

        // If user has preferences enabled but no token, initialize notifications
        if (!existingToken || !existingToken.token) {
          if (__DEV__) {
            console.log('Notification preferences enabled but no token found, initializing...')
          }
          
          const token = await notificationService.initialize()
          if (token) {
            if (__DEV__) {
              console.log('Notifications initialized successfully and token saved')
            }
          } else {
            if (__DEV__) {
              console.log('Failed to initialize notifications (permission may have been denied)')
            }
          }
        } else {
          if (__DEV__) {
            console.log('Notification token already exists, skipping initialization')
          }
          // Update the service with existing token
          notificationService.setToken(existingToken.token)
        }
      } catch (error) {
        if (__DEV__) {
          console.error('Error initializing notifications:', error)
        }
        // Don't let notification errors crash the app
      }
    }

    // Only initialize notifications if we're on a device
    if (Device.isDevice) {
      initializeNotifications()
    }
  }, [])

  useEffect(() => {
    // Get current user ID
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getCurrentUser()
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    
    // Function to refresh pending count
    const refreshPendingCount = async () => {
      try {
        const { count } = await supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .eq('friend_id', currentUserId)
          .eq('status', 'pending')
        
        setPendingCount(count || 0)
      } catch (error) {
        console.error('Error getting pending count:', error)
      }
    }
    
    // Initial refresh
    refreshPendingCount()
    
    // Set up real-time subscription for friendships changes
    // Listen for changes where current user is the recipient (friend_id)
    const channel = supabase
      .channel(`friendships-changes-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `friend_id=eq.${currentUserId}`
        },
        (payload) => {
          // Refresh count when friendships change
          refreshPendingCount()
        }
      )
      .subscribe()

    // Also set up a fallback: refresh every 30 seconds as backup (in case realtime has issues)
    const intervalId = setInterval(() => {
      refreshPendingCount()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(intervalId)
    }
  }, [currentUserId])

  // Function to refresh event invitations count
  const refreshEventInvitationsCount = useCallback(async () => {
    if (!currentUserId) return
    
    try {
      // Get all invitations for the user
      const { data: invitations, error: invitationsError } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', currentUserId)

      if (invitationsError) throw invitationsError

      if (!invitations || invitations.length === 0) {
        setEventInvitationsCount(0)
        return
      }

      const invitedEventIds = invitations.map(inv => inv.event_id)

      if (invitedEventIds.length === 0) {
        setEventInvitationsCount(0)
        return
      }

      // Fetch the events to filter out ended events and events user is hosting
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, event_date, start_time, end_time, host_id')
        .in('id', invitedEventIds)
        .neq('host_id', currentUserId) // Exclude events user is hosting

      if (eventsError) throw eventsError

      if (!events || events.length === 0) {
        setEventInvitationsCount(0)
        return
      }

      // Fetch events user marked as "not going" to exclude them
      const { data: notGoingAttendances, error: notGoingError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', currentUserId)
        .eq('status', 'not_going')
        .in('event_id', invitedEventIds)

      if (notGoingError) throw notGoingError

      const notGoingEventIds = new Set((notGoingAttendances || []).map(a => a.event_id))

      // Fetch events user is already attending to exclude them (matches Invited tab logic)
      const { data: attendingData, error: attendingError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', currentUserId)
        .eq('status', 'going')
        .in('event_id', invitedEventIds)

      if (attendingError) throw attendingError

      const attendingEventIds = new Set((attendingData || []).map(a => a.event_id))

      // Filter out ended events, events user marked as "not going", and events user is already attending
      // This matches the count shown next to "Invited" tab in MyEventsScreen
      const pendingInvitations = events.filter(event => {
        // Exclude ended events
        if (isEventEnded(event.event_date, event.start_time, event.end_time || undefined)) {
          return false
        }
        // Exclude events user marked as "not going"
        if (notGoingEventIds.has(event.id)) {
          return false
        }
        // Exclude events user is already attending
        if (attendingEventIds.has(event.id)) {
          return false
        }
        return true
      })

      setEventInvitationsCount(pendingInvitations.length)
    } catch (error) {
      console.error('Error getting event invitations count:', error)
    }
  }, [currentUserId])

  // Set up event invitations count tracking
  useEffect(() => {
    if (!currentUserId) return
    
    // Initial refresh
    refreshEventInvitationsCount()
    
    // Set up real-time subscription for event_invitations changes
    const channel = supabase
      .channel(`event-invitations-changes-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_invitations',
          filter: `user_id=eq.${currentUserId}`
        },
        () => {
          // Refresh count when invitations change
          refreshEventInvitationsCount()
        }
      )
      .subscribe()

    // Also subscribe to events table changes to handle event updates (e.g., events ending)
    const eventsChannel = supabase
      .channel(`events-changes-for-invitations-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events'
        },
        () => {
          // Refresh count when events change (could affect whether invitations are pending)
          refreshEventInvitationsCount()
        }
      )
      .subscribe()

    // Subscribe to event_attendees changes to track when user marks events as "not going"
    const attendeesChannel = supabase
      .channel(`event-attendees-changes-for-invitations-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_attendees',
          filter: `user_id=eq.${currentUserId}`
        },
        () => {
          // Refresh count when attendance status changes (e.g., user marks as "not going")
          refreshEventInvitationsCount()
        }
      )
      .subscribe()

    // Also set up a fallback: refresh every 30 seconds as backup (in case realtime has issues)
    const intervalId = setInterval(() => {
      refreshEventInvitationsCount()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(attendeesChannel)
      clearInterval(intervalId)
    }
  }, [currentUserId, refreshEventInvitationsCount])

  // Show org mode tabs if in org mode
  if (isOrgMode) {
    // Use targetTab if set, otherwise default to OrgEvents
    const initialRoute: keyof MainTabParamList = targetTab && ['OrgEvents', 'OrgFollowers', 'OrgSettings'].includes(targetTab) 
      ? (targetTab as keyof MainTabParamList)
      : 'OrgEvents'
    
    // Clear targetTab after using it
    if (targetTab) {
      setTimeout(() => setTargetTab(null), 100)
    }
    
    return (
      <Tab.Navigator
        initialRouteName={initialRoute}
        tabBar={(props) => <CustomTabBar {...props} pendingCount={0} eventInvitationsCount={0} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="OrgEvents"
          component={OrgEventsScreen}
          options={{ title: 'Org Events' }}
        />
        <Tab.Screen
          name="OrgFollowers"
          component={OrgFollowersScreen}
          options={{ title: 'Followers' }}
        />
        <Tab.Screen
          name="OrgSettings"
          component={OrgSettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    )
  }

  // Show regular tabs if not in org mode
  // Use targetTab if set, otherwise default to ComingEvents
  const initialRoute: keyof MainTabParamList = targetTab && ['Leaderboard', 'MyEvents', 'ComingEvents', 'Social', 'Profile'].includes(targetTab)
    ? (targetTab as keyof MainTabParamList)
    : 'ComingEvents'
  
  // Clear targetTab after using it
  if (targetTab) {
    setTimeout(() => setTargetTab(null), 100)
  }
  
  return (
      <Tab.Navigator
        initialRouteName={initialRoute}
        tabBar={(props) => <CustomTabBar {...props} pendingCount={pendingCount} eventInvitationsCount={eventInvitationsCount} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ title: 'Leaders' }}
        />
        <Tab.Screen
          name="MyEvents"
          component={MyEventsScreen}
          options={{ title: 'My Events' }}
          listeners={{
            focus: async () => {
              // Refresh event invitations count when MyEvents tab is focused
              refreshEventInvitationsCount()
            }
          }}
        />
      <Tab.Screen
        name="ComingEvents"
        component={EventsListScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{ title: 'Social' }}
        listeners={{
          focus: async () => {
            // Refresh pending count when Social tab is focused
            if (currentUserId) {
              try {
                const { count } = await supabase
                  .from('friendships')
                  .select('*', { count: 'exact', head: true })
                  .eq('friend_id', currentUserId)
                  .eq('status', 'pending')
                
                setPendingCount(count || 0)
              } catch (error) {
                console.error('Error refreshing pending count:', error)
              }
            }
          }
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  )
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [otpChecked, setOtpChecked] = useState(false)
  const { theme } = useTheme()
  const navigationRef = useRef<any>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasSetLoadingFalseRef = useRef(false)
  const pendingNotificationRef = useRef<any>(null)
  const notificationHandledRef = useRef(false)

  // Fail-safe loading timeout - ensures app never gets stuck
  useEffect(() => {
    loadingTimeoutRef.current = setTimeout(() => {
      if (!hasSetLoadingFalseRef.current) {
        if (__DEV__) {
          console.warn('Loading timeout reached - forcing loading to false')
        }
        setLoading(false)
        hasSetLoadingFalseRef.current = true
      }
    }, 3000) // 3 second timeout

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  // Safe function to set loading to false (only once)
  const safeSetLoadingFalse = () => {
    if (!hasSetLoadingFalseRef.current) {
      hasSetLoadingFalseRef.current = true
      setLoading(false)
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
    }
  }

  useEffect(() => {
    // Single source of truth: ONLY use onAuthStateChange for auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (__DEV__) {
          console.log('Auth state change:', { event, session: session ? 'exists' : 'none' })
        }
        
        if (session?.user) {
          // Immediately set user and stop loading - don't block on profile checks
          setUser(session.user as User)
          safeSetLoadingFalse()
          
          // Check OTP verification asynchronously AFTER auth is set (non-blocking)
          // This allows the app to boot even if profile query fails
          const checkOtpVerification = async () => {
            try {
              // Wait a bit for navigation to be ready
              await new Promise(resolve => setTimeout(resolve, 300))
              
              const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('otp_verified')
                .eq('id', session.user.id)
                .maybeSingle()
              
              if (__DEV__) {
                console.log('OTP check result:', { otp_verified: profile?.otp_verified, error: profileError })
              }
              
              // If OTP is not verified, redirect to verification screen (non-blocking)
              if (!profile?.otp_verified) {
                if (__DEV__) {
                  console.log('OTP not verified - redirecting to verification screen')
                }
                setUser(null) // Clear user to show auth flow
                setOtpChecked(true)
                
                // Navigate to verification screen - wait for navigation to be ready
                const maxAttempts = 20
                let attempts = 0
                const tryNavigate = () => {
                  attempts++
                  if (navigationRef.current) {
                    try {
                      navigationRef.current.dispatch(
                        CommonActions.navigate({
                          name: 'AccountVerification',
                          params: {
                            email: session.user.email || '',
                            userId: session.user.id,
                          },
                        })
                      )
                    } catch (navError) {
                      if (__DEV__) {
                        console.error('Navigation error:', navError)
                      }
                      if (attempts < maxAttempts) {
                        setTimeout(tryNavigate, 100)
                      }
                    }
                  } else if (attempts < maxAttempts) {
                    setTimeout(tryNavigate, 100)
                  }
                }
                tryNavigate()
              } else {
                setOtpChecked(true)
              }
            } catch (error) {
              if (__DEV__) {
                console.error('Error checking OTP verification:', error)
              }
              // Don't block app if profile check fails - user is already set
              setOtpChecked(true)
            }
          }
          
          // Run OTP check asynchronously (non-blocking)
          checkOtpVerification()
        } else {
          // No session - clear user and stop loading immediately
          setUser(null)
          setOtpChecked(true)
          safeSetLoadingFalse()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Helper function to navigate to a tab screen
  const navigateToTab = (tabName: string) => {
    if (!navigationRef.current) return
    
    // Use CommonActions to properly navigate to nested tab
    navigationRef.current.dispatch(
      CommonActions.navigate({
        name: 'Main',
        params: {
          screen: tabName,
        },
      })
    )
  }

  // Check for initial notification when app opens (runs immediately, even before auth)
  useEffect(() => {
    const checkInitialNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync()
        if (response) {
          pendingNotificationRef.current = response.notification.request.content.data
          if (__DEV__) {
            console.log('Stored pending notification on app open:', JSON.stringify(pendingNotificationRef.current, null, 2))
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.error('Error checking initial notification:', error)
        }
      }
    }
    
    checkInitialNotification()
  }, [])

  // Handle notification responses (when user taps on notification)
  useEffect(() => {
    // Helper function to navigate to event detail
    const navigateToEventDetail = async (eventId: string | null | undefined, isOrgEvent: boolean = false) => {
      if (!eventId) {
        if (__DEV__) {
          console.log('No eventId in notification data')
        }
        return
      }

      // Wait for navigation to be ready
      const waitForNavigation = (maxAttempts = 10) => {
        return new Promise<void>((resolve) => {
          let attempts = 0
          const checkNavigation = () => {
            attempts++
            if (navigationRef.current || attempts >= maxAttempts) {
              resolve()
            } else {
              setTimeout(checkNavigation, 100)
            }
          }
          checkNavigation()
        })
      }

      await waitForNavigation()

      if (!navigationRef.current) {
        if (__DEV__) {
          console.error('Navigation ref not available')
        }
        return
      }

      try {
        if (__DEV__) {
          console.log(`Fetching ${isOrgEvent ? 'org ' : ''}event for navigation:`, eventId)
        }

        let eventData, error

        if (isOrgEvent) {
          // Fetch org event
          const result = await supabase
            .from('org_events')
            .select(`
              *,
              org:organizations!org_events_org_id_fkey(id, name, icon),
              attendees:org_event_attendees(
                user_id,
                status,
                profiles:profiles!org_event_attendees_user_id_fkey(id, full_name, avatar_url)
              )
            `)
            .eq('id', eventId)
            .single()
          eventData = result.data
          error = result.error
        } else {
          // Fetch regular event
          const result = await supabase
            .from('events')
            .select(`
              *,
              host:profiles!events_host_id_fkey(id, full_name, avatar_url),
              attendees:event_attendees(
                user_id,
                status,
                profiles:profiles!event_attendees_user_id_fkey(id, full_name, avatar_url)
              )
            `)
            .eq('id', eventId)
            .single()
          eventData = result.data
          error = result.error
        }

        if (error) {
          console.error('Error fetching event:', error)
          // If event doesn't exist (e.g., deleted), navigate to Events list
          if (error.code === 'PGRST116') {
            if (navigationRef.current) {
              navigationRef.current.dispatch(
                CommonActions.navigate({
                  name: 'Main',
                  params: {
                    screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents',
                  },
                })
              )
            }
          }
          return
        }

        if (eventData && navigationRef.current) {
          // Transform the data to match EventWithAttendees type
          const event: EventWithAttendees = {
            ...eventData,
            host: isOrgEvent ? undefined : eventData.host,
            attendees: eventData.attendees || [],
            // Add isOrgEvent flag for EventDetailScreen to recognize it
            ...(isOrgEvent ? { isOrgEvent: true } : {})
          }

          if (__DEV__) {
            console.log(`Navigating to ${isOrgEvent ? 'org ' : ''}event detail:`, event.id)
          }

          // Navigate to EventDetail screen
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'EventDetail',
              params: { event },
            })
          )
        }
      } catch (error) {
        console.error('Error navigating to event:', error)
        // Fallback to Events list if navigation fails
        if (navigationRef.current) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'Main',
              params: {
                screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents',
              },
            })
          )
        }
      }
    }

    // Handle pending notification (from cold start) or current notification
    const handleNotification = async (data: any, isPending = false) => {
      if (!data) return
      
      if (__DEV__) {
        console.log(`Handling ${isPending ? 'pending' : 'current'} notification:`, JSON.stringify(data, null, 2))
      }

      // Wait for navigation to be ready and user to be authenticated
      const waitForReady = async (maxAttempts = 30) => {
        for (let i = 0; i < maxAttempts; i++) {
          if (navigationRef.current && user && !loading && otpChecked) {
            return true
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        return false
      }

      const isReady = await waitForReady()
      if (!isReady) {
        if (__DEV__) {
          console.warn('Navigation not ready after waiting, skipping notification handling')
        }
        return
      }

      // Additional small delay to ensure navigation is fully initialized
      await new Promise(resolve => setTimeout(resolve, 300))

      // Handle test notifications - navigate to Leaderboard tab
      if (data?.test === true || data?.screen === 'Leaderboard') {
        if (navigationRef.current) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'Main',
              params: { screen: 'Leaderboard' },
            })
          )
        }
        notificationHandledRef.current = true
        return
      }

      // Handle friend request notifications
      if (data?.type === 'friend_request') {
        if (navigationRef.current) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'Main',
              params: { screen: 'Social' },
            })
          )
        }
        notificationHandledRef.current = true
        return
      }

      // Handle event-related notifications
      const eventId: string | null = (data?.eventId as string) || (data?.event_id as string) || (data?.orgEventId as string) || null
      const isOrgEvent: boolean = data?.isOrgEvent === true || !!data?.orgEventId
      
      if (eventId) {
        await navigateToEventDetail(eventId, isOrgEvent)
        notificationHandledRef.current = true
        return
      }

      // Default: Navigate to Events list
      if (navigationRef.current) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'Main',
            params: { screen: 'ComingEvents' },
          })
        )
      }
      notificationHandledRef.current = true
    }

    // Handle notification responses when app is already running
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data
      
      if (__DEV__) {
        console.log('Notification tapped (app running):', JSON.stringify(data, null, 2))
      }

      // Only handle if user is authenticated
      if (user && !loading && otpChecked) {
        handleNotification(data, false)
      } else {
        // Store for later if not ready
        pendingNotificationRef.current = data
        if (__DEV__) {
          console.log('User not ready, storing notification for later')
        }
      }
    })

    return () => subscription.remove()
  }, [user, loading, otpChecked])

  // Handle pending notification when user becomes authenticated (from cold start)
  useEffect(() => {
    if (pendingNotificationRef.current && !notificationHandledRef.current && user && !loading && otpChecked) {
      // Small delay to ensure navigation is ready
      const timer = setTimeout(() => {
        if (navigationRef.current && pendingNotificationRef.current) {
          const data = pendingNotificationRef.current
          
          // Use the same handleNotification logic but we need to call it
          // Since handleNotification is in the other useEffect, we'll handle it here
          const handlePendingNotification = async () => {
            // Wait for navigation to be fully ready
            await new Promise(resolve => setTimeout(resolve, 300))
            
            // Handle test notifications
            if (data?.test === true || data?.screen === 'Leaderboard') {
              navigationRef.current?.dispatch(
                CommonActions.navigate({
                  name: 'Main',
                  params: { screen: 'Leaderboard' },
                })
              )
              notificationHandledRef.current = true
              pendingNotificationRef.current = null
              return
            }

            // Handle friend request notifications
            if (data?.type === 'friend_request') {
              navigationRef.current?.dispatch(
                CommonActions.navigate({
                  name: 'Main',
                  params: { screen: 'Social' },
                })
              )
              notificationHandledRef.current = true
              pendingNotificationRef.current = null
              return
            }

            // Handle event-related notifications
            const eventId: string | null = (data?.eventId as string) || (data?.event_id as string) || (data?.orgEventId as string) || null
            const isOrgEvent: boolean = data?.isOrgEvent === true || !!data?.orgEventId
            
            if (eventId) {
              try {
                let eventData, error

                if (isOrgEvent) {
                  // Fetch org event
                  const result = await supabase
                    .from('org_events')
                    .select(`
                      *,
                      org:organizations!org_events_org_id_fkey(id, name, icon),
                      attendees:org_event_attendees(
                        user_id,
                        status,
                        profiles:profiles!org_event_attendees_user_id_fkey(id, full_name, avatar_url)
                      )
                    `)
                    .eq('id', eventId)
                    .single()
                  eventData = result.data
                  error = result.error
                } else {
                  // Fetch regular event
                  const result = await supabase
                    .from('events')
                    .select(`
                      *,
                      host:profiles!events_host_id_fkey(id, full_name, avatar_url),
                      attendees:event_attendees(
                        user_id,
                        status,
                        profiles:profiles!event_attendees_user_id_fkey(id, full_name, avatar_url)
                      )
                    `)
                    .eq('id', eventId)
                    .single()
                  eventData = result.data
                  error = result.error
                }

                if (error) {
                  console.error('Error fetching event:', error)
                  if (error.code === 'PGRST116') {
                    navigationRef.current?.dispatch(
                      CommonActions.navigate({
                        name: 'Main',
                        params: { screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents' },
                      })
                    )
                  }
                  notificationHandledRef.current = true
                  pendingNotificationRef.current = null
                  return
                }

                if (eventData && navigationRef.current) {
                  const event: EventWithAttendees = {
                    ...eventData,
                    host: isOrgEvent ? undefined : eventData.host,
                    attendees: eventData.attendees || [],
                    // Add isOrgEvent flag for EventDetailScreen to recognize it
                    ...(isOrgEvent ? { isOrgEvent: true } : {})
                  }

                  navigationRef.current.dispatch(
                    CommonActions.navigate({
                      name: 'EventDetail',
                      params: { event },
                    })
                  )
                }
              } catch (error) {
                console.error('Error navigating to event:', error)
                navigationRef.current?.dispatch(
                  CommonActions.navigate({
                    name: 'Main',
                    params: { screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents' },
                  })
                )
              }
              notificationHandledRef.current = true
              pendingNotificationRef.current = null
              return
            }

            // Default: Navigate to Events list
            navigationRef.current?.dispatch(
              CommonActions.navigate({
                name: 'Main',
                params: { screen: 'ComingEvents' },
              })
            )
            notificationHandledRef.current = true
            pendingNotificationRef.current = null
          }
          
          handlePendingNotification()
        }
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [user, loading, otpChecked])


  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
          <Text style={{ color: theme.text }}>Loading...</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator>
          {user ? (
            <>
              <Stack.Screen
                name="Main"
                component={MainTabNavigator}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="EventDetail"
                component={EventDetailScreen}
                options={({ navigation }) => ({
                  headerShown: true,
                  title: 'Event Details',
                  headerStyle: { 
                    backgroundColor: theme.headerBackground,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.headerBorder,
                  },
                  headerTintColor: theme.headerText,
                  headerTitleStyle: { 
                    fontWeight: '600',
                    fontSize: 18,
                  },
                  headerLeft: () => (
                    <TouchableOpacity
                      style={{ marginLeft: 16 }}
                      onPress={() => navigation.goBack()}
                    >
                      <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                  ),
                })}
              />
              <Stack.Screen
                name="EditProfile"
                component={EditProfileScreen}
                options={{
                  headerShown: true,
                  title: 'Edit Profile',
                  headerStyle: { 
                    backgroundColor: theme.headerBackground,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.headerBorder,
                  },
                  headerTintColor: theme.headerText,
                  headerTitleStyle: { 
                    fontWeight: '600',
                    fontSize: 18,
                  },
                }}
              />
              <Stack.Screen
                name="OrgEdit"
                component={OrgEditScreen}
                options={({ navigation }) => ({
                  headerShown: true,
                  title: 'Edit Organization',
                  headerStyle: { 
                    backgroundColor: theme.headerBackground,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.headerBorder,
                  },
                  headerTintColor: theme.headerText,
                  headerTitleStyle: { 
                    fontWeight: '600',
                    fontSize: 18,
                  },
                  headerLeft: () => (
                    <TouchableOpacity
                      style={{ marginLeft: 16 }}
                      onPress={() => navigation.goBack()}
                    >
                      <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                  ),
                })}
              />
              <Stack.Screen
                name="MyEvents"
                component={MyEventsScreen}
                options={({ navigation }) => ({
                  headerShown: true,
                  title: 'My Events',
                  headerStyle: { 
                    backgroundColor: theme.headerBackground,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.headerBorder,
                  },
                  headerTintColor: theme.headerText,
                  headerTitleStyle: { 
                    fontWeight: '600',
                    fontSize: 18,
                  },
                  headerLeft: () => (
                    <TouchableOpacity
                      style={{ marginLeft: 16 }}
                      onPress={() => navigation.goBack()}
                    >
                      <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                  ),
                })}
              />
              <Stack.Screen
                name="CreateEvent"
                options={{
                  headerShown: false,
                }}
              >
                {({ navigation }) => (
                  <CreateEventScreen
                    onBack={() => navigation.goBack()}
                    onEventCreated={() => navigation.goBack()}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="EventInvite"
                component={EventInviteScreen}
                options={{
                  headerShown: false,
                  presentation: 'modal',
                }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="NotificationSettings"
                component={NotificationSettingsScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="PhoneVisibility"
                component={PhoneVisibilityScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="EventPhotoGallery"
                component={EventPhotoGalleryScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="PhotoViewer"
                component={PhotoViewerScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="GeneralPhotoGallery"
                component={GeneralPhotoGalleryScreen}
                options={{
                  headerShown: false,
                }}
              />
            </>
          ) : (
            <>
              <Stack.Screen 
                name="Auth" 
                component={AuthScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen 
                name="ResetPassword" 
                component={ResetPasswordScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen 
                name="Onboarding" 
                component={OnboardingScreen as any}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen 
                name="AccountVerification" 
                component={AccountVerificationScreen}
                options={{
                  headerShown: false,
                }}
              />
            </>
          )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    )
  }
export default function App() {
  // Expo Updates must not block startup - run AFTER initial render with delay
  useEffect(() => {
    // Wait for app to fully load before checking for updates
    // This ensures updates never block startup or interfere with loading state
    const timer = setTimeout(() => {
      async function checkForUpdates() {
        try {
          // Only check for updates in production builds with Updates enabled
          if (__DEV__) {
            return
          }

          // Check if Updates is available and enabled
          if (!Updates.isEnabled || !Updates.checkForUpdateAsync) {
            return
          }

          const update = await Updates.checkForUpdateAsync()
          if (update.isAvailable) {
            console.log('Update available, fetching...')
            await Updates.fetchUpdateAsync()
            console.log('Update fetched, reloading...')
            // reload to apply update immediately
            await Updates.reloadAsync()
          }
        } catch (e) {
          console.log('EAS update check failed:', e)
          // Don't let update check errors break the app
        }
      }

      checkForUpdates()
    }, 8000) // 8 second delay - ensures app has fully booted

    return () => clearTimeout(timer)
  }, [])

  return (
    <ThemeProvider>
      <OrgModeProvider>
        <AppContent />
      </OrgModeProvider>
    </ThemeProvider>
  )
}
