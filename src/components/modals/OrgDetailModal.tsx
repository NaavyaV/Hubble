import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { Organization } from '../../context/OrgModeContext'
import ImageWithFallback from '../common/ImageWithFallback'

interface OrgDetailModalProps {
  org: Organization
  visible: boolean
  onClose: () => void
  isFollowing: boolean
  notificationsEnabled: boolean
  onFollow: () => void
  onUnfollow: () => void
  onToggleNotifications: () => void
}

export default function OrgDetailModal({
  org,
  visible,
  onClose,
  isFollowing,
  notificationsEnabled,
  onFollow,
  onUnfollow,
  onToggleNotifications
}: OrgDetailModalProps) {
  const { theme } = useTheme()

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity 
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{org.name}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {org.icon ? (
                <ImageWithFallback
                  source={{ uri: org.icon }}
                  style={styles.modalAvatar}
                  fallbackIcon="business"
                  fallbackText={org.name.charAt(0).toUpperCase()}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.modalAvatar, { backgroundColor: theme.primary }]}>
                  <Ionicons name="business" size={40} color="white" />
                </View>
              )}

              <Text style={[styles.modalType, { color: theme.textSecondary }]}>{org.type}</Text>

              {org.description && (
                <Text style={[styles.modalDescription, { color: theme.text }]}>
                  {org.description}
                </Text>
              )}

              <View style={styles.modalActions}>
                {isFollowing ? (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        { 
                          backgroundColor: notificationsEnabled ? theme.primary : theme.surface,
                          borderWidth: notificationsEnabled ? 0 : 1,
                          borderColor: theme.border
                        }
                      ]}
                      onPress={onToggleNotifications}
                    >
                      <Ionicons 
                        name={notificationsEnabled ? "notifications" : "notifications-off"} 
                        size={20} 
                        color={notificationsEnabled ? theme.buttonText : theme.textSecondary} 
                      />
                      <Text style={[
                        styles.modalButtonText,
                        { color: notificationsEnabled ? theme.buttonText : theme.textSecondary }
                      ]}>
                        {notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: theme.error }]}
                      onPress={onUnfollow}
                    >
                      <Ionicons name="person-remove" size={20} color="white" />
                      <Text style={[styles.modalButtonText, { color: 'white' }]}>Unfollow</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.primary }]}
                    onPress={onFollow}
                  >
                    <Ionicons name="person-add" size={20} color={theme.buttonText} />
                    <Text style={[styles.modalButtonText, { color: theme.buttonText }]}>Follow</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    alignItems: 'center',
  },
  modalAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalType: {
    fontSize: 14,
    marginBottom: 16,
  },
  modalDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalActions: {
    width: '100%',
    gap: 12,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})

