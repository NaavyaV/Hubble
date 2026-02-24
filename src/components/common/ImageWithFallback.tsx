import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ImageStyle, ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { validateImageUrl, retryImageLoad } from '../../utils/imageUtils'

// Simple in-memory cache for loaded images
const imageCache = new Set<string>()

interface ImageWithFallbackProps {
  source: { uri: string }
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

  // OPTIMIZED: Skip validation for better performance - let Image component handle errors
  useEffect(() => {
    if (!source.uri) {
      setHasError(true)
      setIsLoading(false)
      return
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

  const handleError = async (error: any) => {
    console.warn('ImageWithFallback - Image load error:', error)
    
    // Try to retry loading the image
    if (maxRetries > 0) {
      const success = await retryImageLoad(imageSource.uri, maxRetries)
      if (success) {
        // Force re-render with the same URL
        setImageSource({ ...imageSource })
        return
      }
    }
    
    setHasError(true)
    setIsLoading(false)
    onError?.(error)
  }

  const handleLoad = () => {
    setIsLoading(false)
    setHasError(false)
    // Cache the successfully loaded image
    imageCache.add(source.uri)
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

  const uri = imageSource.uri
  const contentFit = resizeMode === 'contain' ? 'contain' : resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : 'cover'

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="disk"
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
