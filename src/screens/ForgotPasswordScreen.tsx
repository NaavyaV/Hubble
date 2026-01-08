import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'

interface ForgotPasswordScreenProps {
  navigation: any
  route: {
    params?: {
      email?: string
    }
  }
}

export default function ForgotPasswordScreen({ navigation, route }: ForgotPasswordScreenProps) {
  const { theme } = useTheme()
  const [email, setEmail] = useState(route.params?.email || '')
  const [loading, setLoading] = useState(false)

  const handleSendOTP = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    // Validate email domain
    try {
      const { data: isValidDomain, error: domainError } = await supabase
        .rpc('validate_email_domain', { email_to_check: email.trim() })
      
      if (domainError) {
        console.error('Error validating email domain:', domainError)
        Alert.alert('Error', 'Unable to validate email domain. Please try again.')
        return
      }
      
      if (!isValidDomain) {
        Alert.alert(
          'Invalid Email Domain',
          'Please use your college email address.',
          [{ text: 'OK' }]
        )
        return
      }
    } catch (error) {
      console.error('Error validating email domain:', error)
      Alert.alert('Error', 'Unable to validate email domain. Please try again.')
      return
    }

    setLoading(true)
    try {
      // Use signInWithOtp with shouldCreateUser: false to send recovery OTP
      // This will send an OTP email instead of a password reset link
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false, // Don't create user if they don't exist
          // This will send OTP for existing users
        }
      })

      if (otpError) {
        // Check if error is because user doesn't exist
        if (otpError.message.includes('not found') || 
            otpError.message.includes('does not exist') ||
            otpError.message.includes('User not found') ||
            otpError.message.includes('No user found') ||
            otpError.message.includes('user not found')) {
          Alert.alert(
            'Account Not Found',
            'No account found with this email address. Please check your email or create a new account.',
            [{ text: 'OK' }]
          )
          return
        }
        throw otpError
      }

      // OTP sent successfully - navigate to verification screen
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Auth' },
          {
            name: 'AccountVerification',
            params: {
              email: email.trim(),
              isPasswordReset: true
            }
          }
        ],
      })
    } catch (error: any) {
      // console.error('Forgot password error:', error)
      Alert.alert(
        'Error',
        error.message || 'Failed to send verification code. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigation.goBack()
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            
            <View style={styles.logoContainer}>
              <Ionicons name="mail" size={64} color={theme.primary} />
              <Text style={[styles.logoText, { color: theme.text }]}>Log in with OTP</Text>
              <Text style={[styles.logoSubtext, { color: theme.textSecondary }]}>
                Enter your email to receive a verification code
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="Enter your email"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: theme.buttonPrimary },
                  loading && { backgroundColor: theme.textTertiary }
                ]}
                onPress={handleSendOTP}
                disabled={loading}
              >
                <Text style={[styles.sendButtonText, { color: theme.buttonText }]}>
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  backButton: {
    padding: 8,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
  },
  logoSubtext: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    marginTop: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  sendButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
})

