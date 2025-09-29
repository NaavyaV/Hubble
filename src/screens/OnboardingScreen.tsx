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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { useTheme } from '../context/ThemeContext'

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
  })
  const [loading, setLoading] = useState(false)
  const [colleges, setColleges] = useState<any[]>([])

  useEffect(() => {
    fetchColleges()
  }, [])

  const fetchColleges = async () => {
    try {
      const { data: collegesData, error } = await supabase
        .from('colleges')
        .select('*')
        .order('name')
      
      if (error) {
        console.error('Error fetching colleges:', error)
      } else {
        setColleges(collegesData || [])
      }
    } catch (error) {
      console.error('Error fetching colleges:', error)
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
    'credentials',
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleCreateAccount()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

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

  const formatUSPhone = (input: string) => {
    const digits = (input || '').replace(/\D/g, '').slice(0, 10)
    const len = digits.length
    if (len <= 3) return digits
    if (len <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  const handleCreateAccount = async () => {
    if (!data.fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name')
      return
    }

    if (!data.email.trim() || !data.password.trim()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    if (data.password !== data.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match')
      return
    }

    setLoading(true)
    try {
      console.log('Starting account creation process...')
      console.log('Creating account with email:', data.email.trim())
      
      // Create account - try without metadata first to isolate the issue
      console.log('Attempting to create account without metadata...')
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        // Temporarily remove options.data to avoid trigger conflicts
      })
      
      console.log('Auth response:', {
        user: authData.user ? 'User created' : 'No user',
        session: authData.session ? 'Session created' : 'No session',
        error: authError ? 'Error occurred' : 'No error'
      })

      if (authError) {
        console.error('Auth error details:', {
          message: authError.message,
          status: authError.status,
          details: authError
        })
        
        // If it's a 500 error, it might be a database trigger issue
        if (authError.status === 500) {
          console.log('500 error detected - this is likely a database trigger issue')
          console.log('The handle_new_user() trigger is probably failing')
          console.log('Check your Supabase dashboard → Database → Functions for handle_new_user')
          
          // Try to provide a more helpful error message
          if (authError.message.includes('database error saving new user')) {
            throw new Error('Database trigger error. Please check your Supabase dashboard for the handle_new_user function.')
          }
        }
        
        throw new Error(`Failed to create account: ${authError.message}`)
      }
      
      if (authData.user) {
        console.log('Auth account created successfully:', authData.user.id)
        console.log('User email confirmed:', authData.user.email_confirmed_at ? 'Yes' : 'No')
        
        if (!authData.session) {
          console.log('No session created - email confirmation may be required')
        }
      } else {
        console.log('No user created in auth response')
      }

      // Upload profile image if selected
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

          // Update user metadata with avatar URL
          const { error: updateError } = await supabase.auth.updateUser({
            data: { avatar_url: avatarUrl }
          })
          
          if (updateError) {
            console.warn('Failed to update user metadata with avatar:', updateError)
          }
        } catch (error) {
          console.warn('Profile image upload failed:', error)
          // Don't throw here - image upload failure shouldn't block account creation
        }
      }

      // Create profile in public profiles table
      if (authData.user) {
        // Check if profile already exists (from trigger)
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single()
        
        console.log('Existing profile check:', existingProfile)
        
        const profileData = {
          id: authData.user.id,
          full_name: data.fullName.trim(),
          major: data.major.trim() || null,
          college_id: data.collegeId || null,
          graduating_year: data.graduatingYear || null,
          bio: data.bio.trim() || null,
          avatar_url: avatarUrl,
          phone_number: data.phoneNumber || null,
        }
        
        console.log('Creating profile with data:', profileData)
        console.log('Full onboarding data:', data)
        
        const { data: insertedProfile, error: profileError } = await supabase
          .from('profiles')
          .upsert(profileData)
          .select()
        
        if (profileError) {
          console.error('Profile creation error:', profileError)
          console.error('Profile data that failed:', profileData)
          throw new Error(`Failed to create profile: ${profileError.message}`)
        }
        
        console.log('Profile created successfully:', insertedProfile)
        
        // Verify the profile was actually saved
        const { data: verifyProfile, error: verifyError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single()
        
        if (verifyError) {
          console.error('Failed to verify profile creation:', verifyError)
        } else {
          console.log('Profile verification successful:', verifyProfile)
        }
      }

      // Check if email confirmation is required
      if (authData.user && !authData.session) {
        Alert.alert(
          'Account Created!',
          'Please check your email to verify your account before signing in.',
          [{ text: 'OK', onPress: () => navigation.navigate('Main' as never) }]
        )
      } else {
        Alert.alert(
          'Account Created!',
          'Welcome! Your account has been created successfully.',
          [{ text: 'OK', onPress: () => navigation.navigate('Main' as never) }]
        )
      }
    } catch (error: any) {
      console.error('Account creation error:', error)
      Alert.alert('Error', error.message || 'Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
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
        {colleges.map((college) => (
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
        ))}
        
        {/* Coming Soon Message */}
        <View style={[styles.comingSoonContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
          <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            More colleges to be added soon!
          </Text>
        </View>
      </View>
    </View>
  )

  const renderGraduatingYearStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>When do you graduate?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Select your graduating year</Text>
      <View style={styles.yearGrid}>
        {graduatingYearOptions.map((year) => (
          <TouchableOpacity
            key={year}
            style={[
              styles.yearButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              data.graduatingYear === year && { backgroundColor: theme.primary, borderColor: theme.primary }
            ]}
            onPress={() => updateData('graduatingYear', year)}
          >
            <Text style={[
              styles.yearButtonText,
              { color: theme.text },
              data.graduatingYear === year && { color: theme.buttonText }
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
        maxLength={250}
        autoCorrect={false}
        spellCheck={false}
      />
      <Text style={[styles.wordCount, { color: theme.textSecondary }]}>
        {getWordCount(data.bio)}/50 words
      </Text>
    </View>
  )

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

  const renderPhoneNumberStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>What's your phone number?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Optional - helps friends find you</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
        placeholder="Enter your phone number"
        placeholderTextColor={theme.inputPlaceholder}
        value={data.phoneNumber}
        onChangeText={(value) => updateData('phoneNumber', formatUSPhone(value))}
        keyboardType="phone-pad"
        maxLength={14}
        autoFocus
        autoCorrect={false}
        spellCheck={false}
        textAlign="center"
      />
      <Text style={[styles.privacyNote, { color: theme.textSecondary }]}>
        You can change your phone number privacy settings later in your profile
      </Text>
    </View>
  )

  const renderCredentialsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Create your account</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>Enter your email and password to finish</Text>
      
      <View style={styles.credentialsContainer}>
        <View style={styles.inputGroup}>
          <Text style={[styles.credentialLabel, { color: theme.text }]}>Email</Text>
          <TextInput
            style={[styles.credentialInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
            placeholder="Enter your email"
            placeholderTextColor={theme.inputPlaceholder}
            value={data.email}
            onChangeText={(value) => updateData('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="emailAddress"
          />
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
            textContentType="newPassword"
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
            textContentType="newPassword"
          />
        </View>
      </View>
    </View>
  )

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
        return data.collegeId.length > 0
      case 'graduatingYear':
        return data.graduatingYear.length > 0
      case 'bio':
        return true // Optional
      case 'profilePicture':
        return true // Optional
      case 'phoneNumber':
        return true // Optional
      case 'credentials':
        return data.email.trim().length > 0 && 
               data.password.length > 0 && 
               data.password === data.confirmPassword
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
  },
  backButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  stepContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    width: '100%',
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
    width: '50%', // 1/3 of screen width
    minWidth: '50%',
    maxWidth: '50%', // Expandable to 1/2 of screen width
    textAlign: 'center', // Center aligned when typing
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  bioTextArea: {
    width: '75%', // 3/4 of screen width
    minWidth: '75%',
    maxWidth: '75%',
  },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  wordCount: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    gap: 10,
  },
  yearButton: {
    width: '30%',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '500',
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
  inputGroup: {
    marginBottom: 20,
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
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
})
