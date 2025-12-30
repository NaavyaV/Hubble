/**
 * Centralized notification templates and builders
 * All notification payloads and data are defined here
 */

export type NotificationType = 
  | 'event_invitation'
  | 'event_reminder'
  | 'event_edited_deleted'
  | 'host_update'
  | 'friend_request'
  | 'going_status_updates'
  | 'org_event_created'

export interface NotificationPayload {
  user_id: string
  event_id: string | null
  type: NotificationType
  title: string
  body: string
  scheduled_for: string
  data: Record<string, any>
}

export interface NotificationBuilderParams {
  userId: string
  eventId?: string | null
  hostName?: string
  eventTitle?: string
  userName?: string
  action?: 'joined' | 'left' | 'edited' | 'deleted'
  privacy?: 'public' | 'invite_only'
  scheduledFor?: Date
  additionalData?: Record<string, any>
}

/**
 * Build event invitation notification
 */
export function buildEventInvitationNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, hostName, eventTitle, privacy = 'public' } = params
  
  // Use the body message as the title (remove the "Event Invitation" title)
  const body = privacy === 'invite_only'
    ? `${hostName || 'Someone'} invited you to "${eventTitle || 'an event'}"`
    : `${hostName || 'Someone'} created a new event: "${eventTitle || 'an event'}"`
  
  // Use the body as the title (no separate "Event Invitation" title)
  const title = body

  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'event_invitation',
    title,
    body,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'event_invitation',
      eventId: eventId,
      hostName: hostName,
      privacy: privacy,
      eventTitle: eventTitle,
      ...params.additionalData
    }
  }
}

/**
 * Build event reminder notification
 */
export function buildEventReminderNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, eventTitle, scheduledFor } = params

  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'event_reminder',
    title: 'Event Starting Soon!',
    body: `${eventTitle || 'Your event'} starts in 15 minutes`,
    scheduled_for: scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'event_reminder',
      eventId: eventId,
      ...params.additionalData
    }
  }
}

/**
 * Build event edit/delete notification
 */
export function buildEventEditDeleteNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, eventTitle, action = 'edited' } = params
  
  const actionText = action === 'edited' ? 'edited' : 'deleted'
  const emoji = action === 'edited' ? '✏️' : '🗑️'
  const title = `${emoji} Event ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`
  const body = `"${eventTitle || 'An event'}" has been ${actionText} by the host`

  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'event_edited_deleted',
    title,
    body,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'event_edited_deleted',
      action: action,
      eventTitle: eventTitle,
      eventId: eventId,
      ...params.additionalData
    }
  }
}

/**
 * Build host update notification (when someone joins/leaves event)
 */
export function buildHostUpdateNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, eventTitle, userName, action = 'joined' } = params
  
  const displayName = userName || 'Someone'
  const eventName = eventTitle || 'an event'
  
  // Format: "X is going to Y" for joined, "X is no longer going to Y" for left
  const body = action === 'joined'
    ? `${displayName} is going to "${eventName}"`
    : `${displayName} is not going to "${eventName}"`
  
  // Use the body as the title for consistency
  const title = body

  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'host_update',
    title,
    body,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'host_update',
      eventId: eventId,
      action: action,
      attendeeName: userName,
      eventTitle: eventTitle,
      ...params.additionalData
    }
  }
}

/**
 * Build test notification
 */
export function buildTestNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, userName } = params

  return {
    user_id: userId,
    event_id: null,
    type: 'event_reminder',
    title: '🧪 Test Notification',
    body: `Hello ${userName || 'User'}! This is a test notification from Hubble.`,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      test: true,
      timestamp: new Date().toISOString(),
      screen: 'Leaderboard',
      type: 'event_reminder',
      ...params.additionalData
    }
  }
}

/**
 * Build friend request notification
 */
export function buildFriendRequestNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, userName } = params

  return {
    user_id: userId,
    event_id: null,
    type: 'friend_request',
    title: 'New Friend Request',
    body: `${userName || 'Someone'} sent you a friend request`,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'friend_request',
      requesterName: userName,
      ...params.additionalData
    }
  }
}

/**
 * Build going status update notification
 */
export function buildGoingStatusUpdateNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, eventTitle, userName, action = 'joined' } = params

  const title = action === 'joined' 
    ? 'Friend Joined Event' 
    : 'Friend Left Event'
  const body = action === 'joined'
    ? `${userName || 'A friend'} is now going to "${eventTitle || 'an event'}"`
    : `${userName || 'A friend'} is not going to "${eventTitle || 'an event'}"`

  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'going_status_updates',
    title,
    body,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'going_status_updates',
      eventId: eventId,
      action: action,
      friendName: userName,
      eventTitle: eventTitle,
      ...params.additionalData
    }
  }
}

/**
 * Build org event created notification
 */
export function buildOrgEventCreatedNotification(params: NotificationBuilderParams): NotificationPayload {
  const { userId, eventId, hostName, eventTitle } = params
  
  return {
    user_id: userId,
    event_id: eventId || null,
    type: 'org_event_created',
    title: 'New Event from Organization',
    body: `${hostName || 'An organization'} created a new event: "${eventTitle || 'an event'}"`,
    scheduled_for: params.scheduledFor?.toISOString() || new Date().toISOString(),
    data: {
      type: 'org_event_created',
      eventId: eventId,
      orgName: hostName,
      eventTitle: eventTitle,
      ...params.additionalData
    }
  }
}

/**
 * Helper function to batch create notifications for multiple users
 */
export function buildBatchNotifications(
  userIds: string[],
  builder: (params: NotificationBuilderParams) => NotificationPayload,
  baseParams: Omit<NotificationBuilderParams, 'userId'>
): NotificationPayload[] {
  return userIds.map(userId => builder({ ...baseParams, userId }))
}

