import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native'
import Modal from 'react-native-modal'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'

interface UserProfile {
  id: string
  full_name?: string
  major?: string
  graduating_year?: string
  bio?: string
  avatar_url?: string
}

interface UserProfileModalProps {
  isVisible: boolean
  onClose: () => void
  user: UserProfile | null
}

export default function UserProfileModal({ isVisible, onClose, user }: UserProfileModalProps) {
  const { theme } = useTheme()
  
  if (!user) return null

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modal}
      animationIn="slideInUp"
      animationOut="slideOutDown"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
          <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.surface }]} onPress={onClose}>
            <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.avatarText, { color: theme.buttonText }]}>
                    {user.full_name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </View>
            
            <Text style={[styles.userName, { color: theme.text }]}>
              {user.full_name || 'User'}
            </Text>
            
            {(user.major || user.graduating_year) && (
              <View style={styles.userInfo}>
                {user.major && (
                  <Text style={[styles.userInfoText, { color: theme.primary }]}>
                    {user.major}
                  </Text>
                )}
                {user.graduating_year && (
                  <Text style={[styles.userInfoText, { color: theme.primary }]}>
                    Class of {user.graduating_year}
                  </Text>
                )}
              </View>
            )}

            {user.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioLabel, { color: theme.text }]}>About</Text>
                <Text style={[styles.bioText, { color: theme.textSecondary }]}>{user.bio}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'flex-end',
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    padding: 24,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  userInfoText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  bioContainer: {
    width: '100%',
    alignItems: 'center',
  },
  bioLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
