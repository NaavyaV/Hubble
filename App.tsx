import React, { useState, useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from './src/services/supabase'
import { User, EventWithAttendees } from './src/types'
import notificationService from './src/services/notifications'
import notificationProcessor from './src/services/notificationProcessor'
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
import EditEventScreen from './src/screens/EditEventScreen'
import FriendsScreen from './src/screens/FriendsScreen'
import EventInviteScreen from './src/screens/EventInviteScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen'
import PhoneVisibilityScreen from './src/screens/PhoneVisibilityScreen'
import EventPhotoGalleryScreen from './src/screens/EventPhotoGalleryScreen'
import PhotoViewerScreen from './src/screens/PhotoViewerScreen'
import GeneralPhotoGalleryScreen from './src/screens/GeneralPhotoGalleryScreen'
import LeaderboardScreen from './src/screens/LeaderboardScreen'
import CustomTabBar from './src/components/CustomTabBar'

type RootStackParamList = {
  Auth: undefined
  Onboarding: undefined
  Main: undefined
  EventDetail: { event: EventWithAttendees }
  EditProfile: undefined
  MyEvents: undefined
  CreateEvent: undefined
  EditEvent: { event: any }
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
        const token = await notificationService.initialize()
        if (token) {
          console.log('Notifications initialized successfully')
        }
      } catch (error) {
        console.error('Error initializing notifications:', error)
      }
    }

    initializeNotifications()
    // Start notification processing
    notificationProcessor.startProcessing()
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
        if (session?.user) {
          setUser(session.user as User)
        } else {
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
      if (user) {
        setUser(user as User)
      }
    } catch (error) {
      console.error('Error checking user:', error)
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
                name="EditEvent"
                component={EditEventScreen}
                options={{
                  headerShown: false,
                }}
              />
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
                name="Onboarding" 
                component={OnboardingScreen}
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
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
