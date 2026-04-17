/** Stored in Supabase `dining_locations.college` and used for queries. */
export const UTD_COLLEGE_NAME = 'University of Texas at Dallas'

export const UTD_DINING_API_URL = 'https://utd-dining.vercel.app/api/dining'

export const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

export type DiningDayKey = (typeof DAY_KEYS)[number]
