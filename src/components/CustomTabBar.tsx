import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface CustomTabBarProps {
  state: any
  descriptors: any
  navigation: any
  pendingCount: number
}

export default function CustomTabBar({ state, descriptors, navigation, pendingCount }: CustomTabBarProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  const getTabIcon = (routeName: string, focused: boolean) => {
    let iconName: keyof typeof Ionicons.glyphMap

    switch (routeName) {
      case 'Events':
        iconName = focused ? 'calendar' : 'calendar-outline'
        break
      case 'Leaderboard':
        iconName = focused ? 'trophy' : 'trophy-outline'
        break
      case 'Host':
        iconName = focused ? 'add-circle' : 'add-circle-outline'
        break
      case 'Friends':
        iconName = focused ? 'people' : 'people-outline'
        break
      case 'Profile':
        iconName = focused ? 'person' : 'person-outline'
        break
      default:
        iconName = 'help-outline'
    }

    return <Ionicons name={iconName} size={26} color={focused ? theme.tabBarActive : theme.tabBarInactive} />
  }

  const renderTab = (route: any, index: number) => {
    const { options } = descriptors[route.key]
    const label = options.tabBarLabel !== undefined
      ? options.tabBarLabel
      : options.title !== undefined
      ? options.title
      : route.name

    const isFocused = state.index === index

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      })

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name)
      }
    }

    // Special handling for Friends tab with notification badge
    if (route.name === 'Friends') {
      return (
        <TouchableOpacity
          key={route.key}
          onPress={onPress}
          style={styles.tabItem}
        >
          <View style={{ position: 'relative' }}>
            {getTabIcon(route.name, isFocused)}
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={[
            styles.tabLabel,
            { color: isFocused ? theme.tabBarActive : theme.tabBarInactive }
          ]}>
            {label}
          </Text>
        </TouchableOpacity>
      )
    }

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        style={styles.tabItem}
      >
        {getTabIcon(route.name, isFocused)}
        <Text style={[
          styles.tabLabel,
          { color: isFocused ? theme.tabBarActive : theme.tabBarInactive }
        ]}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.tabBar, { 
      backgroundColor: theme.tabBarBackground,
      paddingBottom: insets.bottom 
    }]}>
      <View style={styles.tabBarContent}>
        {state.routes.map((route: any, index: number) => renderTab(route, index))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    height: 90,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  tabBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 0,
    flex: 1,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
})