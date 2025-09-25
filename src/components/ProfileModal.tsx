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
  } | null
}

export default function ProfileModal({ isVisible, onClose, user }: ProfileModalProps) {
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
      case 'none': return styles.primaryButton
      case 'pending': return styles.secondaryButton
      case 'accepted': return styles.destructiveButton
      default: return styles.primaryButton
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
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {user.full_name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.userName}>
              {user.full_name || 'User'}
            </Text>

            {(user.major || user.graduating_year) && (
              <View style={styles.userInfo}>
                {user.major && (
                  <Text style={styles.userInfoText}>{user.major}</Text>
                )}
                {user.graduating_year && (
                  <Text style={styles.userInfoText}>
                    Class of {user.graduating_year}
                  </Text>
                )}
              </View>
            )}

            {user.bio && (
              <View style={styles.bioSection}>
                <Text style={styles.bioLabel}>About</Text>
                <Text style={styles.bioText}>{user.bio}</Text>
              </View>
            )}

            {user.phone_number && (
              <View style={[styles.bioSection, { marginTop: 12 }] }>
                <Text style={styles.bioLabel}>Contact</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="call-outline" size={16} color="#2c3e50" />
                  <Text style={styles.bioText}>{user.phone_number}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[getActionStyle(), loading && styles.buttonDisabled]}
              onPress={handleFriendAction}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
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
    backgroundColor: 'white',
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
    borderBottomColor: '#e1e8ed',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#7f8c8d',
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
    borderColor: '#3498db',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#3498db',
  },
  avatarPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userInfoText: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '500',
    marginBottom: 4,
  },
  bioSection: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  bioLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    color: '#5a6c7d',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  secondaryButton: {
    backgroundColor: '#f1c40f',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  destructiveButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
})
