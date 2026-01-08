/**
 * Input validation constants
 * These limits help prevent DoS attacks and ensure data consistency
 */

// Text field limits
export const MAX_FULL_NAME_LENGTH = 100
export const MAX_USERNAME_LENGTH = 50
export const MAX_BIO_LENGTH = 500
export const MAX_MAJOR_LENGTH = 100
export const MAX_EVENT_TITLE_LENGTH = 200
export const MAX_EVENT_DESCRIPTION_LENGTH = 2000
export const MAX_LOCATION_LENGTH = 200
export const MAX_ORG_NAME_LENGTH = 100
export const MAX_ORG_DESCRIPTION_LENGTH = 1000
export const MAX_PHONE_NUMBER_LENGTH = 20
export const MAX_CAPTION_LENGTH = 500

// File upload limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const ALLOWED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
] as const

// Request timeout (30 seconds)
export const REQUEST_TIMEOUT_MS = 30000

