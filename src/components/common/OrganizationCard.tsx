import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import ImageWithFallback from './ImageWithFallback'
import { useTheme } from '../../context/ThemeContext'
import { Organization } from '../../context/OrgModeContext'

export interface OrganizationCardProps {
  organization: Organization
  isFollowing?: boolean
  isBlocked?: boolean
  notificationsEnabled?: boolean
  onPress?: () => void
  onFollow?: () => void
  onUnfollow?: () => void
  onUnblock?: () => void
  onToggleNotifications?: () => void
  onMenuPress?: () => void
  showMenuButton?: boolean
  variant?: 'default' | 'onboarding' // Different styles for different contexts
  notificationToggleDisabled?: boolean // For onboarding: disable if not following or notifications not enabled globally
}

export default function OrganizationCard({
  organization,
  isFollowing = false,
  isBlocked = false,
  notificationsEnabled = false,
  onPress,
  onFollow,
  onUnfollow,
  onUnblock,
  onToggleNotifications,
  onMenuPress,
  showMenuButton = false,
  variant = 'default',
  notificationToggleDisabled = false,
}: OrganizationCardProps) {
  const { theme } = useTheme()

  if (variant === 'onboarding') {
    // Onboarding variant - simpler layout
    return (
      <View style={[styles.onboardingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.onboardingHeader}>
          <TouchableOpacity
            style={styles.onboardingContent}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <View style={styles.onboardingLeft}>
              {organization.icon ? (
                <ImageWithFallback
                  source={{ uri: organization.icon }}
                  style={styles.onboardingIcon}
                  fallbackIcon="business"
                  fallbackText={organization.name.charAt(0).toUpperCase()}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.onboardingIconPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="person-circle-outline" size={40} color={theme.textSecondary} />
                </View>
              )}
              <View style={styles.onboardingText}>
                <Text style={[styles.onboardingName, { color: theme.text }]}>
                  {organization.name}
                </Text>
                {organization.description && (
                  <Text 
                    style={[styles.onboardingDescription, { color: theme.textSecondary }]} 
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {organization.description}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
          {showMenuButton && onMenuPress && (
            <TouchableOpacity
              style={styles.onboardingMenuButton}
              onPress={(e) => {
                e.stopPropagation()
                onMenuPress()
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.onboardingActions, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.onboardingFollowButton,
              { 
                backgroundColor: isFollowing ? theme.surface : theme.primary,
                borderColor: isFollowing ? theme.border : theme.primary,
                borderWidth: 1
              }
            ]}
            onPress={(e) => {
              e.stopPropagation()
              if (isFollowing && onUnfollow) {
                onUnfollow()
              } else if (!isFollowing && onFollow) {
                onFollow()
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.onboardingFollowButtonText,
              { color: isFollowing ? theme.text : theme.buttonText }
            ]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
          {onToggleNotifications && (
            <TouchableOpacity
              onPress={() => onToggleNotifications()}
              disabled={notificationToggleDisabled || !isFollowing}
              style={styles.onboardingNotificationButton}
              activeOpacity={0.7}
            >
              {notificationsEnabled ? (
                <Ionicons 
                  name="notifications" 
                  size={24} 
                  color={isFollowing && !notificationToggleDisabled ? theme.primary : theme.textTertiary}
                />
              ) : (
                <View style={styles.notificationCrossedContainer}>
                  <Ionicons 
                    name="notifications-outline" 
                    size={24} 
                    color={isFollowing && !notificationToggleDisabled ? theme.textSecondary : theme.textTertiary}
                  />
                  <View style={[styles.notificationCrossLine, { backgroundColor: isFollowing && !notificationToggleDisabled ? theme.textSecondary : theme.textTertiary }]} />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  // Default variant - used in SocialScreen
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.header, { opacity: isBlocked ? 0.6 : 1 }]}>
        <TouchableOpacity
          style={styles.content}
          onPress={onPress}
          disabled={isBlocked}
        >
          <View style={styles.left}>
            {organization.icon ? (
              <ImageWithFallback
                source={{ uri: organization.icon }}
                style={styles.icon}
                fallbackIcon="business"
                fallbackText={organization.name.charAt(0).toUpperCase()}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.iconPlaceholder, { backgroundColor: theme.primary }]}>
                <Ionicons name="business" size={24} color="white" />
              </View>
            )}
          </View>
          <View style={styles.right}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.name, { color: theme.text }]}>{organization.name}</Text>
              {isBlocked && (
                <View style={[styles.blockedBadge, { backgroundColor: theme.error + '20' }]}>
                  <Text style={[styles.blockedBadgeText, { color: theme.error }]}>Blocked</Text>
                </View>
              )}
            </View>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{organization.type}</Text>
            {organization.description && (
              <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
                {organization.description}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {!isBlocked && showMenuButton && onMenuPress && (
          <TouchableOpacity
            style={[styles.menuButton, { backgroundColor: 'transparent' }]}
            onPress={(e) => {
              e.stopPropagation()
              onMenuPress()
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Follow/Unblock button at bottom - always at full opacity */}
      <View style={styles.footer}>
        {isBlocked ? (
          <TouchableOpacity
            style={[styles.followButton, { backgroundColor: theme.primary }]}
            onPress={onUnblock}
          >
            <Text style={[styles.followButtonText, { color: theme.buttonText }]}>Unblock</Text>
          </TouchableOpacity>
        ) : isFollowing ? (
          <View style={styles.followingActions}>
            {onUnfollow && (
              <TouchableOpacity
                style={[styles.followButton, { backgroundColor: theme.error, flex: 1 }]}
                onPress={onUnfollow}
              >
                <Text style={[styles.followButtonText, { color: 'white' }]}>Unfollow</Text>
              </TouchableOpacity>
            )}
            {onToggleNotifications && (
              <TouchableOpacity
                style={[styles.notificationToggleButton, { 
                  backgroundColor: notificationsEnabled ? theme.primary : theme.surface, 
                  borderWidth: notificationsEnabled ? 0 : 1, 
                  borderColor: theme.border,
                  marginLeft: 8
                }]}
                onPress={onToggleNotifications}
              >
                <Ionicons 
                  name={notificationsEnabled ? "notifications" : "notifications-off"} 
                  size={20} 
                  color={notificationsEnabled ? theme.buttonText : theme.textSecondary} 
                />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          onFollow && (
            <TouchableOpacity
              style={[styles.followButton, { backgroundColor: theme.primary }]}
              onPress={onFollow}
            >
              <Text style={[styles.followButtonText, { color: theme.buttonText }]}>Follow</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Default variant styles
  card: {
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    marginRight: 12,
  },
  right: {
    flex: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  description: {
    fontSize: 12,
    marginTop: 4,
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
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  followButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  followingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Onboarding variant styles
  onboardingCard: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  onboardingContent: {
    flex: 1,
  },
  onboardingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onboardingIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  onboardingIconPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  onboardingText: {
    flex: 1,
  },
  onboardingName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  onboardingDescription: {
    fontSize: 13,
  },
  onboardingMenuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  onboardingFollowButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingFollowButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  onboardingNotificationButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationCrossedContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationCrossLine: {
    position: 'absolute',
    width: 20,
    height: 2,
    transform: [{ rotate: '45deg' }],
  },
})

