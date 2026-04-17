import type { EventWithAttendees } from '../types'

export type RootStackParamList = {
  Auth: undefined
  Onboarding: undefined
  AccountVerification: { email: string; userId?: string }
  ResetPassword: undefined
  ForgotPassword: { email?: string } | undefined
  Main: undefined
  EventDetail: { event: EventWithAttendees }
  EditProfile: undefined
  MyEvents: undefined
  CreateEvent: undefined
  EventInvite: { invitedUsers: string[] }
  Settings: undefined
  NotificationSettings: undefined
  PhoneVisibility: undefined
  LegalDocuments: undefined
  LegalDocumentViewer: { documentType: 'privacy' | 'terms' | 'guidelines' }
  EventPhotoGallery: { event: any; eventImages: string[] }
  PhotoViewer: { photo: any; event: any; hostProfile: any }
  GeneralPhotoGallery: undefined
  OrgEdit: undefined
}

export type MainTabParamList = {
  MyEvents: undefined
  ComingEvents: undefined
  Dining: undefined
  Leaderboard: undefined
  Social: undefined
  Profile: undefined
  OrgEvents: undefined
  OrgFollowers: undefined
  OrgSettings: undefined
}
