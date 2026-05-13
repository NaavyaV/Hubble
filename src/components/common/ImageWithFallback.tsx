import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ImageStyle, ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { validateImageUrl, retryImageLoad } from '../../utils/imageUtils'
import { resolveCachedImageUri, trackRenderedImageSourceMode } from '../../utils/imageCache'

// Simple in-memory cache for loaded images
const imageCache = new Set<string>()
// Avoid repeatedly hammering URLs that just failed.
const failedImageCache = new Map<string, number>()
const FAILED_IMAGE_COOLDOWN_MS = 5 * 60 * 1000

interface ImageWithFallbackProps {
  source: { uri: string }
  cacheKey?: string
  style?: ImageStyle
  containerStyle?: ViewStyle
  fallbackIcon?: keyof typeof Ionicons.glyphMap
  fallbackText?: string
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'
  onError?: (error: any) => void
  onLoad?: () => void
  maxRetries?: number
  skipValidation?: boolean
  priority?: 'high' | 'normal' | 'low'
}

export default function ImageWithFallback({
  source,
  cacheKey,
  style,
  containerStyle,
  fallbackIcon = 'image-outline',
  fallbackText = 'Image failed to load',
  resizeMode = 'cover',
  onError,
  onLoad,
  maxRetries = 3,
  skipValidation = false,
  priority = 'normal'
}: ImageWithFallbackProps) {
  const { theme } = useTheme()
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [imageSource, setImageSource] = useState(source)
  const [resolvedUri, setResolvedUri] = useState(source.uri)

  // OPTIMIZED: Skip validation for better performance - let Image component handle errors
  useEffect(() => {
    if (!source.uri) {
      setHasError(true)
      setIsLoading(false)
      return
    }
    setResolvedUri(source.uri)

    const failedAt = failedImageCache.get(source.uri)
    if (failedAt && Date.now() - failedAt < FAILED_IMAGE_COOLDOWN_MS) {
      setHasError(true)
      setIsLoading(false)
      return
    }
    if (failedAt && Date.now() - failedAt >= FAILED_IMAGE_COOLDOWN_MS) {
      failedImageCache.delete(source.uri)
    }

    // If image is already cached, skip validation
    if (imageCache.has(source.uri)) {
      setIsLoading(false)
      return
    }

    // OPTIMIZED: Skip validation for all URLs - validation is expensive and blocks rendering
    // Let the Image component's onError handler deal with broken images
    // This significantly improves initial load time
    if (skipValidation || source.uri.includes('supabase.co/storage') || priority === 'low') {
      setIsLoading(false)
      return
    }

    // Only validate high-priority images asynchronously (non-blocking)
    if (priority === 'high' && !skipValidation) {
      validateImageUrl(source.uri).catch(() => {
        // Silently fail - Image component will handle the error
      })
    }
    
    setIsLoading(false)
  }, [source.uri, skipValidation, priority])

  useEffect(() => {
    let cancelled = false
    if (!source.uri) return
    resolveCachedImageUri(source.uri, cacheKey)
      .then((uri) => {
        if (!cancelled && uri) {
          setResolvedUri(uri)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedUri(source.uri)
        }
      })
    return () => {
      cancelled = true
    }
  }, [source.uri, cacheKey])

  const handleError = async (error: any) => {
    if (__DEV__) {
      console.warn('ImageWithFallback - Image load error:', error)
    }
    
    // Retry only for high-priority images to reduce repeated network requests.
    if (priority === 'high' && maxRetries > 0) {
      const success = await retryImageLoad(imageSource.uri, maxRetries)
      if (success) {
        // Force re-render with the same URL
        setImageSource({ ...imageSource })
        return
      }
    }
    
    failedImageCache.set(imageSource.uri, Date.now())
    setHasError(true)
    setIsLoading(false)
    onError?.(error)
  }

  const handleLoad = (event: any) => {
    setIsLoading(false)
    setHasError(false)
    // Cache the successfully loaded image
    imageCache.add(source.uri)
    failedImageCache.delete(source.uri)
    const cacheType = event?.cacheType as string | undefined
    if (cacheType === 'disk') {
      trackRenderedImageSourceMode('expo-disk-cache')
    } else if (cacheType === 'memory') {
      trackRenderedImageSourceMode('memory-cache')
    } else if ((resolvedUri || imageSource.uri || '').startsWith('file://')) {
      trackRenderedImageSourceMode('local-file')
    } else {
      trackRenderedImageSourceMode('network')
    }
    onLoad?.()
  }

  if (hasError) {
    return (
      <View style={[styles.fallbackContainer, style, containerStyle]}>
        <Ionicons 
          name={fallbackIcon} 
          size={32} 
          color={theme.textSecondary} 
        />
        <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
          {fallbackText}
        </Text>
      </View>
    )
  }

  const uri = resolvedUri || imageSource.uri
  const contentFit = resizeMode === 'contain' ? 'contain' : resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : 'cover'

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={0}
        onError={handleError}
        onLoad={handleLoad}
      />
      {isLoading && (
        <View style={[styles.loadingOverlay, style]}>
          <Ionicons 
            name="hourglass-outline" 
            size={24} 
            color={theme.textSecondary} 
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  fallbackText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
})
