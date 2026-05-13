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
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { buildPublicAssetUrl, uploadVersionedAsset } from '../utils/imageAsset'
import { useTheme } from '../context/ThemeContext'
import { ImageWithFallback } from '../components'
import { validateContentWithAlert } from '../utils/contentFilter'
import {
  MAX_FULL_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_MAJOR_LENGTH,
} from '../constants/validation'

export default function EditProfileScreen({ navigation }: any) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [fullName, setFullName] = useState('')
  const [major, setMajor] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [colleges, setColleges] = useState<any[]>([])
  const [graduatingYear, setGraduatingYear] = useState('')
  const [bio, setBio] = useState('')
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Generate graduating year options
  const currentYear = new Date().getFullYear()
  const graduatingYearOptions = [
    `'${(currentYear + 5).toString().slice(-2)}`, // Current year + 5
    `'${(currentYear + 4).toString().slice(-2)}`,
    `'${(currentYear + 3).toString().slice(-2)}`,
    `'${(currentYear + 2).toString().slice(-2)}`,
    `'${(currentYear + 1).toString().slice(-2)}`,
    `'${currentYear.toString().slice(-2)}`, // Current year
    'Grad Student',
  ]

  useEffect(() => {
    fetchUserProfile()
    fetchColleges()
  }, [])

  const fetchColleges = async () => {
    try {
      const { data: collegesData, error } = await supabase
        .from('colleges')
        .select('id, name, email_domain, logo_url, short_name')
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

  const fetchUserProfile = async () => {
    try {
      const user = await getCachedUser()
      if (user) {
        // Fetch profile data from profiles table
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, full_name, major, college_id, graduating_year, bio, avatar_url, avatar_path, avatar_version')
          .eq('id', user.id)
          .single()
        
        if (error) {
          console.error('Error fetching profile:', error)
        } else if (profileData) {
          setFullName(profileData.full_name || '')
          setMajor(profileData.major || '')
          setCollegeId(profileData.college_id || '')
          setGraduatingYear(profileData.graduating_year || '')
          setBio(profileData.bio || '')
          const resolvedAvatar =
            profileData.avatar_path
              ? buildPublicAssetUrl('profile-images', profileData.avatar_path)
              : profileData.avatar_url || null
          setProfileImageUri(resolvedAvatar)
        }
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
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
        setProfileImageUri(result.assets[0].uri)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const uploadProfileImage = async (uri: string) => {
    try {
      const user = await getCachedUser()
      if (!user) throw new Error('Not authenticated')
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_version')
        .eq('id', user.id)
        .maybeSingle()
      const uploaded = await uploadVersionedAsset({
        uri,
        bucket: 'profile-images',
        entityType: 'avatars',
        entityId: user.id,
        currentVersion: profile?.avatar_version || 0,
        purpose: 'avatar',
      })
      return uploaded
    } catch (error) {
      console.error('Error uploading profile image:', error)
      throw error
    }
  }

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name')
      return
    }

    // Security: Validate input lengths
    if (fullName.trim().length > MAX_FULL_NAME_LENGTH) {
      Alert.alert('Error', `Full name must be ${MAX_FULL_NAME_LENGTH} characters or less`)
      return
    }
    if (major && major.trim().length > MAX_MAJOR_LENGTH) {
      Alert.alert('Error', `Major must be ${MAX_MAJOR_LENGTH} characters or less`)
      return
    }
    if (bio && bio.trim().length > MAX_BIO_LENGTH) {
      Alert.alert('Error', `Bio must be ${MAX_BIO_LENGTH} characters or less`)
      return
    }

    // Validate content for objectionable language
    if (!validateContentWithAlert(fullName.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }
    if (major && major.trim() && !validateContentWithAlert(major.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }
    if (bio && bio.trim() && !validateContentWithAlert(bio.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }

    setLoading(true)
    try {
      const user = await getCachedUser()
      let avatarUrl = null
      let avatarPath: string | null = null
      let avatarVersion: number | null = null
      if (profileImageUri && !profileImageUri.startsWith('http')) {
        // Only upload if it's a new local image
        const uploaded = await uploadProfileImage(profileImageUri)
        avatarUrl = uploaded.publicUrl
        avatarPath = uploaded.path
        avatarVersion = uploaded.version
      } else if (profileImageUri) {
        // Keep existing URL if it's already uploaded
        avatarUrl = profileImageUri
      }

      // Save to profiles table
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: fullName,
            major: major || null,
            graduating_year: graduatingYear || null,
            bio: bio || null,
            avatar_url: avatarUrl || null,
            avatar_path: avatarPath,
            avatar_version: avatarVersion ?? undefined,
            updated_at: new Date().toISOString(),
          })
        if (profileError) throw profileError
      }

      Alert.alert('Success', 'Profile updated successfully!')
      navigation.goBack()
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        style={[styles.editProfileBack, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 44 }}
        >
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Profile Picture</Text>
              <TouchableOpacity style={styles.profileImageButton} onPress={pickProfileImage}>
                {profileImageUri ? (
                  <ImageWithFallback source={{ uri: profileImageUri }} style={styles.profileImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.profileImagePlaceholder, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.profileImagePlaceholderText, { color: theme.textSecondary }]}>+</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Full Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Enter your full name"
                placeholderTextColor={theme.inputPlaceholder}
                value={fullName}
                onChangeText={setFullName}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Major</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="e.g., Computer Science, Business, etc."
                placeholderTextColor={theme.inputPlaceholder}
                value={major}
                onChangeText={setMajor}
                autoCorrect={false}
                autoCapitalize="words"
                spellCheck={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>College</Text>
              <View style={styles.collegeList}>
                {colleges.filter(college => college.id === collegeId).map((college) => (
                  <View
                    key={college.id}
                    style={[
                      styles.collegeOption,
                      styles.collegeOptionDisabled,
                      { 
                        backgroundColor: theme.surface,
                        borderWidth: 0,
                      }
                    ]}
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
                        { color: theme.text }
                      ]}>
                        {college.name}
                      </Text>
                      <Text style={[
                        styles.collegeShortName,
                        { color: theme.textSecondary }
                      ]}>
                        {college.short_name}
                      </Text>
                    </View>
                    <Ionicons name="lock-closed" size={20} color={theme.textSecondary} />
                  </View>
                ))}
              </View>
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                College setting cannot be changed after account creation
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Graduating Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {graduatingYearOptions.map((year) => {
                  const selected = graduatingYear === year
                  return (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.surface, borderWidth: 0 },
                        selected && { backgroundColor: theme.primary, borderWidth: 0 }
                      ]}
                      onPress={() => setGraduatingYear(year)}
                    >
                      <Text style={[
                        styles.chipText,
                        { color: theme.textSecondary },
                        selected && { color: theme.buttonText }
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Tell us about yourself"
                placeholderTextColor={theme.inputPlaceholder}
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: theme.buttonPrimary },
                loading && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={[styles.saveButtonText, { color: theme.buttonText }]}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editProfileBack: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    padding: 8,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  profileImageButton: {
    alignSelf: 'center',
    marginBottom: 10,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 0,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  profileImagePlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  chipsRow: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 0,
  },
  chipSelected: {
    // Colors applied inline with theme
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    // Colors applied inline with theme
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  collegeList: {
    marginTop: 8,
  },
  collegeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 0,
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
  collegeOptionDisabled: {
    opacity: 0.7,
  },
  helpText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
})
