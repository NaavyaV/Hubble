import { supabase } from '../services/supabase'

/**
 * Extracts the file path from a Supabase storage URL
 * Example: https://xxx.supabase.co/storage/v1/object/public/event-images/events/path/to/file.jpg
 * Returns: events/path/to/file.jpg
 */
function extractFilePathFromUrl(url: string): string | null {
  try {
    // Match pattern: .../storage/v1/object/public/[bucket]/[path]
    // For event-images bucket with events/ subfolder, we want to extract everything after the bucket name
    const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/)
    if (match && match[1]) {
      return match[1]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Deletes an image from Supabase storage
 */
async function deleteImageFromStorage(imageUrl: string | null | undefined, bucket: string = 'photos'): Promise<void> {
  if (!imageUrl) return

  try {
    const filePath = extractFilePathFromUrl(imageUrl)
    if (!filePath) {
      console.warn('Could not extract file path from URL:', imageUrl)
      return
    }

    if (__DEV__) {
      console.log(`[deleteImageFromStorage] Deleting from bucket: ${bucket}, path: ${filePath}`)
    }

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath])

    if (error) {
      console.error(`[deleteImageFromStorage] Error deleting image from storage (bucket: ${bucket}, path: ${filePath}):`, error)
      // Don't throw - continue with other deletions
    } else {
      if (__DEV__) {
        console.log(`[deleteImageFromStorage] Successfully deleted image from ${bucket}/${filePath}`)
      }
    }
  } catch (error) {
    console.error(`[deleteImageFromStorage] Exception deleting image from storage (bucket: ${bucket}):`, error)
    // Don't throw - continue with other deletions
  }
}

/**
 * Completely deletes a regular event and ALL associated data
 * This includes:
 * - event_attendees
 * - event_invitations
 * - event_photos (and their photo_privacy_permissions)
 * - notification_queue entries
 * - notification_log entries
 * - Event image from storage
 * - All photo images from storage
 * - The event itself
 */
export async function deleteEventCompletely(eventId: string): Promise<void> {
  try {
    // Step 1: Get the event to access its image_url
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, image_url')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      throw new Error(`Event not found: ${eventId}`)
    }

    // Step 2: Get all event photos to delete their images and permissions
    const { data: photos, error: photosError } = await supabase
      .from('event_photos')
      .select('id, image_url, thumbnail_url')
      .eq('event_id', eventId)

    if (photosError) {
      console.error('Error fetching event photos:', photosError)
    }

    // Step 3: Delete photo privacy permissions for all photos
    if (photos && photos.length > 0) {
      const photoIds = photos.map(p => p.id)
      const { error: permissionsError } = await supabase
        .from('photo_privacy_permissions')
        .delete()
        .in('photo_id', photoIds)

      if (permissionsError) {
        console.error('Error deleting photo privacy permissions:', permissionsError)
      }

      // Step 4: Delete all photo images from storage
      for (const photo of photos) {
        await deleteImageFromStorage(photo.image_url)
        if (photo.thumbnail_url) {
          await deleteImageFromStorage(photo.thumbnail_url)
        }
      }
    }

    // Step 5: Delete all related database records (in order to respect foreign keys)
    // Delete photo privacy permissions (already done above, but keeping for clarity)
    // Delete event photos
    if (photos && photos.length > 0) {
      const { error: deletePhotosError } = await supabase
        .from('event_photos')
        .delete()
        .eq('event_id', eventId)

      if (deletePhotosError) {
        console.error('Error deleting event photos:', deletePhotosError)
      }
    }

    // Delete notification queue entries (only unprocessed ones, as processed ones should already be sent)
    // Note: We only delete unprocessed entries to avoid deleting notifications that are being processed
    const { error: queueError } = await supabase
      .from('notification_queue')
      .delete()
      .eq('event_id', eventId)
      .eq('processed', false) // Only delete unprocessed entries

    if (queueError) {
      console.error('Error deleting notification queue entries:', queueError)
    }

    // Delete notification log entries
    const { error: logError } = await supabase
      .from('notification_log')
      .delete()
      .eq('event_id', eventId)

    if (logError) {
      console.error('Error deleting notification log entries:', logError)
    }

    // Delete event invitations
    const { error: invitationsError } = await supabase
      .from('event_invitations')
      .delete()
      .eq('event_id', eventId)

    if (invitationsError) {
      console.error('Error deleting event invitations:', invitationsError)
    }

    // Delete event attendees
    const { error: attendeesError } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)

    if (attendeesError) {
      console.error('Error deleting event attendees:', attendeesError)
    }

    // Step 6: Delete event image from storage (event-images bucket, events/ path)
    if (event.image_url) {
      await deleteImageFromStorage(event.image_url, 'event-images')
    }

    // Step 7: Delete the event itself
    const { error: deleteEventError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteEventError) {
      throw deleteEventError
    }

    if (__DEV__) {
      console.log(`Successfully deleted event ${eventId} and all associated data`)
    }
  } catch (error) {
    console.error('Error in deleteEventCompletely:', error)
    throw error
  }
}

/**
 * Completely deletes an org event and ALL associated data
 * This includes:
 * - org_event_attendees
 * - notification_queue entries (if any reference this org event)
 * - notification_log entries (if any reference this org event via data.orgEventId)
 * - Event image from storage
 * - The org_event itself
 */
export async function deleteOrgEventCompletely(eventId: string): Promise<void> {
  try {
    // Step 1: Get the org event to access its image_url
    const { data: event, error: eventError } = await supabase
      .from('org_events')
      .select('id, image_url')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      throw new Error(`Org event not found: ${eventId}`)
    }

    // Step 2: Delete notification queue entries that reference this org event
    // (org events might be referenced in notification_queue.data.orgEventId)
    // Only delete unprocessed entries - processed ones should already be sent
    const { data: queueEntries } = await supabase
      .from('notification_queue')
      .select('id, data, processed')
      .not('data', 'is', null)
      .eq('processed', false) // Only get unprocessed entries

    if (queueEntries) {
      const queueIdsToDelete = queueEntries
        .filter(q => q.data?.orgEventId === eventId)
        .map(q => q.id)

      if (queueIdsToDelete.length > 0) {
        const { error: queueError } = await supabase
          .from('notification_queue')
          .delete()
          .in('id', queueIdsToDelete)

        if (queueError) {
          console.error('Error deleting notification queue entries:', queueError)
        }
      }
    }

    // Step 3: Delete notification log entries that reference this org event
    // (org events are stored in notification_log.data.orgEventId since event_id is null)
    const { data: logEntries } = await supabase
      .from('notification_log')
      .select('id, data')
      .not('data', 'is', null)

    if (logEntries) {
      const logIdsToDelete = logEntries
        .filter(l => l.data?.orgEventId === eventId)
        .map(l => l.id)

      if (logIdsToDelete.length > 0) {
        const { error: logError } = await supabase
          .from('notification_log')
          .delete()
          .in('id', logIdsToDelete)

        if (logError) {
          console.error('Error deleting notification log entries:', logError)
        }
      }
    }

    // Step 4: Delete org event attendees
    const { error: attendeesError } = await supabase
      .from('org_event_attendees')
      .delete()
      .eq('event_id', eventId)

    if (attendeesError) {
      console.error('Error deleting org event attendees:', attendeesError)
    }

    // Step 5: Delete event image from storage (event-images bucket, events/ path)
    if (event.image_url) {
      try {
        await deleteImageFromStorage(event.image_url, 'event-images')
      } catch (error) {
        console.error('[deleteOrgEventCompletely] Failed to delete org event image:', error)
        // Continue with event deletion even if image deletion fails
      }
    }

    // Step 6: Delete the org event itself
    const { error: deleteEventError } = await supabase
      .from('org_events')
      .delete()
      .eq('id', eventId)

    if (deleteEventError) {
      throw deleteEventError
    }

    if (__DEV__) {
      console.log(`Successfully deleted org event ${eventId} and all associated data`)
    }
  } catch (error) {
    console.error('Error in deleteOrgEventCompletely:', error)
    throw error
  }
}

