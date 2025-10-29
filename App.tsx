import React, { useState, useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import * as Updates from 'expo-updates'
import { supabase } from './src/services/supabase'
import { User, EventWithAttendees } from './src/types'
import notificationService from './src/services/notifications'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'

// Import screens
import AuthScreen from './src/screens/AuthScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import EventsListScreen from './src/screens/EventsListScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import EventDetailScreen from './src/screens/EventDetailScreen'
import EditProfileScreen from './src/screens/EditProfileScreen'
import MyEventsScreen from './src/screens/MyEventsScreen'
import CreateEventScreen from './src/screens/CreateEventScreen'
import FriendsScreen from './src/screens/FriendsScreen'
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
}

type MainTabParamList = {
  Events: undefined
  Leaderboard: undefined
  Host: undefined
  Friends: undefined
  Profile: undefined
}

const Stack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

function MainTabNavigator() {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
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

        // Step 1: Check user's notification preferences
        const { data: preferences, error: prefError } = await supabase
          .from('notification_preferences')
          .select('push_notifications')
          .eq('user_id', user.id)
          .single()

        if (prefError && prefError.code !== 'PGRST116') {
          if (__DEV__) {
            console.error('Error fetching notification preferences:', prefError)
          }
          return
        }

        // If no preferences exist or push_notifications is false, skip initialization
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

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} pendingCount={pendingCount} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Events"
        component={EventsListScreen}
        options={{ title: 'Events' }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ title: 'Leaders' }}
      />
      <Tab.Screen
        name="Host"
        options={{ title: 'Create' }}
      >
        {({ navigation }) => (
          <CreateEventScreen
            onBack={() => navigation.goBack()}
            onEventCreated={() => navigation.goBack()}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ title: 'Friends' }}
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
      <NavigationContainer>
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
      <AppContent />
    </ThemeProvider>
  )
}
