import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { EventWithAttendees } from '../../types'

// Date and time formatting utilities
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const formatTime = (timeString: string) => {
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minutes} ${ampm}`
}

interface EventCardProps {
  item: EventWithAttendees & { 
    goingCount?: number
    attendee_count?: number
    tags?: string[]
    isOrgEvent?: boolean
  }
  hostProfile?: {
    id: string
    full_name?: string | null
    username?: string | null
    avatar_url?: string | null
  } | null
  hostOrg?: {
    id: string
    name?: string
    icon?: string | null
  } | null
  userAttendance?: string | null
  isInvited?: boolean
  isHost?: boolean
  isExpanded?: boolean
  showDeleteButton?: boolean
  onDelete?: () => void
  onToggleExpand: () => void
  onPress: () => void
}

export default function EventCard({
  item,
  hostProfile,
  hostOrg,
  userAttendance,
  isInvited,
  isHost,
  isExpanded = false,
  showDeleteButton = false,
  onDelete,
  onToggleExpand,
  onPress,
}: EventCardProps) {
  const { theme } = useTheme()

  const styles = createStyles(theme)

  return (
    <View style={styles.eventCard}>
      {/* Compact header row */}
      <TouchableOpacity
        style={styles.compactHeader}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.compactHeaderLeft}>
          <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
          {!isExpanded && item.description ? (
            <Text style={styles.compactDescription} numberOfLines={1}>
              {item.description.length > 50 ? item.description.substring(0, 50) + '...' : item.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.compactHeaderCenter}>
          <View style={styles.compactRowLeftAligned}>
            <Ionicons name="calendar" size={14} color="#e74c3c" />
            <Text style={styles.compactMeta} numberOfLines={1}>{formatDate(item.event_date)}</Text>
          </View>
          <View style={styles.compactRowLeftAligned}>
            <Ionicons name="time" size={14} color="#f39c12" />
            <Text style={styles.compactMeta} numberOfLines={1}>{formatTime(item.start_time)}</Text>
          </View>
        </View>
          <View style={styles.compactHeaderRight}>
            {showDeleteButton && onDelete && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={onDelete}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={theme.error} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.expandIcon}
              onPress={onToggleExpand}
              activeOpacity={0.7}
            >
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {isExpanded && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
        >
          {/* Optional image */}
          {item.image_url && (
            <Image
              source={{ uri: item.image_url }}
              style={styles.compactImage}
              resizeMode="cover"
            />
          )}

          {/* Description */}
          {item.description ? (
            <Text style={styles.expandedDescription}>{item.description}</Text>
          ) : null}

          {/* Location */}
          {item.location ? (
            <View style={[
              styles.compactLocationRow,
              !item.description && { paddingTop: 10 }
            ]}>
              <Ionicons name="location" size={16} color="#27ae60" />
              <Text style={styles.compactLocationText}>{item.location}</Text>
            </View>
          ) : null}

          {/* Stats */}
          <View style={styles.compactStatsRow}>
            <View style={styles.compactRow}>
              <Ionicons name="people" size={14} color="#27ae60" />
              <Text style={styles.compactMeta}>{(item.goingCount ?? item.attendee_count) || 0} going</Text>
            </View>
            {item.max_attendees ? (
              <View style={styles.compactRow}>
                <Ionicons name="person-add" size={14} color="#3498db" />
                <Text style={styles.compactMeta}>
                  {(item.goingCount ?? item.attendee_count) || 0}/{item.max_attendees} spots
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

const createStyles = (theme: any) => StyleSheet.create({
  eventCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: theme.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactHeaderLeft: {
    flex: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  compactHeaderCenter: {
    width: 100,
    alignItems: 'flex-start',
    marginRight: 10,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  compactRowLeftAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 2,
    textAlign: 'left',
  },
  compactDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 2,
    lineHeight: 14,
    textAlign: 'left',
  },
  expandedDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    lineHeight: 18,
  },
  compactMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    marginLeft: 6,
    flexShrink: 1,
  },
  compactHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    marginRight: 4,
  },
  expandIcon: {
    padding: 8,
  },
  compactImage: {
    width: '100%',
    height: 200,
    backgroundColor: theme.surface,
  },
  compactLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  compactLocationText: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  compactStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
})

