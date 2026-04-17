import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { RouteProp } from '@react-navigation/native'
import { supabase, safeRefreshSession } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { useTheme } from '../context/ThemeContext'
import { uploadBytesToBucket, guessContentTypeFromUri } from '../utils/upload'

type RootStackParamList = {
  AccountVerification: { 
    email: string
    userId?: string
    isPasswordReset?: boolean
    onboardingData?: {
      full_name: string
      college_id: string
      major: string
      phone_number: string
      phone_visibility: string
      otp_verified: boolean
      created_at: string
      updated_at: string
    }
  }
}

type AccountVerificationScreenRouteProp = RouteProp<RootStackParamList, 'AccountVerification'>

interface AccountVerificationScreenProps {
  navigation: any
  route: AccountVerificationScreenRouteProp
}

export default function AccountVerificationScreen({ navigation, route }: AccountVerificationScreenProps) {
  const { email, userId, isPasswordReset, onboardingData } = route.params
  const { theme } = useTheme()
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [rateLimitTime, setRateLimitTime] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [isOtpFocused, setIsOtpFocused] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const otpInputRef = useRef<TextInput | null>(null)
  const cursorOpacity = useRef(new Animated.Value(1)).current
  const isUpdatingProfileRef = useRef(false) // Prevent race conditions with auth state change

  // Countdown timer for rate limiting
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown(countdown - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [countdown])

  // Send OTP on component mount only if not rate limited and not already verified
  // Skip auto-send for password reset flow - OTP was already sent from ForgotPasswordScreen
  useEffect(() => {
    let mounted = true
    
    // Check if user is already verified to prevent unnecessary OTP sends
    const checkIfAlreadyVerified = async () => {
      if (userId) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('otp_verified')
            .eq('id', userId)
            .maybeSingle()
          
          if (profile?.otp_verified && mounted) {
            // if (__DEV__) {
            //   console.log('AccountVerificationScreen.tsx: ','User already verified - skipping OTP send')
            // }
            setVerificationComplete(true)
            setOtpSent(true)
            return true
          }
        } catch (error) {
          // if (__DEV__) {
          //   console.error('AccountVerificationScreen.tsx: ','Error checking verification status:', error)
          // }
        }
      }
      return false
    }

    const initOTP = async () => {
      const alreadyVerified = await checkIfAlreadyVerified()
      if (alreadyVerified || !mounted) {
        return
      }

      if (rateLimitTime === 0 && !isPasswordReset && !verificationComplete) {
        // Only auto-send for account verification (onboarding) flow
        // For password reset, OTP is already sent from ForgotPasswordScreen
        // Send OTP silently on mount (don't show alert)
        // If it fails due to rate limiting, handle it gracefully
        sendOTP(true) // Pass true to indicate this is an auto-send (silent)
      } else if (isPasswordReset) {
        // For password reset, OTP was already sent - just mark as sent
        setOtpSent(true)
      }
    }

    initOTP()
    
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-focus OTP input when component mounts
  useEffect(() => {
    // Small delay to ensure the input is rendered
    const timer = setTimeout(() => {
      otpInputRef.current?.focus()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // Cursor blinking animation
  useEffect(() => {
    if (isOtpFocused && otp.length < 6) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      )
      animation.start()
      return () => animation.stop()
    } else {
      cursorOpacity.setValue(1)
    }
  }, [isOtpFocused, otp.length])


  // Listen for auth state changes to process pending onboarding data
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // if (__DEV__) {
        //   console.log('AccountVerificationScreen.tsx: Auth state change:', { event, session: session ? 'exists' : 'none' })
        // }
        
        if (event === 'SIGNED_IN' && session?.user && !isPasswordReset) {
          // Skip processing pending data if profile update is in progress
          if (isUpdatingProfileRef.current) {
            return
          }
          
          // Wait a moment for handleVerifyOTP to complete the profile update
          await new Promise(resolve => setTimeout(resolve, 1000))

          // Process pending onboarding data (notification preferences, org follows, profile image)
          try {
            const currentUser = await getCachedUser()
            if (!currentUser) {
              return
            }
            
            // Step 1: Create notification preferences if stored in metadata
            if (currentUser.user_metadata?.pending_notification_preferences) {
              const prefs = currentUser.user_metadata.pending_notification_preferences
              const notificationPreferences = {
                user_id: session.user.id,
                push_notifications: prefs.push_notifications,
                event_reminders: prefs.event_reminders,
                going_status_updates: prefs.going_status_updates,
                friend_requests: prefs.friend_requests,
                event_invitations: prefs.event_invitations,
                event_deletions: prefs.event_deletions,
              }
              
              const { error: prefError } = await supabase
                .from('notification_preferences')
                .upsert(notificationPreferences, { onConflict: 'user_id' })
              
              if (!prefError) {
                await supabase.auth.updateUser({
                  data: { pending_notification_preferences: null }
                })
              }
            }
            
            // Step 2: Process pending org follows
            if (currentUser.user_metadata?.pending_org_follows) {
              const pendingFollows = currentUser.user_metadata.pending_org_follows as Array<{
                org_id: string
                notification_enabled: boolean
              }>

              if (pendingFollows && pendingFollows.length > 0) {
                const orgFollowsData = pendingFollows.map(follow => ({
                  user_id: session.user.id,
                  org_id: follow.org_id,
                  notification_enabled: follow.notification_enabled !== false
                }))

                const { error: followsError } = await supabase
                  .from('org_followers')
                  .insert(orgFollowsData)

                if (!followsError) {
                  await supabase.auth.updateUser({
                    data: { pending_org_follows: null }
                  })
                }
              }
            }
            
            // Step 3: Process pending profile image upload
            if (currentUser.user_metadata?.pending_profile_image_uri) {
              const imageUri = currentUser.user_metadata.pending_profile_image_uri as string
              
              try {
                const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg'
                const fileName = `profile-${session.user.id}-${Date.now()}.${fileExt}`
                const filePath = `profile-images/${fileName}`
                const contentType = guessContentTypeFromUri(imageUri)
                
                const avatarUrl = await uploadBytesToBucket({
                  bucket: 'profile-images',
                  filePath,
                  uri: imageUri,
                  contentType,
                  purpose: 'avatar',
                })
                
                if (avatarUrl) {
                  await supabase
                    .from('profiles')
                    .update({ avatar_url: avatarUrl })
                    .eq('id', session.user.id)
                  
                  await supabase.auth.updateUser({
                    data: { pending_profile_image_uri: null }
                  })
                }
              } catch (imageUploadError: any) {
                // if (__DEV__) {
                //   console.error('AccountVerificationScreen.tsx: Error uploading pending profile image:', imageUploadError)
                // }
              }
            }
          } catch (pendingDataError) {
            // if (__DEV__) {
            //   console.error('AccountVerificationScreen.tsx: Error processing pending onboarding data:', pendingDataError)
            // }
          }
          
          // App.tsx will automatically detect the verified user via onAuthStateChange
          // and set user state, which triggers navigation via re-render
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [isPasswordReset])



  const sendOTP = async (isAutoSend: boolean = false) => {
    if (countdown > 0) {
      if (!isAutoSend) {
        Alert.alert(
          'Please Wait',
          `Please wait ${countdown} seconds before requesting a new code.`,
          [{ text: 'OK' }]
        )
      }
      return
    }

    // Skip email domain validation to speed up OTP sending
    // Email domain is already validated during signup/onboarding
    // For password reset, we trust the email is valid since user already has an account

    setResendingEmail(true)
    try {
      // Send OTP - use signInWithOtp for both password reset and account verification
      // This sends an OTP email (not a link) when the email template includes {{ .Token }}
      const result = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: !isPasswordReset // Only create user for account verification, not password reset
        }
      })
      const { data, error } = result

      if (error) {
        // Handle rate limiting - show friendly message instead of error
        if (error.message.includes('For security purposes, you can only request this after')) {
          const match = error.message.match(/(\d+) seconds/)
          if (match) {
            const seconds = parseInt(match[1])
            setRateLimitTime(seconds)
            setCountdown(seconds)
            // If this is an auto-send (on mount), OTP was already sent - just set state
            // Otherwise show the wait message
            if (isAutoSend) {
              // OTP was already sent from previous screen, just inform user to wait
              setOtpSent(true)
              // Don't log error or show alert for auto-send rate limit - OTP was already sent
            } else {
              Alert.alert(
                'Please Wait',
                `For security purposes, you can only request a new code after ${seconds} seconds.`,
                [{ text: 'OK' }]
              )
            }
          } else {
            if (isAutoSend) {
              setOtpSent(true)
            } else {
              Alert.alert(
                'Rate Limited',
                'Please wait a moment before requesting a new verification code.',
                [{ text: 'OK' }]
              )
            }
          }
        } else {
          // For other errors, show alert only if not auto-send
          if (!isAutoSend) {
            Alert.alert(
              'Error',
              `Failed to send verification code: ${error.message}`,
              [{ text: 'OK' }]
            )
          }
        }
      } else {
        setOtpSent(true)
        setRateLimitTime(180) // Set 180 second (3 minute) rate limit
        setCountdown(180)
        // Don't show alert on initial send - it's expected
        // Only show alert when user manually resends
        if (resendingEmail) {
          Alert.alert(
            'Verification Code Sent',
            'A 6-digit verification code has been sent to your email address.',
            [{ text: 'OK' }]
          )
        }
      }
    } catch (error: any) {
      // if (__DEV__) {
      //   console.error('AccountVerificationScreen.tsx: ','Unexpected error sending OTP:', error)
      // }
      Alert.alert(
        'Error',
        `An unexpected error occurred: ${error.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      )
    } finally {
      setResendingEmail(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit verification code.')
      return
    }

    if (verificationComplete) {
      // if (__DEV__) {
      //   console.log('AccountVerificationScreen.tsx: ','Verification already complete, ignoring request')
      // }
      return
    }

    // Dismiss keyboard when verifying
    Keyboard.dismiss()
    
    setLoading(true)
    
    // Add timeout to prevent hanging
    timeoutRef.current = setTimeout(() => {
      // if (__DEV__) {
      //   console.log('AccountVerificationScreen.tsx: ','OTP verification timed out')
      // }
      setLoading(false)
      Alert.alert(
        'Timeout',
        'Verification is taking longer than expected. Please try again.',
        [{ text: 'OK' }]
      )
    }, 10000) // 10 second timeout

    try {
      // Use recovery type for password reset, email type for account verification
      const otpType = isPasswordReset ? 'recovery' : 'email'
      
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: otp,
        type: otpType
      })

      if (error) {
        // Show error in alert, not console
        let errorMessage = 'Unable to verify the code. Please try again or request a new one.'
        let errorTitle = 'Verification Failed'
        
        if (error.message.includes('invalid') || error.message.includes('Invalid') || 
                   error.message.includes('incorrect') || error.message.includes('wrong')) {
          errorTitle = 'Incorrect Code'
          errorMessage = 'The verification code you entered is incorrect. Please try again.'
        } else if (error.message.includes('Token has expired') || error.message.includes('expired') || 
                   error.message.includes('is invalid')) {
          errorTitle = 'Code Expired'
          errorMessage = 'This verification code has expired or is invalid. Please request a new one.'
        }
        
        Alert.alert(
          errorTitle,
          errorMessage,
          [{ text: 'OK' }]
        )
        setOtp('')
        setLoading(false)
      } else {
        // For password reset, just mark as complete - App.tsx will handle navigation
        if (isPasswordReset) {
          setVerificationComplete(true)
          setLoading(false)
          setOtp('')
          return
        }
        
        // For account verification, update profile to mark OTP as verified
        try {
          // Prevent multiple simultaneous updates
          if (isUpdatingProfileRef.current) {
            return
          }
          isUpdatingProfileRef.current = true

          // Get user from verification response
          const verifiedUser = data?.user || data?.session?.user
          if (!verifiedUser) {
            throw new Error('No user found in OTP verification response')
          }

          const now = new Date().toISOString()
          let profileOk = false

          const { error: updateError, data: updateData } = await supabase
            .from('profiles')
            .update({
              otp_verified: true,
              updated_at: now,
            })
            .eq('id', verifiedUser.id)
            .select('otp_verified')
            .single()

          if (updateError) {
            const noRow = /PGRST116|0 rows|no rows|could not find|no profile/i.test(updateError.message ?? '')
            if (noRow) {
              const minimalProfile: Record<string, unknown> = {
                id: verifiedUser.id,
                full_name: onboardingData?.full_name ?? verifiedUser.email?.split('@')[0] ?? 'User',
                college_id: onboardingData?.college_id ?? null,
                major: (onboardingData?.major as string) ?? null,
                phone_number: (onboardingData?.phone_number as string) ?? null,
                phone_visibility: (onboardingData?.phone_visibility as string) ?? 'private',
                otp_verified: true,
                updated_at: now,
              }
              const { error: insertError } = await supabase
                .from('profiles')
                .upsert(minimalProfile, { onConflict: 'id' })
              if (!insertError) {
                profileOk = true
              }
            }
            if (!profileOk) {
              Alert.alert(
                'Verification Error',
                'Your code was verified but we could not save your profile. Please try again or contact support.',
                [{ text: 'OK' }]
              )
              setLoading(false)
              isUpdatingProfileRef.current = false
              return
            }
          } else if (updateData?.otp_verified) {
            profileOk = true
          }

          if (!profileOk) {
            Alert.alert(
              'Verification Error',
              'Your code was verified but the profile update failed to persist. Please try again.',
              [{ text: 'OK' }]
            )
            setLoading(false)
            isUpdatingProfileRef.current = false
            return
          }

          // Mark verification as complete
          setVerificationComplete(true)
          setLoading(false)
          isUpdatingProfileRef.current = false
          
          // Wait a moment to ensure database write is fully committed, then refresh session
          // This triggers TOKEN_REFRESHED event, which will cause App.tsx to re-check otp_verified
          // and set user state to trigger navigation
          setTimeout(async () => {
            try {
              await safeRefreshSession()
            } catch (refreshError: any) {
              // If it's an invalid refresh token error, it's already handled by safeRefreshSession
              // Other errors are logged but don't block the flow - App.tsx will detect via profile subscription if needed
              if (__DEV__ && !refreshError?.message?.includes('Invalid Refresh Token')) {
                console.log('AccountVerificationScreen: Error refreshing session:', refreshError)
              }
            }
          }, 300)
        } catch (updateError: any) {
          isUpdatingProfileRef.current = false
          Alert.alert(
            'Verification Error',
            'Your code was verified but we encountered an error updating your profile. Please try signing in again.',
            [{ text: 'OK' }]
          )
          setLoading(false)
        }
      }
    } catch (error: any) {
      // if (__DEV__) {
      //   console.error('AccountVerificationScreen.tsx: ','Unexpected error verifying OTP:', error)
      // }
      Alert.alert(
        'Error',
        `An unexpected error occurred: ${error.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      )
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // Don't set loading to false if verification is complete - keep the "Verified! Redirecting..." state
      if (!verificationComplete) {
        setLoading(false)
      }
    }
  }

  const handleResendOTP = async () => {
    await sendOTP()
  }


  const handleSignOut = async () => {
    try {
      // Sign out - App.tsx will handle navigation via state change
      const { error } = await supabase.auth.signOut()
      // if (error) {
      //   if (__DEV__) {
      //     console.error('AccountVerificationScreen.tsx: Sign out error:', error)
      //   }
      // }
    } catch (error) {
      // if (__DEV__) {
      //   console.error('AccountVerificationScreen.tsx: Error signing out:', error)
      // }
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack()
              } else {
                navigation.navigate('Auth')
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Ionicons name="mail" size={80} color={theme.primary} />
          </View>

          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: theme.text }]}>
              {isPasswordReset ? 'OTP Login' : 'Verify Your Email'}
            </Text>
            
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              We've sent a 6-digit code to:
            </Text>
            
            <Text style={[styles.email, { color: theme.primary }]}>
              {email}
            </Text>
            
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {isPasswordReset 
                ? 'DISCLAIMER: Because college emails scrutinize OTP emails more, the code may take up to 2-3 minutes to send.\n\nPlease do not close Hubble in this time, and be sure to check spam / junk for your code :)'
                : 'DISCLAIMER: Because college emails scrutinize OTP emails more, the code may take up to 2-3 minutes to send.\n\nPlease do not close Hubble in this time, and be sure to check spam / junk for your code :)'
              }
            </Text>
          </View>

          <View style={styles.otpContainer}>
            <Text style={[styles.otpLabel, { color: theme.text }]}>
              Verification Code
            </Text>
            <View style={styles.otpInputsWrapper}>
              {/* Hidden TextInput for autofill support */}
              <TextInput
                ref={otpInputRef}
                style={styles.hiddenOtpInput}
                value={otp}
                onChangeText={(text) => {
                  // Extract only digits and limit to 6
                  const digits = text.replace(/[^0-9]/g, '').slice(0, 6)
                  setOtp(digits)
                }}
                onFocus={() => setIsOtpFocused(true)}
                onBlur={() => setIsOtpFocused(false)}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus={false}
                caretHidden={true}
              />
              {/* Visual boxes that look like separate inputs */}
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => otpInputRef.current?.focus()}
                style={styles.otpInputs}
              >
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.otpBox,
                      {
                        backgroundColor: theme.surface,
                        borderColor: otp.length > index ? theme.primary : theme.border,
                      }
                    ]}
                  >
                    <Text style={[styles.otpBoxText, { color: theme.text }]}>
                      {otp[index] || ''}
                    </Text>
                    {isOtpFocused && index === otp.length && otp.length < 6 && (
                      <Animated.View 
                        style={[
                          styles.cursor, 
                          { 
                            backgroundColor: theme.primary,
                            opacity: cursorOpacity,
                          }
                        ]} 
                      />
                    )}
                  </View>
                ))}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: verificationComplete ? theme.buttonPrimary : theme.buttonPrimary },
                (loading || (otp.length !== 6 && !verificationComplete)) && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleVerifyOTP}
              disabled={loading || otp.length !== 6 || verificationComplete}
            >
              {loading ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : verificationComplete ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={theme.buttonText} />
                  <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>
                    OTP Verified! Redirecting...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={theme.buttonText} />
                  <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>
                    Verify Code
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
                (resendingEmail || countdown > 0) && { backgroundColor: theme.textTertiary }
              ]}
              onPress={handleResendOTP}
              disabled={resendingEmail || countdown > 0}
            >
              {resendingEmail ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Ionicons name="refresh" size={20} color={theme.text} />
                  <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 32,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  rateLimitText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  otpContainer: {
    width: '100%',
    marginBottom: 32,
  },
  otpLabel: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  otpInputsWrapper: {
    position: 'relative',
    width: '100%',
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
  },
  otpInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  otpBox: {
    width: 45,
    height: 55,
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  otpBoxText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  cursor: {
    position: 'absolute',
    width: 2,
    height: 24,
    borderRadius: 1,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
    marginBottom: 16,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
})


