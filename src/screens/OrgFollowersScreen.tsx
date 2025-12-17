import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import ImageWithFallback from '../components/ImageWithFallback'

interface Follower {
  id: string
  user_id: string
  created_at: string
  profile: {
    id: string
    full_name: string | null
    avatar_url: string | null
    username: string | null
  }
}

export default function OrgFollowersScreen() {
  const { theme } = useTheme()
  const { currentOrg } = useOrgMode()
  const [followers, setFollowers] = useState<Follower[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)

  const fetchFollowers = async () => {
    try {
      if (!currentOrg) return

      const { data: followersData, error } = await supabase
        .from('org_followers')
        .select(`
          id,
          user_id,
          created_at
        `)
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch profiles separately
      const userIds = (followersData || []).map(f => f.user_id)
      let profilesMap: Record<string, any> = {}
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, username')
          .in('id', userIds)
        
        if (profilesData) {
          profilesMap = profilesData.reduce((acc, profile) => {
            acc[profile.id] = profile
            return acc
          }, {} as Record<string, any>)
        }
      }

      const processedFollowers = (followersData || []).map(f => ({
        id: f.id,
        user_id: f.user_id,
        created_at: f.created_at,
        profile: profilesMap[f.user_id] || null
      }))

      setFollowers(processedFollowers)
      setFollowerCount(processedFollowers.length)
    } catch (error) {
      console.error('Error fetching followers:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchFollowers()
  }, [currentOrg])

  const onRefresh = () => {
    setRefreshing(true)
    fetchFollowers()
  }

  const renderFollower = ({ item }: { item: Follower }) => {
    const displayName = item.profile?.full_name || item.profile?.username || 'Unknown'
    
    return (
      <View style={[styles.followerCard, { 
        backgroundColor: theme.card || theme.surface, 
        borderColor: theme.border,
        shadowColor: theme.shadow 
      }]}>
        <View style={styles.followerLeft}>
          {item.profile?.avatar_url ? (
            <ImageWithFallback 
              source={{ uri: item.profile.avatar_url }} 
              style={styles.avatar}
              fallbackIcon="person"
              fallbackText={displayName.charAt(0).toUpperCase()}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.followerRight}>
          <Text style={[styles.followerName, { color: theme.text }]}>{displayName}</Text>
          <Text style={[styles.followerDate, { color: theme.textSecondary }]}>
            Following since {new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric'
            })}
          </Text>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading followers...</Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <FlatList
        data={followers}
        renderItem={renderFollower}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.followersList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Followers</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Your organization doesn't have any followers yet.
            </Text>
          </View>
        }
      />

      {/* Floating Follower Count Icon */}
      <View style={[styles.floatingCount, { backgroundColor: theme.primary }]}>
        <Ionicons name="people" size={24} color={theme.buttonText} />
        <Text style={[styles.floatingCountText, { color: theme.buttonText }]}>
          {followerCount}
        </Text>
      </View>
    </SafeAreaView>
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
  floatingCount: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    gap: 8,
  },
  floatingCountText: {
    fontSize: 16,
    fontWeight: '600',
  },
  followersList: {
    padding: 20,
  },
  followerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
  },
  followerLeft: {
    marginRight: 16,
  },
  followerRight: {
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  followerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  followerDate: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 32,
  },
})

