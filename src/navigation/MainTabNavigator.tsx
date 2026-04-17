import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { warmupTabCaches } from '../services/appWarmup'
import notificationService from '../services/notifications'
import { CustomTabBar } from '../components'
import EventsListScreen from '../screens/EventsListScreen'
import ProfileScreen from '../screens/ProfileScreen'
import MyEventsScreen from '../screens/MyEventsScreen'
import SocialScreen from '../screens/SocialScreen'
import LeaderboardScreen from '../screens/LeaderboardScreen'
import DiningScreen from '../screens/DiningScreen'
import OrgEventsScreen from '../screens/OrgEventsScreen'
import OrgFollowersScreen from '../screens/OrgFollowersScreen'
import OrgSettingsScreen from '../screens/OrgSettingsScreen'
import type { MainTabParamList } from './types'

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabNavigator() {
  const { isOrgMode, targetTab, setTargetTab } = useOrgMode()
  const [pendingCount, setPendingCount] = useState(0)
  const [eventInvitationsCount, setEventInvitationsCount] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const pendingRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const invitationsRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const leaderboardWarmupDone = useRef(false)
  const notifInitStarted = useRef(false)

  // Clear targetTab via effect instead of during render to avoid scheduling
  // a setTimeout inside the render body
  useEffect(() => {
    if (targetTab) {
      setTargetTab(null)
    }
  }, [targetTab, setTargetTab])

  // Resolve current user ID once on mount (from session cache — no network)
  useEffect(() => {
    getCachedUser().then(u => { if (u) setCurrentUserId(u.id) })
  }, [])

  // Notification init: deferred, non-blocking, runs once on physical devices.
  // AuthProvider already verified OTP, so skip that re-check.
  useEffect(() => {
    if (!Device.isDevice || notifInitStarted.current || !currentUserId) return
    notifInitStarted.current = true

    const timer = setTimeout(async () => {
      try {
        const { data: prefs, error: prefErr } = await supabase
          .from('notification_preferences')
          .select('push_notifications')
          .eq('user_id', currentUserId)
          .maybeSingle()

        if (prefErr && prefErr.code !== 'PGRST116') return

        let pushEnabled = prefs?.push_notifications
        if (!prefs) {
          const { data: created, error: createErr } = await supabase
            .from('notification_preferences')
            .upsert({
              user_id: currentUserId,
              push_notifications: true,
              event_reminders: true,
              going_status_updates: true,
              friend_requests: true,
              event_invitations: true,
              event_deletions: true,
            }, { onConflict: 'user_id' })
            .select('push_notifications')
            .single()
          if (createErr) return
          pushEnabled = created?.push_notifications
        }

        if (!pushEnabled) return

        const { data: existingToken } = await supabase
          .from('notification_tokens')
          .select('token')
          .eq('user_id', currentUserId)
          .eq('platform', Platform.OS)
          .maybeSingle()

        if (existingToken?.token) {
          notificationService.setToken(existingToken.token)
        } else {
          await notificationService.initialize()
        }
      } catch (err) {
        if (__DEV__) console.error('MainTabNavigator: notification init error', err)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [currentUserId])

  // Badge: pending friend requests — initial + realtime
  useEffect(() => {
    if (!currentUserId) return

    const refresh = async () => {
      try {
        const { count } = await supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .eq('friend_id', currentUserId)
          .eq('status', 'pending')
        setPendingCount(count || 0)
      } catch {}
    }

    const schedule = (ms = 250) => {
      if (pendingRefreshTimerRef.current) clearTimeout(pendingRefreshTimerRef.current)
      pendingRefreshTimerRef.current = setTimeout(refresh, ms)
    }

    schedule(0)

    const name = `friendships-changes-${currentUserId}`
    for (const ch of supabase.getChannels()) {
      if (ch.topic === name || ch.topic === `realtime:${name}` || ch.topic.endsWith(name)) {
        supabase.removeChannel(ch)
      }
    }

    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${currentUserId}` }, () => schedule())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (pendingRefreshTimerRef.current) clearTimeout(pendingRefreshTimerRef.current)
    }
  }, [currentUserId])

  // Badge: event invitations — initial + realtime
  const refreshInvitations = useCallback(async () => {
    if (!currentUserId) return
    try {
      const { data, error } = await supabase.rpc('get_pending_invitation_count', { p_user_id: currentUserId })
      if (!error) setEventInvitationsCount(data ?? 0)
    } catch {}
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return

    const schedule = (ms = 350) => {
      if (invitationsRefreshTimerRef.current) clearTimeout(invitationsRefreshTimerRef.current)
      invitationsRefreshTimerRef.current = setTimeout(refreshInvitations, ms)
    }
    schedule(0)

    const invName = `event-invitations-changes-${currentUserId}`
    const attName = `event-attendees-changes-for-invitations-${currentUserId}`
    for (const ch of supabase.getChannels()) {
      if ([invName, attName].some(n => ch.topic === n || ch.topic === `realtime:${n}` || ch.topic.endsWith(n))) {
        supabase.removeChannel(ch)
      }
    }

    const invChannel = supabase
      .channel(invName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invitations', filter: `user_id=eq.${currentUserId}` }, () => schedule())
      .subscribe()

    const attChannel = supabase
      .channel(attName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees', filter: `user_id=eq.${currentUserId}` }, () => schedule())
      .subscribe()

    return () => {
      supabase.removeChannel(invChannel)
      supabase.removeChannel(attChannel)
      if (invitationsRefreshTimerRef.current) clearTimeout(invitationsRefreshTimerRef.current)
    }
  }, [currentUserId, refreshInvitations])

  // Memoize tab bar to avoid re-creating on every render
  const renderTabBar = useCallback(
    (props: any) => <CustomTabBar {...props} pendingCount={pendingCount} eventInvitationsCount={eventInvitationsCount} />,
    [pendingCount, eventInvitationsCount]
  )
  const renderOrgTabBar = useCallback(
    (props: any) => <CustomTabBar {...props} pendingCount={0} eventInvitationsCount={0} />,
    []
  )

  if (isOrgMode) {
    const initialRoute: keyof MainTabParamList = targetTab && ['OrgEvents', 'OrgFollowers', 'OrgSettings'].includes(targetTab)
      ? (targetTab as keyof MainTabParamList)
      : 'OrgEvents'

    return (
      <Tab.Navigator
        initialRouteName={initialRoute}
        tabBar={renderOrgTabBar}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tab.Screen name="OrgEvents" component={OrgEventsScreen} options={{ title: 'Org Events' }} />
        <Tab.Screen name="OrgFollowers" component={OrgFollowersScreen} options={{ title: 'Followers' }} />
        <Tab.Screen name="OrgSettings" component={OrgSettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    )
  }

  const initialRoute: keyof MainTabParamList = targetTab && ['Leaderboard', 'MyEvents', 'ComingEvents', 'Dining', 'Social', 'Profile'].includes(targetTab)
    ? (targetTab as keyof MainTabParamList)
    : 'ComingEvents'

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ title: 'Leaders' }}
        listeners={{
          focus: () => {
            if (!leaderboardWarmupDone.current) {
              leaderboardWarmupDone.current = true
              warmupTabCaches()
            }
          }
        }}
      />
      <Tab.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{ title: 'My Events' }}
        listeners={{ focus: () => { refreshInvitations() } }}
      />
      <Tab.Screen name="ComingEvents" component={EventsListScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Dining" component={DiningScreen} options={{ title: 'Dining' }} />
      <Tab.Screen name="Social" component={SocialScreen} options={{ title: 'Social' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}
