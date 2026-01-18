/**
 * Utility functions for handling event times, especially events that span across midnight
 */

/**
 * Parses a date string (YYYY-MM-DD) as a local date (not UTC)
 * This prevents timezone issues when parsing date-only strings
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object representing the date in local timezone
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  // Create date in local timezone (month is 0-indexed in Date constructor)
  return new Date(year, month - 1, day)
}

/**
 * Formats a date string (YYYY-MM-DD) for display
 * Parses it as local date to avoid timezone issues
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Formatted date string for display
 */
export function formatDateString(dateString: string): string {
  const date = parseLocalDate(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Checks if an event spans across midnight (end time is before start time)
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format
 * @returns boolean indicating if the event spans midnight
 */
export function isMidnightSpanningEvent(startTime: string, endTime: string): boolean {
  if (!endTime) return false
  
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  
  return endMinutes < startMinutes
}

/**
 * Gets the actual end date of an event, accounting for midnight spanning
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format (optional)
 * @returns Date object representing the actual end of the event
 */
export function getEventEndDate(eventDate: string, startTime: string, endTime?: string): Date {
  const startDate = getEventStartDate(eventDate, startTime)
  
  if (!endTime) {
    // Default to 6 hours after start if no end time
    return new Date(startDate.getTime() + 6 * 60 * 60 * 1000)
  }
  
  if (isMidnightSpanningEvent(startTime, endTime)) {
    // Event spans midnight, so end time is next day
    const [year, month, day] = eventDate.split('-').map(Number)
    const baseDate = new Date(year, month - 1, day)
    baseDate.setDate(baseDate.getDate() + 1) // Next day
    
    const [endHour, endMinute] = endTime.split(':').map(Number)
    baseDate.setHours(endHour, endMinute, 0, 0)
    return baseDate
  } else {
    // Event ends same day
    const [year, month, day] = eventDate.split('-').map(Number)
    const baseDate = new Date(year, month - 1, day)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    baseDate.setHours(endHour, endMinute, 0, 0)
    return baseDate
  }
}

/**
 * Gets the actual start date of an event
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @returns Date object representing the start of the event in local timezone
 */
export function getEventStartDate(eventDate: string, startTime: string): Date {
  const [year, month, day] = eventDate.split('-').map(Number)
  const [hours, minutes] = startTime.split(':').map(Number)
  // Create date in local timezone (month is 0-indexed in Date constructor)
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return date
}

/**
 * Checks if an event is currently happening (between start and end times)
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format (optional)
 * @returns boolean indicating if the event is currently happening
 */
export function isEventCurrentlyHappening(eventDate: string, startTime: string, endTime?: string): boolean {
  const now = new Date()
  const startDate = getEventStartDate(eventDate, startTime)
  
  // Special handling for events without end time: consider current for 12 hours
  if (!endTime) {
    const twelveHoursLater = new Date(startDate.getTime() + 12 * 60 * 60 * 1000)
    return now >= startDate && now <= twelveHoursLater
  }
  
  const endDate = getEventEndDate(eventDate, startTime, endTime)
  return now >= startDate && now <= endDate
}

/**
 * Checks if an event has ended (past the end time)
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format (optional)
 * @returns boolean indicating if the event has ended
 */
export function isEventEnded(eventDate: string, startTime: string, endTime?: string): boolean {
  const now = new Date()
  
  // Special handling for events without end time: mark as ended after 12 hours
  if (!endTime) {
    const startDate = getEventStartDate(eventDate, startTime)
    const twelveHoursLater = new Date(startDate.getTime() + 12 * 60 * 60 * 1000)
    return now > twelveHoursLater
  }
  
  const endDate = getEventEndDate(eventDate, startTime, endTime)
  return now > endDate
}

/**
 * Checks if an event is in the future (hasn't started yet)
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @returns boolean indicating if the event is in the future
 */
export function isEventInFuture(eventDate: string, startTime: string): boolean {
  const now = new Date()
  const startDate = getEventStartDate(eventDate, startTime)
  
  return now < startDate
}

/**
 * Validates that end time is not before start time for same-day events
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format
 * @returns object with isValid boolean and error message if invalid
 */
export function validateEventTimes(startTime: string, endTime: string): { isValid: boolean; errorMessage?: string } {
  if (!endTime) return { isValid: true }
  
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  
  // If end time is before start time, it's valid (spans midnight)
  // If end time equals start time, it's invalid
  if (endMinutes === startMinutes) {
    return { 
      isValid: false, 
      errorMessage: 'End time cannot be the same as start time' 
    }
  }
  
  return { isValid: true }
}

/**
 * Formats event time display, accounting for midnight spanning
 * @param startTime - Start time string in HH:MM format
 * @param endTime - End time string in HH:MM format (optional)
 * @returns formatted time string for display
 */
export function formatEventTimeDisplay(startTime: string, endTime?: string): string {
  if (!endTime) {
    return startTime
  }
  
  if (isMidnightSpanningEvent(startTime, endTime)) {
    return `${startTime} - ${endTime} (next day)`
  }
  
  return `${startTime} - ${endTime}`
}
