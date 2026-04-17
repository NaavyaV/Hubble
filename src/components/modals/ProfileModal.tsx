import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal as RNModal,
} from 'react-native'
import Modal from 'react-native-modal'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../services/supabase'
import { getCachedUser } from '../../services/sessionService'
import { useTheme } from '../../context/ThemeContext'
import { shouldShowPhoneNumber } from '../../utils/phoneVisibility'
import { safeFriendshipOrQuery } from '../../utils/queryHelpers'
import ReportModal, { ReportReason } from './ReportModal'
import ImageWithFallback from '../common/ImageWithFallback'

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
  isHostingEvent?: boolean
}

export default function ProfileModal({ isVisible, onClose, user, isHostingEvent = false }: ProfileModalProps) {
  const { theme } = useTheme()
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending' | 'accepted' | 'blocked'>('none')
  const [loading, setLoading] = useState(false)
  const [showPhoneNumber, setShowPhoneNumber] = useState(false)
  const [phoneVisibilityLoading, setPhoneVisibilityLoading] = useState(true)
  const [menuVisible, setMenuVisible] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportContentType, setReportContentType] = useState<'user' | 'profile_picture'>('user')

  useEffect(() => {
    if (user && isVisible) {
      checkFriendshipStatus()
      checkPhoneVisibility()
      checkBlockStatus()
      checkMuteStatus()
    } else if (!isVisible) {
      // Reset states when modal closes
      setShowPhoneNumber(false)
      setPhoneVisibilityLoading(true)
      setIsBlocked(false)
      setIsMuted(false)
    }
  }, [user, isVisible])

  const checkBlockStatus = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { data } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', me.id)
        .eq('blocked_id', user.id)
        .maybeSingle()

      setIsBlocked(!!data)
    } catch (error) {
      console.error('Error checking block status:', error)
    }
  }

  const checkMuteStatus = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { data } = await supabase
        .from('user_mutes')
        .select('id')
        .eq('muter_id', me.id)
        .eq('muted_id', user.id)
        .maybeSingle()

      setIsMuted(!!data)
    } catch (error) {
      console.error('Error checking mute status:', error)
    }
  }

  const handleMuteUser = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { error } = await supabase
        .from('user_mutes')
        .insert({
          muter_id: me.id,
          muted_id: user.id
        })

      if (error) throw error

      setIsMuted(true)
      setMenuVisible(false)
      Alert.alert('Success', 'User muted successfully')
    } catch (error) {
      console.error('Error muting user:', error)
      Alert.alert('Error', 'Failed to mute user')
    }
  }

  const handleUnmuteUser = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { error } = await supabase
        .from('user_mutes')
        .delete()
        .eq('muter_id', me.id)
        .eq('muted_id', user.id)

      if (error) throw error

      setIsMuted(false)
      setMenuVisible(false)
      Alert.alert('Success', 'User unmuted successfully')
    } catch (error) {
      console.error('Error unmuting user:', error)
      Alert.alert('Error', 'Failed to unmute user')
    }
  }

  const handleReport = async (reason: ReportReason, comments?: string) => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { error } = await supabase
        .from('reports')
        .insert({
          reported_by: me.id,
          content_type: reportContentType,
          content_id: reportContentType === 'profile_picture' ? user.avatar_url : user.id,
          reason: reason,
          comments: comments || null
        })

      if (error) throw error

      Alert.alert('Report Submitted', 'We have received your report, will handle within 24 hours')
      setReportModalVisible(false)
      setMenuVisible(false)
      setReportContentType('user') // Reset to default
    } catch (error) {
      console.error('Error submitting report:', error)
      Alert.alert('Error', 'Failed to submit report')
    }
  }

  const handleBlockUser = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      // Create ONE-WAY block only (blocker blocks blocked, but blocked doesn't know)
      const { error: blockError } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: me.id, blocked_id: user.id })

      if (blockError) throw blockError

      // Remove any reverse block entries if they exist
      await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', me.id)

      // Auto-unfriend
      const { error: unfriendError } = await supabase
        .from('friendships')
        .delete()
        .or(safeFriendshipOrQuery(me.id, user.id))
        .eq('status', 'accepted')

      if (unfriendError) {
        console.error('Error unfriending user:', unfriendError)
      }

      // Cancel pending requests
      const { error: cancelError } = await supabase
        .from('friendships')
        .delete()
        .or(safeFriendshipOrQuery(me.id, user.id))
        .eq('status', 'pending')

      if (cancelError) {
        console.error('Error cancelling pending requests:', cancelError)
      }

      setIsBlocked(true)
      setFriendshipStatus('none')
      setMenuVisible(false)
      Alert.alert('Success', 'User blocked successfully')
    } catch (error) {
      console.error('Error blocking user:', error)
      Alert.alert('Error', 'Failed to block user')
    }
  }

  const handleUnblockUser = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      // Delete one-way block (only the block we created)
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', me.id)
        .eq('blocked_id', user.id)

      if (error) throw error

      setIsBlocked(false)
      setMenuVisible(false)
      Alert.alert('Success', 'User unblocked successfully')
    } catch (error) {
      console.error('Error unblocking user:', error)
      Alert.alert('Error', 'Failed to unblock user')
    }
  }

  const checkPhoneVisibility = async () => {
    if (!user) {
      setPhoneVisibilityLoading(false)
      return
    }
    
    setPhoneVisibilityLoading(true)
    try {
      const me = await getCachedUser()
      if (!me) {
        setPhoneVisibilityLoading(false)
        return
      }

      const shouldShow = await shouldShowPhoneNumber(user.id, me.id, isHostingEvent)
      setShowPhoneNumber(shouldShow)
    } catch (error) {
      console.error('Error checking phone visibility:', error)
      setShowPhoneNumber(false)
    } finally {
      setPhoneVisibilityLoading(false)
    }
  }

  const checkFriendshipStatus = async () => {
    if (!user) return
    try {
      const me = await getCachedUser()
      if (!me) return

      const { data } = await supabase
        .from('friendships')
        .select('status')
        .or(safeFriendshipOrQuery(me.id, user.id))
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
      const me = await getCachedUser()
      if (!me) return

      if (friendshipStatus === 'none') {
        // Prevent sending friend request to blocked users
        if (isBlocked) {
          Alert.alert('Error', 'Cannot send friend request to a blocked user')
          setLoading(false)
          return
        }
        
        // Check if this user has blocked me (they are a blocker)
        const { data: blockerData } = await supabase
          .from('user_blocks')
          .select('blocker_id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', me.id)
          .maybeSingle()
        
        if (blockerData) {
          Alert.alert('Error', 'Cannot send friend request to this user')
          setLoading(false)
          return
        }
        
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
          .or(safeFriendshipOrQuery(me.id, user.id))
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
      case 'none': return '+ Add'
      case 'pending': return 'Cancel Request'
      case 'accepted': return 'Unfriend'
      default: return '+ Add'
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
      animationIn="slideInUp"
      animationOut="slideOutDown"
      animationInTiming={250}
      animationOutTiming={200}
      backdropTransitionInTiming={200}
      backdropTransitionOutTiming={150}
      useNativeDriverForBackdrop
      hideModalContentWhileAnimating
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <TouchableOpacity style={[styles.closeButton]} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {user.avatar_url ? (
                <ImageWithFallback source={{ uri: user.avatar_url }} style={StyleSheet.flatten([styles.avatar, { borderColor: theme.primary }])} resizeMode="cover" />
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
                {user.college.logo_url ? (
                  <ImageWithFallback
                    source={{ uri: user.college.logo_url }}
                    style={styles.collegeLogo}
                    resizeMode="contain"
                  />
                ) : null}
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

            {/* Show loading placeholder while checking phone visibility to prevent flash */}
            {user.phone_number && phoneVisibilityLoading && (
              <View style={[styles.bioSection, { marginTop: 12, backgroundColor: theme.surface }]}>
                <Text style={[styles.bioLabel, { color: theme.text }]}>Contact</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="call-outline" size={16} color={theme.textTertiary} />
                  <View style={[styles.loadingPlaceholder, { backgroundColor: theme.divider }]} />
                </View>
              </View>
            )}

            {/* Only show phone number after loading completes and permission is granted */}
            {user.phone_number && !phoneVisibilityLoading && showPhoneNumber && (
              <View style={[styles.bioSection, { marginTop: 12, backgroundColor: theme.surface }]}>
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

      {/* User Menu Modal */}
      <RNModal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.menuContent, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <View style={[styles.menuHeader, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>User Options</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.menuItemsContainer}>
              {isBlocked ? (
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    Alert.alert(
                      'Unblock User',
                      'Are you sure you want to unblock this user?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Unblock',
                          style: 'default',
                          onPress: () => {
                            handleUnblockUser()
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                      <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unblock</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    Alert.alert(
                      'Block User',
                      'Are you sure you want to block this user? You will not be able to see each other\'s content.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Block',
                          style: 'destructive',
                          onPress: () => {
                            handleBlockUser()
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="ban" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Block</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    setReportContentType('user')
                    setReportModalVisible(true)
                    setMenuVisible(false)
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                      <Ionicons name="flag" size={22} color={theme.error} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report User</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                {user.avatar_url && (
                  <TouchableOpacity
                    style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      setReportContentType('profile_picture')
                      setReportModalVisible(true)
                      setMenuVisible(false)
                    }}
                  >
                    <View style={styles.menuItemContent}>
                      <View style={[styles.menuItemIconContainer, { backgroundColor: theme.error + '20' }]}>
                        <Ionicons name="image-outline" size={22} color={theme.error} />
                      </View>
                      <View style={styles.menuItemTextContainer}>
                        <Text style={[styles.menuItemTitle, { color: theme.text }]}>Report Profile Picture</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

              {isMuted ? (
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    Alert.alert(
                      'Unmute User',
                      'Are you sure you want to unmute this user? You will receive notifications from them again.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Unmute',
                          style: 'default',
                          onPress: () => {
                            handleUnmuteUser()
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.primary + '20' }]}>
                      <Ionicons name="volume-high" size={22} color={theme.primary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Unmute</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.menuItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => {
                    Alert.alert(
                      'Mute User',
                      'Are you sure you want to mute this user? You will not receive notifications from them.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Mute',
                          style: 'destructive',
                          onPress: () => {
                            handleMuteUser()
                          }
                        }
                      ]
                    )
                  }}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconContainer, { backgroundColor: theme.textSecondary + '20' }]}>
                      <Ionicons name="notifications-off" size={22} color={theme.textSecondary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={[styles.menuItemTitle, { color: theme.text }]}>Mute</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </RNModal>

      {/* Report Modal */}
      <ReportModal
        isVisible={reportModalVisible}
        onClose={() => {
          setReportModalVisible(false)
          setReportContentType('user') // Reset to default
        }}
        onSubmit={handleReport}
        contentType={reportContentType}
      />
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
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
  loadingPlaceholder: {
    height: 14,
    width: 120,
    borderRadius: 4,
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
})
