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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { RouteProp } from '@react-navigation/native'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'

type RootStackParamList = {
  AccountVerification: { 
    email: string
    userId?: string
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
  const { email, userId, onboardingData } = route.params
  const { theme } = useTheme()
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [rateLimitTime, setRateLimitTime] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [verificationComplete, setVerificationComplete] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRefs = useRef<TextInput[]>([])

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

  // Send OTP on component mount only if not rate limited
  useEffect(() => {
    if (rateLimitTime === 0) {
      sendOTP()
    }
  }, [])

  // Listen for auth state changes to handle OTP verification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change in verification screen:', { event, session: session ? 'exists' : 'none' })
        
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('User signed in after OTP - updating otp_verified to true')
          
          // Stop all loading states and clear OTP
          setLoading(false)
          setOtp('')
          setVerificationComplete(true)
          
          // Clear any pending timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
          
          // Update profile to mark OTP as verified
          try {
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ 
                otp_verified: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', session.user.id)
            
            if (updateError) {
              console.error('Error updating otp_verified:', updateError)
            } else {
              console.log('Profile updated successfully - OTP verified')
            }
          } catch (error) {
            console.error('Error updating profile:', error)
          }
          
          // App.tsx auth listener will handle navigation automatically
          console.log('OTP verification complete - App.tsx will handle navigation')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])



  const sendOTP = async () => {
    if (countdown > 0) {
      Alert.alert(
        'Please Wait',
        `Please wait ${countdown} seconds before requesting a new code.`,
        [{ text: 'OK' }]
      )
      return
    }

    // Validate email domain before sending OTP
    try {
      console.log('Validating email domain for:', email)
      const { data: isValidDomain, error: domainError } = await supabase
        .rpc('validate_email_domain', { email_to_check: email })
      
      if (domainError) {
        console.error('Error validating email domain:', domainError)
        Alert.alert('Error', 'Unable to validate email domain. Please try again.')
        return
      }
      
      if (!isValidDomain) {
        Alert.alert(
          'Invalid Email Domain',
          'Please use your college email address to create an account.',
          [{ text: 'OK' }]
        )
        return
      }
      
      console.log('Email domain validation passed')
    } catch (error) {
      console.error('Error validating email domain:', error)
      Alert.alert('Error', 'Unable to validate email domain. Please try again.')
      return
    }

    setResendingEmail(true)
    try {
      console.log('Sending OTP to:', email)
      
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true
        }
      })

      console.log('OTP send response:', { data, error })

      if (error) {
        console.error('OTP send error:', error)
        
        // Handle rate limiting
        if (error.message.includes('For security purposes, you can only request this after')) {
          const match = error.message.match(/(\d+) seconds/)
          if (match) {
            const seconds = parseInt(match[1])
            setRateLimitTime(seconds)
            setCountdown(seconds)
            Alert.alert(
              'Please Wait',
              `For security purposes, you can only request a new code after ${seconds} seconds.`,
              [{ text: 'OK' }]
            )
          } else {
            Alert.alert(
              'Rate Limited',
              'Please wait a moment before requesting a new verification code.',
              [{ text: 'OK' }]
            )
          }
        } else {
          Alert.alert(
            'Error',
            `Failed to send verification code: ${error.message}`,
            [{ text: 'OK' }]
          )
        }
      } else {
        console.log('OTP sent successfully!')
        setOtpSent(true)
        setRateLimitTime(60) // Set 60 second rate limit
        setCountdown(60)
        
        
        Alert.alert(
          'Verification Code Sent',
          'A 6-digit verification code has been sent to your email address.',
          [{ text: 'OK' }]
        )
      }
    } catch (error: any) {
      console.error('Unexpected error sending OTP:', error)
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
      console.log('Verification already complete, ignoring request')
      return
    }

    setLoading(true)
    
    // Add timeout to prevent hanging
    timeoutRef.current = setTimeout(() => {
      console.log('OTP verification timed out')
      setLoading(false)
      Alert.alert(
        'Timeout',
        'Verification is taking longer than expected. Please try again.',
        [{ text: 'OK' }]
      )
    }, 10000) // 10 second timeout

    try {
      console.log('Verifying OTP:', otp)

      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: otp,
        type: 'email'
      })

      console.log('OTP verification response:', { data, error })

      if (error) {
        console.error('OTP verification error:', error)
        
        // Handle different error types with gentle messages
        
        if (error.message.includes('invalid') || error.message.includes('Invalid') || 
                   error.message.includes('incorrect') || error.message.includes('wrong')) {
          Alert.alert(
            'Incorrect Code',
            'The verification code you entered is incorrect. Please try again.',
            [{ text: 'OK' }]
          )
        } else if (error.message.includes('Token has expired') || error.message.includes('expired')) {
          Alert.alert(
            'Code Expired',
            'This verification code has expired. Please request a new one.',
            [{ text: 'OK' }]
          )
        } else {
          Alert.alert(
            'Verification Failed',
            'Unable to verify the code. Please try again or request a new one.',
            [{ text: 'OK' }]
          )
        }
        setOtp('')
      } else {
        console.log('OTP verified successfully! Auth state change will handle navigation.')
        // Don't do anything here - let the auth state listener handle navigation
      }
    } catch (error: any) {
      console.error('Unexpected error verifying OTP:', error)
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
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    await sendOTP()
  }

  const handleOtpChange = (text: string) => {
    // Only allow numbers and limit to 6 digits
    const numericText = text.replace(/[^0-9]/g, '').slice(0, 6)
    setOtp(numericText)
  }

  const handleKeyPress = (index: number, text: string) => {
    if (text.length === 1 && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleSignOut = async () => {
    try {
      console.log('Sign out button pressed')
      
      // Check if user is currently signed in
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Current user before sign out:', user ? 'exists' : 'none')
      
      // Sign out regardless of current state
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Sign out error:', error)
      } else {
        console.log('Sign out successful')
      }
      
      // Navigate to auth screen
      console.log('Navigating to Auth screen...')
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      })
      
    } catch (error) {
      console.error('Error signing out:', error)
      // Even if sign out fails, navigate to auth screen
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      })
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail" size={80} color={theme.primary} />
          </View>

          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: theme.text }]}>
              Verify Your Email
            </Text>
            
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              We've sent a 6-digit code to:
            </Text>
            
            <Text style={[styles.email, { color: theme.primary }]}>
              {email}
            </Text>
            
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              Enter the verification code below to complete your account setup.
            </Text>
          </View>

          <View style={styles.otpContainer}>
            <Text style={[styles.otpLabel, { color: theme.text }]}>
              Verification Code
            </Text>
            <View style={styles.otpInputs}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    if (ref) inputRefs.current[index] = ref
                  }}
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: theme.surface,
                      borderColor: otp.length > index ? theme.primary : theme.border,
                      color: theme.text
                    }
                  ]}
                  value={otp[index] || ''}
                  onChangeText={(text) => {
                    const newOtp = otp.split('')
                    newOtp[index] = text.replace(/[^0-9]/g, '').slice(0, 1)
                    const updatedOtp = newOtp.join('').slice(0, 6)
                    setOtp(updatedOtp)
                    
                    if (text && index < 5) {
                      inputRefs.current[index + 1]?.focus()
                    }
                  }}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
                      inputRefs.current[index - 1]?.focus()
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={1}
                  textAlign="center"
                  selectTextOnFocus
                />
              ))}
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.buttonPrimary },
                (loading || otp.length !== 6 || verificationComplete) && { backgroundColor: theme.textTertiary }
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
                    Verified! Redirecting...
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
  otpInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  otpInput: {
    width: 45,
    height: 55,
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
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

