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
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'
import notificationService from '../services/notifications'

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

  const handleHelpSupportPress = async () => {
    const supportEmail = 'upwork9080@gmail.com'
    
    Alert.alert(
      'Help & Support',
      `Contact us at:\n\n${supportEmail}`,
      [
        { 
          text: 'Open Email', 
          onPress: () => {
            Linking.openURL(`mailto:${supportEmail}`).catch(() => {
              Alert.alert('Error', 'Could not open email client')
            })
          }
        },
        { text: 'Close', style: 'cancel' },
      ]
    )
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

      // Delete notification token from client-side storage
      await notificationService.removeToken()

      // Call the comprehensive database function to delete everything
      // This function handles ALL cascading deletes including:
      // - Upcoming events and all related data
      // - All events where user is host
      // - Friendships
      // - Event attendees (both personal and org events)
      // - Event invitations
      // - Event photos
      // - Notification preferences, tokens, and queue
      // - Org followers
      // - Organization owner_id update
      // - Profile deletion
      // - Auth user deletion
      const { error: deleteError } = await supabase.rpc('delete_user_completely', {
        user_uuid: userId
      })

      if (deleteError) {
        console.error('Error deleting user:', deleteError)
        throw deleteError
      }

      // Sign out (auth user is already deleted by the function)
      try {
        await supabase.auth.signOut()
      } catch (signOutError) {
        // Ignore sign out errors since the auth user is already deleted
        console.log('Sign out after deletion (expected)')
      }

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

          <TouchableOpacity style={styles.settingItem} onPress={handleHelpSupportPress}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle" size={20} color={theme.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Help & Support</Text>
                <Text style={styles.settingDescription}>Get help and contact support</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate('LegalDocuments' as never)}
          >
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
