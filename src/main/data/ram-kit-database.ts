// Vryionics VR Optimization Suite — RAM Kit Knowledge Base
//
// Known-good and known-problematic RAM kits for VR. WMI / SMBIOS gives us
// Manufacturer and partial PartNumber reliably, so matching is done on
// vendor + capacity + speed signature rather than exact SKU.
//
// VR-specific RAM concerns:
//   • AMD AM5 EXPO compatibility — some vendor kits fail at DDR5-6000 EXPO
//   • Intel 13/14th-gen DDR5-6400+ — memory training instability on some
//     kits (mostly fixed via BIOS by late 2024)
//   • Low-CL kits (CL30 on DDR5-6000) vs high-CL "budget" DDR5-6000
//   • Four-stick configurations — most consumer boards can't run four
//     DDR5 sticks at rated speed (see MIXED_RAM_GUIDANCE in cpu-database)

// ── Types ────────────────────────────────────────────────────

export type RamVendor =
  | 'G.Skill'
  | 'Corsair'
  | 'Kingston'
  | 'Crucial'
  | 'Micron'
  | 'Samsung'
  | 'TeamGroup'
  | 'Patriot'
  | 'ADATA'
  | 'XPG'
  | 'Klevv'
  | 'Lexar'
  | 'Mushkin'
  | 'Unknown'

export interface RamKitEntry {
  /**
   * Manufacturer substrings to match against Win32_PhysicalMemory.Manufacturer.
   * WMI reports these inconsistently — e.g. "G Skill International", "G.Skill",
   * "GSkill Intl" all appear depending on BIOS. Use loose matching.
   */
  manufacturerPatterns: string[]
  vendor: RamVendor
  /** Human-readable line name, e.g. "Trident Z5 Neo EXPO". */
  lineName: string
  /**
   * Speed + CL signature used for matching. Both fields are required for
   * identification — a 6000 MHz CL30 kit is very different from 6000 CL36.
   */
  speedMHz: number
  casLatency: number
  /** Memory type. */
  type: 'DDR4' | 'DDR5'
  /** Platform compatibility. Not exclusive — same sticks often run on both. */
  platforms: Array<'Intel XMP' | 'AMD EXPO' | 'Both'>
  /** VR suitability rating for this specific kit. */
  vrSuitability: 'excellent' | 'good' | 'mediocre' | 'poor'
  /** One-liner for UI display. */
  oneLiner: string
  /** VR-specific quirks and known issues. */
  quirks: string[]
}

// ── DDR5 Kits (AM5 / LGA1700 / LGA1851) ─────────────────────

const ddr5Kits: RamKitEntry[] = [
  {
    manufacturerPatterns: ['g skill', 'g.skill', 'gskill'],
    vendor: 'G.Skill',
    lineName: 'Trident Z5 Neo / Trident Z5 RGB (6000 CL30)',
    speedMHz: 6000,
    casLatency: 30,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'excellent',
    oneLiner: 'Gold-standard AM5 VR kit. DDR5-6000 CL30 EXPO, Hynix A/M-die.',
    quirks: [
      'Uses high-bin Hynix A-die or M-die depending on batch — both excellent for VR.',
      'EXPO profiles validated by AMD for 7800X3D / 9800X3D at FCLK 2000 in 1:1 mode.',
      'Runs equally well on Intel 13/14th-gen XMP at DDR5-6000 CL30.',
      'If instability on 14900K: enable "Memory Context Restore = Disabled" in BIOS — it can cause boot failures on some boards.',
    ],
  },
  {
    manufacturerPatterns: ['corsair'],
    vendor: 'Corsair',
    lineName: 'Dominator Titanium / Vengeance RGB (6000-6400 CL30-32)',
    speedMHz: 6000,
    casLatency: 30,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'excellent',
    oneLiner: 'Premium AM5-optimized kit. Excellent for VR; tight subtimings.',
    quirks: [
      'Dominator Titanium line uses top-bin Hynix A-die — handles tight subtimings well.',
      'AMD EXPO certified for 7800X3D / 9800X3D in 1:1 FCLK mode.',
      'Higher price point than G.Skill Trident Z5 Neo but equivalent VR performance.',
    ],
  },
  {
    manufacturerPatterns: ['kingston'],
    vendor: 'Kingston',
    lineName: 'Fury Beast / Fury Renegade (5600-6400)',
    speedMHz: 6000,
    casLatency: 36,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'Reliable mid-range DDR5. CL36 is OK but not optimal — G.Skill CL30 is meaningfully better for VR.',
    quirks: [
      'Fury Beast DDR5-6000 CL36 is widespread but latency is ~5 ns higher than CL30 kits — measurable in VRChat.',
      'Fury Renegade with lower CL timings (CL32) is substantially better for VR than Beast CL36.',
      'XMP-only on some SKUs — double-check that your specific kit has EXPO if on AMD.',
    ],
  },
  {
    manufacturerPatterns: ['crucial', 'micron'],
    vendor: 'Crucial',
    lineName: 'Crucial Pro / Crucial DDR5 (4800-5600)',
    speedMHz: 5600,
    casLatency: 46,
    type: 'DDR5',
    platforms: ['Intel XMP'],
    vrSuitability: 'mediocre',
    oneLiner: 'Stock-speed Crucial DDR5. Fine for general use, but high CL limits VR potential.',
    quirks: [
      'JEDEC-baseline kits (DDR5-5600 CL46) have significantly higher memory latency than AM5-optimized kits.',
      'Pairing with a 7800X3D loses ~10-15% of the V-Cache benefit vs a CL30 kit.',
      'Upgrade target: any CL30 DDR5-6000 kit is a meaningful VR performance improvement.',
      'OEM / pre-built systems often ship this — check RAM model if upgrading from a pre-built for VR.',
    ],
  },
  {
    manufacturerPatterns: ['team', 'teamgroup'],
    vendor: 'TeamGroup',
    lineName: 'T-Force Delta RGB / T-Create Expert (6000 CL30)',
    speedMHz: 6000,
    casLatency: 30,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'excellent',
    oneLiner: 'TeamGroup\'s top EXPO kit. Performance parity with G.Skill at lower price.',
    quirks: [
      'T-Create Expert AMD EXPO 6000 CL30 uses Hynix A-die — equivalent to G.Skill Trident Z5 Neo.',
      'Price-performance leader in the "enthusiast EXPO" tier.',
      'T-Force Delta (RGB) same silicon, more expensive for the RGB.',
    ],
  },
  {
    manufacturerPatterns: ['xpg', 'adata'],
    vendor: 'XPG',
    lineName: 'Lancer Blade / Lancer RGB (6000-6400 CL30-32)',
    speedMHz: 6000,
    casLatency: 30,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'XPG Lancer — solid mid-tier AM5 EXPO kit.',
    quirks: [
      'Mixed Hynix / Samsung-die batches — variance in manual tuning ceiling.',
      'EXPO profiles boot cleanly on most B650/X670 boards.',
      'Slightly softer subtimings than G.Skill Trident Z5 Neo but close enough that VR impact is <2%.',
    ],
  },
  {
    manufacturerPatterns: ['klevv'],
    vendor: 'Klevv',
    lineName: 'Cras V RGB / Cras C930 (6000 CL30)',
    speedMHz: 6000,
    casLatency: 30,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'Klevv Cras V — Hynix die, tight timings, strong AM5 performer.',
    quirks: [
      'Owned by SK Hynix — uses native Hynix dies, generally good binning.',
      'Less visibility in VR community than G.Skill / Corsair but technically equivalent at same spec.',
    ],
  },
  {
    manufacturerPatterns: ['patriot'],
    vendor: 'Patriot',
    lineName: 'Viper Venom / Viper Elite 5 (6000 CL30-36)',
    speedMHz: 6000,
    casLatency: 36,
    type: 'DDR5',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'Value AM5 EXPO kit. CL36 is behind CL30 kits but budget-friendly.',
    quirks: [
      'CL36 variant is ~3-5% slower than CL30 kits in VR benchmarks.',
      'Viper Elite 5 (newer) tends to have better binning than Viper Venom.',
      'Good choice when budget-constrained; CL30 G.Skill is better if budget allows.',
    ],
  },
]

// ── DDR4 Kits (AM4 / LGA1151/1200) ──────────────────────────

const ddr4Kits: RamKitEntry[] = [
  {
    manufacturerPatterns: ['g skill', 'g.skill', 'gskill'],
    vendor: 'G.Skill',
    lineName: 'Ripjaws V / Trident Z RGB (3600 CL16)',
    speedMHz: 3600,
    casLatency: 16,
    type: 'DDR4',
    platforms: ['Both'],
    vrSuitability: 'excellent',
    oneLiner: 'AM4 Zen 3 sweet-spot kit. DDR4-3600 CL16 EXPO/XMP at FCLK 1800 in 1:1.',
    quirks: [
      'Samsung B-die on Trident Z RGB 3600 CL16 — gold-standard DDR4 silicon for Ryzen.',
      'Ripjaws V is budget version with Hynix or Micron — still solid for VR.',
      'XMP profile achieves FCLK 1800 MHz on AM4 in 1:1 mode — lowest latency for Zen 2/3.',
    ],
  },
  {
    manufacturerPatterns: ['corsair'],
    vendor: 'Corsair',
    lineName: 'Vengeance LPX / Vengeance RGB Pro (3600 CL18)',
    speedMHz: 3600,
    casLatency: 18,
    type: 'DDR4',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'Widely-shipped DDR4-3600. CL18 is OK; CL16 G.Skill is slightly better for VR.',
    quirks: [
      'CL18 kits add ~1ns latency vs CL16 — small but measurable in CPU-bound VR.',
      'Vengeance RGB Pro SL (shorter) has better binning on AMD systems than regular Vengeance RGB Pro.',
    ],
  },
  {
    manufacturerPatterns: ['kingston'],
    vendor: 'Kingston',
    lineName: 'Fury Beast DDR4 (3200-3600)',
    speedMHz: 3200,
    casLatency: 16,
    type: 'DDR4',
    platforms: ['Both'],
    vrSuitability: 'good',
    oneLiner: 'Common OEM DDR4. DDR4-3200 CL16 works; upgrade to 3600 for AM4 Zen 3 ideal.',
    quirks: [
      'DDR4-3200 CL16 is fine but leaves FCLK headroom on the table (Zen 3 wants 3600+ for 1:1).',
      'Upgrade to DDR4-3600 CL16 kit for ~5% VR gain on Ryzen 5000 series.',
    ],
  },
  {
    manufacturerPatterns: ['crucial', 'micron'],
    vendor: 'Crucial',
    lineName: 'Ballistix / Crucial DDR4 (2666-3200)',
    speedMHz: 3200,
    casLatency: 16,
    type: 'DDR4',
    platforms: ['Intel XMP'],
    vrSuitability: 'mediocre',
    oneLiner: 'Stock-speed Crucial DDR4. Reliable but leaves VR performance behind 3600 CL16 kits.',
    quirks: [
      'JEDEC-spec kits at DDR4-2666 or 3200 CL22 are common in pre-builts.',
      'XMP to 3200 CL16 if possible; otherwise consider replacing for VR.',
    ],
  },
]

// ── Combined Export ──────────────────────────────────────────

export const RAM_KIT_DATABASE: RamKitEntry[] = [
  ...ddr5Kits,
  ...ddr4Kits,
]

/**
 * Best-effort kit match from WMI Manufacturer + detected speed + CL.
 *
 * WMI rarely gives us the specific SKU, so we match by:
 *   1. Manufacturer string fuzzy-match
 *   2. Detected speed must be within ±100 MHz of entry speed
 *   3. Memory type must match (DDR4 vs DDR5)
 *
 * CL is NOT matched because it's not reliably reported by WMI on all boards —
 * we return all manufacturer-matched kits sorted by speed distance.
 */
export function findRamKitCandidates(
  manufacturer: string,
  speedMHz: number,
  type: 'DDR4' | 'DDR5'
): RamKitEntry[] {
  if (!manufacturer) return []
  const mfgLower = manufacturer.toLowerCase()
  const candidates = RAM_KIT_DATABASE.filter((entry) => {
    if (entry.type !== type) return false
    if (Math.abs(entry.speedMHz - speedMHz) > 100) return false
    return entry.manufacturerPatterns.some((p) => mfgLower.includes(p.toLowerCase()))
  })
  // Sort by how close the speed is to the detected kit
  return candidates.sort(
    (a, b) => Math.abs(a.speedMHz - speedMHz) - Math.abs(b.speedMHz - speedMHz)
  )
}
