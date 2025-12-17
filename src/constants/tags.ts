export const PREDEFINED_TAGS = [
  'Game Night',
  'Study Session',
  'Movie Night',
  'Sports',
  'Food & Dining',
  'Music & Arts',
  'Networking',
  'Outdoor Activity',
  'Workshop',
  'Social Mixer',
  'Party',
] as const

export type PredefinedTag = typeof PREDEFINED_TAGS[number]
