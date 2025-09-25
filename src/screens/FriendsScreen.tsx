import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import ProfileModal from '../components/ProfileModal'

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

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setMe(user.id)
      await Promise.all([
        fetchAllUsers(),
        fetchFriendships(user.id),
      ])
    } catch (error) {
      console.error('Error initializing:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      console.log('Fetching all users...')
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
        .order('full_name')

      if (error) {
        console.error('Error fetching users:', error)
        throw error
      }
      
      console.log('Fetched users:', data?.length || 0, 'users')
      setAllUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      Alert.alert('Error', 'Failed to fetch users. Please check your connection.')
    }
  }

  const fetchFriendships = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

      if (error) throw error

      const friendshipsData = data || []
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

      // Fetch profiles for incoming requests
      if (incomingRequests.length > 0) {
        const senderIds = incomingRequests.map(f => f.user_id)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', senderIds)

        const profilesMap: Record<string, ProfileRow> = {}
        profiles?.forEach(p => {
          profilesMap[p.id] = p
        })
        setIncomingProfiles(profilesMap)
      }

      // Fetch profiles for outgoing requests
      if (outgoingRequests.length > 0) {
        const receiverIds = outgoingRequests.map(f => f.friend_id)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', receiverIds)

        const profilesMap: Record<string, ProfileRow> = {}
        profiles?.forEach(p => {
          profilesMap[p.id] = p
        })
        setOutgoingProfiles(profilesMap)
      }
    } catch (error) {
      console.error('Error fetching friendships:', error)
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

      Alert.alert('Success', 'Friend request sent!')
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

      Alert.alert('Success', 'Friend request accepted!')
      setRecentlyAccepted(prev => new Set([...prev, userId]))
      
      // Auto-remove from recently accepted after 5 seconds
      setTimeout(() => {
        setRecentlyAccepted(prev => {
          const newSet = new Set(prev)
          newSet.delete(userId)
          return newSet
        })
      }, 5000)

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

              Alert.alert('Success', 'Friend request ignored')
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

      Alert.alert('Success', 'Friend request cancelled')
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

              Alert.alert('Success', 'Unfriended')
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
        <Image 
          source={{ uri: user.avatar_url }} 
          style={styles.avatarImage}
        />
      )
    }
    return (
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
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
        style={styles.userItem}
        onPress={() => setSelectedUser(item)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(item)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{item.full_name || 'Unknown'}</Text>
              {status === 'pending' && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>Pending</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          {status === 'accepted' ? (
            <TouchableOpacity
              style={styles.unfriendButton}
              onPress={() => unfriend(item.id, item.full_name || 'this person')}
            >
              <Text style={styles.unfriendText}>Unfriend</Text>
            </TouchableOpacity>
          ) : status === 'pending' ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => cancelFriendRequest(item.id)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : isIncoming ? (
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => {
                  const friendship = incoming.find(f => f.user_id === item.id)
                  if (friendship) acceptFriendRequest(friendship.id, item.id)
                }}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ignoreButton}
                onPress={() => {
                  const friendship = incoming.find(f => f.user_id === item.id)
                  if (friendship) ignoreFriendRequest(friendship.id)
                }}
              >
                <Text style={styles.ignoreText}>Ignore</Text>
              </TouchableOpacity>
            </View>
          ) : isRecentlyAccepted ? (
            <TouchableOpacity
              style={styles.undoButton}
              onPress={() => undoAcceptFriendRequest(item.id)}
            >
              <Text style={styles.undoText}>Undo</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => sendFriendRequest(item.id)}
            >
              <Text style={styles.addText}>Add Friend</Text>
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
        style={styles.userItem}
        onPress={() => setSelectedUser(profile)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(profile)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{profile.full_name || 'Unknown'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          {isRecentlyAccepted ? (
            <TouchableOpacity
              style={styles.undoButton}
              onPress={() => undoAcceptFriendRequest(profile.id)}
            >
              <Text style={styles.undoText}>Undo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => acceptFriendRequest(item.id, profile.id)}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ignoreButton}
                onPress={() => ignoreFriendRequest(item.id)}
              >
                <Text style={styles.ignoreText}>Ignore</Text>
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
        style={styles.userItem}
        onPress={() => setSelectedUser(profile)}
      >
        <View style={styles.userInfo}>
          {renderAvatar(profile)}
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{profile.full_name || 'Unknown'}</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.actionButton}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => cancelFriendRequest(profile.id)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
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
              style={styles.searchInput}
              placeholder="Search users..."
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading users...</Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {allUsers.length === 0 
                    ? 'No users found. Make sure you have created profiles in the database.'
                    : query.trim()
                    ? 'No users match your search.'
                    : 'No new users to discover.'
                  }
                </Text>
                <TouchableOpacity 
                  style={styles.refreshButton}
                  onPress={fetchAllUsers}
                >
                  <Text style={styles.refreshButtonText}>Refresh</Text>
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
                <Text style={styles.sectionTitle}>Incoming Requests</Text>
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
                <Text style={styles.sectionTitle}>Outgoing Requests</Text>
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
                <Text style={styles.emptyText}>No pending requests</Text>
              </View>
            )}
          </View>
        )
      case 'friends':
        return (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            renderItem={renderUserItem}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No friends yet</Text>
              </View>
            }
          />
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friends</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              Pending
            </Text>
            {(incoming.length + outgoing.length) > 0 && (
              <View style={incoming.length > 0 ? styles.redBadge : styles.grayBadge}>
                <Text style={styles.badgeText}>{incoming.length + outgoing.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
          onPress={() => setActiveTab('friends')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              Friends
            </Text>
            {friends.length > 0 && (
              <View style={styles.grayBadge}>
                <Text style={styles.badgeText}>{friends.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
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
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3498db',
  },
  tabText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#3498db',
    fontWeight: '600',
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  redBadge: {
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  grayBadge: {
    backgroundColor: '#95a5a6',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
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
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    marginBottom: 16,
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
    color: '#2c3e50',
    marginBottom: 12,
  },
  sectionList: {
    maxHeight: 200,
  },
  list: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
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
    backgroundColor: '#3498db',
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
    color: 'white',
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
    color: '#2c3e50',
  },
  pendingBadge: {
    backgroundColor: '#f39c12',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingText: {
    fontSize: 12,
    color: 'white',
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
    backgroundColor: '#3498db',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  acceptText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  ignoreButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  ignoreText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  undoButton: {
    backgroundColor: '#f39c12',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  undoText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  unfriendButton: {
    backgroundColor: '#95a5a6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unfriendText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
