import { supabase } from '../services/supabase'

export type PhoneVisibility = 'public' | 'friends_only' | 'private'

export interface PhoneVisibilitySettings {
  phone_visibility: PhoneVisibility
  phone_visible_when_hosting: boolean
}

/**
 * Determines if a phone number should be visible based on privacy settings and context
 */
export const shouldShowPhoneNumber = async (
  profileUserId: string,
  currentUserId: string,
  isHostingEvent: boolean = false
): Promise<boolean> => {
  try {
    // If it's the same user, always show their own phone number
    if (profileUserId === currentUserId) {
      return true
    }

    // Get the profile's phone visibility settings
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('phone_visibility, phone_visible_when_hosting')
      .eq('id', profileUserId)
      .single()

    if (error || !profile) {
      console.error('Error fetching phone visibility settings:', error)
      return false
    }

    const { phone_visibility, phone_visible_when_hosting } = profile

    // Handle different visibility levels
    switch (phone_visibility) {
      case 'public':
        return true
      
      case 'friends_only':
        // Show to friends, or when hosting if hosting visibility is enabled
        const areFriends = await areUsersFriends(currentUserId, profileUserId)
        return areFriends || (isHostingEvent && phone_visible_when_hosting)
      
      case 'private':
        // Only show if they're hosting an event and have hosting visibility enabled
        return isHostingEvent && phone_visible_when_hosting
      
      default:
        return false
    }
  } catch (error) {
    console.error('Error determining phone visibility:', error)
    return false
  }
}

/**
 * Checks if two users are friends
 */
const areUsersFriends = async (userId1: string, userId2: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .or(`and(user_id.eq.${userId1},friend_id.eq.${userId2}),and(user_id.eq.${userId2},friend_id.eq.${userId1})`)
      .eq('status', 'accepted')
      .limit(1)

    if (error) {
      console.error('Error checking friendship:', error)
      return false
    }

    return data && data.length > 0
  } catch (error) {
    console.error('Error checking friendship:', error)
    return false
  }
}

/**
 * Gets the phone visibility settings for a user
 */
export const getPhoneVisibilitySettings = async (userId: string): Promise<PhoneVisibilitySettings | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('phone_visibility, phone_visible_when_hosting')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching phone visibility settings:', error)
      return null
    }

    return {
      phone_visibility: data.phone_visibility || 'private',
      phone_visible_when_hosting: data.phone_visible_when_hosting || false
    }
  } catch (error) {
    console.error('Error fetching phone visibility settings:', error)
    return null
  }
}
