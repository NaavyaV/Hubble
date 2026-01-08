import React, { useState, useEffect } from 'react'
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
  Image,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { useTheme } from '../context/ThemeContext'
import LegalAgreementModal from './LegalAgreementScreen'

// Pre-load image source as constant for instant rendering
const splashIconSource = require('../../assets/splash-icon.png')

export default function AuthScreen({ navigation }: any) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignIn, setIsSignIn] = useState(false)
  const [showLegalModal, setShowLegalModal] = useState(false)

  // Preload image when component mounts to ensure it's cached (backup in case App.tsx preload missed it)
  useEffect(() => {
    try {
      const resolvedSource = Image.resolveAssetSource(splashIconSource)
      if (resolvedSource?.uri) {
        Image.prefetch(resolvedSource.uri).catch(() => {
          // Silent fail - image will still load normally via require()
        })
      }
    } catch (error) {
      // Silent fail - image will still load normally via require()
    }
  }, [])

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })

      if (error) {
        throw error
      }

      // Check if user has completed OTP verification
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('otp_verified')
          .eq('id', data.user.id)
          .maybeSingle()
        
        if (!profile?.otp_verified) {
          // User needs to complete OTP verification - navigate immediately
          navigation.reset({
            index: 0,
            routes: [
              { name: 'Auth' },
              { 
                name: 'AccountVerification', 
                params: { 
                  email: email.trim(),
                  userId: data.user.id
                } 
              }
            ],
          })
          return
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGetStarted = () => {
    setShowLegalModal(true)
  }

  const handleLegalAgree = () => {
    setShowLegalModal(false)
    navigation.navigate('Onboarding')
  }

  const handleCloseLegalModal = () => {
    setShowLegalModal(false)
  }

  const handleSignInPress = () => {
    setIsSignIn(true)
  }

  const handleBack = () => {
    setIsSignIn(false)
    setEmail('')
    setPassword('')
  }

  const handleForgotPassword = () => {
    // Navigate to ForgotPassword screen with current email if available
    navigation.navigate('ForgotPassword', {
      email: email.trim() || undefined
    })
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Render both views but show/hide them - images stay mounted */}
      <View style={[styles.viewContainer, !isSignIn && styles.viewVisible]}>
        <View style={[styles.welcomeContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.logoContainer}>
            <Image 
              source={splashIconSource} 
              style={styles.welcomeLogoImage}
              resizeMode="contain"
              fadeDuration={0}
            />
            <Text style={[styles.welcomeTitle, { color: theme.text }]}>Welcome to Hubble!</Text>
            <Text style={[styles.welcomeSubtext, { color: theme.textSecondary }]}>
              The one stop app to improve your social life on campus :)
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.getStartedButton, { backgroundColor: theme.buttonPrimary }]} onPress={handleGetStarted}>
              <Text style={[styles.getStartedButtonText, { color: theme.buttonText }]}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signInLink} onPress={handleSignInPress}>
              <Text style={[styles.signInLinkText, { color: theme.primary }]}>Have an account? Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.viewContainer, isSignIn && styles.viewVisible]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.content, { paddingTop: insets.top }]}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <View style={[styles.logoContainer, styles.signInLogoContainer]}>
                <Image 
                  source={splashIconSource} 
                  style={styles.logoImage}
                  resizeMode="contain"
                  fadeDuration={0}
                />
                <Text style={[styles.logoText, { color: theme.text }]}>Hubble</Text>
                <Text style={[styles.logoSubtext, { color: theme.textSecondary }]}>Connect with fellow students</Text>
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
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Password</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.inputText }]}
                    placeholder="Enter your password"
                    placeholderTextColor={theme.inputPlaceholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.signInButton,
                    { backgroundColor: theme.buttonPrimary },
                    loading && { backgroundColor: theme.textTertiary }
                  ]}
                  onPress={handleSignIn}
                  disabled={loading}
                >
                  <Text style={[styles.signInButtonText, { color: theme.buttonText }]}>
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.forgotPasswordLink}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>
                    Log in with OTP
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <LegalAgreementModal
        visible={showLegalModal}
        onClose={handleCloseLegalModal}
        onAgree={handleLegalAgree}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  viewVisible: {
    opacity: 1,
    pointerEvents: 'auto',
    zIndex: 1,
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
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  signInLogoContainer: {
    marginBottom: 16,
  },
  logoImage: {
    width: 64,
    height: 64,
  },
  welcomeLogoImage: {
    width: 80,
    height: 80,
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
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 24,
    textAlign: 'center',
  },
  welcomeSubtext: {
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  getStartedButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  signInLink: {
    paddingVertical: 12,
  },
  signInLinkText: {
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  form: {
    marginTop: 20,
    width: '100%',
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
  signInButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  signInButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  forgotPasswordLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 16,
    fontWeight: '500',
  },
})
