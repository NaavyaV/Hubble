export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  major?: string
  graduating_year?: string
  phone_number?: string
}

export interface Event {
  id: string
  host_id: string
  title: string
  description?: string
  event_date: string
  start_time: string
  end_time?: string
  location: string
  max_attendees?: number
  image_url?: string
  privacy?: 'public' | 'friends_only'
  created_at: string
  updated_at: string
}

export interface EventAttendee {
  id: string
  event_id: string
  user_id: string
  status: 'going' | 'maybe' | 'not_going'
  created_at: string
  user?: {
    id?: string
    email?: string
    full_name?: string
    major?: string
    graduating_year?: string
    avatar_url?: string
    bio?: string
    phone_number?: string
  }
}

export interface EventWithAttendees extends Event {
  attendees: EventAttendee[]
  attendee_count: number
}
