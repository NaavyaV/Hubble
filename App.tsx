import React, { useState, useEffect, useRef } from 'react'
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
import CustomTabBar from './src/components/CustomTabBar'

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    // Initialize notifications when user is logged in
    const initializeNotifications = async () => {
      try {
        // Add a small delay to ensure the app is fully loaded
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (__DEV__) {
            console.log('No user found, skipping notification initialization')
          }
          return
        }

        // Step 1: Check user's notification preferences (create defaults if missing)
        let preferences = null
        const { data: existingPrefs, error: prefError } = await supabase
          .from('notification_preferences')
          .select('push_notifications')
          .eq('user_id', user.id)
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
            user_id: user.id,
            push_notifications: true,
            event_reminders: true,
            going_status_updates: true,
            friend_requests: true,
            event_invitations: true,
            event_deletions: true,
          }

          const { data: newPrefs, error: createPrefError } = await supabase
            .from('notification_preferences')
            .insert(defaultPreferences)
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
          .eq('user_id', user.id)
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

    // Get pending friend request count
    const getPendingCount = async () => {
      try {
        const { count } = await supabase
          .from('friendships')
          .select('*', { count: 'exact' })
          .eq('friend_id', currentUserId)
          .eq('status', 'pending')
        
        setPendingCount(count || 0)
      } catch (error) {
        console.error('Error getting pending count:', error)
      }
    }

    getPendingCount()
  }, [currentUserId])

  // Show org mode tabs if in org mode
  if (isOrgMode) {
    // Use targetTab if set, otherwise default to OrgEvents
    const initialRoute = targetTab && ['OrgEvents', 'OrgFollowers', 'OrgSettings'].includes(targetTab) 
      ? targetTab 
      : 'OrgEvents'
    
    // Clear targetTab after using it
    if (targetTab) {
      setTimeout(() => setTargetTab(null), 100)
    }
    
    return (
      <Tab.Navigator
        initialRouteName={initialRoute}
        tabBar={(props) => <CustomTabBar {...props} pendingCount={0} />}
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
  const initialRoute = targetTab && ['Leaderboard', 'MyEvents', 'ComingEvents', 'Social', 'Profile'].includes(targetTab)
    ? targetTab
    : 'ComingEvents'
  
  // Clear targetTab after using it
  if (targetTab) {
    setTimeout(() => setTargetTab(null), 100)
  }
  
  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      tabBar={(props) => <CustomTabBar {...props} pendingCount={pendingCount} />}
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
  const { theme } = useTheme()
  const navigationRef = useRef<any>(null)

  useEffect(() => {
    // Check if user is already logged in
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (__DEV__) {
          console.log('Auth state change:', { event, session: session ? 'exists' : 'none' })
          console.log('User email confirmed:', session?.user?.email_confirmed_at)
        }
        
        if (session?.user) {
          // Add a small delay to allow profile updates to complete
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Check if user has completed OTP verification
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('otp_verified')
            .eq('id', session.user.id)
            .single()
          
          if (__DEV__) {
            console.log('Profile query result:', { profile, profileError })
            console.log('OTP verified:', profile?.otp_verified)
          }
          
          // Only allow access if OTP is verified
          if (profile?.otp_verified) {
            if (__DEV__) {
              console.log('Setting user as authenticated - OTP verified')
            }
            setUser(session.user as User)
          } else {
            if (__DEV__) {
              console.log('User OTP not verified, staying in unauthenticated flow')
            }
            setUser(null)
          }
        } else {
          if (__DEV__) {
            console.log('No session, setting user to null')
          }
          setUser(null)
        }
        setLoading(false)
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

  // Handle notification responses (when user taps on notification)
  useEffect(() => {
    if (!user) return // Don't handle notifications if user is not authenticated

    // Helper function to navigate to event detail
    const navigateToEventDetail = async (eventId: string | null | undefined) => {
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
          console.log('Fetching event for navigation:', eventId)
        }

        const { data: eventData, error } = await supabase
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

        if (error) {
          console.error('Error fetching event:', error)
          // If event doesn't exist (e.g., deleted), navigate to Events list
          if (error.code === 'PGRST116') {
            if (navigationRef.current) {
              navigationRef.current.dispatch(
                CommonActions.navigate({
                  name: 'Main',
                  params: {
                    screen: 'ComingEvents',
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
            host: eventData.host,
            attendees: eventData.attendees || []
          }

          if (__DEV__) {
            console.log('Navigating to event detail:', event.id)
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
                screen: 'ComingEvents',
              },
            })
          )
        }
      }
    }

    // Handle initial notification when app opens from notification
    const handleInitialNotification = async () => {
      const response = await Notifications.getLastNotificationResponseAsync()
      if (response) {
        const data = response.notification.request.content.data
        
        if (__DEV__) {
          console.log('Initial notification on app open:', JSON.stringify(data, null, 2))
        }

        // Wait a bit for navigation to be ready
        setTimeout(() => {
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
            return
          }

          // Handle event-related notifications
          const eventId: string | null = (data?.eventId as string) || (data?.event_id as string) || null
          if (eventId) {
            navigateToEventDetail(eventId)
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
        }, 1000) // Increased delay to ensure navigation is ready
      }
    }

    // Check for initial notification
    handleInitialNotification()

    // Handle notification responses when app is already running
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data
      
      if (__DEV__) {
        console.log('Notification tapped:', JSON.stringify(data, null, 2))
      }

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
        return
      }

      // Handle friend request notifications - navigate to Friends tab
      if (data?.type === 'friend_request') {
        if (navigationRef.current) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'Main',
              params: { screen: 'Friends' },
            })
          )
        }
        return
      }

      // Handle event-related notifications - navigate to EventDetail
      const eventId: string | null = (data?.eventId as string) || (data?.event_id as string) || null
      if (eventId) {
        navigateToEventDetail(eventId)
        return
      }

      // Default: Navigate to Events list for any other notification type
      if (navigationRef.current) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'Main',
            params: { screen: 'ComingEvents' },
          })
        )
      }
    })

    return () => subscription.remove()
  }, [user])

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (__DEV__) {
        console.log('Checking user:', user ? 'exists' : 'none')
        console.log('User email confirmed:', user?.email_confirmed_at)
      }
      
      if (user) {
        // Check if user has completed OTP verification
        const { data: profile } = await supabase
          .from('profiles')
          .select('otp_verified')
          .eq('id', user.id)
          .single()
        
        if (__DEV__) {
          console.log('OTP verified:', profile?.otp_verified)
        }
        
        // Only allow access if OTP is verified
        if (profile?.otp_verified) {
          if (__DEV__) {
            console.log('Setting user as authenticated - OTP verified')
          }
          setUser(user as User)
        } else {
          if (__DEV__) {
            console.log('User OTP not verified, staying in unauthenticated flow')
          }
          setUser(null)
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error checking user:', error)
      }
    } finally {
      setLoading(false)
    }
  }

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
  useEffect(() => {
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

    // Check for updates after a short delay to ensure app is registered
    const timer = setTimeout(() => {
      checkForUpdates()
    }, 1000)

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
