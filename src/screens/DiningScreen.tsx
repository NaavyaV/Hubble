import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native'
import RNModal from 'react-native-modal'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../context/ThemeContext'
import { ImageWithFallback } from '../components'
import { UTD_COLLEGE_NAME } from '../constants/dining'
import { getDiningLocationsForDay, type DiningLocationRow } from '../services/diningService'
import { readDiningCache, writeDiningCacheDay } from '../utils/diningCache'
import {
  getCentralDayKey,
  getCentralDateString,
  getDiningStatusForHours,
  formatClosesInFromHours,
} from '../utils/utdDiningHours'
import {
  venueKey,
  fetchActiveGoingForDate,
  groupGoingByVenue,
  upsertDiningGoing,
  deleteMyDiningGoing,
  type DiningGoingWithProfile,
  type DiningVisibility,
} from '../services/diningGoingService'
import { supabase } from '../services/supabase'
import { getCachedSession } from '../services/sessionService'

type RowVM = DiningLocationRow & {
  open: boolean
  statusLine: string
}

/** Arrive: now through 1 hour (15-min steps) */
const ARRIVAL_MINUTES = [0, 15, 30, 45, 60]
/** Stay:15 min through 1 hour */
const DURATION_MINUTES = [15, 30, 45, 60]

function displayName(p: { full_name: string | null; username: string | null }): string {
  return p.full_name?.trim() || p.username?.trim() || 'Friend'
}

function arrivalChipLabel(m: number): string {
  if (m === 0) return 'Now'
  return `in ${m} mins`
}

function durationChipLabel(m: number): string {
  return `${m} mins`
}

function buildVmsFromLocations(locations: DiningLocationRow[]): RowVM[] {
  const vms: RowVM[] = locations.map((r) => {
    const status = getDiningStatusForHours(r.hours)
    const open = status.kind === 'open'
    const statusLine =
      open
        ? formatClosesInFromHours(r.hours)
        : status.kind === 'closed' && status.reason === 'parse_error'
          ? r.hours
          : 'Closed'
    return { ...r, open, statusLine }
  })
  vms.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1
    return a.venue.localeCompare(b.venue)
  })
  return vms
}

export default function DiningScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [rows, setRows] = useState<RowVM[]>([])
  const [dayLabel, setDayLabel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [goingByVenue, setGoingByVenue] = useState<Map<string, DiningGoingWithProfile[]>>(new Map())

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetRow, setSheetRow] = useState<RowVM | null>(null)
  const [arrivalMinutes, setArrivalMinutes] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [visibilityChoice, setVisibilityChoice] = useState<DiningVisibility>('everyone')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (forceRefresh = false) => {
    try {
      const dayKey = getCentralDayKey()
      const planDate = getCentralDateString()

      const session = await getCachedSession()
      const uid = session?.user?.id ?? null
      setCurrentUserId(uid)

      let usedCache = false
      if (!forceRefresh) {
        const cached = await readDiningCache(dayKey)
        if (cached?.rows?.length) {
          const label =
            cached.day_label ?? cached.rows.find((r) => r.day_label)?.day_label ?? ''
          setDayLabel(label)
          setRows(buildVmsFromLocations(cached.rows))
          setLoading(false)
          usedCache = true
        }
      }

      const locationsPromise =
        usedCache && !forceRefresh ? null : getDiningLocationsForDay(dayKey)
      const goingPromise = fetchActiveGoingForDate(planDate)

      if (locationsPromise) {
        const locations = await locationsPromise
        const label = locations.find((r) => r.day_label)?.day_label ?? ''
        await writeDiningCacheDay(dayKey, label, locations)
        setDayLabel(label)
        setRows(buildVmsFromLocations(locations))
        setLoading(false)
      }

      const going = await goingPromise
      setGoingByVenue(groupGoingByVenue(going))
    } catch (e) {
      if (__DEV__) console.warn('DiningScreen load', e)
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load(false)
    }, [load])
  )

  const onRefresh = () => {
    setRefreshing(true)
    load(true)
  }

  const openSheet = (item: RowVM) => {
    if (!item.open || !currentUserId) {
      if (!currentUserId) Alert.alert('Sign in', 'Sign in to share when you are going.')
      return
    }
    setArrivalMinutes(0)
    setDurationMinutes(45)
    setVisibilityChoice('everyone')
    setSheetRow(item)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSheetRow(null)
  }

  const submitGoing = async () => {
    if (!sheetRow || !currentUserId) return
    const planDate = getCentralDateString()
    const arrival = new Date(Date.now() + arrivalMinutes * 60 * 1000)
    const departure = new Date(arrival.getTime() + durationMinutes * 60 * 1000)
    if (departure.getTime() <= arrival.getTime()) {
      Alert.alert('Stay duration', 'Choose how long you will stay (at least 15 minutes).')
      return
    }

    setSubmitting(true)
    const { error } = await upsertDiningGoing({
      userId: currentUserId,
      building: sheetRow.building,
      venue: sheetRow.venue,
      planDate,
      arrivalAt: arrival,
      departureAt: departure,
      visibility: visibilityChoice,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Could not save', error.message)
      return
    }
    closeSheet()
    await load()
  }

  const peopleHereFor = (item: RowVM): DiningGoingWithProfile[] => {
    const plans = goingByVenue.get(venueKey(item.building, item.venue)) ?? []
    if (!currentUserId) {
      return [...plans].sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile)))
    }
    return [...plans].sort((a, b) => {
      if (a.user_id === currentUserId) return -1
      if (b.user_id === currentUserId) return 1
      return displayName(a.profile).localeCompare(displayName(b.profile))
    })
  }

  const confirmCancelGoing = (item: RowVM) => {
    if (!currentUserId) return
    Alert.alert(
      'Stop sharing?',
      `Remove your plan at ${item.venue}?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const planDate = getCentralDateString()
            const { error } = await deleteMyDiningGoing({
              userId: currentUserId,
              planDate,
              building: item.building,
              venue: item.venue,
            })
            if (error) Alert.alert('Could not remove', error.message)
            else await load()
          },
        },
      ]
    )
  }

  const renderItem = ({ item }: { item: RowVM }) => {
    const peopleStrip = item.open ? peopleHereFor(item) : []
    const vk = venueKey(item.building, item.venue)
    const imGoing =
      !!currentUserId && (goingByVenue.get(vk) ?? []).some((p) => p.user_id === currentUserId)
    const showGoingPill = item.open && !!currentUserId && !imGoing
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: item.open ? theme.primary + '44' : theme.border,
            borderWidth: item.open ? 1 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.venue, { color: theme.text }]} numberOfLines={2}>
              {item.venue}
            </Text>
            <Text style={[styles.placeHoursLine, { color: theme.text }]} numberOfLines={2}>
              {item.building}
              <Text style={{ color: theme.textSecondary, fontWeight: '400' }}>{`, ${item.hours}`}</Text>
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: item.open ? theme.primary + '18' : theme.surface }]}>
            <Ionicons
              name={item.open ? 'restaurant' : 'moon-outline'}
              size={14}
              color={item.open ? theme.primary : theme.textSecondary}
            />
          </View>
        </View>

        <Text
          style={[
            styles.status,
            {
              color: item.open ? theme.primary : theme.textTertiary,
              paddingRight: showGoingPill ? 108 : 0,
            },
          ]}
          numberOfLines={1}
        >
          {item.statusLine}
        </Text>

        {item.open && peopleStrip.length > 0 ? (
          <View style={styles.peopleSection}>
            <Text style={[styles.peopleLabel, { color: theme.textSecondary }]}>People here</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleScroll}>
              {peopleStrip.map((g) => {
                const isMe = g.user_id === currentUserId
                return (
                  <View key={g.id} style={styles.personChip}>
                    <View style={styles.avatarWrap}>
                      {isMe ? (
                        <TouchableOpacity
                          style={[styles.cancelGoingBadge, { backgroundColor: theme.textSecondary }]}
                          onPress={() => confirmCancelGoing(item)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityLabel="Stop sharing dining plan"
                        >
                          <Ionicons name="close" size={10} color="#fff" />
                        </TouchableOpacity>
                      ) : null}
                      {g.profile.avatar_url ? (
                        <ImageWithFallback
                          source={{ uri: g.profile.avatar_url }}
                          style={styles.personAvatar}
                          fallbackIcon="person"
                          fallbackText=""
                          skipValidation
                          priority="low"
                        />
                      ) : (
                        <View style={[styles.personAvatar, styles.personAvatarPlaceholder, { backgroundColor: theme.surface }]}>
                          <Ionicons name="person" size={16} color={theme.textSecondary} />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.personName, { color: theme.text }]} numberOfLines={1}>
                      {isMe ? 'You' : displayName(g.profile)}
                    </Text>
                  </View>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        {showGoingPill ? (
          <TouchableOpacity
            style={[
              styles.goingPill,
              {
                borderColor: theme.primary,
                backgroundColor: theme.primary + '22',
              },
            ]}
            onPress={() => openSheet(item)}
            activeOpacity={0.88}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="walk-outline" size={13} color={theme.primary} />
            <Text style={[styles.goingPillText, { color: theme.primary }]}>I&apos;m going</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.muted, { color: theme.textSecondary, marginTop: 12 }]}>Loading dining…</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.divider }]}>
        <Text style={[styles.title, { color: theme.text }]}>Dining</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{UTD_COLLEGE_NAME}</Text>
        {dayLabel ? (
          <Text style={[styles.day, { color: theme.primary }]}>{dayLabel} (Central)</Text>
        ) : (
          <Text style={[styles.day, { color: theme.textSecondary }]}>Hours in Central Time</Text>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => item.id ?? `${item.venue}-${item.building}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="fast-food-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No dining data for today.</Text>
          </View>
        }
      />

      <RNModal
        isVisible={sheetOpen}
        onBackdropPress={closeSheet}
        onBackButtonPress={closeSheet}
        style={styles.diningSheetRNModal}
        backdropColor="#000"
        animationIn="slideInUp"
        animationOut="fadeOut"
        animationInTiming={280}
        animationOutTiming={220}
        backdropTransitionInTiming={220}
        backdropTransitionOutTiming={220}
        useNativeDriver
        useNativeDriverForBackdrop={false}
        propagateSwipe
        avoidKeyboard
        hideModalContentWhileAnimating={false}
        coverScreen
        backdropOpacity={0.38}
      >
        <View
          style={[
            styles.diningSheetWrap,
            {
              backgroundColor: theme.card,
              maxHeight: Dimensions.get('window').height * 0.88,
              paddingBottom: Math.max(20, insets.bottom + 14),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.diningSheetClose}
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.diningSheetTitle, { color: theme.text }]} numberOfLines={2}>
            {sheetRow ? `Going to ${sheetRow.venue}` : ''}
          </Text>
          <Text style={[styles.diningSheetSub, { color: theme.textSecondary }]} numberOfLines={1}>
            {sheetRow?.building}
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={[styles.diningSheetScroll, { maxHeight: Dimensions.get('window').height * 0.52 }]}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <Text style={[styles.sheetSectionLabel, { color: theme.textSecondary }]}>Arrive</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {ARRIVAL_MINUTES.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setArrivalMinutes(m)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: arrivalMinutes === m ? theme.primary : theme.surface,
                      borderColor: arrivalMinutes === m ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: arrivalMinutes === m ? theme.buttonText : theme.text,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    {arrivalChipLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.sheetSectionLabel, { color: theme.textSecondary }]}>Staying</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {DURATION_MINUTES.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDurationMinutes(m)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: durationMinutes === m ? theme.primary : theme.surface,
                      borderColor: durationMinutes === m ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: durationMinutes === m ? theme.buttonText : theme.text,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    {durationChipLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.sheetSectionLabel, { color: theme.textSecondary }]}>Who can see I&apos;m going</Text>
            <View style={styles.visibilityRow}>
              {(['everyone', 'friends_only'] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setVisibilityChoice(v)}
                  style={[
                    styles.visOption,
                    {
                      backgroundColor: visibilityChoice === v ? theme.primary + '22' : theme.surface,
                      borderColor: visibilityChoice === v ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={v === 'everyone' ? 'globe-outline' : 'people-outline'}
                    size={18}
                    color={visibilityChoice === v ? theme.primary : theme.textSecondary}
                  />
                  <Text
                    style={{
                      color: visibilityChoice === v ? theme.primary : theme.text,
                      fontWeight: '600',
                      marginLeft: 8,
                      fontSize: 14,
                    }}
                  >
                    {v === 'everyone' ? 'All people' : 'Friends only'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1, marginTop: 8 }]}
            onPress={submitGoing}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={theme.buttonText} />
            ) : (
              <Text style={[styles.confirmBtnText, { color: theme.buttonText }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </RNModal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { fontSize: 15 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  day: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingTop: 10 },
  card: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitleBlock: { flex: 1, minWidth: 0, paddingRight: 4 },
  venue: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  placeHoursLine: { fontSize: 12, marginTop: 4, fontWeight: '600', lineHeight: 16 },
  pill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  goingPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.25,
    zIndex: 10,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  goingPillText: { fontSize: 12, fontWeight: '700' },
  peopleSection: { marginTop: 10 },
  peopleLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  peopleScroll: { flexDirection: 'row', gap: 12, paddingRight: 8 },
  personChip: { alignItems: 'center', width: 64 },
  avatarWrap: { position: 'relative', width: 36, height: 36 },
  cancelGoingBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  personAvatar: { width: 36, height: 36, borderRadius: 18 },
  personAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  personName: { fontSize: 10, marginTop: 4, textAlign: 'center', fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyText: { marginTop: 12, fontSize: 16, textAlign: 'center' },

  diningSheetRNModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  diningSheetWrap: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  diningSheetClose: {
    position: 'absolute',
    right: 12,
    top: 10,
    zIndex: 2,
    padding: 6,
  },
  diningSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingRight: 40,
    marginBottom: 4,
  },
  diningSheetSub: { fontSize: 13, marginBottom: 10 },
  diningSheetScroll: {
    flexGrow: 0,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  visibilityRow: { flexDirection: 'column', gap: 8, marginBottom: 14 },
  visOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  confirmBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700' },
})
