import * as FileSystem from 'expo-file-system/legacy'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import { supabase } from '../services/supabase'
import { getCachedUser } from '../services/sessionService'
import { MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS } from '../constants/validation'
import { resizeForUpload, type ImagePurpose } from './imageResize'

/** Compressed uploads are always JPEG from expo-image-manipulator; normalize path for RLS/extension checks. */
function asJpegStoragePath(filePath: string): string {
  const i = filePath.lastIndexOf('/')
  const dir = i >= 0 ? filePath.slice(0, i + 1) : ''
  const file = i >= 0 ? filePath.slice(i + 1) : filePath
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  return `${dir}${stem}.jpg`
}

export async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
  const buffer = decodeBase64(base64)
  return new Uint8Array(buffer)
}

export function guessContentTypeFromUri(uri: string): string {
  const ext = (uri.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'heic':
    case 'heif':
      return 'image/heic'
    default:
      return 'application/octet-stream'
  }
}

export async function uploadBytesToBucket(params: {
  bucket: string
  filePath: string
  uri: string
  contentType?: string
  /**
   * Resize/compress purpose. Defaults to gallery (1600px max edge) when omitted.
   * Use avatar (400) or cover (1200) where appropriate to save bandwidth.
   */
  purpose?: ImagePurpose
}): Promise<string> {
  const { bucket, filePath: rawPath, uri: rawUri, purpose = 'gallery' } = params
  const filePath = asJpegStoragePath(rawPath)

  try {
    const uri = await resizeForUpload(rawUri, purpose)

    if (__DEV__) {
    console.log(`[upload] Starting upload to ${bucket}/${filePath}`)
    }
    
    // Security: Validate file size before reading
    const fileInfo = await FileSystem.getInfoAsync(uri)
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > MAX_IMAGE_SIZE) {
      throw new Error(`File size exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`)
    }
    
    const bytes = await readFileAsBytes(uri)
    
    // Security: Validate file size after reading
    if (bytes.length > MAX_IMAGE_SIZE) {
      throw new Error(`File size exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`)
    }
    
    if (__DEV__) {
    console.log(`[upload] File read successfully, size: ${bytes.length} bytes`)
    }
    
    const type = 'image/jpeg'
    
    // Security: Validate MIME type
    if (!ALLOWED_IMAGE_TYPES.includes(type as any)) {
      throw new Error(`Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`)
    }
    
    // Security: Validate file extension
    const fileExt = (filePath.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(fileExt as any)) {
      throw new Error(`Invalid file extension. Allowed extensions: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`)
    }
    
    if (__DEV__) {
    console.log(`[upload] Content type: ${type}`)
    }

    const user = await getCachedUser()
    if (!user) {
      throw new Error('User must be authenticated to upload files')
    }
    
    if (__DEV__) {
      console.log(`[upload] User authenticated`)
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, {
        contentType: type,
        // Keep immutable image assets cached at the edge for repeat views.
        cacheControl: '31536000, immutable',
        upsert: false,
      })

    if (uploadError) {
      if (__DEV__) {
      console.error(`[upload] Upload failed:`, {
        message: uploadError.message,
        error: uploadError
      })
      }
      throw uploadError
    }

    if (__DEV__) {
      console.log(`[upload] Upload successful`)
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
    
    if (!publicUrl) {
      throw new Error('Failed to generate public URL after upload')
    }
    
    return publicUrl
  } catch (error: any) {
    if (__DEV__) {
    console.error('[upload] Upload error:', {
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
    })
    }
    throw error
  }
}
