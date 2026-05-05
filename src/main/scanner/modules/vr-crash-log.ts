// VR Optimization Suite — SteamVR Crash Log Analyzer
// Reads the SteamVR log directory and extracts recent crash / fatal-error events.
// Runs as part of the vr-runtime scan; produces VrCrashEvent[] for the rules layer.

import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { VrCrashEvent, VrCrashSignature } from '../types'

// Consider only events from the last 7 days — older issues are usually
// already-resolved driver/runtime churn and would create noise.
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Don't process log files larger than this — SteamVR logs can balloon to
// hundreds of MB on dev rigs and we only need the tail.
const MAX_LOG_BYTES = 2 * 1024 * 1024

// Cap the number of events surfaced to the UI — otherwise one bad driver
// can produce hundreds of nearly-identical entries.
const MAX_EVENTS_PER_FILE = 25


const STEAM_LOG_CANDIDATES = [
  'C:\\Program Files (x86)\\Steam\\logs',
  'C:\\Program Files\\Steam\\logs',
  `${process.env.PROGRAMFILES ?? ''}\\Steam\\logs`,
  `${process.env['PROGRAMFILES(X86)'] ?? ''}\\Steam\\logs`,
].filter((p) => p && !p.startsWith('\\'))

const LOG_FILES: Array<{ name: string; source: VrCrashEvent['source'] }> = [
  { name: 'vrserver.txt',     source: 'vrserver'     },
  { name: 'vrcompositor.txt', source: 'vrcompositor' },
  { name: 'vrdashboard.txt',  source: 'vrdashboard'  },
  { name: 'vrmonitor.txt',    source: 'vrmonitor'    },
]

// Ordered by specificity — the first match wins, so put precise codes first.

interface SignatureMatcher {
  signature: VrCrashSignature
  // Case-insensitive substring checks; all substrings must match.
  requires: string[]
  // If any of these match, skip (false positive guards).
  excludes?: string[]
}

const MATCHERS: SignatureMatcher[] = [
  // Exception codes — most precise
  { signature: 'access-violation', requires: ['0xc0000005'] },
  { signature: 'stack-overflow',   requires: ['0xc0000409'] },

  // SteamVR error code patterns
  { signature: 'shared-ipc',       requires: ['error', '309'] },
  { signature: 'overlay-conflict', requires: ['error', '306'] },
  { signature: 'overlay-conflict', requires: ['error', '307'] },
  { signature: 'init-failure',     requires: ['error', '108'] },
  { signature: 'init-failure',     requires: ['error', '109'] },
  { signature: 'init-failure',     requires: ['error', '300'] },
  { signature: 'init-failure',     requires: ['error', '301'] },

  // GPU device-removed / driver crash
  { signature: 'gpu-crash', requires: ['dxgi_error_device_removed'] },
  { signature: 'gpu-crash', requires: ['nvlddmkm'] },
  { signature: 'gpu-crash', requires: ['device removed'] },

  // Driver mismatch / load failure
  { signature: 'driver-mismatch', requires: ['failed to load driver'] },
  { signature: 'driver-mismatch', requires: ['driver version mismatch'] },
  { signature: 'driver-mismatch', requires: ['bad driver'] },

  // Last-resort: generic crash wording
  { signature: 'unknown', requires: ['unhandled exception'] },
  { signature: 'unknown', requires: ['fatal error'], excludes: ['recovered'] },
  { signature: 'unknown', requires: ['process terminated unexpectedly'] },
]

function classifyLine(lineLower: string): VrCrashSignature | null {
  for (const m of MATCHERS) {
    if (m.requires.every((sub) => lineLower.includes(sub))) {
      if (m.excludes?.some((sub) => lineLower.includes(sub))) continue
      return m.signature
    }
  }
  return null
}

//
// SteamVR log lines typically start with "Tue Apr 15 2025 18:44:02.512" or
// "Wed Jan 03 2024 09:11:55.200". Date.parse handles that directly on Windows.

const TIMESTAMP_RE = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4} \d{2}:\d{2}:\d{2}/

function tryParseTimestamp(line: string, fallbackMs: number): number {
  const match = line.match(TIMESTAMP_RE)
  if (!match) return fallbackMs
  const parsed = Date.parse(match[0])
  return Number.isFinite(parsed) ? parsed : fallbackMs
}


function findSteamLogDir(): string | null {
  for (const p of STEAM_LOG_CANDIDATES) {
    if (existsSync(p)) return p
  }
  return null
}


function scanLogFile(path: string, source: VrCrashEvent['source']): VrCrashEvent[] {
  let size = 0
  let mtime = Date.now()
  try {
    const st = statSync(path)
    size = st.size
    mtime = st.mtimeMs
  } catch { return [] }

  if (size === 0) return []
  if (mtime < Date.now() - RECENT_WINDOW_MS) return []  // file not touched recently

  let text: string
  try {
    if (size > MAX_LOG_BYTES) {
      // For huge files, read the last MAX_LOG_BYTES bytes only
      const fd = require('fs').openSync(path, 'r')
      try {
        const buf = Buffer.alloc(MAX_LOG_BYTES)
        require('fs').readSync(fd, buf, 0, MAX_LOG_BYTES, size - MAX_LOG_BYTES)
        text = buf.toString('utf8')
      } finally {
        require('fs').closeSync(fd)
      }
    } else {
      text = readFileSync(path, 'utf8')
    }
  } catch { return [] }

  const out: VrCrashEvent[] = []
  const now = Date.now()
  const lines = text.split(/\r?\n/)

  // Walk lines newest-to-oldest by iterating in reverse, so we naturally
  // collect the most recent crashes first and can bail early at the cap.
  for (let i = lines.length - 1; i >= 0 && out.length < MAX_EVENTS_PER_FILE; i--) {
    const line = lines[i]
    if (!line) continue
    const sig = classifyLine(line.toLowerCase())
    if (!sig) continue

    const ts = tryParseTimestamp(line, mtime)
    if (ts < now - RECENT_WINDOW_MS) break  // all earlier lines are too old

    out.push({
      source,
      timestamp: ts,
      signature: sig,
      excerpt: line.trim().slice(0, 160)
    })
  }

  return out
}


export function scanVrCrashEvents(): VrCrashEvent[] {
  const dir = findSteamLogDir()
  if (!dir) return []

  const all: VrCrashEvent[] = []
  for (const { name, source } of LOG_FILES) {
    const path = join(dir, name)
    try {
      all.push(...scanLogFile(path, source))
    } catch {
      // Individual log failure shouldn't break the scan
    }
  }

  // Sort newest-first
  all.sort((a, b) => b.timestamp - a.timestamp)

  // De-duplicate near-identical events (same signature + same excerpt) within
  // a 60-second window — one "crash" usually writes 5-10 nearly-identical lines.
  const deduped: VrCrashEvent[] = []
  for (const evt of all) {
    const recentDuplicate = deduped.find(
      (d) =>
        d.signature === evt.signature &&
        d.source === evt.source &&
        Math.abs(d.timestamp - evt.timestamp) < 60_000 &&
        d.excerpt.slice(0, 40) === evt.excerpt.slice(0, 40)
    )
    if (!recentDuplicate) deduped.push(evt)
  }

  return deduped.slice(0, 30)  // hard cap for the whole set
}
