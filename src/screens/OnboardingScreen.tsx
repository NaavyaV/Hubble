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
  Switch,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { useTheme } from '../context/ThemeContext'
import { ImageWithFallback } from '../components'
import * as Notifications from 'expo-notifications'
import notificationService from '../services/notifications'
import * as Device from 'expo-device'
import { validateContentWithAlert } from '../utils/contentFilter'
import {
  MAX_FULL_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_MAJOR_LENGTH,
  MAX_PHONE_NUMBER_LENGTH,
} from '../constants/validation'

/** Keep only JSON-serializable values to avoid "Cannot coerce JSON" when updating user metadata. */
function safeUserMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata)) {
    if (v === null || v === undefined) out[k] = v
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')
    else if (typeof v === 'object' && v.constructor === Object) out[k] = safeUserMetadata(v as Record<string, unknown>)
  }
  return out
}

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
  eventReminders: boolean
  goingStatusUpdates: boolean
  friendRequests: boolean
  eventInvitations: boolean
  eventDeletions: boolean
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
    eventReminders: true,
    goingStatusUpdates: true,
    friendRequests: true,
    eventInvitations: true,
    eventDeletions: true,
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

  const hasFilledSkippableAction = () => {
    const step = steps[currentStep]
    if (step === 'bio') {
      return data.bio.trim().length > 0
    }
    if (step === 'profilePicture') {
      return data.profileImageUri !== null
    }
    if (step === 'phoneNumber') {
      // For phone number, consider it "filled" if there's any input (even if invalid)
      // This way we show "Next" instead of "Skip" when user types something
      return data.phoneNumber.trim().length > 0
    }
    return false
  }

  const getBottomButtonText = () => {
    if (loading) return 'Creating Account...'
    if (currentStep === steps.length - 1) return 'Create Account'
    
    // For skippable steps, show "Skip" if nothing is filled, "Next" if something is filled
    if (isSkipAvailable()) {
      return hasFilledSkippableAction() ? 'Next' : 'Skip'
    }
    
    return 'Next'
  }

  const handleBottomButtonPress = () => {
    // If showing "Skip" and it's a skippable step, call handleSkip
    if (isSkipAvailable() && !hasFilledSkippableAction()) {
      handleSkip()
    } else {
      // Otherwise, proceed normally with handleNext
      handleNext()
    }
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

  // Request expo notification permissions when notification settings step is shown
  useEffect(() => {
    const notificationSettingsStepIndex = steps.indexOf('notificationSettings')
    if (currentStep === notificationSettingsStepIndex && data.notificationsEnabled) {
      const requestPermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync()
        if (status !== 'granted') {
          // User denied permissions, disable notifications
          updateData('notificationsEnabled', false)
        }
      }
      requestPermissions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, data.notificationsEnabled])

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
    'notificationSettings',
    'credentials',
  ]

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      let nextStep = currentStep + 1
      
      // Skip notificationSettings step if notifications are disabled
      if (steps[nextStep] === 'notificationSettings' && !data.notificationsEnabled) {
        nextStep = nextStep + 1
      }
      
      setCurrentStep(nextStep)
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

        // Step 2: WAIT for user to be authenticated before proceeding
        // signUp() may not immediately provide a session if email confirmation is required
        // We MUST wait for authentication before uploading profile picture
        console.log('Waiting for user authentication...')
        let session = authResult.data.session
        
        if (!session) {
          console.log('No session from signUp, waiting for session to be established...')
          let sessionEstablished = false
          let attempts = 0
          const maxAttempts = 30 // Increased attempts to ensure we get authenticated
          
          while (!sessionEstablished && attempts < maxAttempts) {
            const { data: { session: currentSession } } = await supabase.auth.getSession()
            if (currentSession) {
              console.log('Session established successfully - user is authenticated')
              session = currentSession
              sessionEstablished = true
            } else {
              attempts++
              console.log(`Waiting for authentication... (attempt ${attempts}/${maxAttempts})`)
              await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms between attempts
            }
          }
          
          if (!sessionEstablished) {
            console.error('Failed to establish session after signUp - cannot proceed with profile creation')
            Alert.alert(
              'Authentication Error',
              'Unable to authenticate your account. Please try again.',
              [{ text: 'OK', onPress: () => setLoading(false) }]
            )
            return
          }
        } else {
          console.log('Session available from signUp - user is authenticated')
        }

        // Small delay to ensure session is fully established
        await new Promise(resolve => setTimeout(resolve, 200))

        // Step 3: NOW that user is authenticated, upload profile image if provided
        let avatarUrl = null
        if (data.profileImageUri) {
          if (data.profileImageUri.startsWith('http')) {
            // If it's already a URL, use it directly
            avatarUrl = data.profileImageUri
            console.log('Using existing profile image URL:', avatarUrl)
          } else {
            // Upload the image - user is now authenticated
            try {
              console.log('User authenticated - uploading profile image:', data.profileImageUri)
              
              // Re-verify and refresh session right before upload
              let uploadSession = session
              if (!uploadSession) {
                console.log('Session not available, refreshing...')
                const { data: { session: refreshedSession } } = await supabase.auth.getSession()
                if (!refreshedSession) {
                  // Try to get user to refresh session
                  const { data: { user: currentUser } } = await supabase.auth.getUser()
                  if (currentUser) {
                    // User exists, try getting session again with a small delay
                    await new Promise(resolve => setTimeout(resolve, 200))
                    const { data: { session: retrySession } } = await supabase.auth.getSession()
                    uploadSession = retrySession
                  }
                } else {
                  uploadSession = refreshedSession
                }
              }
              
              // Verify user is authenticated one more time
              const { data: { user: verifyUser } } = await supabase.auth.getUser()
              if (!verifyUser) {
                throw new Error('User authentication lost')
              }
              
              if (!uploadSession) {
                console.warn('Session lost before upload - storing image URI in metadata for upload after OTP')
                // Store in metadata as fallback - will upload after OTP verification
                // Use the user ID directly since we have it from signUp
                try {
                  await supabase.auth.updateUser({
                    data: {
                      ...safeUserMetadata(authData.user?.user_metadata as Record<string, unknown>),
                      pending_profile_image_uri: data.profileImageUri,
                    },
                  })
                  console.log('Profile image URI stored in metadata for upload after OTP verification')
                } catch (metadataError) {
                  console.error('Error storing profile image URI in metadata:', metadataError)
                }
                avatarUrl = null
              } else {
                console.log('Session confirmed - proceeding with upload')
                const fileExt = data.profileImageUri.split('.').pop()?.toLowerCase() || 'jpg'
                const fileName = `profile-${authData.user.id}-${Date.now()}.${fileExt}`
                const filePath = `profile-images/${fileName}`
                const contentType = guessContentTypeFromUri(data.profileImageUri)

                console.log('Upload parameters:', { bucket: 'profile-images', filePath, contentType })
                
                // User is authenticated - proceed with upload
                avatarUrl = await uploadBytesToBucket({
                  bucket: 'profile-images',
                  filePath,
                  uri: data.profileImageUri,
                  contentType,
                })
                
                console.log('Profile image uploaded successfully:', avatarUrl)
                
                if (!avatarUrl) {
                  console.error('Upload succeeded but no URL returned - this should not happen')
                  Alert.alert(
                    'Upload Warning',
                    'Profile image upload completed but URL was not returned. Your profile will be created without an image.',
                    [{ text: 'OK' }]
                  )
                } else {
                  console.log('Profile image URL confirmed:', avatarUrl)
                }
              }
            } catch (uploadError: any) {
              // Log error and handle gracefully
              console.error('Error uploading profile image:', uploadError)
              console.error('Upload error details:', {
                message: uploadError?.message,
                code: uploadError?.code,
                error: uploadError
              })
              
              // If it's an auth/session error, store in metadata for later upload
              if (uploadError?.message?.includes('authenticated') || 
                  uploadError?.message?.includes('Session') ||
                  uploadError?.message?.includes('session')) {
                console.log('Auth error during upload - storing image URI in metadata for later upload')
                try {
                  await supabase.auth.updateUser({
                    data: {
                      ...safeUserMetadata(authData.user?.user_metadata as Record<string, unknown>),
                      pending_profile_image_uri: data.profileImageUri,
                    },
                  })
                  console.log('Profile image URI stored in metadata for upload after OTP verification')
                } catch (metadataError) {
                  console.error('Error storing profile image URI in metadata:', metadataError)
                }
                avatarUrl = null
              } else {
                // Other upload errors - show alert but continue
                Alert.alert(
                  'Image Upload Failed',
                  'Your profile picture could not be uploaded. Your account will be created without a profile picture. You can add one later in your profile settings.',
                  [{ text: 'Continue', style: 'default' }]
                )
                avatarUrl = null
              }
            }
          }
        } else {
          console.log('No profile image provided')
        }

        // Step 4: Validate content for objectionable language
        if (!validateContentWithAlert(data.fullName.trim(), (message) => Alert.alert('Invalid Content', message))) {
          setLoading(false)
          return
        }
        if (data.major.trim() && !validateContentWithAlert(data.major.trim(), (message) => Alert.alert('Invalid Content', message))) {
          setLoading(false)
          return
        }
        if (data.bio.trim() && !validateContentWithAlert(data.bio.trim(), (message) => Alert.alert('Invalid Content', message))) {
          setLoading(false)
          return
        }

        // Step 6: Create or update profile with normalized onboarding data (avoids JSON/coerce errors)
        const now = new Date().toISOString()
        const profileData: Record<string, unknown> = {
          id: authData.user.id,
          full_name: (data.fullName?.trim() ?? '') || null,
          college_id: data.collegeId || null,
          major: (data.major?.trim() ?? '') || null,
          graduating_year: (data.graduatingYear?.trim() ?? '') || null,
          bio: (data.bio?.trim() ?? '') || null,
          avatar_url: avatarUrl ?? null,
          phone_number: (data.phoneNumber?.trim() ?? '') || null,
          phone_visibility: data.phoneVisibility ?? 'private',
          phone_visible_when_hosting: Boolean(data.phoneVisibleWhenHosting),
          otp_verified: false,
          updated_at: now,
        }
        // Only set created_at on insert; upsert may update existing row
        if (__DEV__) {
          console.log('Creating/updating profile with data:', {
            ...profileData,
            avatar_url: avatarUrl ? 'SET' : 'NULL',
          })
        }

        if (data.profileImageUri && !avatarUrl) {
          console.warn('WARNING: Profile image URI was provided but avatarUrl is null/undefined')
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(profileData, { onConflict: 'id' })

        if (profileError) {
          try {
            await supabase.auth.admin.deleteUser(authData.user.id)
          } catch (deleteError) {
            // ignore
          }

          const msg = profileError.message ?? ''
          const isJsonCoerce = /cannot coerce|json|invalid input syntax/i.test(msg)

          if (msg.includes('Email domain does not match')) {
            Alert.alert(
              'Invalid Email Domain',
              'Your email domain does not match your selected college. Please use your college email address.',
              [{ text: 'OK' }]
            )
          } else if (isJsonCoerce) {
            Alert.alert(
              'Couldn’t save profile',
              'Something went wrong saving your profile. Please try again. If it keeps happening, try again with a shorter bio or different picture.',
              [{ text: 'OK' }]
            )
          } else {
            Alert.alert('Error', `Failed to create profile: ${msg}`)
          }
          setLoading(false)
          return
        }

        // Step 5: Refresh session before following orgs and creating notification preferences
        // Ensure we have a valid session for RLS policies
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!currentSession) {
          console.error('Session lost before following orgs - cannot proceed')
          Alert.alert(
            'Session Error',
            'Your session was lost. Please try creating your account again.',
            [{ text: 'OK', onPress: () => setLoading(false) }]
          )
          return
        }
        
        // Verify user is authenticated
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser || currentUser.id !== authData.user.id) {
          console.error('User authentication mismatch')
          Alert.alert(
            'Authentication Error',
            'Authentication error occurred. Please try again.',
            [{ text: 'OK', onPress: () => setLoading(false) }]
          )
          return
        }

        // Step 6: Create notification preferences NOW (user is authenticated)
        const notificationPreferencesData = {
          user_id: currentUser.id, // Use current user ID from session
          push_notifications: data.notificationsEnabled,
          event_reminders: data.notificationsEnabled && data.eventReminders,
          going_status_updates: data.notificationsEnabled && data.goingStatusUpdates,
          friend_requests: data.notificationsEnabled && data.friendRequests,
          event_invitations: data.notificationsEnabled && data.eventInvitations,
          event_deletions: data.notificationsEnabled && data.eventDeletions,
        }
        
        console.log('Creating notification preferences:', notificationPreferencesData)
        if (__DEV__) {
          console.log('User IDs match')
        }
        
        const { error: prefError } = await supabase
          .from('notification_preferences')
          .upsert(notificationPreferencesData, { onConflict: 'user_id' })
        
        if (prefError) {
          console.error('Error creating notification preferences:', prefError)
          console.error('Pref error details:', {
            message: prefError.message,
            code: prefError.code,
            details: prefError.details,
            hint: prefError.hint
          })
          // Don't fail the entire process, but log the error
          // User can set preferences later if this fails
        } else {
          console.log('Notification preferences created successfully')
        }

        // Step 7: Request notification token if enabled and on a device
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

        // Step 8: Navigate to verification screen with email and userId
        // ALL user data is now set up: profile created, PFP uploaded, orgs followed, notification preferences created
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
      
      let prevStep = currentStep - 1
      
      // Skip notificationSettings step if notifications are disabled when going back
      if (stepsOrder[prevStep] === 'notificationSettings' && !data.notificationsEnabled) {
        prevStep = prevStep - 1
      }
      
      setCurrentStep(prevStep)
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
              {college.logo_url ? (
                <ImageWithFallback
                  source={{ uri: college.logo_url }}
                  style={styles.collegeLogo}
                  resizeMode="contain"
                />
              ) : null}
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
          <ImageWithFallback source={{ uri: data.profileImageUri }} style={styles.profileImage} resizeMode="cover" />
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

  const isValidPhoneNumber = (phone: string) => {
    // Check if phone number has exactly 10 digits
    const digits = (phone || '').replace(/\D/g, '')
    return digits.length === 10
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
        <View 
          style={[
            styles.hostingToggleContainer, 
            { backgroundColor: theme.surface, borderColor: theme.border },
            data.phoneVisibility === 'public' && { opacity: 0.7 } // Dim when public (auto-enabled)
          ]}
        >
          <View style={styles.hostingToggleContent}>
            <View style={styles.hostingToggleTextContainer}>
              <Text style={[styles.hostingToggleTitle, { color: theme.text }]}>
                Show phone number when hosting
              </Text>
              <Text style={[styles.hostingToggleDescription, { color: theme.textSecondary }]}>
                Display your number to event attendees
              </Text>
            </View>
            <View style={styles.hostingToggleSwitchWrapper}>
              <Switch
                value={data.phoneVisibleWhenHosting}
                onValueChange={(value) => {
                  // Don't allow toggling when public since it's automatically enabled
                  if (data.phoneVisibility !== 'public') {
                    updateData('phoneVisibleWhenHosting', value)
                  }
                }}
                disabled={data.phoneVisibility === 'public'}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>
        </View>
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
    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Notifications</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Stay updated on events and friend requests</Text>
        
        <View style={[styles.notificationSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.notificationItem}>
            <View style={styles.notificationItemLeft}>
              <Ionicons 
                name="notifications-outline" 
                size={24} 
                color={theme.textSecondary} 
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
            <View style={styles.notificationSwitchWrapper}>
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
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.helpText, { color: theme.textTertiary }]}>
          You can change these settings anytime in your device settings or in the app
        </Text>
      </View>
    )
  }

  const renderNotificationSettingsStep = () => {
    if (!data.notificationsEnabled) {
      // If notifications are disabled, skip this step
      return null
    }

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Notification Preferences</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Choose what you want to be notified about</Text>
        
        <View style={[styles.notificationSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.notificationSettingItem, { borderBottomColor: theme.border }]}>
            <View style={styles.notificationSettingLeft}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <View style={styles.notificationSettingTextContainer}>
                <Text style={[styles.notificationSettingLabel, { color: theme.text }]}>
                  Event Reminders
                </Text>
                <Text style={[styles.notificationSettingDescription, { color: theme.textSecondary }]}>
                  Get reminders before events you're attending
                </Text>
              </View>
            </View>
            <View style={styles.notificationSwitchWrapper}>
              <Switch
                value={data.eventReminders}
                onValueChange={(val) => updateData('eventReminders', val)}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>

          <View style={[styles.notificationSettingItem, { borderBottomColor: theme.border }]}>
            <View style={styles.notificationSettingLeft}>
              <Ionicons name="checkmark-circle-outline" size={20} color={theme.textSecondary} />
              <View style={styles.notificationSettingTextContainer}>
                <Text style={[styles.notificationSettingLabel, { color: theme.text }]}>
                  Going Status Updates
                </Text>
                <Text style={[styles.notificationSettingDescription, { color: theme.textSecondary }]}>
                  Notifications when friends mark themselves as going
                </Text>
              </View>
            </View>
            <View style={styles.notificationSwitchWrapper}>
              <Switch
                value={data.goingStatusUpdates}
                onValueChange={(val) => updateData('goingStatusUpdates', val)}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>

          <View style={[styles.notificationSettingItem, { borderBottomColor: theme.border }]}>
            <View style={styles.notificationSettingLeft}>
              <Ionicons name="people-outline" size={20} color={theme.textSecondary} />
              <View style={styles.notificationSettingTextContainer}>
                <Text style={[styles.notificationSettingLabel, { color: theme.text }]}>
                  Friend Requests
                </Text>
                <Text style={[styles.notificationSettingDescription, { color: theme.textSecondary }]}>
                  Get notified when someone sends you a friend request
                </Text>
              </View>
            </View>
            <View style={styles.notificationSwitchWrapper}>
              <Switch
                value={data.friendRequests}
                onValueChange={(val) => updateData('friendRequests', val)}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>

          <View style={[styles.notificationSettingItem, { borderBottomColor: theme.border }]}>
            <View style={styles.notificationSettingLeft}>
              <Ionicons name="mail-outline" size={20} color={theme.textSecondary} />
              <View style={styles.notificationSettingTextContainer}>
                <Text style={[styles.notificationSettingLabel, { color: theme.text }]}>
                  Event Invitations
                </Text>
                <Text style={[styles.notificationSettingDescription, { color: theme.textSecondary }]}>
                  Notifications when you're invited to events
                </Text>
              </View>
            </View>
            <View style={styles.notificationSwitchWrapper}>
              <Switch
                value={data.eventInvitations}
                onValueChange={(val) => updateData('eventInvitations', val)}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>

          <View style={styles.notificationSettingItem}>
            <View style={styles.notificationSettingLeft}>
              <Ionicons name="trash-outline" size={20} color={theme.textSecondary} />
              <View style={styles.notificationSettingTextContainer}>
                <Text style={[styles.notificationSettingLabel, { color: theme.text }]}>
                  Event Deletions
                </Text>
                <Text style={[styles.notificationSettingDescription, { color: theme.textSecondary }]}>
                  Get notified when events you're attending are deleted
                </Text>
              </View>
            </View>
            <View style={styles.notificationSwitchWrapper}>
              <Switch
                value={data.eventDeletions}
                onValueChange={(val) => updateData('eventDeletions', val)}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>
        </View>
      </View>
    )
  }

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }


  const renderCredentialsStep = () => {
    const selectedCollegeDomain = getSelectedCollegeDomain()
    const emailPlaceholder = selectedCollegeDomain 
      ? `Enter your @${selectedCollegeDomain} email` 
      : 'Enter your college email'
    const selectedCollege = colleges.find(college => college.id === data.collegeId)
    const collegeName = selectedCollege?.name || 'this college'
    
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
            {data.collegeId && selectedCollege && (
              <Text style={[styles.collegeNote, { color: theme.textSecondary }]}>
                You must be a student at {collegeName} to use Hubble.
              </Text>
            )}
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
      case 'notificationSettings':
        return renderNotificationSettingsStep()
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
        // Can proceed if phone is empty (skip) or valid (10 digits)
        const phoneDigits = (data.phoneNumber || '').replace(/\D/g, '')
        return phoneDigits.length === 0 || phoneDigits.length === 10
      case 'phonePrivacy':
        return true // Settings step
      case 'notifications':
        return true // Settings step
      case 'notificationSettings':
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
            onPress={handleBottomButtonPress}
            disabled={!canProceed() || loading}
          >
            <Text style={[styles.nextButtonText, { color: theme.buttonText }]}>
              {getBottomButtonText()}
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
  collegeNote: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'left',
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
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 24,
    borderWidth: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  hostingToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hostingToggleTextContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  hostingToggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  hostingToggleDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  hostingToggleSwitchWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
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
  notificationSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  notificationSettingLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  notificationSettingTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  notificationSettingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  notificationSettingDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  notificationSwitchWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
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