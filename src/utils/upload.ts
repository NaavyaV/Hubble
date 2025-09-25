import * as FileSystem from 'expo-file-system/legacy'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import { supabase } from '../services/supabase'

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
}): Promise<string> {
  const { bucket, filePath, uri, contentType } = params
  const bytes = await readFileAsBytes(uri)
  const type = contentType || guessContentTypeFromUri(uri)

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, {
        contentType: type,
        upsert: false,
      })

    if (error) {
      throw error
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
    return publicUrl
  } catch (error) {
    console.error('Upload error:', error)
    throw error
  }
}
