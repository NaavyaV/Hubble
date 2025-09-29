import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
} from 'react-native'
import Modal from 'react-native-modal'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'

interface ProfileModalProps {
  isVisible: boolean
  onClose: () => void
  user: {
    id: string
    full_name?: string
    major?: string
    graduating_year?: string
    bio?: string
    avatar_url?: string
    phone_number?: string
    college?: {
      id: string
      name: string
      short_name: string
      logo_url?: string
    }
  } | null
}

export default function ProfileModal({ isVisible, onClose, user }: ProfileModalProps) {
  const { theme } = useTheme()
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending' | 'accepted' | 'blocked'>('none')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && isVisible) {
      checkFriendshipStatus()
    }
  }, [user, isVisible])

  const checkFriendshipStatus = async () => {
    if (!user) return
    try {
      const { data: { user: me } } = await supabase.auth.getUser()
      if (!me) return

      const { data } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(user_id.eq.${me.id},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${me.id})`)
        .maybeSingle()

      if (data) {
        setFriendshipStatus(data.status as any)
      } else {
        setFriendshipStatus('none')
      }
    } catch (error) {
      console.error('Error checking friendship:', error)
    }
  }

  const handleFriendAction = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data: { user: me } } = await supabase.auth.getUser()
      if (!me) return

      if (friendshipStatus === 'none') {
        // Send friend request
        const { error } = await supabase
          .from('friendships')
          .insert({ user_id: me.id, friend_id: user.id, status: 'pending' })
        if (error) throw error
        setFriendshipStatus('pending')
        Alert.alert('Success', 'Friend request sent!')
      } else if (friendshipStatus === 'pending') {
        // Cancel request (only if I sent it)
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('user_id', me.id)
          .eq('friend_id', user.id)
          .eq('status', 'pending')
        if (error) throw error
        setFriendshipStatus('none')
        Alert.alert('Success', 'Friend request cancelled!')
      } else if (friendshipStatus === 'accepted') {
        // Unfriend
        const { error } = await supabase
          .from('friendships')
          .delete()
          .or(`and(user_id.eq.${me.id},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${me.id})`)
        if (error) throw error
        setFriendshipStatus('none')
        Alert.alert('Success', 'Unfriended!')
      }
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const getActionText = () => {
    switch (friendshipStatus) {
      case 'none': return 'Add Friend'
      case 'pending': return 'Cancel Request'
      case 'accepted': return 'Unfriend'
      default: return 'Add Friend'
    }
  }

  const getActionStyle = () => {
    switch (friendshipStatus) {
      case 'none': return [styles.primaryButton, { backgroundColor: theme.buttonPrimary }]
      case 'pending': return [styles.secondaryButton, { backgroundColor: theme.warning }]
      case 'accepted': return [styles.destructiveButton, { backgroundColor: theme.error }]
      default: return [styles.primaryButton, { backgroundColor: theme.buttonPrimary }]
    }
  }

  if (!user) return null

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modal}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
          <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.surface }]} onPress={onClose}>
            <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={[styles.avatar, { borderColor: theme.primary }]} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                  <Text style={[styles.avatarPlaceholderText, { color: theme.buttonText }]}>
                    {user.full_name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.userName, { color: theme.text }]}>
              {user.full_name || 'User'}
            </Text>

            {user.college && (
              <View style={styles.collegeInfo}>
                {user.college.logo_url && (
                  <Image 
                    source={{ uri: user.college.logo_url }} 
                    style={styles.collegeLogo}
                    resizeMode="contain"
                  />
                )}
                <Text style={[styles.collegeName, { color: theme.textSecondary }]}>
                  {user.college.name}
                </Text>
              </View>
            )}

            {(user.major || user.graduating_year) && (
              <View style={styles.userInfo}>
                {user.major && (
                  <Text style={[styles.userInfoText, { color: theme.primary }]}>{user.major}</Text>
                )}
                {user.graduating_year && (
                  <Text style={[styles.userInfoText, { color: theme.primary }]}>
                    Class of {user.graduating_year}
                  </Text>
                )}
              </View>
            )}

            {user.bio && (
              <View style={[styles.bioSection, { backgroundColor: theme.surface }]}>
                <Text style={[styles.bioLabel, { color: theme.text }]}>About</Text>
                <Text style={[styles.bioText, { color: theme.textSecondary }]}>{user.bio}</Text>
              </View>
            )}

            {user.phone_number && (
              <View style={[styles.bioSection, { marginTop: 12, backgroundColor: theme.surface }] }>
                <Text style={[styles.bioLabel, { color: theme.text }]}>Contact</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="call-outline" size={16} color={theme.text} />
                  <Text style={[styles.bioText, { color: theme.textSecondary }]}>{user.phone_number}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[getActionStyle(), loading && { opacity: 0.6 }]}
              onPress={handleFriendAction}
              disabled={loading}
            >
              <Text style={[styles.buttonText, { color: theme.buttonText }]}>
                {loading ? 'Loading...' : getActionText()}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  profileSection: {
    padding: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
  },
  avatarPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  collegeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  collegeLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  collegeName: {
    fontSize: 16,
    fontWeight: '500',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userInfoText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  bioSection: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
  },
  bioLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  destructiveButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
})
