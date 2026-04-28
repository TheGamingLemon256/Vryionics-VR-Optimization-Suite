// Vryionics VR Optimization Suite — Toast Notifier
//
// Wraps Electron's Notification API with deduplication and a per-event
// rate limit so we don't spam the user every poll cycle. Used for:
//   • Thermal throttling detected during a VR session
//   • Critical scan finding appeared after a previously-clean state
//   • Driver update goes from "current" → "outdated"
//   • Live Optimizer auto-enabled / disabled (one-shot at session start)

import { Notification } from 'electron'
import { log } from './logger'

export type NotifyKind =
  | 'thermal'
  | 'critical-finding'
  | 'driver-outdated'
  | 'liveopt-enabled'
  | 'liveopt-disabled'
  | 'session-saved'
  | 'generic'

interface RateState {
  /** Last time a notification of this kind fired. */
  lastAt: number
  /** Hash of the last body — suppress identical repeats. */
  lastBodyHash: string
}

const COOLDOWN_MS: Record<NotifyKind, number> = {
  thermal: 5 * 60 * 1000,           // 5 min — don't spam during sustained thermal events
  'critical-finding': 60 * 60 * 1000, // 1 hr
  'driver-outdated': 24 * 60 * 60 * 1000, // daily
  'liveopt-enabled': 60 * 1000,     // 1 min — VR sessions can flicker briefly
  'liveopt-disabled': 60 * 1000,
  'session-saved': 30 * 1000,
  generic: 30 * 1000,
}

const state: Record<NotifyKind, RateState> = {
  thermal: { lastAt: 0, lastBodyHash: '' },
  'critical-finding': { lastAt: 0, lastBodyHash: '' },
  'driver-outdated': { lastAt: 0, lastBodyHash: '' },
  'liveopt-enabled': { lastAt: 0, lastBodyHash: '' },
  'liveopt-disabled': { lastAt: 0, lastBodyHash: '' },
  'session-saved': { lastAt: 0, lastBodyHash: '' },
  generic: { lastAt: 0, lastBodyHash: '' },
}

function hash(s: string): string {
  // Trivial 32-bit hash, sufficient for "is this the exact same body"
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h.toString(36)
}

export function notify(kind: NotifyKind, title: string, body: string): boolean {
  if (!Notification.isSupported()) return false

  const now = Date.now()
  const rs = state[kind]
  const bodyHash = hash(body)

  if (now - rs.lastAt < COOLDOWN_MS[kind] && rs.lastBodyHash === bodyHash) {
    return false
  }

  try {
    const n = new Notification({ title, body, silent: false })
    n.show()
    rs.lastAt = now
    rs.lastBodyHash = bodyHash
    log.info('notifier', `Toast (${kind}): ${title} — ${body}`)
    return true
  } catch (err) {
    log.warn('notifier', `Toast failed: ${(err as Error).message}`)
    return false
  }
}

/** Reset all cooldowns — used by tests / Settings "test notification" button. */
export function resetCooldowns(): void {
  for (const k of Object.keys(state) as NotifyKind[]) {
    state[k] = { lastAt: 0, lastBodyHash: '' }
  }
}
