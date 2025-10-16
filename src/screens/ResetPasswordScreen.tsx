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

export default function ResetPasswordScreen({ navigation }: any) {
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      // In development without custom deep links, let Supabase use the default verify URL
      // configured by the project's Site URL. Do not pass redirectTo here.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim())

      if (error) {
        throw error
      }

      setEmailSent(true)
    } catch (error: any) {
      console.error('Password reset error:', error)
      Alert.alert('Error', error.message || 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToSignIn = () => {
    navigation.goBack()
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
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    backButton: {
      padding: 8,
      marginBottom: 20,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoText: {
      fontSize: 32,
      fontWeight: 'bold',
      marginTop: 16,
    },
    logoSubtext: {
      fontSize: 16,
      marginTop: 8,
      textAlign: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 40,
    },
    form: {
      marginTop: 20,
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
    resetButton: {
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 20,
    },
    resetButtonText: {
      fontSize: 18,
      fontWeight: '600',
    },
    buttonDisabled: {
      backgroundColor: '#bdc3c7',
    },
    backToSignInButton: {
      alignItems: 'center',
      marginTop: 16,
      marginHorizontal: 20,
    },
    backToSignInButtonContent: {
      paddingVertical: 16,
      paddingHorizontal: 80,
      alignItems: 'center',
      minWidth: 240,
    },
    backToSignInButtonText: {
      fontSize: 16,
      fontWeight: '500',
      paddingHorizontal: 8,
    },
    successContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    successIcon: {
      marginBottom: 20,
    },
    successTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 16,
    },
    successMessage: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 8,
    },
    emailText: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 32,
    },
    checkEmailMessage: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 32,
    },
  })

  if (emailSent) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <TouchableOpacity style={styles.backButton} onPress={handleBackToSignIn}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>

              <View style={styles.successContainer}>
                <Ionicons 
                  name="checkmark-circle" 
                  size={80} 
                  color={theme.success || '#27ae60'} 
                  style={styles.successIcon}
                />
                <Text style={[styles.successTitle, { color: theme.text }]}>
                  Check Your Email
                </Text>
                <Text style={[styles.successMessage, { color: theme.textSecondary }]}>
                  We've sent a password reset link to:
                </Text>
                <Text style={[styles.emailText, { color: theme.primary }]}>
                  {email}
                </Text>
                <Text style={[styles.checkEmailMessage, { color: theme.textSecondary }]}>
                  Click the link in the email to reset your password. The link will expire in 1 hour.
                </Text>

                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: theme.buttonPrimary }]}
                  onPress={handleBackToSignIn}
                >
                  <Text style={[styles.resetButtonText, { color: theme.buttonText }]}>
                    Back to Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToSignIn}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>

            <View style={styles.logoContainer}>
              <Ionicons name="lock-closed" size={64} color={theme.primary} />
              <Text style={[styles.logoText, { color: theme.text }]}>Reset Password</Text>
              <Text style={[styles.logoSubtext, { color: theme.textSecondary }]}>
                Enter your email to receive a reset link
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.inputBackground, 
                    borderColor: theme.inputBorder, 
                    color: theme.inputText 
                  }]}
                  placeholder="Enter your email address"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.resetButton,
                  { backgroundColor: theme.buttonPrimary },
                  loading && { backgroundColor: theme.textTertiary }
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                <Text style={[styles.resetButtonText, { color: theme.buttonText }]}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backToSignInButton}
                onPress={handleBackToSignIn}
              >
                <View style={styles.backToSignInButtonContent}>
                  <Text style={[styles.backToSignInButtonText, { color: theme.primary }]}>
                    Back to Sign In
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
