import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import ProfileModal from '../components/ProfileModal'
import ImageWithFallback from '../components/ImageWithFallback'
import { useTheme } from '../context/ThemeContext'

interface ProfileRow {
  id: string
  full_name?: string
  avatar_url?: string
  phone_number?: string
  major?: string
  graduating_year?: string
  bio?: string
}

interface FriendshipRow {
  id: string
  user_id: string
  friend_id: string
  status: 'pending' | 'accepted' | 'blocked'
}

export default function FriendsScreen() {
  const { theme } = useTheme()
  const [me, setMe] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [allUsers, setAllUsers] = useState<ProfileRow[]>([])
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [incoming, setIncoming] = useState<FriendshipRow[]>([])
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([])
  const [incomingProfiles, setIncomingProfiles] = useState<Record<string, ProfileRow>>({})
  const [outgoingProfiles, setOutgoingProfiles] = useState<Record<string, ProfileRow>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'search' | 'pending' | 'friends'>('search')
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null)
  const [recentlyAccepted, setRecentlyAccepted] = useState<Set<string>>(new Set())
  const isInitialMount = React.useRef(true)
  const hasInitialized = React.useRef(false)

  useEffect(() => {
    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.log('Loading timeout reached, forcing loading to false')
        setLoading(false)
      }
    }, 15000) // 15 second timeout to give more time

    init()

    return () => clearTimeout(timeoutId)
  }, [])

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const refreshData = async () => {
        if (!me || !hasInitialized.current) return
        
        console.log('FriendsScreen: Refreshing data on focus...')
        try {
          await Promise.all([
            fetchAllUsers(),
            fetchFriendships(me),
          ])
          console.log('FriendsScreen: Data refreshed successfully')
        } catch (error) {
          console.error('FriendsScreen: Error refreshing data:', error)
        }
      }
      
      refreshData()
    }, [me])
  )

  // Refresh data when switching tabs
  useEffect(() => {
    // Skip refresh on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const refreshData = async () => {
      if (!me || !hasInitialized.current) return
      
      console.log(`FriendsScreen: Tab switched to ${activeTab}, refreshing data...`)
      try {
        await Promise.all([
          fetchAllUsers(),
          fetchFriendships(me),
        ])
        console.log(`FriendsScreen: Data refreshed for ${activeTab} tab`)
      } catch (error) {
        console.error('FriendsScreen: Error refreshing data on tab switch:', error)
      }
    }
    
    refreshData()
  }, [activeTab, me])

  const init = async () => {
    try {
      console.log('Starting FriendsScreen initialization...')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('No authenticated user found')
        setLoading(false)
        return
      }

      console.log('User found, setting up...')
      setMe(user.id)
      
      console.log('Fetching users and friendships...')
      await Promise.all([
        fetchAllUsers(),
        fetchFriendships(user.id),
      ])
      
      console.log('FriendsScreen initialization complete')
      hasInitialized.current = true
    } catch (error) {
      console.error('Error initializing FriendsScreen:', error)
    } finally {
      console.log('Setting loading to false')
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      console.log('Fetching all users...')
      // Only fetch users who have completed OTP verification
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, full_name, avatar_url, phone_number, major, graduating_year, bio
        `)
        .eq('otp_verified', true) // Only show OTP verified users
        .order('full_name')
        .limit(1000) // Add reasonable limit to prevent massive queries

      if (error) {
        console.error('Error fetching users:', error)
        // Don't throw error, just log it and continue with empty array
        setAllUsers([])
        return
      }
      
      console.log('Fetched users:', data?.length || 0, 'users')
      setAllUsers(data || [])
      console.log('Users state updated')
    } catch (error) {
      console.error('Error fetching users:', error)
      // Don't show alert during initialization, just log the error
      console.log('Setting empty users array due to error')
      setAllUsers([])
    }
  }

  const fetchFriendships = async (userId: string) => {
    try {
      console.log('Fetching friendships for user:', userId)
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

      if (error) throw error

      const friendshipsData = data || []
      console.log('Fetched friendships:', friendshipsData.length)
      setFriendships(friendshipsData)

      // Separate incoming and outgoing requests
      const incomingRequests = friendshipsData.filter(
        f => f.friend_id === userId && f.status === 'pending'
      )
      const outgoingRequests = friendshipsData.filter(
        f => f.user_id === userId && f.status === 'pending'
      )
      
      setIncoming(incomingRequests)
      setOutgoing(outgoingRequests)

      // Optimize: Fetch all needed profiles in parallel
      const allProfileIds = [
        ...incomingRequests.map(f => f.user_id),
        ...outgoingRequests.map(f => f.friend_id)
      ].filter((id, index, arr) => arr.indexOf(id) === index) // Remove duplicates

      if (allProfileIds.length > 0) {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', allProfileIds)
          // Note: Don't filter by OTP for pending requests - we want to show all pending requests

        // Create maps for incoming and outgoing
        const incomingMap: Record<string, ProfileRow> = {}
        const outgoingMap: Record<string, ProfileRow> = {}
        
        allProfiles?.forEach(profile => {
          if (incomingRequests.some(f => f.user_id === profile.id)) {
            incomingMap[profile.id] = profile
          }
          if (outgoingRequests.some(f => f.friend_id === profile.id)) {
            outgoingMap[profile.id] = profile
          }
        })
        
        setIncomingProfiles(incomingMap)
        setOutgoingProfiles(outgoingMap)
      }
    } catch (error) {
      console.error('Error fetching friendships:', error)
      // Set empty arrays on error to prevent loading state issues
      setFriendships([])
      setIncoming([])
      setOutgoing([])
      setIncomingProfiles({})
      setOutgoingProfiles({})
    }
  }

  const searchResults = useMemo(() => {
    const filtered = allUsers.filter(user => user.id !== me)
    
    // If searching, show everyone
    if (query.trim()) {
      return filtered.filter(user => 
        user.full_name?.toLowerCase().includes(query.toLowerCase())
      )
    }
    
    // If not searching, exclude friends, requests, and pending
    const friendIds = new Set()
    const requestIds = new Set()
    const pendingIds = new Set()
    
    friendships.forEach(f => {
      if (f.status === 'accepted') {
        friendIds.add(f.user_id === me ? f.friend_id : f.user_id)
      } else if (f.status === 'pending') {
        if (f.user_id === me) {
          pendingIds.add(f.friend_id)
        } else {
          requestIds.add(f.user_id)
        }
      }
    })
    
    return filtered.filter(user => 
      !friendIds.has(user.id) && 
      !requestIds.has(user.id) && 
      !pendingIds.has(user.id)
    )
  }, [query, allUsers, me, friendships])

  const friends = useMemo(() => {
    return allUsers.filter(user => {
      if (user.id === me) return false
      return friendships.some(f => 
        f.status === 'accepted' && 
        (f.user_id === user.id || f.friend_id === user.id)
      )
    })
  }, [allUsers, friendships, me])

  const getFriendshipStatus = (userId: string) => {
    const friendship = friendships.find(f => 
      (f.user_id === me && f.friend_id === userId) ||
      (f.user_id === userId && f.friend_id === me)
    )
    return friendship?.status || null
  }

  const sendFriendRequest = async (friendId: string) => {
    if (!me) return

    try {
      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: me,
          friend_id: friendId,
          status: 'pending'
        })

      if (error) throw error

      // Update local state immediately
      const newFriendship: FriendshipRow = {
        id: `temp-${Date.now()}`, // Temporary ID until we refetch
        user_id: me,
        friend_id: friendId,
        status: 'pending'
      }
      
      setFriendships(prev => [...prev, newFriendship])
      setOutgoing(prev => [...prev, newFriendship])

      Alert.alert('Success', 'Friend request sent!')
      
      // Refetch to get the real ID from database
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error sending friend request:', error)
      Alert.alert('Error', 'Failed to send friend request')
    }
  }

  const acceptFriendRequest = async (friendshipId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId)

      if (error) throw error

      // Update local state immediately
      setFriendships(prev => prev.map(f => 
        f.id === friendshipId ? { ...f, status: 'accepted' as const } : f
      ))
      setIncoming(prev => prev.filter(f => f.id !== friendshipId))
      setRecentlyAccepted(prev => new Set([...prev, userId]))
      
      // Auto-remove from recently accepted after 5 seconds
      setTimeout(() => {
        setRecentlyAccepted(prev => {
          const newSet = new Set(prev)
          newSet.delete(userId)
          return newSet
        })
      }, 5000)

      Alert.alert('Success', 'Friend request accepted!')
      
      // Refetch to ensure consistency
      if (me) await fetchFriendships(me)
    } catch (error) {
      console.error('Error accepting friend request:', error)
      Alert.alert('Error', 'Failed to accept friend request')
    }
  }

  const undoAcceptFriendRequest = async (userId: string) => {
    if (!me) return

    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', userId)
        .eq('friend_id', me)
        .eq('status', 'accepted')

      if (error) throw error

      Alert.alert('Success', 'Friend request undone')
      setRecentlyAccepted(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error undoing friend request:', error)
      Alert.alert('Error', 'Failed to undo friend request')
    }
  }

  const ignoreFriendRequest = async (friendshipId: string) => {
    Alert.alert(
      'Ignore Friend Request',
      'Are you sure you want to ignore this friend request? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ignore',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId)

              if (error) throw error

              // Update local state immediately
              setFriendships(prev => prev.filter(f => f.id !== friendshipId))
              setIncoming(prev => prev.filter(f => f.id !== friendshipId))

              Alert.alert('Success', 'Friend request ignored')
              
              // Refetch to ensure consistency
              if (me) await fetchFriendships(me)
            } catch (error) {
              console.error('Error ignoring friend request:', error)
              Alert.alert('Error', 'Failed to ignore friend request')
            }
          },
        },
      ]
    )
  }

  const cancelFriendRequest = async (friendId: string) => {
    if (!me) return

    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', me)
        .eq('friend_id', friendId)
        .eq('status', 'pending')

      if (error) throw error

      // Update local state immediately
      setFriendships(prev => prev.filter(f => 
        !(f.user_id === me && f.friend_id === friendId && f.status === 'pending')
      ))
      setOutgoing(prev => prev.filter(f => f.friend_id !== friendId))

      Alert.alert('Success', 'Friend request cancelled')
      
      // Refetch to ensure consistency
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error cancelling friend request:', error)
      Alert.alert('Error', 'Failed to cancel friend request')
    }
  }

  const unfriend = async (friendId: string, friendName: string) => {
    if (!me) return

    Alert.alert(
      'Unfriend',
      `Are you sure you want to unfriend ${friendName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${me},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${me})`)

              if (error) throw error

              // Update local state immediately
              setFriendships(prev => prev.filter(f => 
                !((f.user_id === me && f.friend_id === friendId) || (f.user_id === friendId && f.friend_id === me))
              ))

              Alert.alert('Success', 'Unfriended')
              
              // Refetch to ensure consistency
              await fetchFriendships(me)
            } catch (error) {
              console.error('Error unfriending:', error)
              Alert.alert('Error', 'Failed to unfriend')
            }
          },
        },
      ]
    )
  }

  const renderAvatar = (user: ProfileRow) => {
    if (user.avatar_url) {
      return (
        <ImageWithFallback 
          source={{ uri: user.avatar_url }} 
          style={styles.avatarImage}
          fallbackIcon="person"
          fallbackText=""
          resizeMode="cover"
          skipValidation={true}
          priority="high"
        />
      )
    }
    return (
      <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
        <Text style={[styles.avatarText, { color: theme.buttonText }]}>
          {user.full_name?.charAt(0).toUpperCase() || 'U'}
        </Text>
      </View>
    )
  }

  const renderUserItem = ({ item }: { item: ProfileRow }) => {
    const status = getFriendshipStatus(item.id)
    const isIncoming = incoming.some(f => f.user_id === item.id)
    const isRecentlyAccepted = recentlyAccepted.has(item.id)

    return (
      <TouchableOpacity
        style={[styles.userItem, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
        onPress={() => setSelectedUser(item)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(item)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={[styles.userName, { color: theme.text }]}>{item.full_name || 'Unknown'}</Text>
              {status === 'pending' && (
                <View style={[styles.pendingBadge, { backgroundColor: theme.warning }]}>
                  <Text style={[styles.pendingText, { color: theme.buttonText }]}>Pending</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          {status === 'accepted' ? (
            <View style={styles.moreIcon}>
              <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
            </View>
          ) : status === 'pending' ? (
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: theme.error }]}
              onPress={() => cancelFriendRequest(item.id)}
            >
              <Text style={[styles.cancelText, { color: theme.buttonText }]}>Cancel</Text>
            </TouchableOpacity>
          ) : isIncoming ? (
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={[styles.acceptButton, { backgroundColor: theme.success }]}
                onPress={() => {
                  const friendship = incoming.find(f => f.user_id === item.id)
                  if (friendship) acceptFriendRequest(friendship.id, item.id)
                }}
              >
                <Text style={[styles.acceptText, { color: theme.buttonText }]}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ignoreButton, { backgroundColor: theme.error }]}
                onPress={() => {
                  const friendship = incoming.find(f => f.user_id === item.id)
                  if (friendship) ignoreFriendRequest(friendship.id)
                }}
              >
                <Text style={[styles.ignoreText, { color: theme.buttonText }]}>Ignore</Text>
              </TouchableOpacity>
            </View>
          ) : isRecentlyAccepted ? (
            <TouchableOpacity
              style={[styles.undoButton, { backgroundColor: theme.warning }]}
              onPress={() => undoAcceptFriendRequest(item.id)}
            >
              <Text style={[styles.undoText, { color: theme.buttonText }]}>Undo</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.buttonPrimary }]}
              onPress={() => sendFriendRequest(item.id)}
            >
              <Text style={[styles.addText, { color: theme.buttonText }]}>Add Friend</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderIncomingRequest = ({ item }: { item: FriendshipRow }) => {
    const profile = incomingProfiles[item.user_id]
    if (!profile) return null

    const isRecentlyAccepted = recentlyAccepted.has(profile.id)

    return (
      <TouchableOpacity
        style={[styles.userItem, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
        onPress={() => setSelectedUser(profile)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(profile)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={[styles.userName, { color: theme.text }]}>{profile.full_name || 'Unknown'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          {isRecentlyAccepted ? (
            <TouchableOpacity
              style={[styles.undoButton, { backgroundColor: theme.warning }]}
              onPress={() => undoAcceptFriendRequest(profile.id)}
            >
              <Text style={[styles.undoText, { color: theme.buttonText }]}>Undo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={[styles.acceptButton, { backgroundColor: theme.success }]}
                onPress={() => acceptFriendRequest(item.id, profile.id)}
              >
                <Text style={[styles.acceptText, { color: theme.buttonText }]}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ignoreButton, { backgroundColor: theme.error }]}
                onPress={() => ignoreFriendRequest(item.id)}
              >
                <Text style={[styles.ignoreText, { color: theme.buttonText }]}>Ignore</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderOutgoingRequest = ({ item }: { item: FriendshipRow }) => {
    const profile = outgoingProfiles[item.friend_id]
    if (!profile) return null

    return (
      <TouchableOpacity
        style={[styles.userItem, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
        onPress={() => setSelectedUser(profile)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(profile)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={[styles.userName, { color: theme.text }]}>{profile.full_name || 'Unknown'}</Text>
              <View style={[styles.pendingBadge, { backgroundColor: theme.warning }]}>
                <Text style={[styles.pendingText, { color: theme.buttonText }]}>Pending</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: theme.error }]}
            onPress={() => cancelFriendRequest(profile.id)}
          >
            <Text style={[styles.cancelText, { color: theme.buttonText }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return (
          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
              placeholder="Search users..."
              placeholderTextColor={theme.inputPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading users...</Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {allUsers.length === 0 
                    ? 'No users found. Make sure you have created profiles in the database.'
                    : query.trim()
                    ? 'No users match your search.'
                    : 'No new users to discover.'
                  }
                </Text>
                <TouchableOpacity 
                  style={[styles.refreshButton, { backgroundColor: theme.buttonPrimary }]}
                  onPress={fetchAllUsers}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.buttonText }]}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                renderItem={renderUserItem}
                style={styles.list}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )
      case 'pending':
        return (
          <View style={styles.pendingContainer}>
            {/* Incoming Requests Section */}
            {incoming.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Incoming Requests</Text>
                <FlatList
                  data={incoming}
                  keyExtractor={(item) => `incoming-${item.id}`}
                  renderItem={renderIncomingRequest}
                  style={styles.sectionList}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
            
            {/* Outgoing Requests Section */}
            {outgoing.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Outgoing Requests</Text>
                <FlatList
                  data={outgoing}
                  keyExtractor={(item) => `outgoing-${item.id}`}
                  renderItem={renderOutgoingRequest}
                  style={styles.sectionList}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {/* Empty State */}
            {incoming.length === 0 && outgoing.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending requests</Text>
              </View>
            )}
          </View>
        )
      case 'friends':
        return (
          <View style={styles.friendsContainer}>
            <View style={[styles.friendsSearchContainer, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={[styles.friendsSearchInput, { color: theme.text }]}
                placeholder="Search friends..."
                value={query}
                onChangeText={setQuery}
                placeholderTextColor={theme.inputPlaceholder}
              />
            </View>
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              renderItem={renderUserItem}
              style={styles.list}
              contentContainerStyle={styles.friendsListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No friends yet</Text>
                </View>
              }
            />
          </View>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.tabContainer, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === 'search' && { color: theme.primary, fontWeight: '600' }]}>
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('pending')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === 'pending' && { color: theme.primary, fontWeight: '600' }]}>
              Pending
            </Text>
            {incoming.length > 0 && (
              <View style={[styles.redBadge, { backgroundColor: theme.error }]}>
                <Text style={[styles.badgeText, { color: theme.buttonText }]}>{incoming.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('friends')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === 'friends' && { color: theme.primary, fontWeight: '600' }]}>
              Friends
            </Text>
            {friends.length > 0 && (
              <View style={[styles.grayBadge, { backgroundColor: theme.textTertiary }]}>
                <Text style={[styles.badgeText, { color: theme.buttonText }]}>{friends.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.content, { backgroundColor: theme.background }]}>
        {renderTabContent()}
      </View>

      <ProfileModal
        isVisible={!!selectedUser}
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
      />
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
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  redBadge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  grayBadge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  friendsSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  friendsSearchInput: {
    flex: 1,
    fontSize: 16,
  },
  pendingContainer: {
    flex: 1,
    padding: 16,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionList: {
    maxHeight: 200,
  },
  list: {
    flex: 1,
  },
  friendsContainer: {
    flex: 1,
    padding: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  friendsListContent: {
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    marginLeft: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  acceptText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ignoreButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  ignoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  undoButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  undoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  unfriendButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unfriendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  moreIcon: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  refreshButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
