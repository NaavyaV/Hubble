import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { useNavigation } from '@react-navigation/native'

export default function LegalDocumentsScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()

  const handleOpenDocument = (documentType: 'privacy' | 'terms' | 'guidelines') => {
    ;(navigation as any).navigate('LegalDocumentViewer', { documentType })
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.headerBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>
          Terms & Privacy
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.documentItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => handleOpenDocument('privacy')}
        >
          <View style={styles.documentItemLeft}>
            <Ionicons name="lock-closed" size={24} color={theme.primary} />
            <View style={styles.documentItemText}>
              <Text style={[styles.documentItemTitle, { color: theme.text }]}>
                Privacy Policy
              </Text>
              <Text style={[styles.documentItemDescription, { color: theme.textSecondary }]}>
                How we collect, use, and protect your data
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.documentItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => handleOpenDocument('terms')}
        >
          <View style={styles.documentItemLeft}>
            <Ionicons name="document-text" size={24} color={theme.primary} />
            <View style={styles.documentItemText}>
              <Text style={[styles.documentItemTitle, { color: theme.text }]}>
                Terms of Service
              </Text>
              <Text style={[styles.documentItemDescription, { color: theme.textSecondary }]}>
                Rules and guidelines for using Hubble
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.documentItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => handleOpenDocument('guidelines')}
        >
          <View style={styles.documentItemLeft}>
            <Ionicons name="people" size={24} color={theme.primary} />
            <View style={styles.documentItemText}>
              <Text style={[styles.documentItemTitle, { color: theme.text }]}>
                Community Guidelines
              </Text>
              <Text style={[styles.documentItemDescription, { color: theme.textSecondary }]}>
                Expected behavior and community standards
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  documentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  documentItemText: {
    marginLeft: 12,
    flex: 1,
  },
  documentItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentItemDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
})

