import { supabase } from '../services/supabase'

export interface ImageValidationResult {
  isValid: boolean
  error?: string
  alternativeUrl?: string
}

/**
 * Validates if an image URL is accessible and returns a valid image
 */
export async function validateImageUrl(url: string): Promise<ImageValidationResult> {
  try {
    if (!url || typeof url !== 'string') {
      return { isValid: false, error: 'Invalid URL format' }
    }

    // Check if it's a Supabase storage URL
    if (url.includes('supabase.co/storage')) {
      // For Supabase URLs, skip expensive HEAD request and just validate URL format
      // Supabase storage URLs are typically reliable
      try {
        new URL(url)
        return { isValid: true }
      } catch {
        return { isValid: false, error: 'Invalid Supabase URL format' }
      }
    }

    // For non-Supabase URLs, do a quick HEAD request with timeout
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        return { 
          isValid: false, 
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }

      // Check if it's actually an image
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('image/')) {
        return { 
          isValid: false, 
          error: 'Not an image file'
        }
      }

      return { isValid: true }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { isValid: false, error: 'Request timeout' }
      }
      throw error
    }
  } catch (error) {
    console.error('Error validating image URL:', error)
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Generates a fallback URL for corrupted Supabase images
 */
function generateFallbackUrl(originalUrl: string): string | undefined {
  if (!originalUrl.includes('supabase.co/storage')) {
    return undefined
  }

  // Try to generate a thumbnail URL if the original fails
  // This assumes Supabase storage supports thumbnail generation
  try {
    const url = new URL(originalUrl)
    const pathParts = url.pathname.split('/')
    const fileName = pathParts[pathParts.length - 1]
    
    // Try with a smaller size parameter
    return `${url.origin}${url.pathname}?width=300&height=300&resize=cover`
  } catch {
    return undefined
  }
}

/**
 * Cleans up corrupted images from the database
 */
export async function cleanupCorruptedImages(eventId?: string): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    let query = supabase
      .from('event_photos')
      .select('id, image_url')
    
    if (eventId) {
      query = query.eq('event_id', eventId)
    }

    const { data: photos, error } = await query

    if (error) {
      console.error('Error fetching photos for cleanup:', error)
      return 0
    }

    if (!photos || photos.length === 0) return 0

    const corruptedIds: string[] = []

    // Validate each image URL
    for (const photo of photos) {
      const validation = await validateImageUrl(photo.image_url)
      if (!validation.isValid) {
        corruptedIds.push(photo.id)
        console.log(`Found corrupted image: ${photo.image_url}`)
      }
    }

    // Delete corrupted images from database
    if (corruptedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('event_photos')
        .delete()
        .in('id', corruptedIds)

      if (deleteError) {
        console.error('Error deleting corrupted images:', deleteError)
        return 0
      }

      console.log(`Cleaned up ${corruptedIds.length} corrupted images`)
    }

    return corruptedIds.length
  } catch (error) {
    console.error('Error in cleanupCorruptedImages:', error)
    return 0
  }
}

/**
 * Retries loading an image with exponential backoff
 */
export async function retryImageLoad(
  url: string, 
  maxRetries: number = 3, 
  baseDelay: number = 1000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const validation = await validateImageUrl(url)
      if (validation.isValid) {
        return true
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (error) {
      console.error(`Image load attempt ${attempt} failed:`, error)
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  return false
}
