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

export default function EditProfileScreen({ navigation }: any) {
  const [fullName, setFullName] = useState('')
  const [major, setMajor] = useState('')
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
  }, [])

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setFullName(user.user_metadata?.full_name || '')
        setMajor(user.user_metadata?.major || '')
        setGraduatingYear(user.user_metadata?.graduating_year || '')
        setBio(user.user_metadata?.bio || '')
        setPhoneNumber(user.user_metadata?.phone_number || '')
        setProfileImageUri(user.user_metadata?.avatar_url || null)
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

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          major: major,
          graduating_year: graduatingYear,
          bio: bio,
          avatar_url: avatarUrl,
          phone_number: phoneNumber,
        }
      })

      if (error) throw error

      // Mirror to public profiles table for cross-user visibility
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
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Profile Picture</Text>
              <TouchableOpacity style={styles.profileImageButton} onPress={pickProfileImage}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.profileImage} />
                ) : (
                  <View style={styles.profileImagePlaceholder}>
                    <Text style={styles.profileImagePlaceholderText}>+</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={fullName}
                onChangeText={setFullName}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Major</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Computer Science, Business, etc."
                value={major}
                onChangeText={setMajor}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Graduating Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {graduatingYearOptions.map((year) => {
                  const selected = graduatingYear === year
                  return (
                    <TouchableOpacity
                      key={year}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setGraduatingYear(year)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your phone number"
                value={phoneNumber}
                onChangeText={(t) => setPhoneNumber(formatUSPhone(t))}
                keyboardType="phone-pad"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={14}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Tell us about yourself"
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>
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
    backgroundColor: '#f8f9fa',
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
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2c3e50',
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
    borderColor: '#3498db',
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e1e8ed',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#3498db',
  },
  profileImagePlaceholderText: {
    fontSize: 32,
    color: '#7f8c8d',
    fontWeight: 'bold',
  },
  chipsRow: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  chipSelected: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  chipText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: 'white',
  },
  saveButton: {
    backgroundColor: '#3498db',
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
    color: 'white',
  },
})
