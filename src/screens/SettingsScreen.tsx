import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'
import notificationService from '../services/notifications'
import { isEventEnded } from '../utils/eventTimeUtils'

export default function SettingsScreen() {
  const navigation = useNavigation()
  const { theme, themeMode, setThemeMode, isDark } = useTheme()
  const [deleting, setDeleting] = useState(false)
  const [showEditPhoneModal, setShowEditPhoneModal] = useState(false)
  const [editPhoneValue, setEditPhoneValue] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: 'sunny' },
    { value: 'dark' as const, label: 'Dark', icon: 'moon' },
    { value: 'system' as const, label: 'System', icon: 'phone-portrait' },
  ]

  const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode)
  }

  const handlePhoneVisibilityPress = () => {
    navigation.navigate('PhoneVisibility' as never)
  }

  const openEditPhoneNumber = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'User not found')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', user.id)
        .single()
      setEditPhoneValue(profile?.phone_number || '')
      setShowEditPhoneModal(true)
    } catch (e) {
      Alert.alert('Error', 'Failed to load phone number')
    }
  }

  const savePhoneNumber = async () => {
    try {
      setSavingPhone(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'User not found')
        return
      }
      const { error } = await supabase
        .from('profiles')
        .update({ phone_number: editPhoneValue.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      setShowEditPhoneModal(false)
      Alert.alert('Success', 'Phone number updated')
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update phone number')
    } finally {
      setSavingPhone(false)
    }
  }

  const handleDeleteProfile = () => {
    // First warning
    Alert.alert(
      'Delete Profile',
      'Are you sure you want to delete your profile? This will:\n\n• Delete all your friendships\n• Delete all your upcoming events\n• Remove you from all events\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Second warning
            Alert.alert(
              'Final Confirmation',
              'This is your last chance to cancel. Are you absolutely sure you want to permanently delete your profile?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Forever',
                  style: 'destructive',
                  onPress: () => deleteProfile(),
                },
              ]
            )
          },
        },
      ]
    )
  }

  const deleteProfile = async () => {
    setDeleting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'User not found')
        return
      }

      const userId = user.id

      // Step 1: Get all upcoming events by this user
      const { data: allEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, event_date, start_time, end_time')
        .eq('host_id', userId)

      if (eventsError) {
        console.error('Error fetching events:', eventsError)
      }

      // Filter to get only upcoming events
      const upcomingEventIds: string[] = []
      if (allEvents) {
        for (const event of allEvents) {
          const isPast = isEventEnded(event.event_date, event.start_time, event.end_time)
          if (!isPast) {
            upcomingEventIds.push(event.id)
          }
        }
      }

      console.log(`Found ${upcomingEventIds.length} upcoming events to delete`)

      // Step 2: Delete event attendees for upcoming events (cascading should handle this, but be explicit)
      if (upcomingEventIds.length > 0) {
        const { error: attendeesError } = await supabase
          .from('event_attendees')
          .delete()
          .in('event_id', upcomingEventIds)

        if (attendeesError) {
          console.error('Error deleting event attendees:', attendeesError)
        }

        // Delete event invitations for upcoming events
        const { error: invitationsError } = await supabase
          .from('event_invitations')
          .delete()
          .in('event_id', upcomingEventIds)

        if (invitationsError) {
          console.error('Error deleting event invitations:', invitationsError)
        }

        // Delete event photos for upcoming events
        const { error: photosError } = await supabase
          .from('event_photos')
          .delete()
          .in('event_id', upcomingEventIds)

        if (photosError) {
          console.error('Error deleting event photos:', photosError)
        }

        // Delete notification queue for upcoming events
        const { error: queueError } = await supabase
          .from('notification_queue')
          .delete()
          .in('event_id', upcomingEventIds)

        if (queueError) {
          console.error('Error deleting notification queue:', queueError)
        }

        // Delete upcoming events
        const { error: deleteEventsError } = await supabase
          .from('events')
          .delete()
          .in('id', upcomingEventIds)

        if (deleteEventsError) {
          console.error('Error deleting events:', deleteEventsError)
          throw deleteEventsError
        }
      }

      // Step 3: Delete all friendships (both as user and as friend)
      const { error: friendshipsError } = await supabase
        .from('friendships')
        .delete()
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

      if (friendshipsError) {
        console.error('Error deleting friendships:', friendshipsError)
        throw friendshipsError
      }

      // Step 4: Delete event attendees where user is an attendee (remove user from all events)
      const { error: userAttendeesError } = await supabase
        .from('event_attendees')
        .delete()
        .eq('user_id', userId)

      if (userAttendeesError) {
        console.error('Error deleting user attendees:', userAttendeesError)
      }

      // Step 5: Delete event invitations for this user
      const { error: userInvitationsError } = await supabase
        .from('event_invitations')
        .delete()
        .or(`user_id.eq.${userId},invited_by.eq.${userId}`)

      if (userInvitationsError) {
        console.error('Error deleting user invitations:', userInvitationsError)
      }

      // Step 6: Delete notification data
      // Delete notification preferences
      await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_id', userId)

      // Delete notification tokens
      await notificationService.removeToken()

      // Delete notification queue entries
      await supabase
        .from('notification_queue')
        .delete()
        .eq('user_id', userId)

      // Delete notification logs
      await supabase
        .from('notification_log')
        .delete()
        .eq('user_id', userId)

      // Step 7: Delete the profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (profileError) {
        console.error('Error deleting profile:', profileError)
        throw profileError
      }

      // Step 8: Sign out and navigate to auth
      await supabase.auth.signOut()

      Alert.alert(
        'Profile Deleted',
        'Your profile has been successfully deleted. You have been signed out.',
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error deleting profile:', error)
      Alert.alert(
        'Error',
        `Failed to delete profile: ${error.message}`,
        [{ text: 'OK' }]
      )
    } finally {
      setDeleting(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          
          <View style={styles.themeContainer}>
            <Text style={styles.themeLabel}>Theme</Text>
            <Text style={styles.themeDescription}>
              Choose how the app looks
            </Text>
          </View>

          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.themeOption,
                themeMode === option.value && styles.themeOptionSelected
              ]}
              onPress={() => handleThemeChange(option.value)}
            >
              <View style={styles.themeOptionLeft}>
                <Ionicons
                  name={option.icon as any}
                  size={20}
                  color={themeMode === option.value ? theme.primary : theme.textSecondary}
                />
                <Text style={[
                  styles.themeOptionText,
                  themeMode === option.value && styles.themeOptionTextSelected
                ]}>
                  {option.label}
                </Text>
              </View>
              
              {themeMode === option.value && (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={theme.primary}
                />
              )}
            </TouchableOpacity>
          ))}

          {/* Current Theme Info */}
          <View style={styles.themeInfo}>
            <Text style={styles.themeInfoText}>
              {themeMode === 'system' 
                ? `Using system theme (${isDark ? 'Dark' : 'Light'})`
                : `Using ${themeMode} theme`
              }
            </Text>
          </View>
        </View>


        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handlePhoneVisibilityPress}>
            <View style={styles.settingLeft}>
              <Ionicons name="call" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Phone Number Visibility</Text>
                <Text style={styles.settingDescription}>Control who can see your phone number</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={openEditPhoneNumber}>
            <View style={styles.settingLeft}>
              <Ionicons name="create" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Edit Phone Number</Text>
                <Text style={styles.settingDescription}>Update the phone number on your profile</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="information-circle" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>App Version</Text>
                <Text style={styles.settingDescription}>1.0.0</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Help & Support</Text>
                <Text style={styles.settingDescription}>Get help and contact support</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="document-text" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Terms & Privacy</Text>
                <Text style={styles.settingDescription}>Read our terms and privacy policy</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Delete Profile Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.error }]}
            onPress={handleDeleteProfile}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.deleteButtonText}>Deleting Profile...</Text>
              </>
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.deleteButtonText}>Delete Profile</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={[styles.deleteWarning, { color: theme.textSecondary }]}>
            This will permanently delete your profile and all associated data. This action cannot be undone.
          </Text>
        </View>
      </ScrollView>

      {/* Edit Phone Number Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={showEditPhoneModal}
        onRequestClose={() => setShowEditPhoneModal(false)}
      >
        <View style={styles.editPhoneModalContainer}>
          <View style={styles.editPhoneCard}>
            <Text style={styles.editPhoneTitle}>Edit Phone Number</Text>
            <TextInput
              style={styles.editPhoneInput}
              placeholder="Enter phone number"
              value={editPhoneValue}
              onChangeText={setEditPhoneValue}
              keyboardType="phone-pad"
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={styles.editPhoneActions}>
              <TouchableOpacity
                style={styles.editPhoneButton}
                onPress={() => setShowEditPhoneModal(false)}
                disabled={savingPhone}
              >
                <Text style={styles.editPhoneButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editPhoneButton, styles.editPhonePrimary]}
                onPress={savePhoneNumber}
                disabled={savingPhone}
              >
                {savingPhone ? (
                  <ActivityIndicator color={theme.buttonText} size="small" />
                ) : (
                  <Text style={[styles.editPhoneButtonText, styles.editPhonePrimaryText]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.headerText,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 16,
  },
  themeContainer: {
    marginBottom: 8,
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.text,
    marginBottom: 4,
  },
  themeDescription: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  themeOptionSelected: {
    backgroundColor: theme.primary + '10',
    borderColor: theme.primary,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeOptionText: {
    fontSize: 16,
    color: theme.text,
    marginLeft: 12,
    fontWeight: '500',
  },
  themeOptionTextSelected: {
    color: theme.primary,
    fontWeight: '600',
  },
  themeInfo: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  themeInfoText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontStyle: 'italic',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteWarning: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  editPhoneModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000066',
  },
  editPhoneCard: {
    width: '85%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  editPhoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 12,
  },
  editPhoneInput: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBackground,
    color: theme.inputText,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  editPhoneActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  editPhoneButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  editPhonePrimary: {
    backgroundColor: theme.buttonPrimary,
    borderColor: theme.buttonPrimary,
  },
  editPhoneButtonText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  editPhonePrimaryText: {
    color: theme.buttonText,
  },
})
