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
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'

export default function PhoneVisibilityScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  
  // Phone privacy state
  const [phoneVisibility, setPhoneVisibility] = useState<'public' | 'friends_only' | 'private'>('private')
  const [phoneVisibleWhenHosting, setPhoneVisibleWhenHosting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Original values to track changes
  const [originalPhoneVisibility, setOriginalPhoneVisibility] = useState<'public' | 'friends_only' | 'private'>('private')
  const [originalPhoneVisibleWhenHosting, setOriginalPhoneVisibleWhenHosting] = useState(false)

  const phoneVisibilityOptions = [
    { 
      value: 'public' as const, 
      label: 'Phone number 100% public', 
      description: 'Anyone can see your phone number',
      icon: 'globe-outline'
    },
    { 
      value: 'friends_only' as const, 
      label: 'Phone number shown only to friends', 
      description: 'Only friends can see your phone number',
      icon: 'people-outline'
    },
    { 
      value: 'private' as const, 
      label: 'Phone number completely private', 
      description: 'No one can see your phone number',
      icon: 'lock-closed-outline'
    },
  ]

  useEffect(() => {
    fetchUserProfile()
  }, [])

  const fetchUserProfile = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone_visibility, phone_visible_when_hosting')
        .eq('id', user.id)
        .single()

      if (error) throw error

      const visibility = profile?.phone_visibility || 'private'
      const hosting = profile?.phone_visible_when_hosting || false
      
      setPhoneVisibility(visibility)
      setPhoneVisibleWhenHosting(hosting)
      setOriginalPhoneVisibility(visibility)
      setOriginalPhoneVisibleWhenHosting(hosting)
    } catch (error) {
      console.error('Error fetching user profile:', error)
      Alert.alert('Error', 'Failed to load phone visibility settings')
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneVisibilityChange = (visibility: 'public' | 'friends_only' | 'private') => {
    setPhoneVisibility(visibility)
    // Automatically enable hosting visibility if setting to public
    if (visibility === 'public') {
      setPhoneVisibleWhenHosting(true)
    }
  }

  const handleHostingVisibilityChange = (value: boolean) => {
    if (phoneVisibility === 'public') return // Can't change if public
    setPhoneVisibleWhenHosting(value)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('profiles')
        .update({ 
          phone_visibility: phoneVisibility,
          phone_visible_when_hosting: phoneVisibility === 'public' ? true : phoneVisibleWhenHosting
        })
        .eq('id', user.id)

      if (error) throw error

      // Update original values to reflect saved state
      setOriginalPhoneVisibility(phoneVisibility)
      setOriginalPhoneVisibleWhenHosting(phoneVisibility === 'public' ? true : phoneVisibleWhenHosting)

      Alert.alert('Success', 'Phone visibility settings saved!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (error) {
      console.error('Error updating phone visibility:', error)
      Alert.alert('Error', 'Failed to save phone visibility settings')
    } finally {
      setSaving(false)
    }
  }

  const handleBackPress = () => {
    // Check if there are any changes
    const hasChanges = phoneVisibility !== originalPhoneVisibility || 
                      phoneVisibleWhenHosting !== originalPhoneVisibleWhenHosting

    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      )
    } else {
      navigation.goBack()
    }
  }

  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color={theme.headerText} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Phone Visibility</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Phone Visibility</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          {phoneVisibilityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                phoneVisibility === option.value && styles.visibilityOptionSelected,
                saving && styles.disabled
              ]}
              onPress={() => handlePhoneVisibilityChange(option.value)}
              disabled={saving}
            >
              <View style={styles.visibilityOptionLeft}>
                <Ionicons
                  name={option.icon as any}
                  size={24}
                  color={phoneVisibility === option.value ? theme.primary : theme.textSecondary}
                />
                <View style={styles.visibilityOptionText}>
                  <Text style={[
                    styles.visibilityOptionTitle,
                    phoneVisibility === option.value && styles.visibilityOptionTitleSelected
                  ]}>
                    {option.label}
                  </Text>
                  <Text style={[
                    styles.visibilityOptionDescription,
                    phoneVisibility === option.value && styles.visibilityOptionDescriptionSelected
                  ]}>
                    {option.description}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {/* Phone visible when hosting toggle - show for friends_only and private */}
          {(phoneVisibility === 'friends_only' || phoneVisibility === 'private') && (
            <View style={styles.hostingToggleContainer}>
              <View style={styles.hostingToggleLeft}>
                <Ionicons name="calendar" size={24} color={theme.textSecondary} />
                <View style={styles.hostingToggleText}>
                  <Text style={styles.hostingToggleTitle} numberOfLines={2}>Phone number shown only when hosting events</Text>
                  <Text style={styles.hostingToggleDescription} numberOfLines={2}>
                    Show your phone number for contact when you host events
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.hostingSwitchButton,
                  { 
                    backgroundColor: phoneVisibleWhenHosting ? theme.primary : theme.border,
                    opacity: saving ? 0.5 : 1
                  }
                ]}
                onPress={() => {
                  if (!saving) {
                    handleHostingVisibilityChange(!phoneVisibleWhenHosting)
                  }
                }}
                disabled={saving}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.hostingSwitchThumb,
                  { 
                    backgroundColor: phoneVisibleWhenHosting ? theme.buttonText : theme.textSecondary,
                    transform: [{ translateX: phoneVisibleWhenHosting ? 20 : 2 }]
                  }
                ]} />
              </TouchableOpacity>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: theme.buttonPrimary },
              saving && styles.saveButtonDisabled
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={[styles.saveButtonText, { color: theme.buttonText }]}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
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
    padding: 20,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: theme.surface,
    borderWidth: 0,
    minHeight: 80,
  },
  visibilityOptionSelected: {
    backgroundColor: theme.primary + '10',
    borderWidth: 0,
  },
  visibilityOptionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingTop: 4,
  },
  visibilityOptionText: {
    marginLeft: 16,
    flex: 1,
    flexShrink: 1,
  },
  visibilityOptionTitle: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '600',
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  visibilityOptionTitleSelected: {
    color: theme.primary,
  },
  visibilityOptionDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    lineHeight: 16,
    flexWrap: 'nowrap',
  },
  visibilityOptionDescriptionSelected: {
    color: theme.primary + 'CC',
  },
  hostingToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 0,
  },
  hostingToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
    minWidth: 0, // Allow shrinking
  },
  hostingToggleText: {
    marginLeft: 16,
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  hostingSwitchButton: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: 'center',
  },
  hostingSwitchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  hostingToggleTitle: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  hostingToggleDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    lineHeight: 16,
  },
  saveButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
})
