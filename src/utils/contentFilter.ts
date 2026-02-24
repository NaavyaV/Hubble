// React Native-compatible content filter
// Uses a word list approach instead of Node.js-specific libraries

// Common profanity and offensive words list
// Comprehensive list for content filtering (React Native compatible)
const PROFANITY_WORDS = [
  // Common profanity
  'damn', 'hell', 'shit', 'fuck', 'bitch', 'ass', 'asshole',
  'piss', 'crap', 'bastard', 'bullshit', 'dick', 'pussy', 'cunt',
  'whore', 'slut', 'faggot', 'nigger', 'nigga', 'kike', 'spic',
  'chink', 'gook', 'wetback', 'turd', 'cock', 'tits', 'boobs',
  'shithead', 'motherfucker', 'fucking', 'fucked', 'fucker',
  'shitting', 'pissed', 'crapped', 'dammit', 'goddamn', 'goddam',
  'bitchy', 'bitches', 'shits', 'fucks', 'asses', 'assholes',
  // Variations and common misspellings
  'fuk', 'shyt', 'sh1t', 'f*ck', 'sh*t', 'a$$', 'b1tch',
  'n*gga', 'n*gger', 'f*ggot', 'd*ck', 'p*ssy', 'c*nt',
  // Additional offensive terms
  'retard', 'retarded', 'fag', 'dyke', 'tranny',
  'jap', 'chink', 'gook', 'wetback', 'beaner', 'spic',
  'kike', 'yid', 'heeb', 'towelhead', 'sandnigger', 'raghead'
]

// Normalize text for comparison (minimal normalization to avoid false positives)
function normalizeText(text: string): string {
  // Convert to lowercase
  let normalized = text.toLowerCase()
  
  // Only replace obvious obfuscation characters (not all special chars)
  // This is more conservative to avoid false positives
  normalized = normalized.replace(/0/g, 'o')
  normalized = normalized.replace(/1/g, 'i')
  normalized = normalized.replace(/3/g, 'e')
  normalized = normalized.replace(/4/g, 'a')
  normalized = normalized.replace(/5/g, 's')
  normalized = normalized.replace(/7/g, 't')
  
  // Keep spaces and basic punctuation - don't remove everything
  // This prevents words like "private" from being incorrectly matched
  normalized = normalized.replace(/[*]/g, '')
  
  return normalized
}

// Strip leading/trailing punctuation so we only check the actual word
// e.g. "Billiards," -> "billiards", "anything." -> "anything"
function getCoreWord(token: string): string {
  return token.replace(/^\W+|\W+$/g, '').toLowerCase()
}

// Check if text contains any profanity (whole words only, never substrings)
function containsProfanity(text: string): boolean {
  const normalized = normalizeText(text)
  const profanitySet = new Set(
    PROFANITY_WORDS.map((p) => getCoreWord(normalizeText(p))).filter(
      (core) => core.length >= 2
    )
  )

  const words = normalized.split(/\s+/)

  for (const word of words) {
    const coreWord = getCoreWord(word)
    if (!coreWord) continue

    // Only match when the entire word equals a profanity word (case-insensitive).
    // This ensures "ass" matches only "ass", not "Billiards", "class", "pass", "approachable", etc.
    if (profanitySet.has(coreWord)) {
      return true
    }
  }

  return false
}

export interface ContentFilterResult {
  isValid: boolean
  isProfane: boolean
  filteredText?: string
  errorMessage?: string
}

/**
 * Validates content for objectionable language
 * @param text - The text to validate
 * @param options - Optional configuration
 * @returns ContentFilterResult with validation status
 */
export function validateContent(
  text: string,
  options: {
    allowPartialWords?: boolean // If false, blocks partial word matches (default: true)
    replacePlaceholder?: string // Character to replace profanity with (default: '*')
  } = {}
): ContentFilterResult {
  if (!text || text.trim().length === 0) {
    return {
      isValid: true,
      isProfane: false,
      filteredText: text
    }
  }

  const { allowPartialWords = true, replacePlaceholder = '*' } = options

  try {
    // Check if text contains profanity
    const isProfane = containsProfanity(text)
    
    if (isProfane) {
      return {
        isValid: false,
        isProfane: true,
        filteredText: text, // Don't modify, just reject
        errorMessage: 'Your content contains inappropriate language. Please revise.'
      }
    }

    return {
      isValid: true,
      isProfane: false,
      filteredText: text
    }
  } catch (error) {
    // If filter fails, err on the side of caution
    console.error('Content filter error:', error)
    return {
      isValid: true, // Allow content if filter fails to avoid blocking legitimate content
      isProfane: false,
      filteredText: text
    }
  }
}

/**
 * Validates content and shows an alert if invalid
 * @param text - The text to validate
 * @param onInvalid - Callback when content is invalid
 * @returns boolean - true if valid, false if invalid
 */
export function validateContentWithAlert(
  text: string,
  onInvalid?: (message: string) => void
): boolean {
  const result = validateContent(text)
  
  if (!result.isValid && result.errorMessage) {
    if (onInvalid) {
      onInvalid(result.errorMessage)
    }
    return false
  }
  
  return true
}

/**
 * Hook-friendly validation that can be used in onChangeText
 * Returns a function that validates and optionally prevents invalid input
 */
export function createContentValidator(
  onInvalid?: (message: string) => void
) {
  return (text: string): string | null => {
    const result = validateContent(text)
    
    if (!result.isValid && result.errorMessage) {
      if (onInvalid) {
        onInvalid(result.errorMessage)
      }
      // Return null to prevent the update, or return filtered text
      return null
    }
    
    return text
  }
}
