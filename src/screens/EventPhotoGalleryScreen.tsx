import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'
import { uploadBytesToBucket } from '../utils/upload'
import ImageWithFallback from '../components/ImageWithFallback'

interface EventPhotoGalleryScreenProps {
  event: any
  eventImages: string[]
}

type RootStackParamList = {
  EventPhotoGallery: EventPhotoGalleryScreenProps
}

type EventPhotoGalleryRouteProp = RouteProp<RootStackParamList, 'EventPhotoGallery'>

export default function EventPhotoGalleryScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const route = useRoute<EventPhotoGalleryRouteProp>()
  const { event, eventImages } = route.params

  const [images, setImages] = useState<string[]>(eventImages || [])
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [hostProfile, setHostProfile] = useState<any>(null)
  const [privacySettings, setPrivacySettings] = useState({
    isPublic: false,
    showToFriends: false,
    selectedFriends: [] as string[]
  })

  const screenWidth = Dimensions.get('window').width
  const imageSize = (screenWidth - 48) / 3 // 3 columns with proper gaps (16px padding + 8px gaps)

  useEffect(() => {
    console.log('EventPhotoGallery - eventImages changed:', eventImages)
    setImages(eventImages || [])
    fetchHostProfile()
  }, [eventImages])

  const fetchHostProfile = async () => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', event.host_id)
        .eq('otp_verified', true) // Only show OTP verified users
        .single()

      if (error) {
        console.error('Error fetching host profile:', error)
      } else {
        setHostProfile(profile)
      }
    } catch (error) {
      console.error('Error fetching host profile:', error)
    }
  }

  useEffect(() => {
    console.log('EventPhotoGallery - images state changed:', images.length, 'images')
    if (images.length > 0) {
      console.log('EventPhotoGallery - rendering images grid with:', images.length, 'images')
    }
  }, [images])

  const handleAddPhotos = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library')
        return
      }

      // Use string value for mediaTypes to avoid undefined issues
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 0.7,
        exif: false,
      })

      console.log('Image picker result:', result)

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImageUris = result.assets.map(asset => asset.uri)
        console.log('Selected images:', newImageUris)
        setSelectedImages(newImageUris)
        setShowPrivacyModal(true)
      } else if (result.canceled) {
        console.log('User canceled image picker')
      } else {
        console.log('No images selected')
        Alert.alert('No Images', 'Please select at least one image to upload.')
      }
    } catch (error: any) {
      console.error('Error picking images:', error)
      Alert.alert('Error', `Failed to pick images: ${error?.message || 'Unknown error'}`)
    }
  }

  const handleUploadPhotos = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('No Photos Selected', 'Please select at least one photo to upload.')
      return
    }
    
    if (isUploading) {
      Alert.alert('Upload in Progress', 'Please wait for the current upload to complete.')
      return
    }
    
    setIsUploading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'You must be logged in to upload photos.')
        return
      }

      const privacyLevel = privacySettings.isPublic ? 'public' : 
                          (privacySettings.showToFriends ? 'friends_only' : 'attendees_only')
      
      // Upload each photo to Supabase
      const uploadPromises = selectedImages.map(async (imageUri) => {
        try {
          // Create a unique filename
          const timestamp = Date.now()
          const filename = `event_${event.id}_${timestamp}_${Math.random().toString(36).substring(7)}.jpg`
          
          // Use the proper upload utility
          const imageUrl = await uploadBytesToBucket({
            bucket: 'photos',
            filePath: filename,
            uri: imageUri,
            contentType: 'image/jpeg'
          })
          
          // Save photo metadata to database
          const { data: photoData, error: dbError } = await supabase
            .from('event_photos')
            .insert({
              event_id: event.id,
              uploaded_by: user.id,
              image_url: imageUrl,
              privacy_level: privacyLevel,
              caption: `Photo from ${event.title}`
            })
            .select()
            .single()
          
          if (dbError) {
            console.error('Database error:', dbError)
            return null
          }
          
          return photoData
        } catch (error) {
          console.error('Error uploading photo:', error)
          return null
        }
      })
      
      const results = await Promise.all(uploadPromises)
      const successfulUploads = results.filter(result => result !== null)
      
      if (successfulUploads.length > 0) {
        // Update local images state with new photos
        const newImageUrls = successfulUploads.map(photo => photo.image_url)
        const updatedImages = [...images, ...newImageUrls]
        setImages(updatedImages)
        
        // Images will be refetched when user returns to events list
        
        Alert.alert('Success', `${successfulUploads.length} photos uploaded successfully!`)
        console.log('Photos uploaded successfully:', newImageUrls)
        console.log('Updated images array:', updatedImages)
      } else {
        Alert.alert('Error', 'Failed to upload photos. Please try again.')
      }
    } catch (error) {
      console.error('Upload error:', error)
      Alert.alert('Error', 'Failed to upload photos. Please try again.')
    } finally {
      // Reset state
      setIsUploading(false)
      setSelectedImages([])
      setShowPrivacyModal(false)
    }
  }

  const renderImageItem = ({ item, index }: { item: string, index: number }) => {
    console.log('Rendering image item:', item, 'at index:', index)
    return (
      <TouchableOpacity
        style={[styles.imageItem, { width: imageSize, height: imageSize }]}
        onPress={() => {
          // Navigate to photo viewer with event context
          (navigation as any).navigate('PhotoViewer', {
            photo: {
              id: `temp-${index}`,
              imageUrl: item,
              caption: `Photo from ${event.title}`,
              createdAt: new Date().toISOString(),
              uploadedBy: 'current-user' // TODO: Get actual uploader
            },
            event: event,
            hostProfile: hostProfile || {
              full_name: 'Loading...',
              avatar_url: null
            }
          })
        }}
      >
        <ImageWithFallback 
          source={{ uri: item }} 
          style={styles.image}
          fallbackIcon="image-outline"
          fallbackText="Failed to load"
          onError={(error: any) => console.error('Image load error:', error)}
          onLoad={() => console.log('Image loaded successfully:', item)}
        />
      </TouchableOpacity>
    )
  }


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Event Photos</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Event Info */}
      <View style={[styles.eventInfo, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
        <Text style={[styles.eventDate, { color: theme.textSecondary }]}>
          {new Date(event.event_date).toLocaleDateString()} • {event.start_time}
        </Text>
      </View>

      {/* Photo Grid */}
      <View style={styles.content}>
        {images.length > 0 ? (
          <View style={styles.imageGrid}>
            {images.map((image, index) => (
              <View 
                key={`${image}-${index}`}
                style={[
                  styles.imageItem,
                  { 
                    width: imageSize, 
                    height: imageSize,
                    marginRight: (index + 1) % 3 === 0 ? 0 : 8,
                    marginBottom: 8
                  }
                ]}
              >
                <TouchableOpacity
                  style={styles.imageItem}
                  onPress={() => {
                    // Navigate to photo viewer with event context
                    (navigation as any).navigate('PhotoViewer', {
                      photo: {
                        id: `temp-${index}`,
                        imageUrl: image,
                        caption: `Photo from ${event.title}`,
                        createdAt: new Date().toISOString(),
                        uploadedBy: 'current-user' // TODO: Get actual uploader
                      },
                      event: event,
                      hostProfile: hostProfile || {
                        full_name: 'Loading...',
                        avatar_url: null
                      }
                    })
                  }}
                >
                  <ImageWithFallback 
                    source={{ uri: image }} 
                    style={styles.image}
                    fallbackIcon="image-outline"
                    fallbackText="Failed to load"
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>No Photos Yet</Text>
            <Text style={[styles.emptyStateMessage, { color: theme.textSecondary }]}>
              Add photos from this event to share memories
            </Text>
          </View>
        )}
      </View>

      {/* Add Photos Button */}
      <TouchableOpacity
        style={[styles.addPhotosButton, { backgroundColor: theme.primary }]}
        onPress={handleAddPhotos}
      >
        <Ionicons name="camera" size={20} color="white" />
        <Text style={styles.addPhotosText}>Add Photos</Text>
      </TouchableOpacity>

      {/* Privacy Modal */}
      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
              <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Privacy Settings</Text>
            <TouchableOpacity onPress={handleUploadPhotos} disabled={isUploading}>
              <Text style={[
                styles.modalDone, 
                { color: isUploading ? theme.textSecondary : theme.primary }
              ]}>
                {isUploading ? 'Uploading...' : 'Upload'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={[styles.privacySectionTitle, { color: theme.text }]}>
              Who can see these photos?
            </Text>
            
            {/* Public Toggle */}
            <View style={styles.privacySection}>
              <View style={[styles.privacyToggleRow, { backgroundColor: theme.surface }]}>
                <View style={styles.privacyToggleInfo}>
                  <Ionicons name="globe-outline" size={24} color={theme.text} />
                  <View style={styles.privacyToggleText}>
                    <Text style={[styles.privacyToggleTitle, { color: theme.text }]}>
                      Public
                    </Text>
                    <Text style={[styles.privacyToggleDescription, { color: theme.textSecondary }]}>
                      Everyone can see these photos
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    { backgroundColor: privacySettings.isPublic ? theme.primary : theme.border }
                  ]}
                  onPress={() => setPrivacySettings(prev => ({ 
                    ...prev, 
                    isPublic: !prev.isPublic,
                    // When making public, disable friends option
                    showToFriends: !prev.isPublic ? false : prev.showToFriends
                  }))}
                >
                  <View style={[
                    styles.toggleThumb,
                    { 
                      backgroundColor: 'white',
                      transform: [{ translateX: privacySettings.isPublic ? 20 : 2 }]
                    }
                  ]} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Attendee Access Info */}
            <View style={[styles.privacySection, { backgroundColor: theme.primary + '15', padding: 12, borderRadius: 8 }]}>
              <View style={styles.checkboxInfo}>
                <Ionicons name="people" size={24} color={theme.primary} />
                <View style={styles.checkboxText}>
                  <Text style={[styles.checkboxTitle, { color: theme.primary }]}>
                    Event Attendees
                  </Text>
                  <Text style={[styles.checkboxDescription, { color: theme.primary }]}>
                    All people who attended this event can see these photos
                  </Text>
                </View>
              </View>
            </View>

            {/* Friends Option - Only show when not public */}
            {!privacySettings.isPublic && (
              <View style={styles.privacySection}>
                <Text style={[styles.privacySubSectionTitle, { color: theme.text }]}>
                  Additional access:
                </Text>
                
                {/* Friends Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setPrivacySettings(prev => ({ 
                    ...prev, 
                    showToFriends: !prev.showToFriends 
                  }))}
                >
                  <View style={styles.checkboxInfo}>
                    <Ionicons name="person-outline" size={24} color={theme.text} />
                    <View style={styles.checkboxText}>
                      <Text style={[styles.checkboxTitle, { color: theme.text }]}>
                        Also share with friends
                      </Text>
                      <Text style={[styles.checkboxDescription, { color: theme.textSecondary }]}>
                        Your friends can also see these photos (in addition to attendees)
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.checkbox,
                    { 
                      backgroundColor: privacySettings.showToFriends ? theme.primary : 'transparent',
                      borderColor: privacySettings.showToFriends ? theme.primary : theme.border
                    }
                  ]}>
                    {privacySettings.showToFriends && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.selectedImagesPreview}>
              <Text style={[styles.previewTitle, { color: theme.text }]}>
                Selected Photos ({selectedImages.length})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.previewContainer}>
                  {selectedImages.map((imageUri, index) => (
                    <ImageWithFallback 
                      key={index} 
                      source={{ uri: imageUri }} 
                      style={styles.previewImage}
                      fallbackIcon="image-outline"
                      fallbackText=""
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  eventInfo: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  imageGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  imageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  imageItem: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
  },
  addPhotosText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  privacySectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 16,
  },
  privacySection: {
    marginBottom: 24,
  },
  privacySubSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    marginTop: 8,
  },
  privacyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  privacyToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyToggleText: {
    marginLeft: 16,
    flex: 1,
  },
  privacyToggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  privacyToggleDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  checkboxInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkboxText: {
    marginLeft: 16,
    flex: 1,
  },
  checkboxTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkboxDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedImagesPreview: {
    marginTop: 30,
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  previewContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
})
