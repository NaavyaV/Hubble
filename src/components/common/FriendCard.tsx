import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import ImageWithFallback from './ImageWithFallback'
import { useTheme } from '../../context/ThemeContext'

export interface FriendCardUser {
  id: string
  full_name?: string
  avatar_url?: string
  phone_number?: string
  major?: string
  graduating_year?: string
  bio?: string
}

export type FriendStatus = 'none' | 'pending_incoming' | 'pending_outgoing' | 'accepted'

export interface FriendCardProps {
  user: FriendCardUser
  status: FriendStatus
  isBlocked?: boolean
  isMuted?: boolean
  isRecentlyAccepted?: boolean
  isLocallyPending?: boolean
  onPress?: () => void
  onAddFriend?: () => void
  onAcceptRequest?: () => void
  onRejectRequest?: () => void
  onCancelRequest?: () => void
  onRemoveFriend?: () => void
  onUnblock?: () => void
  onMenuPress?: () => void
  showMenuButton?: boolean
}

function FriendCard({
  user,
  status,
  isBlocked = false,
  isMuted = false,
  isRecentlyAccepted = false,
  isLocallyPending = false,
  onPress,
  onAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onRemoveFriend,
  onUnblock,
  onMenuPress,
  showMenuButton = false,
}: FriendCardProps) {
  const { theme } = useTheme()
  // Only show pending if status is actually pending, not if it's accepted
  const showPending = (status === 'pending_outgoing' || (status === 'none' && isLocallyPending))

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <TouchableOpacity
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', opacity: isBlocked ? 0.6 : 1 }}
        onPress={onPress}
        disabled={isBlocked}
      >
        <View style={styles.cardLeft}>
          {user.avatar_url ? (
            <ImageWithFallback
              source={{ uri: user.avatar_url }}
              cacheKey={`profile:${user.id}:avatar`}
              style={styles.avatar}
              fallbackIcon="person"
              fallbackText={user.full_name?.charAt(0).toUpperCase() || 'U'}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>
                {user.full_name?.charAt(0).toUpperCase() || user.phone_number?.slice(-1) || 'U'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardRight}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.name, { color: theme.text }]}>
              {user.full_name || user.phone_number || 'Unknown'}
            </Text>
            {isMuted && (
              <Ionicons name="notifications-off" size={16} color={theme.textSecondary} />
            )}
            {isBlocked && (
              <View style={[styles.blockedBadge, { backgroundColor: theme.error + '20' }]}>
                <Text style={[styles.blockedBadgeText, { color: theme.error }]}>Blocked</Text>
              </View>
            )}
          </View>
          {status === 'accepted' && isRecentlyAccepted && !isBlocked && (
            <View style={[styles.badge, { backgroundColor: theme.success + '20' }]}>
              <Text style={[styles.badgeText, { color: theme.success }]}>New Friend!</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={[styles.cardActions, { opacity: 1 }]}>
        {isBlocked ? (
          <TouchableOpacity
            style={[styles.addFriendButton, { backgroundColor: theme.primary }]}
            onPress={onUnblock}
          >
            <Text style={[styles.addFriendText, { color: theme.buttonText }]}>Unblock</Text>
          </TouchableOpacity>
        ) : status === 'pending_incoming' ? (
          // Show accept/reject buttons for incoming requests
          <>
            {onAcceptRequest && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.success }]}
                onPress={onAcceptRequest}
              >
                <Ionicons name="checkmark" size={20} color="white" />
              </TouchableOpacity>
            )}
            {onRejectRequest && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.error }]}
                onPress={onRejectRequest}
              >
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            )}
          </>
        ) : status === 'pending_outgoing' || (status === 'none' && isLocallyPending) ? (
          // Show pending button for outgoing requests or locally pending
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.pendingButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.pendingText, { color: theme.textSecondary }]}>Pending</Text>
            </View>
            {showMenuButton && onMenuPress && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: 'transparent' }]}
                onPress={(e) => {
                  e.stopPropagation()
                  onMenuPress()
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ) : status === 'accepted' ? (
          // Show menu button for accepted friends
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {showMenuButton && onMenuPress ? (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: 'transparent' }]}
                onPress={(e) => {
                  e.stopPropagation()
                  onMenuPress()
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : onRemoveFriend ? (
              <TouchableOpacity
                style={[styles.addFriendButton, { backgroundColor: theme.error }]}
                onPress={onRemoveFriend}
              >
                <Text style={[styles.addFriendText, { color: 'white' }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : status === 'none' && !isLocallyPending ? (
          // Show add friend button for users with no relationship
          <View style={styles.addFriendContainer}>
            {onAddFriend && (
              <TouchableOpacity
                style={[styles.addFriendButton, { backgroundColor: theme.primary }]}
                onPress={onAddFriend}
              >
                <Text style={[styles.addFriendText, { color: theme.buttonText }]}>+ Add</Text>
              </TouchableOpacity>
            )}
            {showMenuButton && onMenuPress && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: 'transparent', marginLeft: 8 }]}
                onPress={(e) => {
                  e.stopPropagation()
                  onMenuPress()
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
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
  blockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  blockedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
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
  addFriendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addFriendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFriendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '600',
  },
})

export default React.memo(FriendCard)