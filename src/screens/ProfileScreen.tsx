import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { ImageWithFallback } from '../components'
import { useTheme } from '../context/ThemeContext'
import { useOrgMode } from '../context/OrgModeContext'
import { buildTestNotification } from '../utils/notificationTemplates'

export default function ProfileScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  const { setOrgMode, setTargetTab } = useOrgMode()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [college, setCollege] = useState<any>(null)
  const [organization, setOrganization] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserData()
  }, [])

  // Refresh when screen comes into focus (e.g., returning from EditProfile)
  useFocusEffect(
    React.useCallback(() => {
      fetchUserData()
    }, [])
  )

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        
        // Fetch profile data with college information
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select(`
            *,
            college:colleges(*)
          `)
          .eq('id', user.id)
          .single()
        
        if (error) {
          console.error('Error fetching profile:', error)
        } else {
          setProfile(profileData)
          setCollege(profileData.college)
          
          // Fetch organization if user owns one
          if (profileData.org_ownership_id) {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('*')
              .eq('id', profileData.org_ownership_id)
              .single()
            
            if (orgData) {
              setOrganization(orgData)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut()
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out')
            }
          },
        },
      ]
    )
  }

  const handleEditProfile = () => {
    navigation.navigate('EditProfile' as never)
  }

  const handleNotifications = () => {
    navigation.navigate('NotificationSettings' as never)
  }

  const handleSettings = () => {
    navigation.navigate('Settings' as never)
  }

  const handleSwitchToOrgMode = () => {
    if (organization) {
      setTargetTab('OrgSettings')
      setOrgMode(organization)
    }
  }

  const handleTestNotification = async () => {
    const logBorder = '----------------------------------------'
    
    console.log(logBorder)
    console.log('🧪 TEST NOTIFICATION - Starting')
    console.log(logBorder)
    
    try {
      // Step 1: Check if user is authenticated
      console.log(logBorder)
      console.log('Step 1: Checking user authentication...')
      console.log(logBorder)
      
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.log('❌ User not authenticated:', authError)
        console.log(logBorder)
        Alert.alert('Error', 'User not authenticated')
        return
      }
      
      console.log('✅ User authenticated:', user.id)
      console.log('User email:', user.email)
      console.log(logBorder)
      
      // Step 2: Check notification token (needed for Supabase to send notifications)
      console.log(logBorder)
      console.log('Step 2: Checking notification token...')
      console.log(logBorder)
      
      const { data: tokenData, error: tokenError } = await supabase
        .from('notification_tokens')
        .select('token')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (tokenError && tokenError.code !== 'PGRST116') {
        console.log('⚠️ Error checking token:', tokenError.message)
      }
      
      if (!tokenData || !tokenData.token) {
        console.log('⚠️ No notification token found in database')
        console.log('The notification will be queued, but may not be delivered')
        console.log('Please ensure notifications are enabled in your settings')
      } else {
        console.log('✅ Notification token found:', `${tokenData.token.substring(0, 20)}...`)
        console.log('Token will be used by Supabase Edge Function to deliver notification')
      }
      
      console.log(logBorder)
      
      // Step 4: Send test notification through Supabase queue
      console.log(logBorder)
      console.log('Step 4: Queuing test notification in Supabase...')
      console.log(logBorder)
      
      // Use centralized notification builder
      const testNotificationData = buildTestNotification({
        userId: user.id,
        userName: profile?.full_name || 'User'
      })
      
      console.log('Notification queue payload:', JSON.stringify(testNotificationData, null, 2))
      
      const { data: queuedNotification, error: queueError } = await supabase
        .from('notification_queue')
        .insert(testNotificationData)
        .select()
        .single()
      
      if (queueError) {
        console.log('❌ Failed to queue notification:', queueError)
        throw queueError
      }
      
      console.log('✅ Notification queued successfully!')
      console.log('Queue ID:', queuedNotification.id)
      console.log('Scheduled for:', queuedNotification.scheduled_for)
      console.log('Processed:', queuedNotification.processed)
      console.log(logBorder)

      console.log('ℹ️  Notification will be processed automatically by Edge Function')
      console.log('The database trigger will process queued notifications immediately')
      console.log('Your notification should arrive shortly!')
      console.log(logBorder)
      
      // Step 5: Summary
      console.log(logBorder)
      console.log('Step 5: Summary')
      console.log(logBorder)
      console.log('✅ User:', user.email)
      console.log('✅ Notification queued with ID:', queuedNotification.id)
      console.log('✅ Token status:', tokenData && tokenData.token ? 'Available' : 'Not found')
      console.log('✅ Notification scheduled for:', queuedNotification.scheduled_for)
      console.log(logBorder)
      console.log('🎉 TEST NOTIFICATION - Completed Successfully')
      console.log('The notification will be processed and delivered through Supabase')
      console.log(logBorder)
      
      Alert.alert(
        'Success!',
        'Test notification queued in Supabase! It will be processed and delivered shortly. Check your notifications panel in a few moments.',
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.log(logBorder)
      console.log('❌ TEST NOTIFICATION - Failed')
      console.log('Error:', error.message)
      console.log('Error details:', error)
      console.log(logBorder)
      
      Alert.alert('Error', `Failed to send test notification: ${error.message}`)
    }
  }

  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Compact Profile Card - Horizontal Layout */}
        <View style={styles.profileCard}>
          <View style={styles.profileLeft}>
            <View style={styles.avatarContainer}>
              {profile?.avatar_url ? (
                <ImageWithFallback 
                  source={{ uri: profile.avatar_url }} 
                  style={styles.avatar}
                  fallbackIcon="person"
                  fallbackText=""
                  resizeMode="cover"
                  skipValidation={true}
                  priority="high"
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {profile?.full_name?.charAt(0).toUpperCase() || profile?.phone_number?.slice(-1) || 'U'}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.profileRight}>
            <Text style={styles.userName}>
              {profile?.full_name || 'User'}
            </Text>
            {profile?.phone_number && (
              <Text style={styles.userEmail}>{profile.phone_number}</Text>
            )}
            
            {(profile?.major || profile?.graduating_year || college) && (
              <View style={styles.userInfo}>
                {college && (
                  <Text style={styles.userInfoText}>
                    {college.name}
                  </Text>
                )}
                {profile?.major && (
                  <Text style={styles.userInfoText}>
                    {profile.major}
                  </Text>
                )}
                {profile?.graduating_year && (
                  <Text style={styles.userInfoText}>
                    Class of {profile.graduating_year}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Bio Section - Separate */}
        {profile?.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bioTitle}>About</Text>
            <Text style={styles.bioText} numberOfLines={4}>
              {profile.bio}
            </Text>
          </View>
        )}

        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
            <Text style={styles.menuItemText}>Edit Profile</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleNotifications}>
            <Text style={styles.menuItemText}>Notifications</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
            <Text style={styles.menuItemText}>Settings</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom Buttons - Fixed at bottom */}
      <View style={[styles.bottomContainer, { backgroundColor: theme.background }]}>
        {organization && (
          <TouchableOpacity 
            style={[styles.switchToOrgButton, { backgroundColor: theme.primary }]} 
            onPress={handleSwitchToOrgMode}
          >
            <Text style={[styles.switchToOrgText, { color: theme.buttonText }]}>
              Switch to {organization.name}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.testNotificationButton, { backgroundColor: theme.primary }]} onPress={handleTestNotification}>
          <Text style={[styles.testNotificationText, { color: theme.buttonText }]}>Send Test Notification</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 200, // Space for bottom buttons
  },
  profileCard: {
    backgroundColor: theme.card,
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
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  userInfo: {
    marginBottom: 0,
  },
  userInfoText: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '500',
    marginBottom: 2,
  },
  bioSection: {
    backgroundColor: theme.card,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
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
  bioTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  menuContainer: {
    backgroundColor: theme.card,
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
    color: theme.text,
    fontWeight: '500',
  },
  menuItemArrow: {
    fontSize: 18,
    color: theme.textTertiary,
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
  switchToOrgButton: {
    marginBottom: 12,
    paddingVertical: 16,
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
  switchToOrgText: {
    fontSize: 16,
    fontWeight: '600',
  },
  testNotificationButton: {
    marginBottom: 12,
    paddingVertical: 16,
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
  testNotificationText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: theme.error,
    paddingVertical: 16,
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
  signOutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
