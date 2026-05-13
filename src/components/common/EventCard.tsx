import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { EventWithAttendees } from '../../types'
import { formatInformalEventTime } from '../../utils/informalEventTime'
import { getInviteThemeGradient, normalizeInviteThemeKey } from '../../utils/inviteEventTheme'
import ImageWithFallback from './ImageWithFallback'

export interface EventCardProps {
  item: EventWithAttendees & {
    goingCount?: number
    attendee_count?: number
    tags?: string[]
    isOrgEvent?: boolean
  }
  onPress: () => void
  /** You host this event — same blue + Going as attending */
  isHost?: boolean
  /** Current user's RSVP — blue border + "Going" when going */
  userAttendance?: string | null
  /** When set, attendance is also read from item.attendees if userAttendance is missing */
  viewerId?: string | null
  isInvited?: boolean
  showDeleteButton?: boolean
  onDelete?: () => void
  invitationStatus?: 'pending' | 'declined' | null
}

function EventCard({
  item,
  onPress,
  isHost,
  userAttendance,
  viewerId,
  isInvited,
  showDeleteButton,
  onDelete,
  invitationStatus,
}: EventCardProps) {
  const { theme, isDark } = useTheme()
  const { height: windowHeight } = useWindowDimensions()
  const hasImage = Boolean(item.image_url)
  const cardHeight = hasImage ? Math.round(windowHeight * 0.2) : undefined

  const informal = formatInformalEventTime(
    item.event_date,
    item.start_time,
    item.end_time
  )
  const locationLine = item.location?.trim() || 'Location TBD'

  const titleSizeImage = 23
  const titleSizePlain = 21
  const metaSizeImage = 15
  const metaSizePlain = 14

  const styles = createStyles(
    theme,
    cardHeight ?? 0,
    titleSizeImage,
    titleSizePlain,
    metaSizeImage,
    metaSizePlain,
    theme.primary
  )

  const fromAttendees =
    viewerId && item.attendees?.length
      ? (item.attendees as { user_id: string; status?: string }[]).find((a) => a.user_id === viewerId)?.status
      : null
  const resolvedAttendance = userAttendance ?? fromAttendees ?? null
  const isGoingStatus = String(resolvedAttendance || '')
    .toLowerCase()
    .trim() === 'going'
  const effectiveHost = Boolean(isHost && item.host_id)
  const showInvitedChip = Boolean(isInvited) || invitationStatus === 'pending'
  const showDeclinedChip = invitationStatus === 'declined'
  const showGoingBadge =
    !showDeclinedChip && (effectiveHost || isGoingStatus)
  const showBlueHighlight = showGoingBadge

  const goingPill = showGoingBadge ? (
    <View style={styles.goingPill} pointerEvents="none">
      <Text style={styles.goingPillText}>Going</Text>
    </View>
  ) : null

  const inviteKey = normalizeInviteThemeKey((item as any).invite_theme_color)
  const plainGradientColors: [string, string] =
    !hasImage && inviteKey !== 'default'
      ? getInviteThemeGradient(inviteKey, isDark)
      : [theme.card, theme.surface]

  return (
    <View
      style={[
        styles.shadowWrap,
        {
          backgroundColor:
            !hasImage && inviteKey !== 'default' ? plainGradientColors[0] : theme.card,
        },
        showBlueHighlight ? styles.highlightedGoing : styles.notAttendingBorder,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.92}
        style={[
          styles.touchClip,
          hasImage && cardHeight != null
            ? { height: cardHeight, minHeight: cardHeight }
            : styles.touchClipNoImage,
        ]}
      >
        {hasImage ? (
          <View style={[styles.heroRoot, cardHeight != null && { minHeight: cardHeight, height: '100%' }]}>
            <ImageWithFallback
              source={{ uri: item.image_url }}
              style={StyleSheet.absoluteFill}
              cacheKey={`event:${item.id}:cover`}
              resizeMode="cover"
              skipValidation
              priority="high"
            />
            <View style={[StyleSheet.absoluteFill, styles.imageDarken]} />
            <LinearGradient
              colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
              locations={[0, 0.42, 1]}
              style={StyleSheet.absoluteFill}
            />

            {(showInvitedChip || showDeclinedChip) && (
              <View style={styles.chipRow}>
                {showDeclinedChip ? (
                  <View style={[styles.chip, styles.chipMuted]}>
                    <Text style={styles.chipText}>Declined</Text>
                  </View>
                ) : null}
                {showInvitedChip && !showDeclinedChip ? (
                  <View style={[styles.chip, styles.chipAccent, { backgroundColor: theme.primary + 'E8' }]}>
                    <Text style={styles.chipText}>Invited</Text>
                  </View>
                ) : null}
              </View>
            )}

            {showDeleteButton && onDelete ? (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete()}>
                <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
              </TouchableOpacity>
            ) : null}

            {goingPill}

            <View style={[styles.heroTextColumn, showBlueHighlight && styles.heroTextColumnWithGoing]}>
              <Text style={styles.titleOnImage} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.locationOnImage} numberOfLines={2}>
                {locationLine}
              </Text>
              <Text style={styles.informalOnImage} numberOfLines={2}>
                {informal}
              </Text>
            </View>
          </View>
        ) : (
          <LinearGradient
            colors={plainGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.noImageBody}
          >
            {(showInvitedChip || showDeclinedChip) && (
              <View style={styles.chipRowInline}>
                {showDeclinedChip ? (
                  <View style={[styles.chip, styles.chipMuted]}>
                    <Text style={styles.chipText}>Declined</Text>
                  </View>
                ) : null}
                {showInvitedChip && !showDeclinedChip ? (
                  <View style={[styles.chip, styles.chipAccent]}>
                    <Text style={styles.chipText}>Invited</Text>
                  </View>
                ) : null}
              </View>
            )}
            {showDeleteButton && onDelete ? (
              <TouchableOpacity style={styles.deleteBtnNoImage} onPress={() => onDelete()}>
                <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
              </TouchableOpacity>
            ) : null}
            {goingPill}
            <View style={[styles.textBlockPlain, showBlueHighlight && styles.textBlockPlainWithGoing]}>
              <Text style={styles.titlePlain} numberOfLines={3}>
                {item.title}
              </Text>
              <Text style={styles.locationPlain} numberOfLines={3}>
                {locationLine}
              </Text>
              <Text style={styles.informalPlain} numberOfLines={3}>
                {informal}
              </Text>
            </View>
          </LinearGradient>
        )}
      </TouchableOpacity>
    </View>
  )
}

const createStyles = (
  theme: any,
  cardHeight: number,
  titleSizeImage: number,
  titleSizePlain: number,
  metaSizeImage: number,
  metaSizePlain: number,
  primaryBlue: string
) =>
  StyleSheet.create({
    shadowWrap: {
      marginBottom: 14,
      borderRadius: 14,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.14,
      shadowRadius: 5,
      elevation: 5,
    },
    highlightedGoing: {
      borderWidth: 2,
      borderColor: primaryBlue,
    },
    notAttendingBorder: {
      borderWidth: 0,
      borderColor: theme.border,
    },
    goingPill: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: primaryBlue,
      backgroundColor: primaryBlue + '22',
      zIndex: 100,
      elevation: 12,
    },
    goingPillText: {
      color: primaryBlue,
      fontSize: 13,
      fontWeight: '700',
    },
    heroTextColumnWithGoing: {
      paddingRight: 88,
    },
    touchClip: {
      borderRadius: 14,
      overflow: 'hidden',
    },
    touchClipNoImage: {},
    heroRoot: {
      width: '100%',
      flex: 1,
      position: 'relative',
      justifyContent: 'flex-end',
    },
    imageDarken: {
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    chipRow: {
      position: 'absolute',
      top: 10,
      left: 12,
      right: 52,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      zIndex: 2,
    },
    chipRowInline: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    chipAccent: {
      backgroundColor: 'rgba(52, 152, 219, 0.92)',
    },
    chipMuted: {
      backgroundColor: 'rgba(120, 120, 120, 0.85)',
    },
    chipText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },
    deleteBtn: {
      position: 'absolute',
      top: 8,
      right: 10,
      zIndex: 3,
      padding: 6,
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderRadius: 10,
    },
    deleteBtnNoImage: {
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 3,
      padding: 6,
      backgroundColor: 'rgba(0,0,0,0.06)',
      borderRadius: 10,
    },
    heroTextColumn: {
      paddingHorizontal: 14,
      paddingBottom: Math.max(14, Math.round(cardHeight * 0.08)),
      paddingTop: 12,
      gap: 5,
      zIndex: 1,
    },
    titleOnImage: {
      fontSize: titleSizeImage,
      fontWeight: '700',
      lineHeight: titleSizeImage + 6,
      color: '#ffffff',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    locationOnImage: {
      fontSize: metaSizeImage,
      fontWeight: '500',
      lineHeight: metaSizeImage + 5,
      color: 'rgba(255,255,255,0.92)',
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    informalOnImage: {
      fontSize: metaSizeImage,
      fontWeight: '600',
      color: 'rgba(220,220,220,0.95)',
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    noImageBody: {
      paddingTop: 14,
      paddingBottom: 16,
      paddingHorizontal: 14,
      position: 'relative',
    },
    textBlockPlain: {
      gap: 6,
      paddingTop: 4,
    },
    textBlockPlainWithGoing: {
      paddingRight: 88,
    },
    titlePlain: {
      fontSize: titleSizePlain,
      fontWeight: '700',
      lineHeight: titleSizePlain + 6,
      color: theme.text,
    },
    locationPlain: {
      fontSize: metaSizePlain,
      fontWeight: '500',
      lineHeight: metaSizePlain + 5,
      color: theme.textSecondary,
    },
    informalPlain: {
      fontSize: metaSizePlain,
      fontWeight: '600',
      color: theme.textSecondary,
    },
  })

export default React.memo(EventCard)
