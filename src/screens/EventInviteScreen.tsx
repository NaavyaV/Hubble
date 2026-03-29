import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { safeFriendshipUserOrQuery, safeBlockOrQuery } from '../utils/queryHelpers'
import { ImageWithFallback } from '../components'
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

// Global variable to store selected users temporarily
let globalSelectedUsers: string[] = []

export const getSelectedUsers = () => globalSelectedUsers
export const clearSelectedUsers = () => { globalSelectedUsers = [] }

interface EventInviteScreenProps {
  invitedUsers?: string[]
  isEditMode?: boolean
  eventId?: string
  onInvitesUpdated?: (invitedUsers: string[]) => void
  onClose?: () => void
}

export default function EventInviteScreen(props?: EventInviteScreenProps) {
  const { theme } = useTheme()
  const navigation = useNavigation()
  const route = useRoute()
  
  // Use props if provided (for modal), otherwise use route params (for navigation)
  let routeParams: any = null
  try {
    routeParams = route.params
  } catch (e) {
    // Route might not be available in modal context
    routeParams = null
  }
  
  const invitedUsers = props?.invitedUsers || routeParams?.invitedUsers || []
  const isEditMode = props?.isEditMode || routeParams?.isEditMode || false
  const eventId = props?.eventId || routeParams?.eventId
  const onInvitesUpdated = props?.onInvitesUpdated || routeParams?.onInvitesUpdated
  const handleClose = props?.onClose || (() => navigation.goBack())

  const [filteredFriends, setFilteredFriends] = useState<ProfileRow[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set(invitedUsers))
  const [friends, setFriends] = useState<ProfileRow[]>([])
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchedInvitedUsers, setFetchedInvitedUsers] = useState<string[]>([])

  useEffect(() => {
    fetchFriends()
    // If in edit mode and eventId is provided, fetch invited users from event_invitations
    if (isEditMode && eventId && invitedUsers.length === 0) {
      fetchInvitedUsers()
    } else {
      setFetchedInvitedUsers(invitedUsers)
      setSelectedUsers(new Set(invitedUsers))
    }
  }, [isEditMode, eventId])

  useEffect(() => {
    // Update selected users when fetched invited users change
    if (fetchedInvitedUsers.length > 0) {
      setSelectedUsers(new Set(fetchedInvitedUsers))
    }
  }, [fetchedInvitedUsers])

  useEffect(() => {
    filterFriends()
  }, [query, friends])


  const fetchInvitedUsers = async () => {
    try {
      if (!eventId) return

      const { data: invitations, error } = await supabase
        .from('event_invitations')
        .select('user_id')
        .eq('event_id', eventId)

      if (error) {
        console.error('Error fetching invited users:', error)
        return
      }

      const invitedUserIds = (invitations || []).map(inv => inv.user_id)
      setFetchedInvitedUsers(invitedUserIds)
    } catch (error) {
      console.error('Error fetching invited users:', error)
    }
  }

  const fetchFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Optimize: Filter for accepted friendships in the query instead of in memory
      const { data: friendshipsData, error: friendshipsError } = await supabase
        .from('friendships')
        .select('id, user_id, friend_id, status')
        .or(safeFriendshipUserOrQuery(user.id))
        .eq('status', 'accepted')

      if (friendshipsError) throw friendshipsError

      const acceptedFriendships = friendshipsData || []
      setFriendships(acceptedFriendships)

      // Get friend profiles
      const friendIds = acceptedFriendships.map(f => 
        f.user_id === user.id ? f.friend_id : f.user_id
      )

      if (friendIds.length > 0) {
        // Separate blocked users (users I blocked) from blockers (users who blocked me)
        const { data: blockedData } = await supabase
          .from('user_blocks')
          .select('blocked_id, blocker_id')
          .or(safeBlockOrQuery(user.id))

        const blockedUserIds = new Set<string>() // Users I have blocked
        const blockerIds = new Set<string>() // Users who have blocked me
        if (blockedData) {
          blockedData.forEach((b: any) => {
            if (b.blocker_id === user.id) {
              blockedUserIds.add(b.blocked_id) // I blocked them
            }
            if (b.blocked_id === user.id) {
              blockerIds.add(b.blocker_id) // They blocked me
            }
          })
        }

        const { data: friendProfiles, error: friendsError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', friendIds)
          .eq('otp_verified', true) // Only show OTP verified users

        if (friendsError) throw friendsError
        
        // Filter out blocked users AND blockers
        // If Person A blocks Person B, Person B should not see Person A in friends list
        const filteredFriends = (friendProfiles || []).filter(f => 
          !blockedUserIds.has(f.id) && 
          !blockerIds.has(f.id) // Exclude users who have blocked me
        )
        setFriends(filteredFriends)
      }
    } catch (error) {
      console.error('Error fetching friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterFriends = () => {
    if (!query.trim()) {
      setFilteredFriends(friends)
      return
    }

    const filtered = friends.filter(friend =>
      friend.full_name?.toLowerCase().includes(query.toLowerCase()) ||
      friend.major?.toLowerCase().includes(query.toLowerCase()) ||
      friend.graduating_year?.toLowerCase().includes(query.toLowerCase())
    )

    setFilteredFriends(filtered)
  }

  const toggleUserSelection = (userId: string) => {
    // In edit mode, don't allow removing already invited users
    // Check both props and fetched invited users
    const allInvitedUsers = [...invitedUsers, ...fetchedInvitedUsers]
    if (isEditMode && allInvitedUsers.includes(userId)) {
      Alert.alert(
        'Cannot Remove',
        'You cannot remove people who are already invited to the event.',
        [{ text: 'OK' }]
      )
      return
    }

    setSelectedUsers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const handleInviteAllFriends = () => {
    const friendIds = friends.map(friend => friend.id)
    const newFriends = friendIds.filter(id => !selectedUsers.has(id))
    
    if (newFriends.length === 0) {
      Alert.alert('Info', 'All your friends are already selected')
      return
    }

    setSelectedUsers(prev => {
      const newSet = new Set(prev)
      newFriends.forEach(id => newSet.add(id))
      return newSet
    })

    Alert.alert('Success', `Added ${newFriends.length} friends to the invite list`)
  }

  const handleDone = () => {
    const selectedArray = Array.from(selectedUsers)
    globalSelectedUsers = selectedArray
    
    // If there's a callback for updating invites, call it
    if (onInvitesUpdated) {
      onInvitesUpdated(selectedArray)
    }
    
    handleClose()
  }

  const renderUser = ({ item }: { item: ProfileRow }) => {
    const isSelected = selectedUsers.has(item.id)
    const allInvitedUsers = [...invitedUsers, ...fetchedInvitedUsers]
    const isAlreadyInvited = isEditMode && allInvitedUsers.includes(item.id)
    const isFriend = friends.some(friend => friend.id === item.id)

    return (
      <TouchableOpacity
        style={[
          styles.userItem,
          {
            backgroundColor: isAlreadyInvited
              ? theme.primary + '18'
              : isSelected
                ? theme.primary + '14'
                : theme.surface,
            opacity: isAlreadyInvited ? 0.65 : 1,
          },
        ]}
        onPress={() => toggleUserSelection(item.id)}
        disabled={isAlreadyInvited}
      >
        <View style={styles.userAvatar}>
          {item.avatar_url ? (
            <ImageWithFallback 
              source={{ uri: item.avatar_url }} 
              style={styles.avatarImage}
              fallbackIcon="person"
              fallbackText=""
              resizeMode="cover"
              skipValidation={true}
              priority="high"
            />
          ) : (
            <Ionicons name="person" size={24} color={theme.textSecondary} />
          )}
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={[styles.userName, { color: theme.text }]}>{item.full_name || 'Unknown'}</Text>
            {isAlreadyInvited && (
              <View style={[styles.invitedBadge, { backgroundColor: theme.primary }]}>
                <Ionicons name="checkmark" size={12} color="white" />
                <Text style={styles.invitedBadgeText}>Invited</Text>
              </View>
            )}
          </View>
          
          {item.major && (
            <Text style={[styles.userMajor, { color: theme.textSecondary }]}>{item.major}</Text>
          )}
          
          {item.graduating_year && (
            <Text style={[styles.userYear, { color: theme.textSecondary }]}>{item.graduating_year}</Text>
          )}
        </View>

        <View style={styles.selectionIndicator}>
          {isSelected ? (
            <View style={[styles.selectedIndicator, { backgroundColor: theme.primary }]}>
              <Ionicons name="checkmark" size={16} color="white" />
            </View>
          ) : (
            <View style={[styles.unselectedIndicator, { backgroundColor: theme.divider }]} />
          )}
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading friends...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {isEditMode ? 'Edit invites' : 'Invite friends'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search friends..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={theme.inputPlaceholder}
          />
        </View>

        <View style={styles.friendsSection}>
          <View style={styles.friendsHeader}>
            <Text style={[styles.friendsTitle, { color: theme.textSecondary }]}>Friends</Text>
            {friends.length > 0 && (
              <TouchableOpacity style={[styles.inviteAllButton, { backgroundColor: theme.primary }]} onPress={handleInviteAllFriends}>
                <Text style={styles.inviteAllButtonText}>Invite All</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {filteredFriends.length > 0 ? (
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              style={styles.friendsList}
              showsVerticalScrollIndicator={false}
            />
          ) : friends.length > 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyStateText, { color: theme.text }]}>No friends match your search</Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.textSecondary }]}>
                Try a different search term
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyStateText, { color: theme.text }]}>No friends found</Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.textSecondary }]}>
                Add friends to invite them to your events
              </Text>
            </View>
          )}
        </View>

        {isEditMode && (
          <View style={[styles.editNote, { backgroundColor: theme.surface }]}>
            <Ionicons name="information-circle" size={16} color={theme.primary} />
            <Text style={[styles.editNoteText, { color: theme.textSecondary }]}>
              You can add more people but cannot remove those already invited
            </Text>
          </View>
        )}
      </View>

      {/* Floating Invite Button */}
      <View style={[styles.floatingButtonContainer, { backgroundColor: theme.background }]}>
        {(() => {
          // Calculate number of new people to invite (excluding already invited)
          const allInvitedUsers = [...invitedUsers, ...fetchedInvitedUsers]
          const newInviteCount = Array.from(selectedUsers).filter(id => !allInvitedUsers.includes(id)).length
          const buttonText = newInviteCount === 0 
            ? 'Done' 
            : `Invite ${newInviteCount} ${newInviteCount === 1 ? 'person' : 'people'}`
          
          return (
            <TouchableOpacity 
              style={[styles.floatingDoneButton, { backgroundColor: theme.primary }]} 
              onPress={handleDone}
            >
              <Text style={styles.floatingDoneButtonText}>{buttonText}</Text>
            </TouchableOpacity>
          )
        })()}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40, // Same width as back button for centering
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  doneButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  friendsSection: {
    flex: 1,
    marginBottom: 12,
  },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  friendsTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  inviteAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inviteAllButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  friendsList: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  invitedBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  userMajor: {
    fontSize: 14,
    marginBottom: 2,
  },
  userYear: {
    fontSize: 12,
  },
  selectionIndicator: {
    marginLeft: 12,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unselectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  editNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 0,
    marginTop: 10,
  },
  editNoteText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 0,
    alignItems: 'center',
  },
  floatingDoneButton: {
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  floatingDoneButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
})
