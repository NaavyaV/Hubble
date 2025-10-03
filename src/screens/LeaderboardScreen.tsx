import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../services/supabase'

const { width: screenWidth } = Dimensions.get('window')

interface LeaderboardEntry {
  host_id: string
  full_name: string
  username: string
  avatar_url: string
  major: string
  graduating_year: string
  total_rsvps: number
  total_events_hosted: number
  rank: number
}

export default function LeaderboardScreen() {
  const { theme } = useTheme()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const fetchLeaderboard = async () => {
    try {
      setLoading(true)
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      setCurrentUserId(user.id)

      // Fetch all leaderboard data
      const { data, error } = await supabase
        .from('host_leaderboard')
        .select('*')
        .order('rank', { ascending: true })

      if (error) throw error

      const leaderboardData = data || []
      
      // Show all users in traditional leaderboard format
      setLeaderboard(leaderboardData)
      
      // Find current user's rank
      const userEntry = leaderboardData.find(entry => entry.host_id === user.id)
      setCurrentUserRank(userEntry || null)

    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchLeaderboard()
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return { name: 'trophy', color: '#FFD700' }
      case 2:
        return { name: 'medal', color: '#C0C0C0' }
      case 3:
        return { name: 'medal', color: '#CD7F32' }
      default:
        return { name: 'person', color: theme.textSecondary }
    }
  }

  const getRankBackground = (rank: number) => {
    switch (rank) {
      case 1:
        return ['#FFD700', '#FFA500']
      case 2:
        return ['#C0C0C0', '#A8A8A8']
      case 3:
        return ['#CD7F32', '#B8860B']
      default:
        return [theme.surface, theme.surface]
    }
  }

  const renderLeaderboardItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentUser = item.host_id === currentUserId
    const rankIcon = getRankIcon(item.rank)
    const rankBackground = getRankBackground(item.rank)

    return (
      <View
        style={[
          styles.leaderboardItem,
          { 
            backgroundColor: isCurrentUser ? theme.primary + '08' : 'transparent',
            borderLeftColor: isCurrentUser ? theme.primary : 'transparent',
            borderLeftWidth: isCurrentUser ? 4 : 0,
          }
        ]}
      >
        <View style={styles.rankContainer}>
          {item.rank <= 3 ? (
            <LinearGradient
              colors={rankBackground}
              style={styles.rankBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name={rankIcon.name as any} size={16} color="white" />
            </LinearGradient>
          ) : (
            <View style={[styles.rankNumber, { backgroundColor: theme.border }]}>
              <Text style={[styles.rankNumberText, { color: theme.text }]}>
                {item.rank}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
                <Ionicons name="person" size={18} color="white" />
              </View>
            )}
          </View>
          
          <View style={styles.userDetails}>
            <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
              {item.full_name || item.username || 'Anonymous'}
            </Text>
            {item.major && (
              <Text style={[styles.userMajor, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.major}
                {item.graduating_year && ` • ${item.graduating_year}`}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {item.total_rsvps}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              RSVPs
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {item.total_events_hosted}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Events
            </Text>
          </View>
        </View>
      </View>
    )
  }



  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.primary + '20', theme.primary + '05']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Ionicons name="trophy" size={32} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>Top Hosts</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Ranked by total RSVPs received
          </Text>
        </View>
      </LinearGradient>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading leaderboard...
          </Text>
        </View>
      )}

      <FlatList
        data={leaderboard}
        renderItem={renderLeaderboardItem}
        keyExtractor={(item) => item.host_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            progressViewOffset={0}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Users Yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Users will appear here as they join the app!
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 8,
  },
  headerContent: {
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    minHeight: 60,
  },
  rankContainer: {
    marginRight: 16,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  userMajor: {
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 100,
    justifyContent: 'space-between',
  },
  statRow: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 9,
    marginTop: 1,
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
