import React, { useState, useEffect } from 'react'
import { safeFriendshipOrQuery } from '../utils/queryHelpers'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'
import { ImageWithFallback } from '../components'

interface PhotoWithEvent {
  id: string
  image_url: string
  thumbnail_url?: string
  caption?: string
  created_at: string
  uploaded_by: string
  privacy_level: 'public' | 'attendees_only' | 'friends_only'
  event: {
    id: string
    title: string
    event_date: string
    start_time: string
    location: string
    host_id: string
  }
  host_profile: {
    full_name: string
    avatar_url?: string
  }
}

export default function GeneralPhotoGalleryScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [photos, setPhotos] = useState<PhotoWithEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const screenWidth = Dimensions.get('window').width
  const imageSize = (screenWidth - 48) / 3 // 3 columns with proper gaps (16px padding + 8px gaps)

  useEffect(() => {
    fetchPhotos()
  }, [])

  useEffect(() => {
    console.log('GeneralPhotoGallery - photos state changed:', photos.length, 'photos')
    if (photos.length > 0) {
      console.log('GeneralPhotoGallery - rendering photos grid with:', photos.length, 'photos')
    }
  }, [photos])

  const fetchHostProfiles = async (photosData: any[]) => {
    try {
      // Get unique host IDs
      const hostIds = [...new Set(photosData.map(photo => photo.events.host_id))]
      
      if (hostIds.length === 0) return photosData

      // Fetch host profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', hostIds)
        .eq('otp_verified', true) // Only show OTP verified users

      if (error) {
        console.error('Error fetching host profiles:', error)
        return photosData
      }

      // Create a map of profiles
      const profilesMap = profiles?.reduce((acc: any, profile: any) => {
        acc[profile.id] = profile
        return acc
      }, {}) || {}

      // Map profiles to photos
      return photosData.map(photo => ({
        ...photo,
        host_profile: profilesMap[photo.events.host_id] || null
      }))
    } catch (error) {
      console.error('Error in fetchHostProfiles:', error)
      return photosData
    }
  }

  const fetchPhotos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch photos that the user has access to
      const { data: photosData, error } = await supabase
        .from('event_photos')
        .select(`
          id,
          image_url,
          thumbnail_url,
          caption,
          created_at,
          uploaded_by,
          privacy_level,
          events!inner(
            id,
            title,
            event_date,
            start_time,
            location,
            host_id
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching photos:', error)
        return
      }

      // Fetch host profiles separately
      const photosWithHostProfiles = await fetchHostProfiles(photosData || [])
      
      // Filter photos based on user's access permissions
      const accessiblePhotos = await filterAccessiblePhotos(photosWithHostProfiles, user.id)
      console.log('GeneralPhotoGallery - fetched photos:', accessiblePhotos)
      setPhotos(accessiblePhotos)
    } catch (error) {
      console.error('Error fetching photos:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const filterAccessiblePhotos = async (photosData: any[], userId: string) => {
    const accessiblePhotos: PhotoWithEvent[] = []

    for (const photo of photosData) {
      let hasAccess = false

      // Check if user uploaded the photo
      if (photo.uploaded_by === userId) {
        hasAccess = true
      }
      // Check if photo is public
      else if (photo.privacy_level === 'public') {
        hasAccess = true
      }
      // Check if user attended the event (for attendees_only photos)
      else if (photo.privacy_level === 'attendees_only') {
        const { data: attendance } = await supabase
          .from('event_attendees')
          .select('status')
          .eq('event_id', photo.event.id)
          .eq('user_id', userId)
          .eq('status', 'going')
          .single()
        
        if (attendance) {
          hasAccess = true
        }
      }
      // Check if user is friends with uploader (for friends_only photos)
      else if (photo.privacy_level === 'friends_only') {
        const { data: friendship } = await supabase
          .from('friendships')
          .select('status')
          .or(safeFriendshipOrQuery(userId, photo.uploaded_by))
          .eq('status', 'accepted')
          .single()
        
        if (friendship) {
          hasAccess = true
        }
      }

      if (hasAccess) {
        accessiblePhotos.push(photo)
      }
    }

    return accessiblePhotos
  }

  const onRefresh = async () => {
    setRefreshing(true)
    fetchPhotos()
  }

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="images-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>No Photos Yet</Text>
      <Text style={[styles.emptyStateMessage, { color: theme.textSecondary }]}>
        Photos from events will appear here as they're shared
      </Text>
    </View>
  )

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading photos...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {photos.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={3}
          key="grid"
          contentContainerStyle={styles.imageGrid}
          columnWrapperStyle={{ flexDirection: 'row', marginBottom: 8 }}
          renderItem={({ item: photo, index }) => (
            <View
              style={[
                styles.imageItem,
                {
                  width: imageSize,
                  height: imageSize,
                  marginRight: (index % 3) < 2 ? 8 : 0,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.imageItem}
                onPress={() => {
                  (navigation as any).navigate('PhotoViewer', {
                    photo: {
                      id: photo.id,
                      imageUrl: photo.image_url,
                      caption: photo.caption || `Photo from ${photo.event?.title || 'Unknown Event'}`,
                      createdAt: photo.created_at,
                      uploadedBy: photo.uploaded_by
                    },
                    event: photo.event || {
                      id: 'unknown',
                      title: 'Unknown Event',
                      event_date: new Date().toISOString().split('T')[0],
                      start_time: '00:00',
                      location: 'Unknown Location',
                      host_id: 'unknown'
                    },
                    hostProfile: photo.host_profile || {
                      full_name: 'Unknown Host',
                      avatar_url: null
                    }
                  })
                }}
              >
                <ImageWithFallback
                  source={{ uri: photo.thumbnail_url || photo.image_url }}
                  style={styles.image}
                  resizeMode="cover"
                  fallbackIcon="image-outline"
                  fallbackText="Failed to load"
                />
                <View style={styles.privacyIndicator}>
                  <Ionicons
                    name={
                      photo.privacy_level === 'public' ? 'globe' :
                      photo.privacy_level === 'attendees_only' ? 'people' : 'person'
                    }
                    size={12}
                    color="white"
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
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
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  privacyIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    padding: 4,
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
})
