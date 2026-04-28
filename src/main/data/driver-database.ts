// Vryionics VR Optimization Suite — GPU Driver Knowledge Base
//
// Tracks known-good and known-problematic GPU driver versions for VR.
// Rules compare the detected GPU driver version against these entries
// and warn about regressions or recommend specific "golden" drivers.

export type DriverVendor = 'NVIDIA' | 'AMD' | 'Intel'
export type DriverStatus = 'golden' | 'recommended' | 'stable' | 'regression' | 'avoid'

export interface DriverEntry {
  vendor: DriverVendor
  /** Driver version string, matched as a substring. e.g. "566.36" or "24.12.1". */
  version: string
  /** Approximate release date (YYYY-MM-DD). */
  releaseDate: string
  status: DriverStatus
  /** Applies to which GPU generation(s) — null = all of vendor's modern cards. */
  applicableGenerations: string[] | null
  /** One-line summary. */
  summary: string
  /** VR-specific notes. */
  notes: string[]
}

// ── NVIDIA Drivers ──────────────────────────────────────────

const nvidiaDrivers: DriverEntry[] = [
  {
    vendor: 'NVIDIA', version: '572', releaseDate: '2025-02-01', status: 'recommended',
    applicableGenerations: ['Blackwell', 'Ada Lovelace', 'Ampere'],
    summary: 'Feb 2025 Game Ready — matured DLSS 4 Multi Frame Generation, VR compositor fixes.',
    notes: [
      'First driver with stable DLSS 4 MFG for Blackwell.',
      'Fixed Ampere VR HAGS flicker introduced in 566.xx series.',
      'Current recommended baseline for RTX 20/30/40/50-series VR users.',
    ],
  },
  {
    vendor: 'NVIDIA', version: '566.36', releaseDate: '2024-11-12', status: 'regression',
    applicableGenerations: ['Ampere'],
    summary: 'VR compositor stutters on RTX 30-series during wireless streaming.',
    notes: [
      'Documented regression: intermittent VR frame stalls on RTX 3060-3090 in AirLink/VD.',
      'If on this driver and wireless VR is unreliable, roll back to 566.14 or forward to 572.xx.',
    ],
  },
  {
    vendor: 'NVIDIA', version: '565.90', releaseDate: '2024-10-08', status: 'golden',
    applicableGenerations: ['Ada Lovelace', 'Ampere', 'Turing'],
    summary: 'Long-term-stable VR driver. Heavily tested across VR titles through Q4 2024.',
    notes: [
      'Community "golden" driver — widely used by VR streamers through 2024-2025.',
      'Safe fallback if newer drivers introduce issues.',
    ],
  },
  {
    vendor: 'NVIDIA', version: '560.94', releaseDate: '2024-08-14', status: 'golden',
    applicableGenerations: ['Ada Lovelace', 'Ampere'],
    summary: 'First driver with reliable AV1 encoding for Virtual Desktop 1.32+.',
    notes: [
      'Introduced DLSS 3.8 transformer model.',
      'Particularly stable for VR streaming workflows.',
    ],
  },
  {
    vendor: 'NVIDIA', version: '555.99', releaseDate: '2024-06-04', status: 'avoid',
    applicableGenerations: ['Ampere'],
    summary: 'Broken HAGS on Ampere caused VR compositor crashes.',
    notes: [
      'Avoid — known to cause SteamVR Error 306 on RTX 30-series when HAGS is enabled.',
      'Disable HAGS as a workaround, or upgrade to 556+ drivers.',
    ],
  },
  {
    vendor: 'NVIDIA', version: '552.22', releaseDate: '2024-04-16', status: 'stable',
    applicableGenerations: ['Ada Lovelace', 'Ampere'],
    summary: 'Solid pre-DLSS-4 baseline. Good for users who want legacy stability.',
    notes: [
      'No DLSS 4 MFG, no AV1 4:2:2, but very stable.',
    ],
  },
]

// ── AMD Drivers (Adrenalin / Pro) ───────────────────────────

const amdDrivers: DriverEntry[] = [
  {
    vendor: 'AMD', version: '25.1.1', releaseDate: '2025-01-15', status: 'recommended',
    applicableGenerations: ['RDNA4', 'RDNA3', 'RDNA2'],
    summary: 'First driver with FSR 4 (RDNA4-exclusive ML upscaling).',
    notes: [
      'FSR 4 is Radeon RX 9000-series only — other RDNA cards get FSR 3.1.',
      'VR compositor improvements for AMF AV1 on VCN 4.0+.',
      'Current recommended baseline for all RDNA2+ VR users.',
    ],
  },
  {
    vendor: 'AMD', version: '24.12.1', releaseDate: '2024-12-10', status: 'golden',
    applicableGenerations: ['RDNA3', 'RDNA2'],
    summary: 'December 2024 stable release with Frame Gen fixes.',
    notes: [
      'FSR 3 Frame Generation stabilized for VR titles.',
      'Fixes for RX 7900-series VR compositor stall.',
    ],
  },
  {
    vendor: 'AMD', version: '24.10.2', releaseDate: '2024-10-18', status: 'regression',
    applicableGenerations: ['RDNA2'],
    summary: 'RX 6000-series VR sporadic black screen — fixed in 24.11+.',
    notes: [
      'Known regression: intermittent 1-frame black flashes on RX 6700/6800/6900 in VR compositors.',
      'Roll back to 24.9.1 or forward to 24.11+ to avoid.',
    ],
  },
  {
    vendor: 'AMD', version: '24.9.1', releaseDate: '2024-09-17', status: 'golden',
    applicableGenerations: ['RDNA3', 'RDNA2'],
    summary: 'Long-lived stable AMD driver — widely adopted through Q4 2024.',
    notes: [
      'Community fallback when newer drivers introduce VR regressions.',
    ],
  },
  {
    vendor: 'AMD', version: '24.6.1', releaseDate: '2024-06-25', status: 'stable',
    applicableGenerations: ['RDNA3', 'RDNA2'],
    summary: 'Pre-FSR3 maturity. VR workable but FSR3 support limited.',
    notes: [
      'Stable but lacks FSR 3.1 Frame Gen refinements.',
    ],
  },
]

// ── Intel Arc / Xe Drivers ──────────────────────────────────

const intelDrivers: DriverEntry[] = [
  {
    vendor: 'Intel', version: '32.0.101.6127', releaseDate: '2025-01-28', status: 'recommended',
    applicableGenerations: ['Arc Battlemage', 'Arc Alchemist'],
    summary: 'XeSS 2 with Frame Generation for Battlemage. VR compositor fixes.',
    notes: [
      'Substantial VR improvements for Arc A750/A770 DX12 titles.',
      'Introduces XeSS 2 Frame Gen (Battlemage-only).',
      'Current recommended baseline for Arc VR users.',
    ],
  },
  {
    vendor: 'Intel', version: '32.0.101.5972', releaseDate: '2024-12-10', status: 'golden',
    applicableGenerations: ['Arc Alchemist'],
    summary: 'Mature Alchemist driver. Solid for VR after months of DX12 refinement.',
    notes: [
      'ReBAR is mandatory — verify before reporting performance issues.',
    ],
  },
  {
    vendor: 'Intel', version: '31.0.101.5445', releaseDate: '2024-07-03', status: 'regression',
    applicableGenerations: ['Arc Alchemist'],
    summary: 'VR audio desync on Arc A770 — fixed in 31.0.101.5590.',
    notes: [
      'Audio drift > 100ms during long VR sessions. Update past 5590.',
    ],
  },
]

// ── Combined Export ─────────────────────────────────────────

export const DRIVER_DATABASE: DriverEntry[] = [
  ...nvidiaDrivers,
  ...amdDrivers,
  ...intelDrivers,
]

/**
 * Find a matching driver entry by vendor + version substring. Used by
 * rules to surface status ("golden" / "regression" / "avoid") for the
 * detected driver.
 */
export function findDriverEntry(vendor: DriverVendor, version: string): DriverEntry | null {
  if (!version) return null
  for (const entry of DRIVER_DATABASE) {
    if (entry.vendor !== vendor) continue
    if (version.includes(entry.version)) return entry
  }
  return null
}

/**
 * Return the latest recommended driver for a vendor + generation.
 * Used to suggest upgrades from regression / avoid drivers.
 */
export function getRecommendedDriver(vendor: DriverVendor, generation: string | null): DriverEntry | null {
  const candidates = DRIVER_DATABASE.filter(
    (e) =>
      e.vendor === vendor &&
      (e.status === 'recommended' || e.status === 'golden') &&
      (e.applicableGenerations === null ||
        generation === null ||
        e.applicableGenerations.some((g) => generation.includes(g) || g.includes(generation)))
  )
  if (candidates.length === 0) return null
  // Most-recent first
  candidates.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
  return candidates[0]
}
