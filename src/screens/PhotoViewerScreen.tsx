import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { useTheme } from '../context/ThemeContext'
import { ImageWithFallback } from '../components'

interface PhotoViewerScreenProps {
  photo: {
    id: string
    imageUrl: string
    caption?: string
    createdAt: string
    uploadedBy: string
  }
  event: {
    id: string
    title: string
    event_date: string
    start_time: string
    location: string
    host_id: string
  }
  hostProfile: {
    full_name: string
    avatar_url?: string
  }
}

type RootStackParamList = {
  PhotoViewer: PhotoViewerScreenProps
}

type PhotoViewerRouteProp = RouteProp<RootStackParamList, 'PhotoViewer'>

export default function PhotoViewerScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const route = useRoute<PhotoViewerRouteProp>()
  const { photo, event, hostProfile } = route.params

  const screenWidth = Dimensions.get('window').width
  const screenHeight = Dimensions.get('window').height
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [containerHeight, setContainerHeight] = useState(screenHeight * 0.7)

  // Calculate optimal container height based on common aspect ratios
  useEffect(() => {
    const maxHeight = screenHeight * 0.8
    const minHeight = screenHeight * 0.5
    
    // Use a height that works well for most common photo aspect ratios
    // 4:3, 16:9, 1:1, 3:2 - this height minimizes black borders for these ratios
    const optimalHeight = Math.min(maxHeight, Math.max(minHeight, screenWidth * 1.33))
    setContainerHeight(optimalHeight)
  }, [screenWidth, screenHeight])

  const handleImageLoad = (event: any) => {
    const { width, height } = event.nativeEvent.source
    const aspectRatio = height / width
    
    // Calculate container height based on actual image aspect ratio
    const maxHeight = screenHeight * 0.8
    const minHeight = screenHeight * 0.5
    
    let calculatedHeight = screenWidth * aspectRatio
    
    // Clamp the height within reasonable bounds
    calculatedHeight = Math.max(minHeight, Math.min(maxHeight, calculatedHeight))
    
    setContainerHeight(calculatedHeight)
    setImageAspectRatio(aspectRatio)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown Date'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch (error) {
      console.error('Error formatting date:', error)
      return 'Invalid Date'
    }
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return 'Unknown Time'
    try {
      return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch (error) {
      console.error('Error formatting time:', error)
      return 'Invalid Time'
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Photo</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        <View style={[styles.photoContainer, { height: containerHeight }]}>
          <Image 
            source={{ uri: photo.imageUrl }} 
            style={styles.photo}
            resizeMode="contain"
            onError={(error) => console.error('Image load error:', error)}
            onLoad={handleImageLoad}
          />
        </View>

        {/* Photo Info */}
        <View style={[styles.photoInfo, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          {photo.caption && (
            <Text style={[styles.caption, { color: theme.text }]}>{photo.caption}</Text>
          )}
          <View style={styles.uploadInfo}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.uploadDate, { color: theme.textSecondary }]}>
              Uploaded {formatDate(photo.createdAt)}
            </Text>
          </View>
        </View>

        {/* Event Info */}
        <View style={[styles.eventInfo, { backgroundColor: theme.card }]}>
          <View style={styles.eventHeader}>
            <View style={[styles.eventIconContainer, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name="calendar-outline" size={20} color={theme.primary} />
            </View>
            <Text style={[styles.eventInfoTitle, { color: theme.text }]}>From Event</Text>
          </View>
          
          <Text style={[styles.eventTitle, { color: theme.text }]}>{event?.title || 'Unknown Event'}</Text>
          
          <View style={styles.eventDetails}>
            <View style={[styles.eventDetailCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.eventDetailIcon, { backgroundColor: '#e74c3c20' }]}>
                <Ionicons name="calendar" size={16} color="#e74c3c" />
              </View>
              <Text style={[styles.eventDetailText, { color: theme.text }]}>
                {formatDate(event?.event_date)}
              </Text>
            </View>
            
            <View style={[styles.eventDetailCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.eventDetailIcon, { backgroundColor: '#f39c1220' }]}>
                <Ionicons name="time" size={16} color="#f39c12" />
              </View>
              <Text style={[styles.eventDetailText, { color: theme.text }]}>
                {formatTime(event?.start_time)}
              </Text>
            </View>
            
            <View style={[styles.eventDetailCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.eventDetailIcon, { backgroundColor: '#27ae6020' }]}>
                <Ionicons name="location" size={16} color="#27ae60" />
              </View>
              <Text style={[styles.eventDetailText, { color: theme.text }]} numberOfLines={1}>
                {event?.location || 'Unknown Location'}
              </Text>
            </View>
          </View>

          <View style={[styles.hostInfo, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={styles.hostAvatar}>
              {hostProfile?.avatar_url ? (
                <ImageWithFallback 
                  source={{ uri: hostProfile.avatar_url }} 
                  style={styles.hostAvatarImage}
                  fallbackIcon="person-outline"
                  fallbackText=""
                />
              ) : (
                <View style={[styles.hostAvatarPlaceholder, { backgroundColor: theme.primary }]}>
                  <Text style={styles.hostAvatarText}>
                    {hostProfile?.full_name?.charAt(0).toUpperCase() || 'H'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.hostDetails}>
              <Text style={[styles.hostLabel, { color: theme.textSecondary }]}>Hosted by</Text>
              <Text style={[styles.hostName, { color: theme.text }]}>{hostProfile?.full_name || 'Unknown Host'}</Text>
            </View>
            <Ionicons name="person-outline" size={20} color={theme.textSecondary} />
          </View>
        </View>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  photoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    width: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  photoInfo: {
    padding: 20,
    borderBottomWidth: 1,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  uploadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadDate: {
    fontSize: 14,
    marginLeft: 6,
  },
  eventInfo: {
    padding: 20,
    marginBottom: 20,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  eventDetails: {
    marginBottom: 20,
  },
  eventDetailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  eventDetailIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventDetailText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderTopWidth: 1,
  },
  hostAvatar: {
    marginRight: 12,
  },
  hostAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  hostAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  hostDetails: {
    flex: 1,
  },
  hostLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  hostName: {
    fontSize: 16,
    fontWeight: '600',
  },
})
