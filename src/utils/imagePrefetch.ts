import { Image } from 'expo-image'

/**
 * Warm disk/memory cache for remote images (expo-image uses memory-disk by default).
 * Caps batch size to avoid spiking memory or network on large lists.
 */
export async function prefetchImageUris(uris: (string | null | undefined)[], max = 40): Promise<void> {
  const unique = [...new Set(uris.filter((u): u is string => Boolean(u && u.length > 0)))]
  const batch = unique.slice(0, max)
  await Promise.all(batch.map(uri => Image.prefetch(uri).catch(() => undefined)))
}
