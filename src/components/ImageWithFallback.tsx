import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Image, ImageStyle, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { validateImageUrl, retryImageLoad } from '../utils/imageUtils'

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
  maxRetries = 3
}: ImageWithFallbackProps) {
  const { theme } = useTheme()
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [imageSource, setImageSource] = useState(source)

  // Validate image URL on mount
  useEffect(() => {
    const validateImage = async () => {
      if (!source.uri) {
        setHasError(true)
        setIsLoading(false)
        return
      }

      try {
        const validation = await validateImageUrl(source.uri)
        if (!validation.isValid) {
          console.warn('ImageWithFallback - Invalid image URL:', source.uri, validation.error)
          if (validation.alternativeUrl) {
            setImageSource({ uri: validation.alternativeUrl })
          } else {
            setHasError(true)
            setIsLoading(false)
          }
        }
      } catch (error) {
        console.warn('ImageWithFallback - Error validating URL:', error)
      }
    }

    validateImage()
  }, [source.uri])

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

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={imageSource}
        style={style}
        resizeMode={resizeMode}
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
