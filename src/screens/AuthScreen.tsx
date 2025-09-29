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

export default function AuthScreen({ navigation }: any) {
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignIn, setIsSignIn] = useState(false)

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })

      if (error) throw error
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGetStarted = () => {
    navigation.navigate('Onboarding')
  }

  const handleSignInPress = () => {
    setIsSignIn(true)
  }

  const handleBack = () => {
    setIsSignIn(false)
    setEmail('')
    setPassword('')
  }

  if (isSignIn) {
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
                <Ionicons name="calendar" size={64} color={theme.primary} />
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
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.welcomeContainer}>
        <View style={styles.logoContainer}>
          <Ionicons name="calendar" size={80} color={theme.primary} />
          <Text style={[styles.welcomeTitle, { color: theme.text }]}>Welcome to Hubble</Text>
          <Text style={[styles.welcomeSubtext, { color: theme.textSecondary }]}>
            Connect with fellow students, discover events, and make lasting friendships on campus.
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
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
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
    paddingTop: 20,
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
})
