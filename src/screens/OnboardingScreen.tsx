import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { useTheme } from '../context/ThemeContext'
import * as Notifications from 'expo-notifications'
import notificationService from '../services/notifications'
import * as Device from 'expo-device'

interface OnboardingData {
  fullName: string
  major: string
  collegeId: string
  graduatingYear: string
  bio: string
  profileImageUri: string | null
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  phoneVisibility: 'public' | 'friends_only' | 'private'
  phoneVisibleWhenHosting: boolean
  notificationsEnabled: boolean
}

export default function OnboardingScreen({ navigation }: any) {
  const { theme } = useTheme()
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({
    fullName: '',
    major: '',
    collegeId: '',
    graduatingYear: '',
    bio: '',
    profileImageUri: null,
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneVisibility: 'private',
    phoneVisibleWhenHosting: false,
    notificationsEnabled: true,
  })
  const [loading, setLoading] = useState(false)
  const [colleges, setColleges] = useState<any[]>([])
  const [collegesLoading, setCollegesLoading] = useState(true)
  const [emailDomainError, setEmailDomainError] = useState(false)
  const [skippedPhoneStep, setSkippedPhoneStep] = useState(false)

  const isSkipAvailable = () => {
    const step = steps[currentStep]
    return step === 'bio' || step === 'profilePicture' || step === 'phoneNumber'
  }

  const handleSkip = () => {
    const step = steps[currentStep]
    if (step === 'bio') {
      setData(prev => ({ ...prev, bio: '' }))
      // Go to next step (profilePicture)
      const idx = steps.indexOf('profilePicture')
      if (idx >= 0) setCurrentStep(idx)
      return
    }
    if (step === 'profilePicture') {
      // Ensure no image and go to phone number
      setData(prev => ({ ...prev, profileImageUri: null }))
      const idx = steps.indexOf('phoneNumber')
      if (idx >= 0) setCurrentStep(idx)
      return
    }
    if (step === 'phoneNumber') {
      // Clear phone and set phone privacy settings to minimal exposure, skip to notifications
      setData(prev => ({
        ...prev,
        phoneNumber: '',
        phoneVisibility: 'private',
        phoneVisibleWhenHosting: false,
      }))
      setSkippedPhoneStep(true)
      const nextIdx = steps.indexOf('notifications')
      if (nextIdx >= 0) setCurrentStep(nextIdx)
      return
    }
  }

  useEffect(() => {
    fetchColleges()
  }, [])

  // Auto-request notification permissions when notifications step is shown
  useEffect(() => {
    // Step 8 is 'notifications' (0-indexed)
    if (currentStep === 8) {
      // Check and request permissions when step is shown
      checkAndRequestNotificationPermissions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  const fetchColleges = async () => {
    try {
      setCollegesLoading(true)
      const { data: collegesData, error } = await supabase
        .from('colleges')
        .select('*')
        .order('name')
      
      if (error) {
        Alert.alert('Error', 'Failed to load colleges. Please try again.')
        setColleges([])
      } else {
        setColleges(collegesData || [])
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load colleges. Please try again.')
      setColleges([])
    } finally {
      setCollegesLoading(false)
    }
  }

  const getSelectedCollegeDomain = () => {
    if (!colleges || colleges.length === 0) return ''
    const selectedCollege = colleges.find(college => college.id === data.collegeId)
    return selectedCollege?.email_domain || ''
  }

  const validateEmailDomain = (email: string) => {
    if (!data.collegeId || !colleges || colleges.length === 0) return false
    const domain = getSelectedCollegeDomain()
    if (!domain) return false
    return email.toLowerCase().endsWith(`@${domain}`)
  }

  const validateEmailDomainWithDatabase = async (email: string) => {
    try {
      const { data: isValid, error } = await supabase
        .rpc('validate_email_domain', { email_to_check: email })
      
      if (error) {
        return false
      }
      
      return isValid
    } catch (error) {
      return false
    }
  }

  const currentYear = new Date().getFullYear()
  const graduatingYearOptions = [
    `'${(currentYear + 5).toString().slice(-2)}`,
    `'${(currentYear + 4).toString().slice(-2)}`,
    `'${(currentYear + 3).toString().slice(-2)}`,
    `'${(currentYear + 2).toString().slice(-2)}`,
    `'${(currentYear + 1).toString().slice(-2)}`,
    `'${currentYear.toString().slice(-2)}`,
    'Grad Student',
  ]

  const steps = [
    'name',
    'major',
    'college',
    'graduatingYear',
    'bio',
    'profilePicture',
    'phoneNumber',
    'phonePrivacy',
    'notifications',
    'credentials',
  ]

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // Final step - create account, profile, and send OTP
      
      // Email domain validation will happen after loading starts
      
      setLoading(true)
      let authData: any = null
      try {
        // Step 1: Create auth user with signUp (with college_id in metadata for backend validation)
        const authResult = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
          options: {
            emailRedirectTo: undefined, // We'll handle verification with OTP instead
            data: {
              college_id: data.collegeId
            }
          }
        })

        if (authResult.error) {
          Alert.alert('Error', `Failed to create account: ${authResult.error.message}`)
          return
        }

        if (!authResult.data.user) {
          Alert.alert('Error', 'Failed to create user account. Please try again.')
          return
        }

        authData = authResult.data

        // Step 3: Upload profile image if provided
        let avatarUrl = null
        if (data.profileImageUri && !data.profileImageUri.startsWith('http')) {
          try {
            const fileExt = data.profileImageUri.split('.').pop()?.toLowerCase() || 'jpg'
            const fileName = `profile-${Date.now()}.${fileExt}`
            const filePath = `profile-images/${fileName}`
            const contentType = guessContentTypeFromUri(data.profileImageUri)

            avatarUrl = await uploadBytesToBucket({
              bucket: 'profile-images',
              filePath,
              uri: data.profileImageUri,
              contentType,
            })
          } catch (uploadError) {
            // Continue without profile image - don't fail the entire process
          }
        }

        // Step 4: Create profile with all onboarding data
        const profileData = {
          id: authData.user.id,
          full_name: data.fullName.trim(),
          college_id: data.collegeId,
          major: data.major.trim(),
          graduating_year: data.graduatingYear,
          bio: data.bio.trim(),
          avatar_url: avatarUrl,
          phone_number: data.phoneNumber.trim(),
          phone_visibility: data.phoneVisibility,
          phone_visible_when_hosting: data.phoneVisibleWhenHosting,
          otp_verified: false, // Will be set to true after OTP verification
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        
        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileData)

        if (profileError) {
          // Profile creation failed - DELETE the auth user immediately
          
          // Delete the auth user to prevent orphaned records
          try {
            await supabase.auth.admin.deleteUser(authData.user.id)
          } catch (deleteError) {
          }
          
          // Show user-friendly error
          if (profileError.message.includes('Email domain does not match')) {
            Alert.alert(
              'Invalid Email Domain',
              'Your email domain does not match your selected college. Please use your college email address.',
              [{ text: 'OK' }]
            )
          } else {
            Alert.alert('Error', `Failed to create profile: ${profileError.message}`)
          }
          return // Stay on current screen
        }

        // Step 5: Save notification preferences
        const notificationPreferences = {
          user_id: authData.user.id,
          push_notifications: data.notificationsEnabled,
          event_reminders: data.notificationsEnabled,
          going_status_updates: data.notificationsEnabled,
          friend_requests: data.notificationsEnabled,
          event_invitations: data.notificationsEnabled,
          event_deletions: data.notificationsEnabled,
        }

        const { error: prefError } = await supabase
          .from('notification_preferences')
          .insert(notificationPreferences)

        if (prefError) {
          // Log error but don't fail account creation
          if (__DEV__) {
            console.error('Error saving notification preferences:', prefError)
          }
        }

        // Step 6: Request notification token if enabled and on a device
        if (data.notificationsEnabled && Device.isDevice) {
          try {
            // Small delay to ensure preferences are saved
            await new Promise(resolve => setTimeout(resolve, 200))
            
            const token = await notificationService.initialize()
            if (token && __DEV__) {
              console.log('Notification token obtained during onboarding:', token.substring(0, 20) + '...')
            }
          } catch (tokenError) {
            // Log error but don't fail account creation
            if (__DEV__) {
              console.error('Error requesting notification token during onboarding:', tokenError)
            }
          }
        }

        // Step 7: Navigate to verification screen with email and userId
        navigation.navigate('AccountVerification', { 
          email: data.email.trim(),
          userId: authData.user.id
        })
        
      } catch (error) {
        // Unexpected error - cleanup auth user if it was created
        
        // Try to delete auth user if it was created
        try {
          if (authData?.user?.id) {
            await supabase.auth.admin.deleteUser(authData.user.id)
          }
        } catch (deleteError) {
        }
        
        Alert.alert('Error', 'Failed to create account. Please try again.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      // If we skipped phone steps and the user presses back from the step after privacy (notifications),
      // take them directly to phone number entry
      const stepsOrder = steps
      if (skippedPhoneStep && stepsOrder[currentStep] === 'notifications') {
        const phoneIdx = stepsOrder.indexOf('phoneNumber')
        if (phoneIdx >= 0) {
          setCurrentStep(phoneIdx)
          return
        }
      }
      setCurrentStep(currentStep - 1)
    }
  }

  const updateData = (field: keyof OnboardingData, value: string | boolean) => {
    setData(prev => {
      const newData = { ...prev, [field]: value }
      
      // If phone visibility is set to public, automatically enable phone visible when hosting
      if (field === 'phoneVisibility' && value === 'public') {
        newData.phoneVisibleWhenHosting = true
      }
      
      // Clear email domain error when user starts typing after getting an error
      if (field === 'email' && emailDomainError) {
        setEmailDomainError(false)
      }
      
      // Reset email domain error when college is changed
      if (field === 'collegeId') {
        setEmailDomainError(false)
      }
      
      return newData
    })
  }

  const renderNameStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>What's your name?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>This will be displayed on your profile</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
        placeholder="Enter your full name"
        placeholderTextColor={theme.inputPlaceholder}
        value={data.fullName}
        onChangeText={(value) => updateData('fullName', value)}
        autoFocus
        autoCorrect={false}
        autoCapitalize="words"
        spellCheck={false}
      />
    </View>
  )

  const renderMajorStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>What's your major?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Help others find you with similar interests</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
        placeholder="e.g., Computer Science, Business, etc."
        placeholderTextColor={theme.inputPlaceholder}
        value={data.major}
        onChangeText={(value) => updateData('major', value)}
        autoFocus
        autoCorrect={false}
        autoCapitalize="words"
        spellCheck={false}
      />
    </View>
  )

  const renderCollegeStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Which college do you attend?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Connect with students from your school</Text>
      
      <View style={styles.collegeList}>
        {collegesLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading colleges...</Text>
          </View>
        ) : colleges.length === 0 ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>No colleges available. Please try again later.</Text>
          </View>
        ) : (
          colleges.map((college) => (
            <TouchableOpacity
              key={college.id}
              style={[
                styles.collegeOption,
                { 
                  backgroundColor: data.collegeId === college.id ? theme.primary : theme.surface,
                  borderColor: data.collegeId === college.id ? theme.primary : theme.border
                }
              ]}
              onPress={() => updateData('collegeId', college.id)}
            >
              {college.logo_url && (
                <Image 
                  source={{ uri: college.logo_url }} 
                  style={styles.collegeLogo}
                  resizeMode="contain"
                />
              )}
              <View style={styles.collegeInfo}>
                <Text style={[
                  styles.collegeName,
                  { color: data.collegeId === college.id ? theme.buttonText : theme.text }
                ]}>
                  {college.name}
                </Text>
                <Text style={[
                  styles.collegeShortName,
                  { color: data.collegeId === college.id ? theme.buttonText : theme.textSecondary }
                ]}>
                  {college.short_name}
                </Text>
              </View>
              {data.collegeId === college.id && (
                <Ionicons name="checkmark-circle" size={24} color={theme.buttonText} />
              )}
            </TouchableOpacity>
          ))
        )}
        
        {/* Coming Soon Message */}
        {!collegesLoading && colleges.length > 0 && (
          <View style={[styles.comingSoonContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
            <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
              More colleges to be added soon!
            </Text>
          </View>
        )}
      </View>
    </View>
  )

  const renderGraduatingYearStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>When do you graduate?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Select your graduating year</Text>
      <View style={styles.yearList}>
        {graduatingYearOptions.map((year) => (
          <TouchableOpacity
            key={year}
            style={[
              styles.yearListButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              data.graduatingYear === year && { backgroundColor: theme.primary, borderColor: theme.primary }
            ]}
            onPress={() => updateData('graduatingYear', year)}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.yearListButtonText,
              { color: data.graduatingYear === year ? theme.buttonText : theme.text }
            ]}>
              {year}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

  const renderBioStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Tell us about yourself</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Write a short bio (optional, max 50 words)</Text>
      <TextInput
        style={[styles.input, styles.textArea, styles.bioTextArea, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
        placeholder="Share something about yourself..."
        placeholderTextColor={theme.inputPlaceholder}
        value={data.bio}
        onChangeText={(value) => updateData('bio', value)}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        textAlign="left"
        maxLength={250}
        autoCorrect={false}
        spellCheck={false}
      />
      <Text style={[styles.wordCount, { color: theme.textSecondary }]}>
        {getWordCount(data.bio)}/50 words
      </Text>
    </View>
  )

  const pickProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled) {
        updateData('profileImageUri', result.assets[0].uri)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const renderProfilePictureStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Add a profile picture</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Optional - you can always add this later</Text>
      <TouchableOpacity style={styles.profileImageButton} onPress={pickProfileImage}>
        {data.profileImageUri ? (
          <Image source={{ uri: data.profileImageUri }} style={styles.profileImage} />
        ) : (
          <View style={[styles.profileImagePlaceholder, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <Ionicons name="camera" size={32} color={theme.textSecondary} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  )

  const formatUSPhone = (input: string) => {
    const digits = (input || '').replace(/\D/g, '').slice(0, 10)
    const len = digits.length
    if (len <= 3) return digits
    if (len <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  const renderPhoneNumberStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>What's your phone number?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Optional - helps friends find you</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
        placeholder="(123) 456-7890"
        placeholderTextColor={theme.inputPlaceholder}
        value={data.phoneNumber}
        onChangeText={(value) => updateData('phoneNumber', formatUSPhone(value))}
        keyboardType="phone-pad"
        maxLength={14}
        autoFocus
        autoCorrect={false}
        spellCheck={false}
        textAlign="left"
      />
      <Text style={[styles.privacyNote, { color: theme.textSecondary }]}> 
        You can change your phone number privacy settings later in your profile
      </Text>
    </View>
  )

  const renderPhonePrivacyStep = () => {
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

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Phone Number Privacy</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Who can see your phone number?</Text>
        
        <View style={styles.privacyOptions}>
          {phoneVisibilityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                { backgroundColor: theme.surface, borderColor: theme.border },
                data.phoneVisibility === option.value && { 
                  backgroundColor: theme.primary + '10',
                  borderColor: theme.primary,
                  borderWidth: 2
                }
              ]}
              onPress={() => updateData('phoneVisibility', option.value)}
              activeOpacity={0.7}
            >
              <View style={styles.visibilityOptionLeft}>
                <Ionicons
                  name={option.icon as any}
                  size={24}
                  color={data.phoneVisibility === option.value ? theme.primary : theme.textSecondary}
                />
                <View style={styles.visibilityOptionText}>
                  <Text style={[
                    styles.visibilityOptionTitle,
                    { color: data.phoneVisibility === option.value ? theme.primary : theme.text }
                  ]}>
                    {option.label}
                  </Text>
                  <Text style={[
                    styles.visibilityOptionDescription,
                    { color: data.phoneVisibility === option.value ? theme.primary + 'CC' : theme.textSecondary }
                  ]}>
                    {option.description}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Show hosting toggle for all privacy levels, but with different behavior for public */}
        <TouchableOpacity 
          style={[
            styles.hostingToggleContainer, 
            { backgroundColor: theme.surface, borderColor: theme.border },
            data.phoneVisibility === 'public' && { opacity: 0.7 } // Dim when public (auto-enabled)
          ]}
          onPress={() => {
            // Don't allow toggling when public since it's automatically enabled
            if (data.phoneVisibility !== 'public') {
              updateData('phoneVisibleWhenHosting', !data.phoneVisibleWhenHosting)
            }
          }}
          disabled={data.phoneVisibility === 'public'}
        >
          <View style={styles.hostingToggleLeft}>
            <Ionicons name="calendar" size={24} color={theme.textSecondary} />
            <View style={styles.hostingToggleText}>
              <Text style={[styles.hostingToggleTitle, { color: theme.text }]}>
                Phone number shown when hosting events
              </Text>
              <Text style={[styles.hostingToggleDescription, { color: theme.textSecondary }]}>
                {data.phoneVisibility === 'public' 
                  ? 'Automatically enabled since your phone number is public'
                  : 'Show your phone number for contact when you host events'
                }
              </Text>
            </View>
          </View>
          <View style={[
            styles.iosToggle,
            { backgroundColor: data.phoneVisibleWhenHosting ? theme.primary : theme.border }
          ]}>
            <View style={[
              styles.iosToggleThumb,
              { backgroundColor: theme.surface },
              data.phoneVisibleWhenHosting && styles.iosToggleThumbActive
            ]} />
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  const checkAndRequestNotificationPermissions = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      
      // If already granted, ensure toggle is on
      if (existingStatus === 'granted') {
        if (!data.notificationsEnabled) {
          updateData('notificationsEnabled', true)
        }
        return true
      }

      // If undetermined or denied, request permission
      if (existingStatus === 'undetermined') {
        const { status } = await Notifications.requestPermissionsAsync()
        
        if (status === 'granted') {
          updateData('notificationsEnabled', true)
          return true
        } else {
          // Permission denied, set toggle to off
          updateData('notificationsEnabled', false)
          return false
        }
      }

      // Permission was previously denied
      updateData('notificationsEnabled', false)
      return false
    } catch (error) {
      updateData('notificationsEnabled', false)
      return false
    }
  }

  const requestNotificationPermissions = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus === 'granted') {
        updateData('notificationsEnabled', true)
        return true
      } else {
        // Permission denied, ensure toggle is off
        updateData('notificationsEnabled', false)
        Alert.alert(
          'Permission Required',
          'To receive notifications about events and friend requests, please enable notifications in your device settings.',
          [{ text: 'OK' }]
        )
        return false
      }
    } catch (error) {
      updateData('notificationsEnabled', false)
      return false
    }
  }

  const renderNotificationsStep = () => {
    const handleNotificationToggle = async () => {
      if (!data.notificationsEnabled) {
        // User is enabling notifications, request permissions
        await requestNotificationPermissions()
        // requestNotificationPermissions already handles updating the toggle state
      } else {
        // User is disabling notifications
        updateData('notificationsEnabled', false)
      }
    }

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Notifications</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Stay updated on events and friend requests</Text>
        
        <View style={[styles.notificationSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity 
            style={styles.notificationItem}
            onPress={handleNotificationToggle}
            activeOpacity={0.7}
          >
            <View style={styles.notificationItemLeft}>
              <Ionicons 
                name="notifications-outline" 
                size={24} 
                color={data.notificationsEnabled ? theme.primary : theme.textSecondary} 
              />
              <View style={styles.notificationItemText}>
                <Text style={[styles.notificationItemTitle, { color: theme.text }]}>
                  Allow Notifications
                </Text>
                <Text style={[styles.notificationItemDescription, { color: theme.textSecondary }]}>
                  Get notified about event updates, friend requests, and messages
                </Text>
              </View>
            </View>
            <Switch
              value={data.notificationsEnabled}
              onValueChange={async (val) => {
                if (val) {
                  await requestNotificationPermissions()
                } else {
                  updateData('notificationsEnabled', false)
                }
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={data.notificationsEnabled ? theme.buttonText : theme.textSecondary}
              ios_backgroundColor={theme.border}
            />
          </TouchableOpacity>

          <View style={[styles.notificationDetails, { borderTopColor: theme.border }]}>
            <View style={styles.notificationDetailItem}>
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.notificationDetailText, { color: theme.textSecondary }]}>
                Event reminders and updates
              </Text>
            </View>
            <View style={styles.notificationDetailItem}>
              <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.notificationDetailText, { color: theme.textSecondary }]}>
                Friend requests and messages
              </Text>
            </View>
            <View style={styles.notificationDetailItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.notificationDetailText, { color: theme.textSecondary }]}>
                Event confirmations and changes
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.helpText, { color: theme.textTertiary }]}>
          You can change these settings anytime in your device settings or in the app
        </Text>
      </View>
    )
  }

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  const renderCredentialsStep = () => {
    const selectedCollegeDomain = getSelectedCollegeDomain()
    const emailPlaceholder = selectedCollegeDomain 
      ? `Enter your ${selectedCollegeDomain} email` 
      : 'Enter your college email'
    
    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Create your account</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Enter your college email and password to finish</Text>
        
        <View style={styles.credentialsContainer}>
          <View style={styles.inputGroup}>
            <Text style={[styles.credentialLabel, { color: theme.text }]}>College Email</Text>
            <TextInput
              style={[
                styles.credentialInput, 
                { backgroundColor: theme.inputBackground, color: theme.inputText },
                emailDomainError 
                  ? { borderColor: '#ff4444', borderWidth: 2 } 
                  : { borderColor: theme.inputBorder }
              ]}
              placeholder={emailPlaceholder}
              placeholderTextColor={theme.inputPlaceholder}
              value={data.email}
              onChangeText={(value) => updateData('email', value)}
              onBlur={() => {
                // Validate email domain when user finishes typing
                if (data.email.trim().length > 0 && data.collegeId && colleges.length > 0) {
                  const isValidDomain = validateEmailDomain(data.email.trim())
                  setEmailDomainError(!isValidDomain)
                }
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="emailAddress"
            />
            {selectedCollegeDomain && emailDomainError && (
              <View style={styles.emailErrorContainer}>
                <Text style={[styles.emailDomainHint, { color: '#ff4444' }]}>
                  Only {selectedCollegeDomain} email addresses are accepted
                </Text>
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.credentialLabel, { color: theme.text }]}>Password</Text>
            <TextInput
              style={[styles.credentialInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
              placeholder="Create a password"
              placeholderTextColor={theme.inputPlaceholder}
              value={data.password}
              onChangeText={(value) => updateData('password', value)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.credentialLabel, { color: theme.text }]}>Confirm Password</Text>
            <TextInput
              style={[styles.credentialInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
              placeholder="Confirm your password"
              placeholderTextColor={theme.inputPlaceholder}
              value={data.confirmPassword}
              onChangeText={(value) => updateData('confirmPassword', value)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>
        </View>
      </View>
    )
  }

  const renderCurrentStep = () => {
    switch (steps[currentStep]) {
      case 'name':
        return renderNameStep()
      case 'major':
        return renderMajorStep()
      case 'college':
        return renderCollegeStep()
      case 'graduatingYear':
        return renderGraduatingYearStep()
      case 'bio':
        return renderBioStep()
      case 'profilePicture':
        return renderProfilePictureStep()
      case 'phoneNumber':
        return renderPhoneNumberStep()
      case 'phonePrivacy':
        return renderPhonePrivacyStep()
      case 'notifications':
        return renderNotificationsStep()
      case 'credentials':
        return renderCredentialsStep()
      default:
        return renderNameStep()
    }
  }

  const canProceed = () => {
    switch (steps[currentStep]) {
      case 'name':
        return data.fullName.trim().length > 0
      case 'major':
        return true // Optional
      case 'college':
        return !collegesLoading && data.collegeId.length > 0
      case 'graduatingYear':
        return data.graduatingYear.length > 0
      case 'bio':
        return true // Optional
      case 'profilePicture':
        return true // Optional
      case 'phoneNumber':
        return true // Optional
      case 'phonePrivacy':
        return true // Settings step
      case 'notifications':
        return true // Settings step
      case 'credentials':
        return !collegesLoading && 
               colleges.length > 0 &&
               data.email.trim().length > 0 && 
               data.password.length > 0 && 
               data.password === data.confirmPassword &&
               validateEmailDomain(data.email.trim())
      default:
        return false
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.topBar, { backgroundColor: theme.background }]}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={currentStep === 0 ? () => navigation.goBack() : handleBack}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          {isSkipAvailable() && (
            <TouchableOpacity 
              style={[styles.skipTopButton, { backgroundColor: theme.buttonPrimary }]}
              onPress={handleSkip}
              activeOpacity={0.8}
            >
              <Text style={[styles.skipTopButtonText, { color: theme.buttonText }]}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {renderCurrentStep()}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.nextButton,
              { backgroundColor: theme.buttonPrimary },
              (!canProceed() || loading) && { backgroundColor: theme.textTertiary }
            ]}
            onPress={handleNext}
            disabled={!canProceed() || loading}
          >
            <Text style={[styles.nextButtonText, { color: theme.buttonText }]}>
              {loading ? 'Creating Account...' : 
               currentStep === steps.length - 1 ? 'Create Account' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  skipTopButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  skipTopButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  stepContainer: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
    minHeight: 400,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 22,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    width: '50%',
    minWidth: '50%',
    maxWidth: '50%',
    textAlign: 'left',
  },
  inputGroup: {
    marginBottom: 20,
    alignItems: 'center',
    width: '100%',
  },
  credentialsContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  credentialLabel: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'left',
    alignSelf: 'flex-start',
    width: '100%',
  },
  credentialInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 17,
    width: '100%',
    minHeight: 50,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  nextButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 120,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  collegeList: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  collegeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  collegeLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  collegeInfo: {
    flex: 1,
  },
  collegeName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  collegeShortName: {
    fontSize: 14,
  },
  comingSoonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  comingSoonText: {
    fontSize: 14,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emailDomainHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emailErrorContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  bioTextArea: {
    width: '75%',
    minWidth: '75%',
    maxWidth: '75%',
  },
  wordCount: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  yearGrid: {
    // no longer used
  },
  yearButton: {
    // no longer used
  },
  yearButtonText: {
    // no longer used
  },
  yearList: {
    width: '100%',
    marginTop: 12,
    gap: 10,
  },
  yearListButton: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  yearListButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileImageButton: {
    alignSelf: 'center',
    marginTop: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  privacyOptions: {
    marginTop: 20,
    width: '100%',
    maxWidth: 400,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    minHeight: 80,
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
    fontWeight: '600',
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  visibilityOptionDescription: {
    fontSize: 12,
    lineHeight: 16,
    flexWrap: 'nowrap',
  },
  hostingToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
  },
  hostingToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostingToggleText: {
    marginLeft: 16,
    flex: 1,
  },
  hostingToggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  hostingToggleDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  notificationSection: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 400,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  notificationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationItemText: {
    marginLeft: 16,
    flex: 1,
  },
  notificationItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  notificationItemDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  notificationDetails: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  notificationDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  notificationDetailText: {
    fontSize: 14,
    marginLeft: 12,
  },
  iosToggle: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  iosToggleThumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    alignSelf: 'flex-start',
  },
  iosToggleThumbActive: {
    alignSelf: 'flex-end',
  },
  helpText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
  },
})