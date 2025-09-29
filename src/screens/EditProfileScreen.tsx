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
import { Picker } from '@react-native-picker/picker'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { useTheme } from '../context/ThemeContext'

export default function EditProfileScreen({ navigation }: any) {
  const { theme } = useTheme()
  const [fullName, setFullName] = useState('')
  const [major, setMajor] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [colleges, setColleges] = useState<any[]>([])
  const [graduatingYear, setGraduatingYear] = useState('')
  const [bio, setBio] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
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

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Fetch profile data from profiles table
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
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
          setPhoneNumber(profileData.phone_number || '')
          setProfileImageUri(profileData.avatar_url || null)
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

  const formatUSPhone = (input: string) => {
    const digits = (input || '').replace(/\D/g, '').slice(0, 10)
    const len = digits.length
    if (len <= 3) return digits
    if (len <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  const uploadProfileImage = async (uri: string) => {
    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `profile-${Date.now()}.${fileExt}`
      const filePath = `profile-images/${fileName}`
      const contentType = guessContentTypeFromUri(uri)

      const publicUrl = await uploadBytesToBucket({
        bucket: 'profile-images',
        filePath,
        uri,
        contentType,
      })

      return publicUrl
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

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let avatarUrl = null
      if (profileImageUri && !profileImageUri.startsWith('http')) {
        // Only upload if it's a new local image
        avatarUrl = await uploadProfileImage(profileImageUri)
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
            college_id: collegeId || null,
            graduating_year: graduatingYear || null,
            bio: bio || null,
            avatar_url: avatarUrl || null,
            phone_number: phoneNumber || null,
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
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Profile Picture</Text>
              <TouchableOpacity style={styles.profileImageButton} onPress={pickProfileImage}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={[styles.profileImage, { borderColor: theme.primary }]} />
                ) : (
                  <View style={[styles.profileImagePlaceholder, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
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
              <Text style={[styles.label, { color: theme.text }]}>College *</Text>
              <View style={styles.collegeList}>
                {colleges.map((college) => (
                  <TouchableOpacity
                    key={college.id}
                    style={[
                      styles.collegeOption,
                      { 
                        backgroundColor: collegeId === college.id ? theme.primary : theme.surface,
                        borderColor: collegeId === college.id ? theme.primary : theme.border
                      }
                    ]}
                    onPress={() => setCollegeId(college.id)}
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
                        { color: collegeId === college.id ? theme.buttonText : theme.text }
                      ]}>
                        {college.name}
                      </Text>
                      <Text style={[
                        styles.collegeShortName,
                        { color: collegeId === college.id ? theme.buttonText : theme.textSecondary }
                      ]}>
                        {college.short_name}
                      </Text>
                    </View>
                    {collegeId === college.id && (
                      <Ionicons name="checkmark-circle" size={24} color={theme.buttonText} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
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
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        selected && { backgroundColor: theme.primary, borderColor: theme.primary }
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
              <Text style={[styles.label, { color: theme.text }]}>Phone Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                placeholder="Enter your phone number"
                placeholderTextColor={theme.inputPlaceholder}
                value={phoneNumber}
                onChangeText={(t) => setPhoneNumber(formatUSPhone(t))}
                keyboardType="phone-pad"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={14}
              />
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
  profileImageButton: {
    alignSelf: 'center',
    marginBottom: 10,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
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
    borderWidth: 1,
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
})
