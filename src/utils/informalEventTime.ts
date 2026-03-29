import {
  getEventStartDate,
  isEventCurrentlyHappening,
} from './eventTimeUtils'

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Informal relative labels for upcoming / in-progress events.
 */
export function formatInformalEventTime(
  eventDate: string,
  startTime: string,
  endTime?: string | null
): string {
  if (isEventCurrentlyHappening(eventDate, startTime, endTime || undefined)) {
    return 'Happening now'
  }

  const start = getEventStartDate(eventDate, startTime)
  const now = new Date()
  const ms = start.getTime() - now.getTime()

  if (ms <= 0) {
    return 'Starting soon'
  }

  const hours = ms / (1000 * 60 * 60)
  const days = ms / (1000 * 60 * 60 * 24)

  if (hours < 5) {
    const n = Math.max(1, Math.ceil(hours))
    return n === 1 ? 'in 1 hour' : `in ${n} hours`
  }

  if (hours >= 6 && hours <= 12 && isSameLocalCalendarDay(start, now)) {
    return 'Later today'
  }

  if (days <= 6) {
    const n = Math.max(1, Math.ceil(days))
    return n === 1 ? 'in 1 day' : `in ${n} days`
  }

  if (days <= 28) {
    const w = Math.max(1, Math.round(days / 7))
    return w === 1 ? 'in 1 week' : `in ${w} weeks`
  }

  return 'Next month on'
}
