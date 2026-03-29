/**
 * Apple Invites–style card backgrounds. Keys are stored in `invite_theme_color` on events / org_events.
 * `default` = no custom theme (use app surface/card in UI).
 */
export const INVITE_THEME_KEYS = [
  'default',
  'slate',
  'ocean',
  'rose',
  'forest',
  'terracotta',
  'lavender',
  'sunshine',
] as const

export type InviteThemeKey = (typeof INVITE_THEME_KEYS)[number]

type ThemeDef = {
  light: [string, string]
  dark: [string, string]
  /** Title / primary text on this invite background */
  titleLight: string
  titleDark: string
  secondaryLight: string
  secondaryDark: string
}

const DEFS: Record<InviteThemeKey, ThemeDef> = {
  default: {
    light: ['#f5f6f8', '#ffffff'],
    dark: ['#2d2d2d', '#1e1e1e'],
    titleLight: '#2c3e50',
    titleDark: '#ffffff',
    secondaryLight: '#7f8c8d',
    secondaryDark: '#b3b3b3',
  },
  slate: {
    light: ['#e4e8ef', '#cdd5e1'],
    dark: ['#3d4656', '#2d3342'],
    titleLight: '#1e2937',
    titleDark: '#f1f5f9',
    secondaryLight: '#475569',
    secondaryDark: '#cbd5e1',
  },
  ocean: {
    light: ['#d6ecff', '#b8ddf8'],
    dark: ['#1a3a52', '#0f2a3d'],
    titleLight: '#0c2d43',
    titleDark: '#e0f2fe',
    secondaryLight: '#1e5a7a',
    secondaryDark: '#93c5ef',
  },
  rose: {
    light: ['#fce4ec', '#f8bbd0'],
    dark: ['#4a2430', '#351820'],
    titleLight: '#4a148c',
    titleDark: '#fce4ec',
    secondaryLight: '#880e4f',
    secondaryDark: '#f8bbd0',
  },
  forest: {
    light: ['#e8f5e9', '#c8e6c9'],
    dark: ['#1b2e24', '#152018'],
    titleLight: '#1b5e20',
    titleDark: '#e8f5e9',
    secondaryLight: '#2e7d32',
    secondaryDark: '#a5d6a7',
  },
  terracotta: {
    light: ['#fbe9e7', '#ffccbc'],
    dark: ['#3e2723', '#2d1b18'],
    titleLight: '#5d4037',
    titleDark: '#ffccbc',
    secondaryLight: '#8d4e37',
    secondaryDark: '#d7a48f',
  },
  lavender: {
    light: ['#ede7f6', '#d1c4e9'],
    dark: ['#312445', '#241835'],
    titleLight: '#4527a0',
    titleDark: '#ede7f6',
    secondaryLight: '#5e35b1',
    secondaryDark: '#b39ddb',
  },
  sunshine: {
    light: ['#fff8e1', '#ffecb3'],
    dark: ['#4a3e10', '#2d2608'],
    titleLight: '#b45309',
    titleDark: '#fff8e1',
    secondaryLight: '#c2410c',
    secondaryDark: '#fde68a',
  },
}

export function normalizeInviteThemeKey(raw: string | null | undefined): InviteThemeKey {
  if (!raw || raw === 'default') return 'default'
  const k = String(raw).trim()
  // Legacy DB value — too close to app chrome; map away
  if (k === 'charcoal') return 'default'
  const kk = k as InviteThemeKey
  return (INVITE_THEME_KEYS as readonly string[]).includes(kk) ? kk : 'default'
}

export function getInviteThemeGradient(key: InviteThemeKey, isDark: boolean): [string, string] {
  const def = DEFS[key]
  return isDark ? def.dark : def.light
}

export function getInviteThemeTextColors(key: InviteThemeKey, isDark: boolean) {
  const def = DEFS[key]
  return {
    title: isDark ? def.titleDark : def.titleLight,
    secondary: isDark ? def.secondaryDark : def.secondaryLight,
  }
}

export function nextInviteThemeKey(current: InviteThemeKey): InviteThemeKey {
  const i = INVITE_THEME_KEYS.indexOf(current)
  const next = (i + 1) % INVITE_THEME_KEYS.length
  return INVITE_THEME_KEYS[next]
}
