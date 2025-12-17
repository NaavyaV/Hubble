import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import ImageWithFallback from '../components/ImageWithFallback'

export default function OrgSettingsScreen() {
  const { theme } = useTheme()
  const { currentOrg, exitOrgMode, setTargetTab } = useOrgMode()
  const navigation = useNavigation()

  const handleEditOrg = () => {
    ;(navigation as any).navigate('OrgEdit')
  }

  const handleExitOrgMode = () => {
    setTargetTab('Profile')
    exitOrgMode()
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Org Profile Header */}
        <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
          <View style={styles.profileLeft}>
            <View style={styles.avatarContainer}>
              {currentOrg?.icon ? (
                <ImageWithFallback 
                  source={{ uri: currentOrg.icon }} 
                  style={styles.avatar}
                  fallbackIcon="business"
                  fallbackText={currentOrg.name.charAt(0).toUpperCase()}
                  resizeMode="cover"
                  skipValidation={true}
                  priority="high"
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <Ionicons name="business" size={40} color="white" />
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.profileRight}>
            <Text style={[styles.orgName, { color: theme.text }]}>
              {currentOrg?.name || 'Organization'}
            </Text>
            {currentOrg?.type && (
              <Text style={[styles.orgType, { color: theme.textSecondary }]}>
                {currentOrg.type}
              </Text>
            )}
            {currentOrg?.description && (
              <Text style={[styles.orgDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                {currentOrg.description}
              </Text>
            )}
          </View>
        </View>

        {/* Edit Menu */}
        <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEditOrg}>
            <Text style={[styles.menuItemText, { color: theme.text }]}>Edit Organization</Text>
            <Text style={[styles.menuItemArrow, { color: theme.textTertiary }]}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Exit Org Mode Button - Fixed at bottom */}
      <View style={[styles.bottomContainer, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.exitButton, { backgroundColor: theme.primary }]}
          onPress={handleExitOrgMode}
        >
          <Text style={styles.exitButtonText}>Switch to Personal Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingBottom: 100, // Space for bottom button
  },
  profileCard: {
    margin: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  profileLeft: {
    marginRight: 16,
  },
  profileRight: {
    flex: 1,
    justifyContent: 'center',
  },
  avatarContainer: {
    marginBottom: 0,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.primary,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  orgType: {
    fontSize: 14,
    marginBottom: 8,
  },
  orgDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  menuContainer: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuItemArrow: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
  },
  exitButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  exitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})

