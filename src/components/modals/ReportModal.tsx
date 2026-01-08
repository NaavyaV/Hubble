import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native'
import Modal from 'react-native-modal'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'

export type ReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'fake_account' | 'other'

interface ReportModalProps {
  isVisible: boolean
  onClose: () => void
  onSubmit: (reason: ReportReason, comments?: string) => void
  contentType: 'user' | 'organization' | 'event' | 'event_photo' | 'profile_picture'
}

const getReportReasons = (contentType: ReportModalProps['contentType']): { value: ReportReason; label: string }[] => {
  const baseReasons = [
    { value: 'spam' as ReportReason, label: 'Spam' },
    { value: 'harassment' as ReportReason, label: 'Harassment' },
    { value: 'inappropriate_content' as ReportReason, label: 'Inappropriate Content' },
  ]
  
  // Add fake_account only for users and organizations
  if (contentType === 'user' || contentType === 'organization') {
    return [
      ...baseReasons,
      { value: 'fake_account' as ReportReason, label: 'Fake Account' },
      { value: 'other' as ReportReason, label: 'Other' },
    ]
  }
  
  // For events and photos, exclude fake_account
  return [
    ...baseReasons,
    { value: 'other' as ReportReason, label: 'Other' },
  ]
}

export default function ReportModal({ isVisible, onClose, onSubmit, contentType }: ReportModalProps) {
  const { theme } = useTheme()
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [comments, setComments] = useState('')
  const reportReasons = getReportReasons(contentType)

  const handleSubmit = () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for reporting')
      return
    }

    // Don't close modal yet - wait for confirmation
    Alert.alert(
      'Submit Report',
      'Are you sure you want to submit this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: () => {
            onSubmit(selectedReason, comments.trim() || undefined)
            setSelectedReason(null)
            setComments('')
            onClose()
          }
        }
      ]
    )
  }

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'user':
        return 'this user'
      case 'organization':
        return 'this organization'
      case 'event':
        return 'this event'
      case 'event_photo':
        return 'this photo'
      case 'profile_picture':
        return 'this profile picture'
      default:
        return 'this content'
    }
  }

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modal}
      animationIn="fadeIn"
      animationOut="fadeOut"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]}>What are you reporting?</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Please select a reason for reporting {getContentTypeLabel()}
            </Text>

            <View style={styles.reasonsContainer}>
              {reportReasons.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={[
                    styles.reasonButton,
                    {
                      backgroundColor: selectedReason === reason.value ? theme.primary + '20' : theme.surface,
                      borderColor: selectedReason === reason.value ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedReason(reason.value)}
                >
                  <View style={styles.reasonContent}>
                    <View
                      style={[
                        styles.radioButton,
                        {
                          borderColor: selectedReason === reason.value ? theme.primary : theme.border,
                          backgroundColor: selectedReason === reason.value ? theme.primary : 'transparent',
                        },
                      ]}
                    >
                      {selectedReason === reason.value && (
                        <View style={[styles.radioButtonInner, { backgroundColor: theme.buttonText }]} />
                      )}
                    </View>
                    <Text style={[styles.reasonLabel, { color: theme.text }]}>{reason.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.commentsContainer}>
              <Text style={[styles.commentsLabel, { color: theme.text }]}>Additional Comments (Optional)</Text>
              <TextInput
                style={[
                  styles.commentsInput,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Provide any additional details..."
                placeholderTextColor={theme.textTertiary}
                value={comments}
                onChangeText={setComments}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.error }]}
              onPress={handleSubmit}
            >
              <Text style={[styles.submitButtonText, { color: theme.buttonText }]}>Submit Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
  },
  keyboardAvoidingView: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  content: {
    padding: 16,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  reasonsContainer: {
    gap: 6,
    marginBottom: 12,
  },
  reasonButton: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  reasonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reasonLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  commentsContainer: {
    marginTop: 4,
  },
  commentsLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  commentsInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    height: 100,
  },
  footer: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
})

