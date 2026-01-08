import { EventWithAttendees } from '../types'

export type TimeSection = 'today' | 'thisWeek' | 'nextWeek'

export interface GroupedEvent<T = EventWithAttendees> {
  title: string
  data: T[]
}

/**
 * Gets the start of today (midnight)
 */
function getStartOfToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

/**
 * Gets the end of today (11:59:59 PM)
 */
function getEndOfToday(): Date {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  return now
}

/**
 * Gets the end of this week (Sunday at 11:59:59 PM)
 */
function getEndOfThisWeek(): Date {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilSunday = (7 - day) % 7 || 7 // If it's Sunday, daysUntilSunday = 7
  
  const endOfWeek = new Date(now)
  endOfWeek.setDate(now.getDate() + daysUntilSunday)
  endOfWeek.setHours(23, 59, 59, 999)
  return endOfWeek
}

/**
 * Gets the start of next week (Monday at 00:00:00)
 */
function getStartOfNextWeek(): Date {
  const endOfThisWeek = getEndOfThisWeek()
  const startOfNextWeek = new Date(endOfThisWeek)
  startOfNextWeek.setDate(endOfThisWeek.getDate() + 1)
  startOfNextWeek.setHours(0, 0, 0, 0)
  return startOfNextWeek
}

/**
 * Determines which time section an event belongs to based on its event_date
 */
function getEventTimeSection(eventDate: string, startTime?: string): TimeSection {
  const eventDateTime = new Date(eventDate)
  if (startTime) {
    const [hours, minutes] = startTime.split(':')
    eventDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
  } else {
    eventDateTime.setHours(0, 0, 0, 0)
  }
  
  const now = new Date()
  const startOfToday = getStartOfToday()
  const endOfToday = getEndOfToday()
  const endOfThisWeek = getEndOfThisWeek()
  const startOfNextWeek = getStartOfNextWeek()
  
  // Today: event date/time is between start of today and end of today
  if (eventDateTime >= startOfToday && eventDateTime <= endOfToday) {
    return 'today'
  }
  
  // This week: event date/time is between end of today and end of this week (Sunday night)
  if (eventDateTime > endOfToday && eventDateTime <= endOfThisWeek) {
    return 'thisWeek'
  }
  
  // Next week on: event date/time is after start of next week
  if (eventDateTime >= startOfNextWeek) {
    return 'nextWeek'
  }
  
  // Past events fall into 'nextWeek' for display purposes (they'll be filtered elsewhere)
  return 'nextWeek'
}

/**
 * Groups events by time sections: Today, This Week, Next Week On
 */
export function groupEventsByTime<T extends EventWithAttendees>(events: T[]): GroupedEvent<T>[] {
  const today: EventWithAttendees[] = []
  const thisWeek: EventWithAttendees[] = []
  const nextWeek: EventWithAttendees[] = []
  
  events.forEach(event => {
    const section = getEventTimeSection(event.event_date, event.start_time)
    
    switch (section) {
      case 'today':
        today.push(event)
        break
      case 'thisWeek':
        thisWeek.push(event)
        break
      case 'nextWeek':
        nextWeek.push(event)
        break
    }
  })
  
  const grouped: GroupedEvent[] = []
  
  if (today.length > 0) {
    grouped.push({ title: 'Today', data: today })
  }
  
  if (thisWeek.length > 0) {
    grouped.push({ title: 'This Week', data: thisWeek })
  }
  
  if (nextWeek.length > 0) {
    grouped.push({ title: 'Next Week On', data: nextWeek })
  }
  
  return grouped
}

