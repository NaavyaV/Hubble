/**
 * Interpret dining hours in America/Chicago (UTD campus time).
 */

const TZ = 'America/Chicago'

/** Minutes from midnight, 0–1439, in Central Time for "now". */
export function getCentralMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  let h = 0
  let m = 0
  for (const p of parts) {
    if (p.type === 'hour') h = parseInt(p.value, 10)
    if (p.type === 'minute') m = parseInt(p.value, 10)
  }
  return h * 60 + m
}

export function getCentralDayKey(): typeof import('../constants/dining').DAY_KEYS[number] {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(new Date())
  return w.toLowerCase() as typeof import('../constants/dining').DAY_KEYS[number]
}

/** YYYY-MM-DD in America/Chicago (for `dining_going.plan_date`). */
export function getCentralDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Parse "9:00 a.m." / "12:00 p.m." style strings (API format) to minutes since midnight. */
export function parseTimeToMinutes(t: string): number | null {
  const s = t.trim().toLowerCase().replace(/\u00a0/g, ' ')
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)$/)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const minute = parseInt(m[2], 10)
  const mer = m[3].replace(/\./g, '').replace(/\s/g, '')
  if (mer === 'am') {
    if (hour === 12) hour = 0
  } else if (mer === 'pm') {
    if (hour !== 12) hour += 12
  } else return null
  return hour * 60 + minute
}

export type DiningStatus =
  | { kind: 'closed'; reason: 'closed' | 'parse_error' }
  | { kind: 'open'; closesDisplay: string }

function windowForHours(hoursRaw: string): { start: number; end: number; closesDisplay: string } | null {
  const hours = hoursRaw.trim()
  if (!hours || hours.toLowerCase() === 'closed') return null
  const parts = hours.split(/\s+-\s+/)
  if (parts.length !== 2) return null
  const startM = parseTimeToMinutes(parts[0])
  const endM = parseTimeToMinutes(parts[1])
  if (startM === null || endM === null) return null
  let start = startM
  let end = endM
  if (end <= start) {
    end += 24 * 60
  }
  return { start, end, closesDisplay: parts[1].trim() }
}

/**
 * Single interval "start - end". If end <= start, interval crosses midnight (end += 24h).
 */
export function getDiningStatusForHours(hoursRaw: string): DiningStatus {
  const w = windowForHours(hoursRaw)
  if (!w) {
    const hours = hoursRaw.trim()
    if (!hours || hours.toLowerCase() === 'closed') return { kind: 'closed', reason: 'closed' }
    return { kind: 'closed', reason: 'parse_error' }
  }
  const { start, end, closesDisplay } = w

  let nowT = getCentralMinutesNow()
  if (end > 24 * 60 && nowT < end - 24 * 60) {
    nowT += 24 * 60
  }

  const open = nowT >= start && nowT < end
  if (!open) {
    return { kind: 'closed', reason: 'closed' }
  }

  return { kind: 'open', closesDisplay }
}

/** Relative time until close (Central), when currently open. */
export function formatClosesInFromHours(hoursRaw: string): string {
  const w = windowForHours(hoursRaw)
  if (!w) return ''
  const { start, end, closesDisplay } = w

  let nowT = getCentralMinutesNow()
  if (end > 24 * 60 && nowT < end - 24 * 60) {
    nowT += 24 * 60
  }
  if (nowT < start || nowT >= end) return ''

  const minutesLeft = end - nowT
  if (minutesLeft < 1) return `Closes at ${closesDisplay}`
  if (minutesLeft < 60) return `Closes in ${Math.round(minutesLeft)} min`
  const h = Math.floor(minutesLeft / 60)
  const m = Math.round(minutesLeft % 60)
  if (m === 0) return `Closes in ${h} hr${h === 1 ? '' : 's'}`
  return `Closes in ${h} hr ${m} min`
}
