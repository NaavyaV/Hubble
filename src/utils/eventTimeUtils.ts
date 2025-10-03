/**
 * Utility functions for handling event times, especially events that span across midnight
 */

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
  const startDate = new Date(eventDate + ' ' + startTime)
  
  if (!endTime) {
    // Default to 6 hours after start if no end time
    return new Date(startDate.getTime() + 6 * 60 * 60 * 1000)
  }
  
  if (isMidnightSpanningEvent(startTime, endTime)) {
    // Event spans midnight, so end time is next day
    const nextDay = new Date(eventDate)
    nextDay.setDate(nextDay.getDate() + 1)
    return new Date(nextDay.toISOString().split('T')[0] + ' ' + endTime)
  } else {
    // Event ends same day
    return new Date(eventDate + ' ' + endTime)
  }
}

/**
 * Gets the actual start date of an event
 * @param eventDate - Event date string in YYYY-MM-DD format
 * @param startTime - Start time string in HH:MM format
 * @returns Date object representing the start of the event
 */
export function getEventStartDate(eventDate: string, startTime: string): Date {
  return new Date(eventDate + ' ' + startTime)
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
