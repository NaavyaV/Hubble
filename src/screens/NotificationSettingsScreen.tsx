import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'
import notificationService from '../services/notifications'

interface NotificationSettings {
  pushNotifications: boolean
  eventReminders: boolean
  goingStatusUpdates: boolean
  friendRequests: boolean
  eventInvitations: boolean
  eventDeletions: boolean
}

export default function NotificationSettingsScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  const [settings, setSettings] = useState<NotificationSettings>({
    pushNotifications: true,
    eventReminders: true,
    goingStatusUpdates: true,
    friendRequests: true,
    eventInvitations: true,
    eventDeletions: true,
  })
  const [originalSettings, setOriginalSettings] = useState<NotificationSettings>({
    pushNotifications: true,
    eventReminders: true,
    goingStatusUpdates: true,
    friendRequests: true,
    eventInvitations: true,
    eventDeletions: true,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNotificationSettings()
  }, [])

  const fetchNotificationSettings = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch notification preferences from database
      const { data: preferences, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching notification settings:', error)
        return
      }

      if (preferences) {
        setSettings({
          pushNotifications: preferences.push_notifications,
          eventReminders: preferences.event_reminders,
          goingStatusUpdates: preferences.going_status_updates,
          friendRequests: preferences.friend_requests,
          eventInvitations: preferences.event_invitations,
          eventDeletions: preferences.event_deletions,
        })
        setOriginalSettings({
          pushNotifications: preferences.push_notifications,
          eventReminders: preferences.event_reminders,
          goingStatusUpdates: preferences.going_status_updates,
          friendRequests: preferences.friend_requests,
          eventInvitations: preferences.event_invitations,
          eventDeletions: preferences.event_deletions,
        })
      } else {
        // Create default preferences if none exist
        const defaultSettings = {
          push_notifications: true,
          event_reminders: true,
          going_status_updates: true,
          friend_requests: true,
          event_invitations: true,
          event_deletions: true,
        }
        
        const { error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            ...defaultSettings
          })

        if (insertError) {
          console.error('Error creating default notification preferences:', insertError)
        }
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    // If push notifications are being disabled, disable all other notifications
    if (key === 'pushNotifications' && !value) {
      setSettings(prev => ({
        ...prev,
        pushNotifications: false,
        eventReminders: false,
        goingStatusUpdates: false,
        friendRequests: false,
        eventInvitations: false,
        eventDeletions: false,
      }))
    } else {
      setSettings(prev => ({ ...prev, [key]: value }))
    }
  }

  const hasUnsavedChanges = () => {
    return JSON.stringify(settings) !== JSON.stringify(originalSettings)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if push notifications are being enabled and if user previously had them disabled
      const wasPushEnabledBefore = originalSettings.pushNotifications
      const isPushEnabledNow = settings.pushNotifications

      // Save notification preferences to database
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          push_notifications: settings.pushNotifications,
          event_reminders: settings.eventReminders,
          going_status_updates: settings.goingStatusUpdates,
          friend_requests: settings.friendRequests,
          event_invitations: settings.eventInvitations,
          event_deletions: settings.eventDeletions,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error saving notification settings:', error)
        Alert.alert('Error', 'Failed to save notification settings')
        return
      }
      
      // If push notifications are being enabled now (weren't before), check for token
      if (isPushEnabledNow && !wasPushEnabledBefore) {
        try {
          // Check if user has a token
          const { data: existingToken } = await supabase
            .from('notification_tokens')
            .select('token')
            .eq('user_id', user.id)
            .maybeSingle()

          // If no token exists, initialize notifications
          if (!existingToken || !existingToken.token) {
            const token = await notificationService.initialize()
            if (token) {
              console.log('Notification token initialized after enabling push notifications')
            } else {
              console.log('Failed to initialize notification token (permission may have been denied)')
            }
          }
        } catch (tokenError) {
          console.error('Error initializing notification token:', tokenError)
          // Don't fail the save if token initialization fails
        }
      }
      
      // Update original settings to match current settings
      setOriginalSettings({ ...settings })
      
      // Show success message
      Alert.alert('Success', 'Notification settings saved successfully!')
    } catch (error) {
      console.error('Error saving notification settings:', error)
      Alert.alert('Error', 'Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  const handleBackPress = () => {
    if (hasUnsavedChanges()) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to save them before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: handleSave }
        ]
      )
    } else {
      navigation.goBack()
    }
  }

  const SettingRow = ({ 
    title, 
    description, 
    value, 
    onValueChange, 
    icon,
    disabled = false
  }: {
    title: string
    description: string
    value: boolean
    onValueChange: (value: boolean) => void
    icon: string
    disabled?: boolean
  }) => (
    <View style={[
      styles.settingRow, 
      { backgroundColor: theme.surface, borderColor: theme.border },
      disabled && { opacity: 0.6 }
    ]}>
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name={icon as any} size={20} color={theme.primary} />
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.settingDescription, { color: theme.textSecondary }]} numberOfLines={2}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || saving}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor={value ? theme.buttonText : theme.textSecondary}
        ios_backgroundColor={theme.border}
      />
    </View>
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Notification Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>General</Text>
          <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
            Overall notification preferences
          </Text>
          
          <SettingRow
            title="Push Notifications"
            description="Enable or disable all push notifications"
            value={settings.pushNotifications}
            onValueChange={(value) => updateSetting('pushNotifications', value)}
            icon="notifications"
            disabled={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Push Notifications</Text>
          <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
            Control which notifications you receive
          </Text>
          
          <SettingRow
            title="Event Reminders"
            description="Get reminded 15 minutes before events you're going to"
            value={settings.eventReminders}
            onValueChange={(value) => updateSetting('eventReminders', value)}
            icon="time"
            disabled={!settings.pushNotifications}
          />
          
          <SettingRow
            title="Going Status Updates"
            description="Notify when someone updates their going status for your events"
            value={settings.goingStatusUpdates}
            onValueChange={(value) => updateSetting('goingStatusUpdates', value)}
            icon="people"
            disabled={!settings.pushNotifications}
          />
          
          <SettingRow
            title="Friend Requests"
            description="Notify when you receive friend requests"
            value={settings.friendRequests}
            onValueChange={(value) => updateSetting('friendRequests', value)}
            icon="person-add"
            disabled={!settings.pushNotifications}
          />
          
          <SettingRow
            title="Event Invitations"
            description="Notify when you're invited to events"
            value={settings.eventInvitations}
            onValueChange={(value) => updateSetting('eventInvitations', value)}
            icon="mail"
            disabled={!settings.pushNotifications}
          />
          
          <SettingRow
            title="Event Deletions"
            description="Notify when events you're going to are deleted"
            value={settings.eventDeletions}
            onValueChange={(value) => updateSetting('eventDeletions', value)}
            icon="trash"
            disabled={!settings.pushNotifications}
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: theme.buttonPrimary },
              (!hasUnsavedChanges() || saving) && { backgroundColor: theme.textTertiary }
            ]}
            onPress={handleSave}
            disabled={!hasUnsavedChanges() || saving}
          >
            <Text style={[styles.saveButtonText, { color: theme.buttonText }]}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
          
          {hasUnsavedChanges() && (
            <Text style={[styles.unsavedText, { color: theme.warning }]}>
              You have unsaved changes
            </Text>
          )}
          
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Changes will take effect immediately after saving.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
    minWidth: 0, // Allow shrinking
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0, // Don't shrink icon
  },
  settingText: {
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  unsavedText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
})
