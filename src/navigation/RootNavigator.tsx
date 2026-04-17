import React, { useEffect, useRef } from 'react'
import { TouchableOpacity } from 'react-native'
import { NavigationContainer, CommonActions } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import type { RootStackParamList } from './types'
import type { EventWithAttendees } from '../types'
import { MainTabNavigator } from './MainTabNavigator'

import AuthScreen from '../screens/AuthScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import EventDetailScreen from '../screens/EventDetailScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import MyEventsScreen from '../screens/MyEventsScreen'
import CreateEventScreen from '../screens/CreateEventScreen'
import EventInviteScreen from '../screens/EventInviteScreen'
import SettingsScreen from '../screens/SettingsScreen'
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen'
import PhoneVisibilityScreen from '../screens/PhoneVisibilityScreen'
import EventPhotoGalleryScreen from '../screens/EventPhotoGalleryScreen'
import PhotoViewerScreen from '../screens/PhotoViewerScreen'
import GeneralPhotoGalleryScreen from '../screens/GeneralPhotoGalleryScreen'
import AccountVerificationScreen from '../screens/AccountVerificationScreen'
import ResetPasswordScreen from '../screens/ResetPasswordScreen'
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen'
import OrgEditScreen from '../screens/OrgEditScreen'
import LegalDocumentsScreen from '../screens/LegalDocumentsScreen'
import LegalDocumentViewerScreen from '../screens/LegalDocumentViewerScreen'

const Stack = createStackNavigator<RootStackParamList>()

function headerStyle(theme: any) {
  return {
    backgroundColor: theme.headerBackground,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
  }
}

function BackButton({ navigation, theme }: { navigation: any; theme: any }) {
  return (
    <TouchableOpacity style={{ marginLeft: 16 }} onPress={() => navigation.goBack()}>
      <Ionicons name="arrow-back" size={24} color={theme.headerText} />
    </TouchableOpacity>
  )
}

export default function RootNavigator() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigationRef = useRef<any>(null)
  const pendingNotificationRef = useRef<any>(null)
  const notificationHandledRef = useRef(false)

  // Capture cold-start notification immediately (before auth resolves)
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) pendingNotificationRef.current = response.notification.request.content.data
      })
      .catch(() => {})
  }, [])

  // Handle notification tap while app is running
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      if (user) {
        handleNotificationNavigation(data)
      } else {
        pendingNotificationRef.current = data
      }
    })
    return () => sub.remove()
  }, [user])

  // Process pending notification once user is authenticated
  useEffect(() => {
    if (!user || !pendingNotificationRef.current || notificationHandledRef.current) return
    const timer = setTimeout(() => {
      if (navigationRef.current && pendingNotificationRef.current) {
        handleNotificationNavigation(pendingNotificationRef.current)
        pendingNotificationRef.current = null
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [user])

  const handleNotificationNavigation = async (data: any) => {
    if (!data || notificationHandledRef.current) return

    const waitForNav = async (attempts = 15) => {
      for (let i = 0; i < attempts; i++) {
        if (navigationRef.current) return true
        await new Promise(r => setTimeout(r, 100))
      }
      return false
    }
    if (!(await waitForNav())) return

    const nav = navigationRef.current
    notificationHandledRef.current = true

    if (data?.test === true || data?.screen === 'Leaderboard') {
      nav.dispatch(CommonActions.navigate({ name: 'Main', params: { screen: 'Leaderboard' } }))
      return
    }
    if (data?.type === 'friend_request') {
      nav.dispatch(CommonActions.navigate({ name: 'Main', params: { screen: 'Social' } }))
      return
    }

    const eventId: string | null = data?.eventId || data?.event_id || data?.orgEventId || null
    const isOrgEvent: boolean = data?.isOrgEvent === true || !!data?.orgEventId
    if (eventId) {
      await navigateToEvent(nav, eventId, isOrgEvent)
      return
    }

    nav.dispatch(CommonActions.navigate({ name: 'Main', params: { screen: 'ComingEvents' } }))
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
            <Stack.Screen
              name="EventDetail"
              component={EventDetailScreen}
              options={({ navigation }) => ({
                headerShown: true,
                title: 'Event Details',
                headerStyle: headerStyle(theme),
                headerTintColor: theme.headerText,
                headerTitleStyle: { fontWeight: '600', fontSize: 18 },
                headerLeft: () => <BackButton navigation={navigation} theme={theme} />,
              })}
            />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="OrgEdit"
              component={OrgEditScreen}
              options={({ navigation }) => ({
                headerShown: true,
                title: 'Edit Organization',
                headerStyle: headerStyle(theme),
                headerTintColor: theme.headerText,
                headerTitleStyle: { fontWeight: '600', fontSize: 18 },
                headerLeft: () => <BackButton navigation={navigation} theme={theme} />,
              })}
            />
            <Stack.Screen
              name="MyEvents"
              component={MyEventsScreen}
              options={({ navigation }) => ({
                headerShown: true,
                title: 'My Events',
                headerStyle: headerStyle(theme),
                headerTintColor: theme.headerText,
                headerTitleStyle: { fontWeight: '600', fontSize: 18 },
                headerLeft: () => <BackButton navigation={navigation} theme={theme} />,
              })}
            />
            <Stack.Screen name="CreateEvent" options={{ headerShown: false }}>
              {({ navigation }) => (
                <CreateEventScreen onBack={() => navigation.goBack()} onEventCreated={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="EventInvite" component={EventInviteScreen} options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="PhoneVisibility" component={PhoneVisibilityScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LegalDocuments" component={LegalDocumentsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LegalDocumentViewer" component={LegalDocumentViewerScreen} options={{ headerShown: false }} />
            <Stack.Screen name="EventPhotoGallery" component={EventPhotoGalleryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="PhotoViewer" component={PhotoViewerScreen} options={{ headerShown: false }} />
            <Stack.Screen name="GeneralPhotoGallery" component={GeneralPhotoGalleryScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen as any} options={{ headerShown: false }} />
            <Stack.Screen name="AccountVerification" component={AccountVerificationScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

async function navigateToEvent(nav: any, eventId: string, isOrgEvent: boolean) {
  try {
    let eventData: any, error: any

    if (isOrgEvent) {
      const result = await supabase
        .from('org_events')
        .select(`*, org:organizations!org_events_org_id_fkey(id, name, icon), attendees:org_event_attendees(user_id, status, profiles:profiles!org_event_attendees_user_id_fkey(id, full_name, avatar_url))`)
        .eq('id', eventId)
        .single()
      eventData = result.data; error = result.error
    } else {
      const result = await supabase
        .from('events')
        .select(`*, attendees:event_attendees(user_id, status)`)
        .eq('id', eventId)
        .single()
      eventData = result.data; error = result.error

      if (eventData && !error) {
        const [hostResult, attendeeResult] = await Promise.all([
          eventData.host_id
            ? supabase.from('profiles').select('id, full_name, avatar_url').eq('id', eventData.host_id).single()
            : Promise.resolve({ data: null }),
          eventData.attendees?.length
            ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', eventData.attendees.map((a: any) => a.user_id).filter(Boolean))
            : Promise.resolve({ data: null }),
        ])
        if (hostResult.data) eventData.host = hostResult.data
        if (attendeeResult.data) {
          const map = new Map(attendeeResult.data.map((p: any) => [p.id, p]))
          eventData.attendees = eventData.attendees.map((a: any) => ({ ...a, profiles: map.get(a.user_id) || null }))
        }
      }
    }

    if (error) {
      if (error.code === 'PGRST116') {
        nav.dispatch(CommonActions.navigate({ name: 'Main', params: { screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents' } }))
      }
      return
    }

    if (eventData) {
      const event: EventWithAttendees = {
        ...eventData,
        host: isOrgEvent ? undefined : eventData.host,
        attendees: eventData.attendees || [],
        ...(isOrgEvent ? { isOrgEvent: true } : {}),
      }
      nav.dispatch(CommonActions.navigate({ name: 'EventDetail', params: { event } }))
    }
  } catch {
    nav.dispatch(CommonActions.navigate({ name: 'Main', params: { screen: isOrgEvent ? 'OrgEvents' : 'ComingEvents' } }))
  }
}
