import React, { useState, useEffect, useRef } from 'react'
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
import { getCachedUser } from '../services/sessionService'
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

const PHOTO_PAGE_SIZE = 60

export default function GeneralPhotoGalleryScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [photos, setPhotos] = useState<PhotoWithEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  /** Next `range()` start for Supabase (raw rows), not filtered list length */
  const nextDbOffsetRef = useRef(0)

  const screenWidth = Dimensions.get('window').width
  const imageSize = (screenWidth - 48) / 3 // 3 columns with proper gaps (16px padding + 8px gaps)

  useEffect(() => {
    fetchPhotos(true)
  }, [])

  const fetchHostProfiles = async (photosData: any[]) => {
    try {
      // Get unique host IDs
      const hostIds = [
        ...new Set(
          photosData.map((photo) => (photo.event ?? photo.events)?.host_id).filter(Boolean),
        ),
      ]
      
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
      return photosData.map((photo) => {
        const ev = photo.event ?? photo.events
        return {
          ...photo,
          event: ev,
          host_profile: profilesMap[ev.host_id] || null,
        }
      })
    } catch (error) {
      console.error('Error in fetchHostProfiles:', error)
      return photosData
    }
  }

  const fetchPhotos = async (reset = false) => {
    try {
      const user = await getCachedUser()
      if (!user) return

      if (!reset && (loadingMore || !hasMore)) return

      if (reset) {
        setLoading(true)
        setHasMore(true)
        nextDbOffsetRef.current = 0
      } else {
        setLoadingMore(true)
      }

      const start = nextDbOffsetRef.current
      const end = start + PHOTO_PAGE_SIZE - 1

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
        .range(start, end)

      if (error) {
        console.error('Error fetching photos:', error)
        return
      }

      const normalized = (photosData || []).map((p: any) => ({
        ...p,
        event: p.events,
      }))

      const photosWithHostProfiles = await fetchHostProfiles(normalized)
      const accessiblePhotos = await filterAccessiblePhotos(photosWithHostProfiles, user.id)

      if (reset) {
        setPhotos(accessiblePhotos)
      } else {
        setPhotos((prev) => {
          const seen = new Set(prev.map((x) => x.id))
          const merged = [...prev]
          for (const p of accessiblePhotos) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          return merged
        })
      }

      const batchLen = (photosData || []).length
      nextDbOffsetRef.current = start + batchLen
      if (batchLen < PHOTO_PAGE_SIZE) {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Error fetching photos:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  const filterAccessiblePhotos = async (photosData: any[], userId: string) => {
    const attendeeOnlyEventIds = [
      ...new Set(
        photosData
          .filter((photo) => {
            const ev = photo.event ?? photo.events
            return photo.privacy_level === 'attendees_only' && ev?.id
          })
          .map((photo) => (photo.event ?? photo.events).id),
      ),
    ]
    const friendOnlyUploaderIds = [
      ...new Set(
        photosData
          .filter((photo) => photo.privacy_level === 'friends_only' && photo?.uploaded_by)
          .map((photo) => photo.uploaded_by)
      ),
    ]

    const [attendanceResult, outgoingFriendsResult, incomingFriendsResult] = await Promise.all([
      attendeeOnlyEventIds.length > 0
        ? supabase
            .from('event_attendees')
            .select('event_id')
            .eq('user_id', userId)
            .eq('status', 'going')
            .in('event_id', attendeeOnlyEventIds)
        : Promise.resolve({ data: [], error: null } as any),
      friendOnlyUploaderIds.length > 0
        ? supabase
            .from('friendships')
            .select('friend_id')
            .eq('status', 'accepted')
            .eq('user_id', userId)
            .in('friend_id', friendOnlyUploaderIds)
        : Promise.resolve({ data: [], error: null } as any),
      friendOnlyUploaderIds.length > 0
        ? supabase
            .from('friendships')
            .select('user_id')
            .eq('status', 'accepted')
            .eq('friend_id', userId)
            .in('user_id', friendOnlyUploaderIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    const attendedEventIds = new Set((attendanceResult.data || []).map((row: any) => row.event_id))
    const acceptedFriendIds = new Set<string>([
      ...(outgoingFriendsResult.data || []).map((row: any) => row.friend_id),
      ...(incomingFriendsResult.data || []).map((row: any) => row.user_id),
    ])

    return photosData.filter((photo) => {
      if (photo.uploaded_by === userId) return true
      if (photo.privacy_level === 'public') return true
      if (photo.privacy_level === 'attendees_only')
        return attendedEventIds.has(photo.events?.id ?? photo.event?.id)
      if (photo.privacy_level === 'friends_only') return acceptedFriendIds.has(photo.uploaded_by)
      return false
    })
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchPhotos(true)
  }

  const onEndReached = () => {
    if (!loading && !loadingMore && hasMore) {
      fetchPhotos(false)
    }
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
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
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
