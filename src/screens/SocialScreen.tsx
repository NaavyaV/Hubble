import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, SectionList, Alert, Image, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { ProfileModal, ImageWithFallback, OrgDetailModal } from '../components'
import { useTheme } from '../context/ThemeContext'
import { Organization } from '../context/OrgModeContext'

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

type TabType = 'friends' | 'organizations'

export default function SocialScreen() {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const [me, setMe] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('friends')
  
  // Friends state
  const [allUsers, setAllUsers] = useState<ProfileRow[]>([])
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [incoming, setIncoming] = useState<FriendshipRow[]>([])
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([])
  const [incomingProfiles, setIncomingProfiles] = useState<Record<string, ProfileRow>>({})
  const [outgoingProfiles, setOutgoingProfiles] = useState<Record<string, ProfileRow>>({})
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null)
  const [recentlyAccepted, setRecentlyAccepted] = useState<Set<string>>(new Set())
  
  // Organizations state
  const [allOrgs, setAllOrgs] = useState<Organization[]>([])
  const [followedOrgs, setFollowedOrgs] = useState<string[]>([])
  const [orgNotifications, setOrgNotifications] = useState<Record<string, boolean>>({})
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  
  // Friends sub-tabs
  const [friendsSubTab, setFriendsSubTab] = useState<'people' | 'pending' | 'friends'>('people')
  
  // Organizations sub-tabs
  const [orgsSubTab, setOrgsSubTab] = useState<'following' | 'all'>('following')
  
  // Track recently followed orgs to keep them visible
  const [recentlyFollowedOrgs, setRecentlyFollowedOrgs] = useState<Set<string>>(new Set())
  
  // Track friend menu popup
  const [friendMenuVisible, setFriendMenuVisible] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(true)
  const isInitialMount = useRef(true)
  const hasInitialized = useRef(false)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false)
      }
    }, 15000)

    init()

    return () => clearTimeout(timeoutId)
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      if (!me || !hasInitialized.current) return
      
      if (activeTab === 'friends') {
        fetchFriendships(me)
      } else {
        fetchOrganizations()
        fetchFollowedOrgs()
        // Clear recently followed orgs when switching tabs to apply proper filtering
        setRecentlyFollowedOrgs(new Set())
      }
      
      // Set up real-time subscription for friendships changes to update badges
      const channel = supabase
        .channel('social-friendships-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `user_id=eq.${me}`
          },
          () => {
            if (activeTab === 'friends') {
              fetchFriendships(me)
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `friend_id=eq.${me}`
          },
          () => {
            if (activeTab === 'friends') {
              fetchFriendships(me)
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }, [me, activeTab])
  )

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      setMe(user.id)
      
      await Promise.all([
        fetchAllUsers(),
        fetchFriendships(user.id),
        fetchOrganizations(),
        fetchFollowedOrgs()
      ])
      
      hasInitialized.current = true
    } catch (error) {
      console.error('Error initializing SocialScreen:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`id, full_name, avatar_url, phone_number, major, graduating_year, bio`)
        .eq('otp_verified', true)
        .order('full_name')
        .limit(1000)

      if (error) {
        console.error('Error fetching users:', error)
        setAllUsers([])
        return
      }
      
      setAllUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      setAllUsers([])
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

      const incomingRequests = friendshipsData.filter(
        f => f.friend_id === userId && f.status === 'pending'
      )
      const outgoingRequests = friendshipsData.filter(
        f => f.user_id === userId && f.status === 'pending'
      )
      
      setIncoming(incomingRequests)
      setOutgoing(outgoingRequests)

      const allProfileIds = [
        ...incomingRequests.map(f => f.user_id),
        ...outgoingRequests.map(f => f.friend_id)
      ].filter((id, index, arr) => arr.indexOf(id) === index)

      if (allProfileIds.length > 0) {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', allProfileIds)

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
      setFriendships([])
      setIncoming([])
      setOutgoing([])
      setIncomingProfiles({})
      setOutgoingProfiles({})
    }
  }

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name')

      if (error) throw error
      setAllOrgs(data || [])
    } catch (error) {
      console.error('Error fetching organizations:', error)
      setAllOrgs([])
    }
  }

  const fetchFollowedOrgs = async () => {
    try {
      if (!me) return
      
      const { data, error } = await supabase
        .from('org_followers')
        .select('org_id, notification_enabled')
        .eq('user_id', me)

      if (error) throw error

      const followedList: string[] = []
      const notificationsMap: Record<string, boolean> = {}
      
      if (data && Array.isArray(data)) {
        data.forEach((f: any) => {
          if (f && f.org_id) {
            followedList.push(f.org_id)
            notificationsMap[f.org_id] = f.notification_enabled !== false
          }
        })
      }
      
      setFollowedOrgs(followedList)
      setOrgNotifications(notificationsMap)
    } catch (error) {
      console.error('Error fetching followed orgs:', error)
    }
  }

  const handleOrgPress = (org: Organization) => {
    setSelectedOrg(org)
  }

  const handleFollowOrg = async (orgId: string) => {
    try {
      if (!me) return

      const { error } = await supabase
        .from('org_followers')
        .insert({
          user_id: me,
          org_id: orgId,
          notification_enabled: true
        })

      if (error) throw error

      setFollowedOrgs(prev => [...prev, orgId])
      setOrgNotifications(prev => ({ ...prev, [orgId]: true }))
      // Track recently followed org to keep it visible
      setRecentlyFollowedOrgs(prev => new Set([...prev, orgId]))
    } catch (error) {
      console.error('Error following org:', error)
      Alert.alert('Error', 'Failed to follow organization')
    }
  }

  const handleUnfollowOrg = async (orgId: string) => {
    try {
      if (!me) return

      Alert.alert(
        'Unfollow Organization',
        'Are you sure you want to unfollow this organization?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unfollow',
            style: 'destructive',
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('org_followers')
                  .delete()
                  .eq('user_id', me)
                  .eq('org_id', orgId)

                if (error) throw error

                setFollowedOrgs(prev => prev.filter(id => id !== orgId))
                
                const newNotifications = { ...orgNotifications }
                delete newNotifications[orgId]
                setOrgNotifications(newNotifications)
                
                // Remove from recently followed if present
                setRecentlyFollowedOrgs(prev => {
                  const next = new Set(prev)
                  next.delete(orgId)
                  return next
                })
              } catch (error) {
                console.error('Error unfollowing org:', error)
                Alert.alert('Error', 'Failed to unfollow organization')
              }
            }
          }
        ]
      )
    } catch (error) {
      console.error('Error showing unfollow confirmation:', error)
    }
  }

  const handleToggleOrgNotifications = async (orgId: string) => {
    try {
      if (!me) return

      const currentValue = orgNotifications[orgId] !== false
      const newValue = !currentValue

      const { error } = await supabase
        .from('org_followers')
        .update({ notification_enabled: newValue })
        .eq('user_id', me)
        .eq('org_id', orgId)

      if (error) throw error

      setOrgNotifications(prev => ({ ...prev, [orgId]: newValue }))
    } catch (error) {
      console.error('Error toggling org notifications:', error)
      Alert.alert('Error', 'Failed to update notification settings')
    }
  }

  // Friends functions (from FriendsScreen)
  const getFriendStatus = (userId: string): 'none' | 'pending_incoming' | 'pending_outgoing' | 'accepted' => {
    if (!me) return 'none'
    
    const friendship = friendships.find(
      f => (f.user_id === userId && f.friend_id === me) || (f.user_id === me && f.friend_id === userId)
    )
    
    if (!friendship) return 'none'
    if (friendship.status === 'accepted') return 'accepted'
    if (friendship.user_id === me) return 'pending_outgoing'
    return 'pending_incoming'
  }

  const sendFriendRequest = async (friendId: string) => {
    try {
      if (!me) return

      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: me,
          friend_id: friendId,
          status: 'pending'
        })

      if (error) throw error
      await fetchFriendships(me)
    } catch (error) {
      console.error('Error sending friend request:', error)
      Alert.alert('Error', 'Failed to send friend request')
    }
  }

  const acceptFriendRequest = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId)

      if (error) throw error
      
      const friendship = friendships.find(f => f.id === friendshipId)
      if (friendship) {
        setRecentlyAccepted(prev => new Set([...prev, friendship.friend_id]))
      }
      
      await fetchFriendships(me!)
    } catch (error) {
      console.error('Error accepting friend request:', error)
      Alert.alert('Error', 'Failed to accept friend request')
    }
  }

  const rejectFriendRequest = async (friendshipId: string) => {
    Alert.alert(
      'Reject Friend Request',
      'Are you sure you want to reject this friend request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId)

              if (error) throw error
              await fetchFriendships(me!)
            } catch (error) {
              console.error('Error rejecting friend request:', error)
              Alert.alert('Error', 'Failed to reject friend request')
            }
          }
        }
      ]
    )
  }

  const cancelFriendRequest = async (friendshipId: string) => {
    Alert.alert(
      'Cancel Friend Request',
      'Are you sure you want to cancel this friend request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId)

              if (error) throw error
              await fetchFriendships(me!)
            } catch (error) {
              console.error('Error canceling friend request:', error)
              Alert.alert('Error', 'Failed to cancel friend request')
            }
          }
        }
      ]
    )
  }

  const removeFriend = async (friendId: string) => {
    try {
      if (!me) return

      Alert.alert(
        'Remove Friend',
        'Are you sure you want to remove this friend?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${me},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${me})`)

              if (error) throw error
              await fetchFriendships(me)
            }
          }
        ]
      )
    } catch (error) {
      console.error('Error removing friend:', error)
      Alert.alert('Error', 'Failed to remove friend')
    }
  }

  // Get friends data based on sub-tab (without search)
  const getFriendsDataBase = () => {
    switch (friendsSubTab) {
      case 'people':
        // Show all users except friends and pending
        const friendIds = new Set(
          friendships
            .filter(f => f.status === 'accepted')
            .flatMap(f => [f.user_id, f.friend_id])
        )
        const pendingIds = new Set(
          friendships
            .filter(f => f.status === 'pending')
            .flatMap(f => [f.user_id, f.friend_id])
        )
        return allUsers.filter(user => 
          user.id !== me && 
          !friendIds.has(user.id) && 
          !pendingIds.has(user.id)
        )
      case 'pending':
        // Return empty array - we'll handle pending requests separately with sections
        return []
      case 'friends':
        return acceptedFriends
      default:
        return []
    }
  }
  
  // Get friends data with search applied to current list
  const getFriendsData = () => {
    const baseData = getFriendsDataBase()
    if (!query) return baseData
    
    const searchLower = query.toLowerCase()
    return baseData.filter(user => 
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.phone_number?.includes(query)
    )
  }

  // Get orgs data based on sub-tab (without search)
  const getOrgsDataBase = () => {
    if (orgsSubTab === 'following') {
      return allOrgs.filter(org => followedOrgs.includes(org.id))
    } else {
      // All Orgs - exclude followed ones (but include recently followed ones to keep them visible)
      return allOrgs.filter(org => 
        !followedOrgs.includes(org.id) || recentlyFollowedOrgs.has(org.id)
      )
    }
  }
  
  // Get orgs data with search applied to current list
  const getOrgsData = () => {
    const baseData = getOrgsDataBase()
    if (!query) return baseData
    
    const searchLower = query.toLowerCase()
    return baseData.filter(org => 
      org.name.toLowerCase().includes(searchLower) ||
      org.description?.toLowerCase().includes(searchLower) ||
      org.type.toLowerCase().includes(searchLower)
    )
  }

  const acceptedFriends = friendships
    .filter(f => f.status === 'accepted')
    .map(f => {
      const friendId = f.user_id === me ? f.friend_id : f.user_id
      return allUsers.find(u => u.id === friendId)
    })
    .filter(Boolean) as ProfileRow[]

  const renderFriend = ({ item }: { item: ProfileRow }) => {
    const status = getFriendStatus(item.id)
    const isRecentlyAccepted = recentlyAccepted.has(item.id)

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => setSelectedUser(item)}
      >
        <View style={styles.cardLeft}>
          {item.avatar_url ? (
            <ImageWithFallback
              source={{ uri: item.avatar_url }}
              style={styles.avatar}
              fallbackIcon="person"
              fallbackText={item.full_name?.charAt(0).toUpperCase() || 'U'}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>
                {item.full_name?.charAt(0).toUpperCase() || item.phone_number?.slice(-1) || 'U'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.name, { color: theme.text }]}>
            {item.full_name || item.phone_number || 'Unknown'}
          </Text>
          {status === 'accepted' && isRecentlyAccepted && (
            <View style={[styles.badge, { backgroundColor: theme.success + '20' }]}>
              <Text style={[styles.badgeText, { color: theme.success }]}>New Friend!</Text>
            </View>
          )}
        </View>
        <View style={styles.cardActions}>
          {status === 'none' && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={() => sendFriendRequest(item.id)}
            >
              <Ionicons name="person-add" size={20} color={theme.buttonText} />
            </TouchableOpacity>
          )}
          {status === 'pending_incoming' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.success }]}
                onPress={() => {
                  const friendship = friendships.find(
                    f => f.friend_id === me && f.user_id === item.id && f.status === 'pending'
                  )
                  if (friendship) acceptFriendRequest(friendship.id)
                }}
              >
                <Ionicons name="checkmark" size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.error }]}
                onPress={() => {
                  const friendship = friendships.find(
                    f => f.friend_id === me && f.user_id === item.id && f.status === 'pending'
                  )
                  if (friendship) rejectFriendRequest(friendship.id)
                }}
              >
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </>
          )}
          {status === 'pending_outgoing' && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.error }]}
              onPress={() => {
                const friendship = friendships.find(
                  f => f.user_id === me && f.friend_id === item.id && f.status === 'pending'
                )
                if (friendship) cancelFriendRequest(friendship.id)
              }}
            >
              <Ionicons name="close" size={20} color="white" />
            </TouchableOpacity>
          )}
          {status === 'accepted' && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: 'transparent' }]}
              onPress={() => setFriendMenuVisible(item.id)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderOrg = ({ item }: { item: Organization }) => {
    const isFollowing = followedOrgs.includes(item.id)
    const notificationsEnabled = orgNotifications[item.id] !== false

    return (
      <View style={[styles.orgCardContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.orgCardContent}
          onPress={() => handleOrgPress(item)}
        >
          <View style={styles.cardLeft}>
            {item.icon ? (
              <ImageWithFallback
                source={{ uri: item.icon }}
                style={styles.avatar}
                fallbackIcon="business"
                fallbackText={item.name.charAt(0).toUpperCase()}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <Ionicons name="business" size={24} color="white" />
              </View>
            )}
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.type}</Text>
            {item.description && (
              <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        
        {/* Follow button at bottom */}
        <View style={styles.orgCardFooter}>
          {isFollowing ? (
            <View style={styles.followingActions}>
              <TouchableOpacity
                style={[styles.followButton, { backgroundColor: theme.error, flex: 1 }]}
                onPress={() => handleUnfollowOrg(item.id)}
              >
                <Text style={[styles.followButtonText, { color: 'white' }]}>Unfollow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.notificationToggleButton, { 
                  backgroundColor: notificationsEnabled ? theme.primary : theme.surface, 
                  borderWidth: notificationsEnabled ? 0 : 1, 
                  borderColor: theme.border,
                  marginLeft: 8
                }]}
                onPress={() => handleToggleOrgNotifications(item.id)}
              >
                <Ionicons 
                  name={notificationsEnabled ? "notifications" : "notifications-off"} 
                  size={20} 
                  color={notificationsEnabled ? theme.buttonText : theme.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.followButton, { backgroundColor: theme.primary }]}
              onPress={() => handleFollowOrg(item.id)}
            >
              <Text style={[styles.followButtonText, { color: theme.buttonText }]}>Follow</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'friends' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'friends' ? theme.primary : theme.textSecondary }
          ]}>
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'organizations' && { borderBottomWidth: 2, borderBottomColor: theme.primary }
          ]}
          onPress={() => setActiveTab('organizations')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'organizations' ? theme.primary : theme.textSecondary }
          ]}>
            Organizations
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sub-tabs for Friends */}
      {activeTab === 'friends' && (
        <View style={[styles.subTabContainer, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'people' ? theme.primary : theme.surface,
                borderWidth: friendsSubTab === 'people' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setFriendsSubTab('people')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: friendsSubTab === 'people' ? theme.buttonText : theme.textSecondary }
            ]}>
              People
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'pending' ? theme.primary : theme.surface,
                borderWidth: friendsSubTab === 'pending' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setFriendsSubTab('pending')}
          >
            <View style={styles.subTabButtonContent}>
              <Text style={[
                styles.subTabButtonText,
                { color: friendsSubTab === 'pending' ? theme.buttonText : theme.textSecondary }
              ]}>
                Pending
              </Text>
              {incoming.length > 0 && (
                <View style={[styles.pendingBadge, { backgroundColor: '#e74c3c' }]}>
                  <Text style={styles.pendingBadgeText}>
                    {incoming.length > 9 ? '9+' : incoming.length}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: friendsSubTab === 'friends' ? theme.primary : theme.surface,
                borderWidth: friendsSubTab === 'friends' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setFriendsSubTab('friends')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: friendsSubTab === 'friends' ? theme.buttonText : theme.textSecondary }
            ]}>
              Friends
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sub-tabs for Organizations */}
      {activeTab === 'organizations' && (
        <View style={[styles.subTabContainer, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: orgsSubTab === 'following' ? theme.primary : theme.surface,
                borderWidth: orgsSubTab === 'following' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setOrgsSubTab('following')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: orgsSubTab === 'following' ? theme.buttonText : theme.textSecondary }
            ]}>
              Following
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTabButton,
              { 
                backgroundColor: orgsSubTab === 'all' ? theme.primary : theme.surface,
                borderWidth: orgsSubTab === 'all' ? 0 : 1,
                borderColor: theme.border
              }
            ]}
            onPress={() => setOrgsSubTab('all')}
          >
            <Text style={[
              styles.subTabButtonText,
              { color: orgsSubTab === 'all' ? theme.buttonText : theme.textSecondary }
            ]}>
              All Orgs
            </Text>
          </TouchableOpacity>
        </View>
      )}


      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.searchBarCapsule, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={activeTab === 'friends' ? "Search..." : "Search organizations..."}
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {activeTab === 'friends' ? (
        friendsSubTab === 'pending' ? (
          <SectionList
            sections={[
              {
                title: 'Incoming',
                data: query 
                  ? incoming.map(f => incomingProfiles[f.user_id]).filter(Boolean).filter((profile: ProfileRow) => 
                      profile.full_name?.toLowerCase().includes(query.toLowerCase()) ||
                      profile.phone_number?.includes(query)
                    ) as ProfileRow[]
                  : incoming.map(f => incomingProfiles[f.user_id]).filter(Boolean) as ProfileRow[]
              },
              {
                title: 'Outgoing',
                data: query
                  ? outgoing.map(f => outgoingProfiles[f.friend_id]).filter(Boolean).filter((profile: ProfileRow) =>
                      profile.full_name?.toLowerCase().includes(query.toLowerCase()) ||
                      profile.phone_number?.includes(query)
                    ) as ProfileRow[]
                  : outgoing.map(f => outgoingProfiles[f.friend_id]).filter(Boolean) as ProfileRow[]
              }
            ]}
            renderItem={renderFriend}
            renderSectionHeader={({ section }) => {
              if (section.data.length === 0) return null
              return (
                <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                  <Text style={[styles.sectionHeaderText, { color: theme.textSecondary }]}>
                    {section.title}
                  </Text>
                </View>
              )
            }}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {query ? 'No pending requests found' : 'No pending requests'}
                </Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={getFriendsData()}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {query ? 'No users found' : 
                   friendsSubTab === 'people' ? 'No users to discover' :
                   'No friends yet'}
                </Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={getOrgsData()}
          renderItem={renderOrg}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.text }]}>
                {query ? 'No organizations found' : 
                 orgsSubTab === 'following' ? 'Not following any organizations' :
                 'No organizations available'}
              </Text>
            </View>
          }
        />
      )}

      {/* Friend Menu Popup */}
      {friendMenuVisible && (
        <Modal
          visible={!!friendMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFriendMenuVisible(null)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setFriendMenuVisible(null)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.menuContent, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={[styles.menuHeader, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Friend Options</Text>
                <TouchableOpacity onPress={() => setFriendMenuVisible(null)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItemsContainer}>
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    const friend = allUsers.find(u => u.id === friendMenuVisible)
                    if (friend) {
                      removeFriend(friend.id)
                      setFriendMenuVisible(null)
                    }
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="person-remove" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unfriend</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.5 }]}
                  onPress={() => {
                    Alert.alert('Coming Soon', 'Block functionality will be available in a future update.')
                  }}
                  disabled={true}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.textSecondary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.textSecondary }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.5 }]}
                  onPress={() => {
                    Alert.alert('Coming Soon', 'Report functionality will be available in a future update.')
                  }}
                  disabled={true}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.textSecondary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.textSecondary }]}>Report</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Profile Modal */}
      {selectedUser && (
        <ProfileModal
          user={selectedUser}
          isVisible={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {/* Org Detail Modal */}
      {selectedOrg && (
        <OrgDetailModal
          org={selectedOrg}
          visible={!!selectedOrg}
          onClose={() => setSelectedOrg(null)}
          isFollowing={followedOrgs.includes(selectedOrg.id)}
          notificationsEnabled={orgNotifications[selectedOrg.id] !== false}
          onFollow={() => handleFollowOrg(selectedOrg.id)}
          onUnfollow={() => handleUnfollowOrg(selectedOrg.id)}
          onToggleNotifications={() => handleToggleOrgNotifications(selectedOrg.id)}
        />
      )}
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
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subTabContainer: {
    flexDirection: 'row',
    padding: 8,
    paddingTop: 16,
    gap: 8,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subTabButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  pendingBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingTop: 4,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBarCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  orgCardContainer: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  orgCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  orgCardFooter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  followingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  notificationToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardLeft: {
    marginRight: 12,
  },
  cardRight: {
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 14,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    marginTop: 4,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 280,
    maxWidth: '90%',
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuItemsContainer: {
    padding: 12,
    gap: 8,
  },
  menuItemCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuItemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemTextContainer: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
  },
})

