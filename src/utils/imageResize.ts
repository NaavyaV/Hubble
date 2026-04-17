import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

export type ImagePurpose = 'avatar' | 'cover' | 'gallery'

const MAX_DIMENSIONS: Record<ImagePurpose, number> = {
  avatar: 400,
  cover: 1200,
  gallery: 1600,
}

const JPEG_QUALITY: Record<ImagePurpose, number> = {
  avatar: 0.8,
  cover: 0.8,
  gallery: 0.82,
}

/**
 * Resize and compress an image before upload.
 * Returns the URI of the compressed file (a new tmp file on disk).
 */
export async function resizeForUpload(
  uri: string,
  purpose: ImagePurpose,
): Promise<string> {
  const maxDim = MAX_DIMENSIONS[purpose]
  const quality = JPEG_QUALITY[purpose]

  const result = await manipulateAsync(
    uri,
    [{ resize: { width: maxDim, height: maxDim } }],
    { compress: quality, format: SaveFormat.JPEG },
  )

  return result.uri
}
