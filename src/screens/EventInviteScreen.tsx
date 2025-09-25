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

export default function EventInviteScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { invitedUsers = [], isEditMode = false, eventId } = route.params as {
    invitedUsers: string[]
    isEditMode?: boolean
    eventId?: string
  }

  const [allUsers, setAllUsers] = useState<ProfileRow[]>([])
  const [filteredUsers, setFilteredUsers] = useState<ProfileRow[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set(invitedUsers))
  const [friends, setFriends] = useState<ProfileRow[]>([])
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsers()
    fetchFriends()
  }, [])

  useEffect(() => {
    filterUsers()
  }, [query, allUsers])

  const fetchUsers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
        .neq('id', user.id) // Exclude current user

      if (error) throw error

      setAllUsers(profiles || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch friendships where current user is either user_id or friend_id
      const { data: friendshipsData, error: friendshipsError } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

      if (friendshipsError) throw friendshipsError

      const acceptedFriendships = (friendshipsData || []).filter(f => f.status === 'accepted')
      setFriendships(acceptedFriendships)

      // Get friend profiles
      const friendIds = acceptedFriendships.map(f => 
        f.user_id === user.id ? f.friend_id : f.user_id
      )

      if (friendIds.length > 0) {
        const { data: friendProfiles, error: friendsError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone_number, major, graduating_year, bio')
          .in('id', friendIds)

        if (friendsError) throw friendsError
        setFriends(friendProfiles || [])
      }
    } catch (error) {
      console.error('Error fetching friends:', error)
    }
  }

  const filterUsers = () => {
    if (!query.trim()) {
      setFilteredUsers(allUsers)
      return
    }

    const filtered = allUsers.filter(user =>
      user.full_name?.toLowerCase().includes(query.toLowerCase()) ||
      user.major?.toLowerCase().includes(query.toLowerCase()) ||
      user.graduating_year?.toLowerCase().includes(query.toLowerCase())
    )

    setFilteredUsers(filtered)
  }

  const toggleUserSelection = (userId: string) => {
    // In edit mode, don't allow removing already invited users
    if (isEditMode && invitedUsers.includes(userId)) {
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
    navigation.goBack()
  }

  const renderUser = ({ item }: { item: ProfileRow }) => {
    const isSelected = selectedUsers.has(item.id)
    const isAlreadyInvited = isEditMode && invitedUsers.includes(item.id)
    const isFriend = friends.some(friend => friend.id === item.id)

    return (
      <TouchableOpacity
        style={[
          styles.userItem,
          isSelected && styles.userItemSelected,
          isAlreadyInvited && styles.userItemInvited
        ]}
        onPress={() => toggleUserSelection(item.id)}
        disabled={isAlreadyInvited}
      >
        <View style={styles.userAvatar}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color="#7f8c8d" />
          )}
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{item.full_name || 'Unknown'}</Text>
            {isFriend && (
              <View style={styles.friendBadge}>
                <Ionicons name="people" size={12} color="white" />
                <Text style={styles.friendBadgeText}>Friend</Text>
              </View>
            )}
            {isAlreadyInvited && (
              <View style={styles.invitedBadge}>
                <Ionicons name="checkmark" size={12} color="white" />
                <Text style={styles.invitedBadgeText}>Invited</Text>
              </View>
            )}
          </View>
          
          {item.major && (
            <Text style={styles.userMajor}>{item.major}</Text>
          )}
          
          {item.graduating_year && (
            <Text style={styles.userYear}>{item.graduating_year}</Text>
          )}
        </View>

        <View style={styles.selectionIndicator}>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={24} color="#3498db" />
          ) : (
            <Ionicons name="ellipse-outline" size={24} color="#bdc3c7" />
          )}
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? 'Edit Invites' : 'Invite People'}
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#7f8c8d" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#7f8c8d"
          />
        </View>

        <View style={styles.friendsSection}>
          <View style={styles.friendsHeader}>
            <Text style={styles.friendsTitle}>Your Friends</Text>
            <TouchableOpacity style={styles.inviteAllButton} onPress={handleInviteAllFriends}>
              <Text style={styles.inviteAllButtonText}>Invite All</Text>
            </TouchableOpacity>
          </View>
          
          {friends.length > 0 ? (
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              style={styles.friendsList}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <Text style={styles.noFriendsText}>No friends found</Text>
          )}
        </View>

        <View style={styles.allUsersSection}>
          <Text style={styles.allUsersTitle}>All Users</Text>
          
          {filteredUsers.length > 0 ? (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              style={styles.allUsersList}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <Text style={styles.noUsersText}>No users found</Text>
          )}
        </View>

        {isEditMode && (
          <View style={styles.editNote}>
            <Ionicons name="information-circle" size={16} color="#f39c12" />
            <Text style={styles.editNoteText}>
              You can add more people but cannot remove those already invited
            </Text>
          </View>
        )}
      </View>
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
  },
  loadingText: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3498db',
    borderRadius: 6,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#2c3e50',
  },
  friendsSection: {
    marginBottom: 24,
  },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  friendsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
  },
  inviteAllButton: {
    backgroundColor: '#27ae60',
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
    maxHeight: 200,
  },
  noFriendsText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    padding: 20,
  },
  allUsersSection: {
    flex: 1,
  },
  allUsersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  allUsersList: {
    flex: 1,
  },
  noUsersText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    padding: 20,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  userItemSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#3498db',
  },
  userItemInvited: {
    backgroundColor: '#fff3cd',
    borderColor: '#f39c12',
    opacity: 0.8,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
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
    color: '#2c3e50',
    marginRight: 8,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  friendBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f39c12',
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
    color: '#7f8c8d',
    marginBottom: 2,
  },
  userYear: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  selectionIndicator: {
    marginLeft: 12,
  },
  editNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f39c12',
    marginTop: 16,
  },
  editNoteText: {
    fontSize: 14,
    color: '#2c3e50',
    marginLeft: 8,
    flex: 1,
  },
})
