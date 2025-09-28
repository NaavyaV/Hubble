import React, { useState } from 'react'
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
    graduatingYear: '',
    bio: '',
    profileImageUri: null,
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)

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
      // Create account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          data: {
            full_name: data.fullName.trim(),
            major: data.major.trim() || null,
            graduating_year: data.graduatingYear || null,
            bio: data.bio.trim() || null,
            phone_number: data.phoneNumber || null,
          }
        }
      })

      if (authError) throw authError

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
          await supabase.auth.updateUser({
            data: { avatar_url: avatarUrl }
          })
        } catch (error) {
          console.warn('Profile image upload failed:', error)
        }
      }

      // Create profile in public profiles table
      if (authData.user) {
        await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            full_name: data.fullName.trim(),
            major: data.major.trim() || null,
            graduating_year: data.graduatingYear || null,
            bio: data.bio.trim() || null,
            avatar_url: avatarUrl,
            phone_number: data.phoneNumber || null,
          })
      }

      Alert.alert(
        'Account Created!',
        'Please check your email to verify your account.',
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      Alert.alert('Error', error.message)
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
      />
    </View>
  )

  const renderMajorStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's your major?</Text>
      <Text style={styles.stepSubtitle}>Help others find you with similar interests</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Computer Science, Business, etc."
        value={data.major}
        onChangeText={(value) => updateData('major', value)}
        autoFocus
      />
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
      <Text style={styles.stepTitle}>Tell us about yourself</Text>
      <Text style={styles.stepSubtitle}>Write a short bio (optional, max 50 words)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Share something about yourself..."
        value={data.bio}
        onChangeText={(value) => updateData('bio', value)}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={250}
      />
      <Text style={styles.wordCount}>
        {getWordCount(data.bio)}/50 words
      </Text>
    </View>
  )

  const renderProfilePictureStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Add a profile picture</Text>
      <Text style={styles.stepSubtitle}>Optional - you can always add this later</Text>
      <TouchableOpacity style={styles.profileImageButton} onPress={pickProfileImage}>
        {data.profileImageUri ? (
          <Image source={{ uri: data.profileImageUri }} style={styles.profileImage} />
        ) : (
          <View style={styles.profileImagePlaceholder}>
            <Ionicons name="camera" size={32} color="#7f8c8d" />
            <Text style={styles.profileImagePlaceholderText}>Tap to add photo</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )

  const renderPhoneNumberStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's your phone number?</Text>
      <Text style={styles.stepSubtitle}>Optional - helps friends find you</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your phone number"
        value={data.phoneNumber}
        onChangeText={(value) => updateData('phoneNumber', formatUSPhone(value))}
        keyboardType="phone-pad"
        maxLength={14}
        autoFocus
      />
    </View>
  )

  const renderCredentialsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Create your account</Text>
      <Text style={styles.stepSubtitle}>Enter your email and password to finish</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          value={data.email}
          onChangeText={(value) => updateData('email', value)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password *</Text>
        <TextInput
          style={styles.input}
          placeholder="Create a password"
          value={data.password}
          onChangeText={(value) => updateData('password', value)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Confirm Password *</Text>
        <TextInput
          style={styles.input}
          placeholder="Confirm your password"
          value={data.confirmPassword}
          onChangeText={(value) => updateData('confirmPassword', value)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  )

  const renderCurrentStep = () => {
    switch (steps[currentStep]) {
      case 'name':
        return renderNameStep()
      case 'major':
        return renderMajorStep()
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
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentStep + 1) / steps.length) * 100}%`, backgroundColor: theme.primary }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {currentStep + 1} of {steps.length}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {renderCurrentStep()}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    paddingTop: 40,
    paddingBottom: 20,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  wordCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  yearButtonSelected: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  yearButtonTextSelected: {
    color: 'white',
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
    borderColor: '#3498db',
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#3498db',
  },
  profileImagePlaceholderText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  nextButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
})
