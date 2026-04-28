// VR Optimization Suite — Headset Profile Loader
// Profiles are bundled via static Vite JSON imports (zero filesystem I/O at runtime).
// A dev-mode filesystem scan is also attempted as fallback for new profiles added without rebuilding.

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { HeadsetProfile, HeadsetProfileSummary, ConnectionArchetype } from './types'

// ── Static JSON Imports (bundled at compile time) ─────────────
// Vite/Rollup inlines these — no path resolution issues in dev, build, or packaged app.

// Original 10
import metaQuest3 from './profiles/meta-quest-3.json'
import metaQuest2 from './profiles/meta-quest-2.json'
import metaQuestPro from './profiles/meta-quest-pro.json'
import valveIndex from './profiles/valve-index.json'
import htcVivePro2 from './profiles/htc-vive-pro-2.json'
import pimaxCrystal from './profiles/pimax-crystal.json'
import pico4 from './profiles/pico-4.json'
import hpReverbG2 from './profiles/hp-reverb-g2.json'
import bigscreenBeyond from './profiles/bigscreen-beyond.json'
import sonyPsvr2 from './profiles/sony-psvr2.json'
// Additional 14 profiles
import metaQuest3s from './profiles/meta-quest-3s.json'
import metaQuest1 from './profiles/meta-quest-1.json'
import htcVivePro from './profiles/htc-vive-pro.json'
import htcViveProEye from './profiles/htc-vive-pro-eye.json'
import htcViveXrElite from './profiles/htc-vive-xr-elite.json'
import htcViveFocusVision from './profiles/htc-vive-focus-vision.json'
import htcViveCosmosElite from './profiles/htc-vive-cosmos-elite.json'
import pimaxCrystalLight from './profiles/pimax-crystal-light.json'
import pimax8kx from './profiles/pimax-8kx.json'
import bigscreenBeyond2 from './profiles/bigscreen-beyond-2.json'
import pico4Ultra from './profiles/pico-4-ultra.json'
import hpReverbG1 from './profiles/hp-reverb-g1.json'
import samsungOdysseyPlus from './profiles/samsung-odyssey-plus.json'
import lenovoExplorer from './profiles/lenovo-explorer.json'
// Steam Link profile disabled — selecting the Steam Link streaming option
// was halting the setup wizard. Profile file renamed to _steam-link.json.disabled
// on disk so the dev-scan also skips it. Re-enable by restoring both.
// import steamLink from './profiles/steam-link.json'
// Phase-4 expansion — legacy, prosumer, and 2024/2025 flagships
import metaRiftCv1 from './profiles/meta-rift-cv1.json'
import metaRiftS from './profiles/meta-rift-s.json'
import htcViveOriginal from './profiles/htc-vive-original.json'
import varjoAero from './profiles/varjo-aero.json'
import varjoXr3 from './profiles/varjo-xr-3.json'
import varjoXr4 from './profiles/varjo-xr-4.json'
import shiftallMeganex from './profiles/shiftall-meganex-superlight-8k.json'
import somniumVr1 from './profiles/somnium-vr1.json'
import appleVisionPro from './profiles/apple-vision-pro.json'
import pimaxCrystalSuper from './profiles/pimax-crystal-super.json'
import dpvrE4 from './profiles/dpvr-e4.json'
// Fallback profile for users whose headset we don't ship a dedicated profile for.
// Intentionally placed last in BUNDLED_PROFILES so it sorts to the bottom of the
// brand list under "Other" — always discoverable, never competes with a real match.
import genericUnlisted from './profiles/generic-unlisted.json'

const BUNDLED_PROFILES: unknown[] = [
  // Meta — modern
  metaQuest3,
  metaQuest3s,
  metaQuest2,
  metaQuest1,
  metaQuestPro,
  // Meta — legacy tethered
  metaRiftS,
  metaRiftCv1,
  // Valve
  valveIndex,
  // HTC
  htcVivePro2,
  htcVivePro,
  htcViveProEye,
  htcViveXrElite,
  htcViveFocusVision,
  htcViveCosmosElite,
  htcViveOriginal,
  // Pimax
  pimaxCrystalSuper,
  pimaxCrystal,
  pimaxCrystalLight,
  pimax8kx,
  // Bigscreen
  bigscreenBeyond,
  bigscreenBeyond2,
  // Pico
  pico4,
  pico4Ultra,
  // Varjo (prosumer / enterprise)
  varjoXr4,
  varjoXr3,
  varjoAero,
  // Shiftall
  shiftallMeganex,
  // Somnium
  somniumVr1,
  // Apple
  appleVisionPro,
  // DPVR (budget)
  dpvrE4,
  // HP / Microsoft WMR
  hpReverbG2,
  hpReverbG1,
  samsungOdysseyPlus,
  lenovoExplorer,
  // Sony
  sonyPsvr2,
  // Valve (Steam Link streaming) — disabled, see import note above
  // steamLink,
  // Fallback — users whose headset isn't in the list ("Other → My headset isn't listed")
  genericUnlisted
]

// ── Profile Cache ─────────────────────────────────────────────

let profileCache: HeadsetProfile[] | null = null

// ── Validation ────────────────────────────────────────────────

function validateProfile(data: unknown, source: string): string | null {
  if (!data || typeof data !== 'object') {
    return `${source}: not a valid object`
  }

  const p = data as Record<string, unknown>

  for (const field of ['id', 'brand', 'model', 'type']) {
    if (typeof p[field] !== 'string' || !(p[field] as string).trim()) {
      return `${source}: missing or invalid '${field}'`
    }
  }

  if (typeof p.releaseYear !== 'number' || p.releaseYear < 2012 || p.releaseYear > 2030) {
    return `${source}: invalid releaseYear`
  }

  if (!['standalone-hybrid', 'tethered', 'standalone'].includes(p.type as string)) {
    return `${source}: type must be 'standalone-hybrid', 'tethered', or 'standalone'`
  }

  if (!p.display || typeof p.display !== 'object') {
    return `${source}: missing display`
  }
  const d = p.display as Record<string, unknown>
  if (!Array.isArray(d.resolutionPerEye) || d.resolutionPerEye.length !== 2) {
    return `${source}: invalid display.resolutionPerEye`
  }
  if (!Array.isArray(d.refreshRates) || d.refreshRates.length === 0) {
    return `${source}: invalid display.refreshRates`
  }

  if (!Array.isArray(p.connections) || p.connections.length === 0) {
    return `${source}: must have at least one connection method`
  }

  if (!Array.isArray(p.runtimes) || p.runtimes.length === 0) {
    return `${source}: must have at least one runtime`
  }

  if (!p.tracking || typeof p.tracking !== 'object') {
    return `${source}: missing tracking`
  }

  if (!p.requirements || typeof p.requirements !== 'object') {
    return `${source}: missing requirements`
  }

  return null
}

// ── Dev-mode filesystem scan ──────────────────────────────────

/**
 * In development, also scan the source profiles directory so new JSON files
 * added without rebuilding are picked up. Returns only profiles NOT already
 * bundled (matched by id) to avoid duplicates.
 */
function loadDevProfiles(bundledIds: Set<string>): HeadsetProfile[] {
  // Walk up from out/main/ to find the source tree.
  // out/main/ → ../../src/main/headsets/profiles
  const candidates = [
    join(__dirname, '..', '..', 'src', 'main', 'headsets', 'profiles'),
    join(__dirname, 'profiles') // direct sibling (never true in compiled output, but harmless)
  ]

  const dir = candidates.find((c) => existsSync(c))
  if (!dir) return []

  const extra: HeadsetProfile[] = []

  try {
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.json') && !f.startsWith('_')
    )
    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), 'utf8')
        const data = JSON.parse(raw)
        const err = validateProfile(data, file)
        if (err) {
          console.warn(`[headsets:loader] Skipping invalid profile: ${err}`)
          continue
        }
        const profile = data as HeadsetProfile
        if (!bundledIds.has(profile.id)) {
          extra.push(profile)
        }
      } catch {
        // Skip unreadable files silently
      }
    }
  } catch {
    // Directory unreadable — fine in production
  }

  return extra
}

// ── Public API ────────────────────────────────────────────────

export function loadAllProfiles(forceReload = false): HeadsetProfile[] {
  if (profileCache && !forceReload) return profileCache

  const profiles: HeadsetProfile[] = []

  // 1. Load all bundled profiles first
  for (const raw of BUNDLED_PROFILES) {
    const err = validateProfile(raw, (raw as any)?.id ?? 'unknown')
    if (err) {
      console.warn(`[headsets:loader] Bundled profile invalid: ${err}`)
      continue
    }
    profiles.push(raw as HeadsetProfile)
  }

  // 2. In development, merge additional profiles from the source tree
  const bundledIds = new Set(profiles.map((p) => p.id))
  const extras = loadDevProfiles(bundledIds)
  profiles.push(...extras)

  // Sort by brand, then model. Special case: "Other" always sorts last so the
  // generic/unlisted profile never competes with real brand matches.
  profiles.sort((a, b) => {
    const aIsOther = a.brand.toLowerCase() === 'other'
    const bIsOther = b.brand.toLowerCase() === 'other'
    if (aIsOther && !bIsOther) return 1
    if (bIsOther && !aIsOther) return -1
    const brandCmp = a.brand.localeCompare(b.brand)
    if (brandCmp !== 0) return brandCmp
    return a.model.localeCompare(b.model)
  })

  console.log(`[headsets:loader] Loaded ${profiles.length} headset profiles (${BUNDLED_PROFILES.length} bundled, ${extras.length} dev extras)`)
  profileCache = profiles
  return profiles
}

export function getProfile(id: string): HeadsetProfile | null {
  return loadAllProfiles().find((p) => p.id === id) ?? null
}

export function getProfileSummaries(): HeadsetProfileSummary[] {
  return loadAllProfiles().map((p) => ({
    id: p.id,
    brand: p.brand,
    model: p.model,
    type: p.type,
    connectionArchetypes: [
      ...new Set(p.connections.map((c) => c.archetype))
    ] as ConnectionArchetype[]
  }))
}

export function clearProfileCache(): void {
  profileCache = null
}

export function getBrands(): string[] {
  return [...new Set(loadAllProfiles().map((p) => p.brand))].sort()
}

export function getProfilesByBrand(brand: string): HeadsetProfile[] {
  return loadAllProfiles().filter(
    (p) => p.brand.toLowerCase() === brand.toLowerCase()
  )
}
