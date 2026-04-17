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
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { ImageWithFallback } from '../components'
import { validateContentWithAlert } from '../utils/contentFilter'
import {
  MAX_ORG_NAME_LENGTH,
  MAX_ORG_DESCRIPTION_LENGTH,
} from '../constants/validation'

export default function OrgEditScreen({ navigation }: any) {
  const { theme } = useTheme()
  const { currentOrg, setOrgMode } = useOrgMode()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'Greek Life' | 'Student Organization'>('Student Organization')
  const [icon, setIcon] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name)
      setDescription(currentOrg.description || '')
      setType(currentOrg.type)
      setIcon(currentOrg.icon)
    }
  }, [currentOrg])

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload an icon')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri
        setLoading(true)
        
        try {
          const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg'
          const fileName = `org-icon-${Date.now()}.${fileExt}`
          const filePath = `org-icons/${fileName}`
          const contentType = guessContentTypeFromUri(uri)

          const uploadedUrl = await uploadBytesToBucket({
            bucket: 'photos',
            filePath,
            uri,
            contentType,
            purpose: 'avatar',
          })

          setIcon(uploadedUrl)
        } catch (error) {
          console.error('Error uploading icon:', error)
          Alert.alert('Error', 'Failed to upload icon')
        } finally {
          setLoading(false)
        }
      }
    } catch (error) {
      console.error('Error picking image:', error)
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const handleSave = async () => {
    if (!currentOrg || !name.trim()) {
      Alert.alert('Error', 'Organization name is required')
      return
    }

    // Security: Validate input lengths
    if (name.trim().length > MAX_ORG_NAME_LENGTH) {
      Alert.alert('Error', `Organization name must be ${MAX_ORG_NAME_LENGTH} characters or less`)
      return
    }
    if (description && description.trim().length > MAX_ORG_DESCRIPTION_LENGTH) {
      Alert.alert('Error', `Description must be ${MAX_ORG_DESCRIPTION_LENGTH} characters or less`)
      return
    }

    // Validate content for objectionable language
    if (!validateContentWithAlert(name.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }
    if (description && description.trim() && !validateContentWithAlert(description.trim(), (message) => Alert.alert('Invalid Content', message))) {
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          type,
          icon,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentOrg.id)
        .select()
        .single()

      if (error) throw error

      // Update the org in context
      setOrgMode(data as any)
      Alert.alert('Success', 'Organization settings updated', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (error: any) {
      console.error('Error updating organization:', error)
      Alert.alert('Error', `Failed to update organization: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Icon Section */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Organization Icon</Text>
            <TouchableOpacity
              style={styles.iconContainer}
              onPress={handlePickImage}
              disabled={loading}
            >
              {icon ? (
                <ImageWithFallback source={{ uri: icon }} style={styles.icon} resizeMode="cover" />
              ) : (
                <View style={[styles.iconPlaceholder, { backgroundColor: theme.primary }]}>
                  <Ionicons name="image-outline" size={40} color="white" />
                </View>
              )}
              <View style={styles.iconOverlay}>
                <Ionicons name="camera" size={24} color="white" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Basic Info Section */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Basic Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Name</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: theme.inputBackground || theme.surface,
                  borderColor: theme.inputBorder || theme.border,
                  color: theme.inputText || theme.text
                }]}
                value={name}
                onChangeText={setName}
                placeholder="Organization name"
                placeholderTextColor={theme.inputPlaceholder || theme.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Type</Text>
              <View style={styles.typeContainer}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    type === 'Greek Life' && { backgroundColor: theme.primary },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setType('Greek Life')}
                >
                  <Text style={[
                    styles.typeButtonText,
                    { color: type === 'Greek Life' ? 'white' : theme.text }
                  ]}>
                    Greek Life
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    type === 'Student Organization' && { backgroundColor: theme.primary },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setType('Student Organization')}
                >
                  <Text style={[
                    styles.typeButtonText,
                    { color: type === 'Student Organization' ? 'white' : theme.text }
                  ]}>
                    Student Organization
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Description</Text>
              <TextInput
                style={[styles.textArea, { 
                  backgroundColor: theme.inputBackground || theme.surface,
                  borderColor: theme.inputBorder || theme.border,
                  color: theme.inputText || theme.text
                }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Organization description"
                placeholderTextColor={theme.inputPlaceholder || theme.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={[styles.saveButtonText, { color: theme.buttonText }]}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  iconContainer: {
    alignSelf: 'center',
    position: 'relative',
  },
  icon: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  iconPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    margin: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})

