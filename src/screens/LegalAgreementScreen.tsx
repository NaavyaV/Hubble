import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { loadLegalDocument, documentTitles } from '../utils/legalDocuments'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

type DocumentType = 'privacy' | 'terms' | 'guidelines' | null

interface LegalAgreementModalProps {
  visible: boolean
  onClose: () => void
  onAgree: () => void
}

export default function LegalAgreementModal({ 
  visible, 
  onClose, 
  onAgree,
}: LegalAgreementModalProps) {
  const { theme } = useTheme()
  const [agreed, setAgreed] = useState(false)
  const [viewingDocument, setViewingDocument] = useState<DocumentType>(null)
  const [documentContent, setDocumentContent] = useState<string>('')
  const [loadingDocument, setLoadingDocument] = useState(false)

  const handleContinue = () => {
    if (!agreed) {
      return
    }
    setAgreed(false)
    setViewingDocument(null)
    setDocumentContent('')
    onAgree()
  }

  const handleClose = () => {
    setAgreed(false)
    setViewingDocument(null)
    setDocumentContent('')
    onClose()
  }

  const handleOpenDocument = async (docType: 'privacy' | 'terms' | 'guidelines') => {
    setViewingDocument(docType)
    setLoadingDocument(true)
    try {
      const content = await loadLegalDocument(docType)
      setDocumentContent(content)
    } catch (error) {
      console.error('Error loading document:', error)
      setDocumentContent(`Error loading ${documentTitles[docType]}. Please try again.`)
    } finally {
      setLoadingDocument(false)
    }
  }

  const handleBackToAgreement = () => {
    setViewingDocument(null)
    setDocumentContent('')
  }

  useEffect(() => {
    if (!visible) {
      setAgreed(false)
      setViewingDocument(null)
      setDocumentContent('')
    }
  }, [visible])

  const styles = createStyles(theme)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
            {viewingDocument ? (
              <>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handleBackToAgreement}
                >
                  <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  {documentTitles[viewingDocument]}
                </Text>
                <View style={styles.headerSpacer} />
              </>
            ) : (
              <>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Legal Agreement</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleClose}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </>
            )}
          </View>

          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
          >
            {viewingDocument ? (
              loadingDocument ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                    Loading document...
                  </Text>
                </View>
              ) : (
                <Text style={[styles.documentText, { color: theme.text }]}>
                  {documentContent}
                </Text>
              )
            ) : (
              <>
                <View style={styles.logoContainer}>
                  <Ionicons name="document-text" size={48} color={theme.primary} />
                  <Text style={[styles.title, { color: theme.text }]}>Welcome to Hubble</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Please review and agree to our legal documents to continue
                  </Text>
                </View>

                <View style={[styles.agreementBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.agreementText, { color: theme.text }]}>
                    By continuing, I agree to the{' '}
                    <Text 
                      style={[styles.link, { color: theme.primary }]}
                      onPress={() => handleOpenDocument('privacy')}
                    >
                      Privacy Policy
                    </Text>
                    {', '}
                    <Text 
                      style={[styles.link, { color: theme.primary }]}
                      onPress={() => handleOpenDocument('terms')}
                    >
                      Terms of Service
                    </Text>
                    {', and '}
                    <Text 
                      style={[styles.link, { color: theme.primary }]}
                      onPress={() => handleOpenDocument('guidelines')}
                    >
                      Community Guidelines
                    </Text>
                    {', and confirm I am at least 17 years old.'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.checkboxContainer,
                    { backgroundColor: theme.surface, borderColor: theme.border }
                  ]}
                  onPress={() => setAgreed(!agreed)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.checkbox,
                    { borderColor: theme.border },
                    agreed && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}>
                    {agreed && (
                      <Ionicons name="checkmark" size={20} color="white" />
                    )}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                    I agree to the terms and confirm I am at least 17 years old
                  </Text>
                </TouchableOpacity>

                <View style={styles.ageNote}>
                  <Ionicons name="information-circle" size={16} color={theme.textSecondary} />
                  <Text style={[styles.ageNoteText, { color: theme.textSecondary }]}>
                    You must be 17 years or older to use Hubble
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          {!viewingDocument && (
            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  { backgroundColor: theme.buttonPrimary },
                  !agreed && { backgroundColor: theme.textTertiary, opacity: 0.5 }
                ]}
                onPress={handleContinue}
                disabled={!agreed}
              >
                <Text style={[styles.continueButtonText, { color: theme.buttonText }]}>
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    height: Math.min(SCREEN_HEIGHT * 0.85, 600),
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    minHeight: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerSpacer: {
    width: 40,
  },
  closeButton: {
    padding: 8,
    marginRight: -8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  agreementBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  agreementText: {
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  ageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  ageNoteText: {
    fontSize: 13,
    marginLeft: 8,
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  continueButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  documentText: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'left',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
})
