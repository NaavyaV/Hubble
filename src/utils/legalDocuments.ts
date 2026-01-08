import { privacyPolicyContent } from '../assets/legal/privacy_policy'
import { termsOfServiceContent } from '../assets/legal/terms_of_service'
import { communityGuidelinesContent } from '../assets/legal/community_guidelines'

type DocumentType = 'privacy' | 'terms' | 'guidelines'

export const documentTitles: Record<DocumentType, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  guidelines: 'Community Guidelines',
}

const documentContent: Record<DocumentType, string> = {
  privacy: privacyPolicyContent,
  terms: termsOfServiceContent,
  guidelines: communityGuidelinesContent,
}

export async function loadLegalDocument(type: DocumentType): Promise<string> {
  // Return the content directly - it's already loaded as a module
  return documentContent[type]
}

