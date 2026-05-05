// Accent, glass intensity, reduced motion. Persists via api.config.

import { create } from 'zustand'

export type AccentColor = 'purple' | 'blue' | 'cyan' | 'green' | 'orange'

const ACCENT_MAP: Record<AccentColor, { primary: string; rgb: string; secondary: string; text: string }> = {
  purple: { primary: '#7c5bf5', rgb: '124,91,245',  secondary: '#5b9bf5', text: '#c4b5fd' },
  blue:   { primary: '#3b82f6', rgb: '59,130,246',  secondary: '#60a5fa', text: '#93c5fd' },
  cyan:   { primary: '#06b6d4', rgb: '6,182,212',   secondary: '#22d3ee', text: '#67e8f9' },
  green:  { primary: '#10b981', rgb: '16,185,129',  secondary: '#34d399', text: '#6ee7b7' },
  orange: { primary: '#f59e0b', rgb: '245,158,11',  secondary: '#fbbf24', text: '#fcd34d' }
}

function applyCssVars(accent: AccentColor, glassOpacity: number): void {
  const { primary, rgb, secondary, text } = ACCENT_MAP[accent]
  const root = document.documentElement
  root.style.setProperty('--accent-primary',   primary)
  root.style.setProperty('--accent',           primary)   // alias — some components use var(--accent)
  root.style.setProperty('--accent-rgb',       rgb)
  root.style.setProperty('--accent-secondary', secondary)
  root.style.setProperty('--accent-text',      text)      // light tint for button/label text
  root.style.setProperty('--glass-opacity',    String(glassOpacity))

  // Accent-tinted background — four overlapping radial glows at considerably
  // stronger opacity than before. This is the *static* layer; the animated
  // orbs in <AmbientBackground /> float on top and bring the
  // "Avatar / Pandora bioluminescence" feel.
  //
  // Opacities tuned so the accent is clearly present but content text stays
  // legible over it. Test by cycling accent colors in Settings → Appearance
  // and watching the preview strip remain readable.
  root.style.setProperty(
    '--bg-gradient',
    // Top-left bright glow — primary light source
    `radial-gradient(ellipse 1100px 800px at 10% -10%,  rgba(${rgb}, 0.28) 0%, transparent 55%),` +
    // Bottom-right secondary
    `radial-gradient(ellipse 1000px 700px at 92% 108%, rgba(${rgb}, 0.20) 0%, transparent 50%),` +
    // Top-right warm fill
    `radial-gradient(ellipse 600px 500px at 95% 8%,    rgba(${rgb}, 0.14) 0%, transparent 55%),` +
    // Mid-center ambient wash — carries the accent through the page middle
    `radial-gradient(ellipse 800px 600px at 50% 55%,   rgba(${rgb}, 0.08) 0%, transparent 65%)`
  )

  // Parse "r,g,b" into components once so the tinted base background can
  // lean a couple percent toward the accent — prevents the bottom of long
  // pages (below the gradients) looking flat-black.
  const [r, g, b] = rgb.split(',').map((s) => parseInt(s.trim(), 10))
  const tr = Math.round(10 + r * 0.04)
  const tg = Math.round(10 + g * 0.04)
  const tb = Math.round(20 + b * 0.04)
  root.style.setProperty('--bg-color-tinted', `rgb(${tr}, ${tg}, ${tb})`)
}

interface ThemeState {
  accent: AccentColor
  glassOpacity: number   // 0.6 – 0.95
  reducedMotion: boolean
  loaded: boolean

  setAccent: (color: AccentColor) => void
  setGlassOpacity: (v: number) => void
  setReducedMotion: (v: boolean) => void
  loadFromStorage: () => Promise<void>
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  accent: 'purple',
  glassOpacity: 0.85,
  reducedMotion: false,
  loaded: false,

  setAccent: (color) => {
    set({ accent: color })
    applyCssVars(color, get().glassOpacity)
    try { (window as any).api?.config?.set('theme.accent', color) } catch { /* ignore */ }
  },

  setGlassOpacity: (v) => {
    set({ glassOpacity: v })
    applyCssVars(get().accent, v)
    try { (window as any).api?.config?.set('theme.glassOpacity', v) } catch { /* ignore */ }
  },

  setReducedMotion: (v) => {
    set({ reducedMotion: v })
    document.documentElement.classList.toggle('reduce-motion', v)
    try { (window as any).api?.config?.set('theme.reducedMotion', v) } catch { /* ignore */ }
  },

  loadFromStorage: async () => {
    try {
      const api = (window as any).api
      const accent = (await api?.config?.get('theme.accent')) as AccentColor | null
      const opacity = (await api?.config?.get('theme.glassOpacity')) as number | null
      const motion = (await api?.config?.get('theme.reducedMotion')) as boolean | null

      const resolvedAccent = accent ?? 'purple'
      const resolvedOpacity = opacity ?? 0.85
      const resolvedMotion = motion ?? false

      set({ accent: resolvedAccent, glassOpacity: resolvedOpacity, reducedMotion: resolvedMotion, loaded: true })
      applyCssVars(resolvedAccent, resolvedOpacity)
      if (resolvedMotion) document.documentElement.classList.add('reduce-motion')
    } catch {
      set({ loaded: true })
      applyCssVars('purple', 0.85)
    }
  }
}))
