import React, { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import { getLeaderboard, LeaderboardEntry } from '../services/leaderboardService'
import { prefetchImageUris } from '../utils/imagePrefetch'
import { ImageWithFallback } from '../components'

type ListRow = LeaderboardEntry & { __selfFooter?: boolean }

export default function LeaderboardScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const fetchLeaderboard = async (options?: { force?: boolean }) => {
    try {
      if (!options?.force) {
        setLoading(true)
      }
      const data = await getLeaderboard({ force: options?.force })
      if (!data) return

      setLeaderboard(data.leaderboard)
      setCurrentUserRank(data.currentUserRank)
      setCurrentUserId(data.currentUserId)
      prefetchImageUris(data.leaderboard.map((e) => e.avatar_url))
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
    fetchLeaderboard({ force: true })
  }

  const topThree = useMemo(() => leaderboard.slice(0, 3), [leaderboard])
  const first = topThree[0]
  const second = topThree[1]
  const third = topThree[2]

  const listData = useMemo((): ListRow[] => {
    const ranks4Through10 = leaderboard.slice(3, 10)
    const userOut =
      !!currentUserId &&
      !!currentUserRank &&
      currentUserRank.rank > 10 &&
      !ranks4Through10.some((e) => e.host_id === currentUserId)

    if (userOut) {
      return [...ranks4Through10, { ...currentUserRank, __selfFooter: true }]
    }
    return ranks4Through10
  }, [leaderboard, currentUserId, currentUserRank])

  const podiumGradient = useMemo(
    () => [theme.primary, theme.background] as [string, string],
    [theme.primary, theme.background]
  )

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading leaderboard…</Text>
        </View>
      </SafeAreaView>
    )
  }

  const renderPodiumSlot = (
    entry: LeaderboardEntry | undefined,
    rank: number,
    opts: { avatarSize: number; pedestal: number; highlight?: boolean }
  ) => {
    if (!entry) {
      return <View style={[styles.podiumColumn, { paddingBottom: opts.pedestal, width: 110 }]} />
    }
    const isYou = currentUserId === entry.host_id
    const score = entry.total_rsvps

    return (
      <View style={[styles.podiumColumn, { paddingBottom: opts.pedestal }]}>
        {opts.highlight ? (
          <View style={styles.crownWrap}>
            <Ionicons name="trophy" size={rank === 1 ? 26 : 20} color="#FFD55A" />
          </View>
        ) : (
          <View style={{ height: 26 }} />
        )}
        <View
          style={[
            styles.podiumAvatarRing,
            {
              width: opts.avatarSize + 8,
              height: opts.avatarSize + 8,
              borderRadius: (opts.avatarSize + 8) / 2,
              borderColor:
                rank === 1 ? '#FFD55A' : rank === 2 ? '#9ea3ad' : rank === 3 ? '#b87333' : theme.primary,
            },
          ]}
        >
          {entry.avatar_url ? (
            <ImageWithFallback
              source={{ uri: entry.avatar_url }}
              style={{
                width: opts.avatarSize,
                height: opts.avatarSize,
                borderRadius: opts.avatarSize / 2,
              }}
              fallbackIcon="person"
              fallbackText=""
              resizeMode="cover"
              skipValidation={true}
              priority="high"
            />
          ) : (
            <View
              style={{
                width: opts.avatarSize,
                height: opts.avatarSize,
                borderRadius: opts.avatarSize / 2,
                backgroundColor: theme.primary,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="person" size={opts.avatarSize * 0.35} color="white" />
            </View>
          )}
        </View>
        <View style={[styles.rankPill, { backgroundColor: theme.primary }]}>
          <Text style={styles.rankPillText}>{rank}</Text>
        </View>
        <Text style={[styles.podiumName, { color: '#fff' }]} numberOfLines={1}>
          {entry.full_name || entry.username || 'Host'}
        </Text>
        {isYou ? (
          <Text style={[styles.youTag, { color: '#a8e8ff' }]}>You</Text>
        ) : null}
        <Text style={[styles.podiumScore, { color: '#fff' }]}>{score}</Text>
        <Text style={styles.podiumScoreLabel}>RSVPs</Text>
      </View>
    )
  }

  const renderListRow = ({ item }: { item: ListRow }) => {
    const isSelfRow = !!item.__selfFooter
    const score = item.total_rsvps
    return (
      <View
        style={[
          styles.listRow,
          {
            backgroundColor: isSelfRow ? theme.primary + '18' : theme.card,
          },
        ]}
      >
        <Text style={[styles.listRank, { color: theme.textSecondary }]}>
          {isSelfRow ? `#${item.rank}` : item.rank}
        </Text>
        {item.avatar_url ? (
          <ImageWithFallback
            source={{ uri: item.avatar_url }}
            style={styles.listAvatar}
            fallbackIcon="person"
            fallbackText=""
            resizeMode="cover"
            skipValidation={true}
            priority="normal"
          />
        ) : (
          <View style={[styles.listAvatar, { backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={16} color="white" />
          </View>
        )}
        <View style={styles.listMiddle}>
          <Text style={[styles.listName, { color: theme.text }]} numberOfLines={1}>
            {item.full_name || item.username || 'Anonymous'}
          </Text>
          <View style={styles.listPointsRow}>
            <Ionicons name="star" size={14} color="#f4c430" />
            <Text style={[styles.listPoints, { color: theme.textSecondary, marginLeft: 6 }]}>{score} RSVPs</Text>
          </View>
        </View>
        {isSelfRow ? (
          <Text style={[styles.selfHint, { color: theme.primary }]}>Your rank</Text>
        ) : (
          <View style={{ width: 8 }} />
        )}
      </View>
    )
  }

  return (
    <View style={[styles.screenRoot, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={podiumGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.podiumSection}
      >
        <SafeAreaView edges={['top']} style={styles.podiumSafe}>
          <Text style={styles.heroTitle}>LEADERBOARD</Text>
          <Text style={styles.heroSubtitle}>Top hosts by RSVPs</Text>
          <View style={styles.podiumRow}>
            {renderPodiumSlot(second, 2, { avatarSize: 72, pedestal: 18 })}
            {renderPodiumSlot(first, 1, { avatarSize: 92, pedestal: 36, highlight: true })}
            {renderPodiumSlot(third, 3, { avatarSize: 72, pedestal: 18 })}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={[styles.listSheet, { backgroundColor: theme.background }]}>
        <Text style={[styles.listHeading, { color: theme.text }]}>Rankings</Text>
        <FlatList
          data={listData}
          keyExtractor={(item) => (item.__selfFooter ? `${item.host_id}-self` : item.host_id)}
          renderItem={renderListRow}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 12 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          showsVerticalScrollIndicator
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <Ionicons name="trophy-outline" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyInlineText, { color: theme.textSecondary }]}>
                Not enough hosts yet for a full table.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  podiumSection: {
    paddingBottom: 14,
  },
  podiumSafe: {
    paddingHorizontal: 16,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#ffffff',
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginBottom: 10,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 240,
    paddingHorizontal: 4,
  },
  podiumColumn: {
    alignItems: 'center',
    width: 112,
    marginHorizontal: 2,
  },
  crownWrap: {
    marginBottom: 4,
    height: 28,
    justifyContent: 'flex-end',
  },
  podiumAvatarRing: {
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  rankPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  rankPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  podiumName: {
    fontSize: 15,
    fontWeight: '600',
    maxWidth: 108,
    textAlign: 'center',
  },
  youTag: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  podiumScore: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  podiumScoreLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  listSheet: {
    flex: 1,
    paddingTop: 4,
  },
  listHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 18,
    marginTop: 20,
    marginBottom: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    flexGrow: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  listRank: {
    width: 32,
    fontSize: 15,
    fontWeight: '600',
  },
  listAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  listMiddle: {
    flex: 1,
    minWidth: 0,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
  },
  listPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  listPoints: {
    fontSize: 14,
    fontWeight: '500',
  },
  selfHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyInlineText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
})
