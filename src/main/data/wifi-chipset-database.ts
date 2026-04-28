// Vryionics VR Optimization Suite — Wi-Fi Chipset Knowledge Base
//
// Per-chipset deep knowledge for wireless VR. Extends the shallow tier
// classification in scanner/modules/network.ts (which maps vendor +
// family → a 5-level VR suitability bucket) with:
//   • Specific driver quirks per chipset
//   • Known-problematic driver versions
//   • 802.11 standard + max channel width
//   • Power-saving behavior that breaks VR (some chipsets' L1/L2 states
//     introduce audible streaming stutter even when "power saving" is off
//     in Device Manager)
//   • Firmware baseline recommendations
//
// Rules consume this to give per-chipset tuning advice rather than
// vendor-level generalizations.

export type WifiVendor = 'Intel' | 'Qualcomm' | 'MediaTek' | 'Realtek' | 'Broadcom' | 'Unknown'
export type WifiStandard = 'Wi-Fi 4 (n)' | 'Wi-Fi 5 (ac)' | 'Wi-Fi 6 (ax)' | 'Wi-Fi 6E (ax)' | 'Wi-Fi 7 (be)'
export type WifiSuitability = 'excellent' | 'good' | 'mediocre' | 'poor' | 'unknown'

export interface WifiChipsetEntry {
  /** Case-insensitive substrings to match against InterfaceDescription. */
  matchPatterns: string[]
  vendor: WifiVendor
  /** Human-readable family name, e.g. "Intel AX210". */
  family: string
  /** Year the chipset entered consumer laptops / motherboards. */
  releaseYear: number
  standard: WifiStandard
  /** Maximum channel width (20/40/80/160/320 MHz). VR bandwidth potential. */
  maxChannelWidthMHz: 20 | 40 | 80 | 160 | 320
  /** Does the chipset have a 6 GHz radio? */
  supports6GHz: boolean
  /** Does the chipset support Multi-Link Operation (Wi-Fi 7)? */
  supportsMLO: boolean
  /** VR suitability — matches the shallow tier in network.ts for consistency. */
  vrSuitability: WifiSuitability

  /** VR-relevant driver notes — issues + recommended driver source. */
  driverNotes: {
    /** Preferred driver source (vendor direct vs OEM vs Windows Update). */
    preferredSource: 'vendor-direct' | 'oem-only' | 'windows-update' | 'varies'
    /** Known-bad driver versions or ranges (free-form strings). */
    knownBadVersions?: string[]
    /** Explicit guidance — specific drivers proven good for VR. */
    recommendedVersion?: string
    /** Any chipset-specific VR anti-tip or quirk. */
    vrQuirk?: string
  }

  /** One-liner summary for UI display. */
  oneLiner: string
  /** Detailed quirks for advanced-mode findings. */
  quirks: string[]
}

// ── Intel Wi-Fi chipsets ─────────────────────────────────────

const intelChipsets: WifiChipsetEntry[] = [
  {
    matchPatterns: ['be200', 'be201', 'be202'],
    vendor: 'Intel',
    family: 'Intel BE200 / BE201 / BE202 (Wi-Fi 7)',
    releaseYear: 2024,
    standard: 'Wi-Fi 7 (be)',
    maxChannelWidthMHz: 320,
    supports6GHz: true,
    supportsMLO: true,
    vrSuitability: 'excellent',
    driverNotes: {
      preferredSource: 'vendor-direct',
      recommendedVersion: 'Intel PROSet 23.60.1 or later (Feb 2025) — earlier drivers had MLO bugs affecting VR streaming.',
      vrQuirk: 'Multi-Link Operation (MLO) can aggregate 5 GHz + 6 GHz bands for higher effective throughput. Enable MLO only if your router supports it — some routers negotiate poorly and cause stream stutter.',
    },
    oneLiner: 'Top-tier Wi-Fi 7 with 320 MHz + MLO. Best current chipset for wireless VR.',
    quirks: [
      'Requires Windows 11 24H2 for full MLO support. Win 10 / older Win 11 falls back to single-link operation.',
      'Bluetooth 5.4 integrated — check for coexistence issues if using Bluetooth trackers (rare).',
      'OEM laptops sometimes lock BE200 to a reduced bandwidth in BIOS — verify 320 MHz is achievable in your chassis.',
    ],
  },
  {
    matchPatterns: ['ax210', 'ax211'],
    vendor: 'Intel',
    family: 'Intel AX210 / AX211 (Wi-Fi 6E)',
    releaseYear: 2021,
    standard: 'Wi-Fi 6E (ax)',
    maxChannelWidthMHz: 160,
    supports6GHz: true,
    supportsMLO: false,
    vrSuitability: 'excellent',
    driverNotes: {
      preferredSource: 'vendor-direct',
      recommendedVersion: 'Intel PROSet 22.260+ (2024+). Early 22.xx had 6 GHz regression fixed in 22.180.',
      vrQuirk: 'The "U-NII-5" 6 GHz band (channels 1-93) is the standard VR band. 6 GHz requires AFC (Automated Frequency Coordination) in some regions — your router may show limited channels available.',
    },
    oneLiner: 'Gold-standard Wi-Fi 6E. Widely deployed, rock-solid for VR streaming.',
    quirks: [
      'AX210 = desktop M.2 card; AX211 = laptop CNVio2 integrated into the CPU chipset. Functionally identical for VR.',
      '6 GHz channel 193 and above sometimes unavailable even in countries where they\'re licensed — OEM firmware restriction.',
      'Driver 22.120 (2022 era) had a bug where 6 GHz would silently fall back to 5 GHz — update if you see unexplained band changes.',
    ],
  },
  {
    matchPatterns: ['ax200'],
    vendor: 'Intel',
    family: 'Intel AX200 (Wi-Fi 6)',
    releaseYear: 2019,
    standard: 'Wi-Fi 6 (ax)',
    maxChannelWidthMHz: 160,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'excellent',
    driverNotes: {
      preferredSource: 'vendor-direct',
      recommendedVersion: 'Intel PROSet 22.180+ — any driver from 2023+ is fine.',
    },
    oneLiner: '2019 flagship. No 6 GHz but 5 GHz 160 MHz is excellent for wireless VR.',
    quirks: [
      'Identical 5 GHz performance to AX210. Only difference is 6 GHz — AX200 is 5 GHz-only.',
      'If your router doesn\'t have 6 GHz, AX200 is functionally equivalent to AX210 for VR.',
      'Widely deployed in 2019-2021 laptops and enthusiast desktops.',
    ],
  },
  {
    matchPatterns: ['ax201', 'ax203'],
    vendor: 'Intel',
    family: 'Intel AX201 / AX203 (Wi-Fi 6, 80 MHz)',
    releaseYear: 2020,
    standard: 'Wi-Fi 6 (ax)',
    maxChannelWidthMHz: 80,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'good',
    driverNotes: {
      preferredSource: 'vendor-direct',
      vrQuirk: 'Capped at 80 MHz channel width (not 160 MHz like AX200/AX210) — max theoretical VR bitrate is ~750 Mbps vs 1200+ on AX200. Still plenty for wireless VR but closer to the ceiling.',
    },
    oneLiner: 'OEM-budget Wi-Fi 6. 80 MHz max limits ceiling vs AX200/AX210 but adequate for VR.',
    quirks: [
      'AX201 / AX203 are the "budget" Wi-Fi 6 variants — 80 MHz channel width instead of 160 MHz.',
      'Common in mid-range laptops 2020-2022. Ultrabooks often ship this instead of AX200/AX210.',
      'Upgrading to AX200 / AX210 via M.2 slot (if your laptop permits) is a $25-30 win for wireless VR.',
    ],
  },
  {
    matchPatterns: ['ac 9560', 'ac9560', 'ac 9462', 'ac9462', 'ac 9260', 'ac9260'],
    vendor: 'Intel',
    family: 'Intel AC 9000 Series (Wi-Fi 5)',
    releaseYear: 2018,
    standard: 'Wi-Fi 5 (ac)',
    maxChannelWidthMHz: 160,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'good',
    driverNotes: {
      preferredSource: 'vendor-direct',
    },
    oneLiner: 'Pre-Wi-Fi-6 Intel flagship. Still solid for wireless VR at 5 GHz.',
    quirks: [
      'Wi-Fi 5 (ac) — no OFDMA, no BSS coloring. Shared Wi-Fi networks degrade wireless VR more on this chip.',
      'Supports 160 MHz on 5 GHz but many routers cap at 80 MHz for compatibility.',
      'Upgrade to AX210 / BE200 is a ~$30 M.2 swap on most desktops; worthwhile for VR.',
    ],
  },
  {
    matchPatterns: ['ac 8260', 'ac8260', 'ac 8265', 'ac8265'],
    vendor: 'Intel',
    family: 'Intel AC 8000 Series',
    releaseYear: 2015,
    standard: 'Wi-Fi 5 (ac)',
    maxChannelWidthMHz: 80,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'mediocre',
    driverNotes: {
      preferredSource: 'vendor-direct',
      vrQuirk: 'Older generation — OS-level power management quirks on Win 11 sometimes force it into aggressive sleep during VR streaming. Disable "Allow this computer to turn off this device" in Device Manager.',
    },
    oneLiner: 'Aging Wi-Fi 5. 80 MHz channel limit + power-saving quirks make VR marginal.',
    quirks: [
      '2015-era silicon — maturity means driver issues are rare, but channel width ceiling is 80 MHz.',
      'Functional for wireless VR but users report occasional stutters under sustained load.',
      'High-value upgrade target — even a $20 USB Wi-Fi 6E dongle outperforms for VR.',
    ],
  },
]

// ── Qualcomm / Atheros ──────────────────────────────────────

const qualcommChipsets: WifiChipsetEntry[] = [
  {
    matchPatterns: ['fastconnect 7800', 'fastconnect 7900', 'fastconnect 7'],
    vendor: 'Qualcomm',
    family: 'Qualcomm FastConnect 7xxx (Wi-Fi 7)',
    releaseYear: 2023,
    standard: 'Wi-Fi 7 (be)',
    maxChannelWidthMHz: 320,
    supports6GHz: true,
    supportsMLO: true,
    vrSuitability: 'excellent',
    driverNotes: {
      preferredSource: 'oem-only',
      vrQuirk: 'Qualcomm ships drivers to OEMs rather than directly to users. Your laptop/motherboard vendor\'s latest driver is usually required for VR fixes to land.',
    },
    oneLiner: 'Qualcomm Wi-Fi 7 flagship. Excellent for wireless VR, OEM-distributed drivers.',
    quirks: [
      'Driver updates flow through the OEM (laptop or motherboard vendor) — Qualcomm rarely publishes direct consumer drivers.',
      'Apparent in Snapdragon X laptops, premium Asus / Lenovo designs.',
      'MLO support strong — often better implementation than Intel BE200 in early benchmarks.',
    ],
  },
  {
    matchPatterns: ['fastconnect 6900'],
    vendor: 'Qualcomm',
    family: 'Qualcomm FastConnect 6900 (Wi-Fi 6E)',
    releaseYear: 2021,
    standard: 'Wi-Fi 6E (ax)',
    maxChannelWidthMHz: 160,
    supports6GHz: true,
    supportsMLO: false,
    vrSuitability: 'excellent',
    driverNotes: {
      preferredSource: 'oem-only',
    },
    oneLiner: 'Qualcomm Wi-Fi 6E — on par with Intel AX210 for VR.',
    quirks: [
      'Deployed in Snapdragon 8cx Gen 3 laptops and various gaming laptops from 2022+.',
      'OEM driver cadence varies — Asus/Lenovo/HP release on different schedules.',
    ],
  },
  {
    matchPatterns: ['atheros ar9', 'qca'],
    vendor: 'Qualcomm',
    family: 'Atheros AR-series (legacy)',
    releaseYear: 2012,
    standard: 'Wi-Fi 4 (n)',
    maxChannelWidthMHz: 40,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'poor',
    driverNotes: {
      preferredSource: 'oem-only',
      vrQuirk: 'Legacy Atheros chips are Wi-Fi 4 (n) only — fundamentally inadequate bandwidth for modern VR streaming. No driver fix helps.',
    },
    oneLiner: 'Legacy Atheros — Wi-Fi 4 only, not suitable for modern wireless VR.',
    quirks: [
      'Wi-Fi 4 (802.11n) tops out at ~150 Mbps under ideal conditions — far below the ~200+ Mbps needed for high-quality wireless VR.',
      'Upgrade is mandatory for wireless VR. USB Wi-Fi 6E dongle ($25-40) is the cheapest fix.',
    ],
  },
]

// ── MediaTek ─────────────────────────────────────────────────

const mediaTekChipsets: WifiChipsetEntry[] = [
  {
    matchPatterns: ['mt7925'],
    vendor: 'MediaTek',
    family: 'MediaTek MT7925 (Wi-Fi 7)',
    releaseYear: 2024,
    standard: 'Wi-Fi 7 (be)',
    maxChannelWidthMHz: 320,
    supports6GHz: true,
    supportsMLO: true,
    vrSuitability: 'good',
    driverNotes: {
      preferredSource: 'oem-only',
      vrQuirk: 'Early MediaTek Wi-Fi 7 drivers had connection-drop issues on specific routers (TP-Link Deco BE85 notably). Update to Jan 2025+ OEM driver for VR-stable behavior.',
    },
    oneLiner: 'MediaTek Wi-Fi 7. Good for VR but lags Intel BE200 in driver maturity.',
    quirks: [
      'Value-tier Wi-Fi 7 — commonly paired with AMD Ryzen 7040/8040 laptops.',
      'MLO implementation improving with drivers; parity with Intel expected by mid-2025.',
    ],
  },
  {
    matchPatterns: ['mt7921', 'mt7922'],
    vendor: 'MediaTek',
    family: 'MediaTek MT7921 / MT7922 (Wi-Fi 6)',
    releaseYear: 2021,
    standard: 'Wi-Fi 6 (ax)',
    maxChannelWidthMHz: 80,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'good',
    driverNotes: {
      preferredSource: 'oem-only',
    },
    oneLiner: 'MediaTek Wi-Fi 6. Widely deployed, usable for VR with the right router setup.',
    quirks: [
      '80 MHz channel max — ceiling limits bitrate vs 160 MHz chips.',
      'Common in mid-range 2022-2024 laptops (IdeaPad, Aspire).',
      'VR works fine on 5 GHz 80 MHz channel — dedicated SSID recommended.',
    ],
  },
]

// ── Realtek (most VR-problematic) ───────────────────────────

const realtekChipsets: WifiChipsetEntry[] = [
  {
    matchPatterns: ['rtl8922', 'rtl8921'],
    vendor: 'Realtek',
    family: 'Realtek RTL8922 (Wi-Fi 7)',
    releaseYear: 2024,
    standard: 'Wi-Fi 7 (be)',
    maxChannelWidthMHz: 320,
    supports6GHz: true,
    supportsMLO: true,
    vrSuitability: 'mediocre',
    driverNotes: {
      preferredSource: 'varies',
      vrQuirk: 'Realtek\'s Wi-Fi 7 is newer and drivers are less mature. Multiple reports of MLO instability during sustained UDP streams (exactly what wireless VR is).',
    },
    oneLiner: 'Realtek Wi-Fi 7. New silicon, maturing drivers — Intel BE200 still preferred for VR.',
    quirks: [
      'Early MLO implementation quirks — disable MLO and use single-band mode for stable VR.',
      'Mostly shipped in value motherboards and budget Wi-Fi 7 laptops.',
      'If already installed, your path is: try driver updates monthly, expect quality approaching Intel by mid-2025.',
    ],
  },
  {
    matchPatterns: ['rtl8852'],
    vendor: 'Realtek',
    family: 'Realtek RTL8852 (Wi-Fi 6)',
    releaseYear: 2022,
    standard: 'Wi-Fi 6 (ax)',
    maxChannelWidthMHz: 160,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'mediocre',
    driverNotes: {
      preferredSource: 'varies',
      vrQuirk: 'Realtek drivers can mis-queue sustained UDP streams. Wireless VR users report micro-stutters that disappear when swapping to Intel AX210.',
    },
    oneLiner: 'Realtek Wi-Fi 6. Widely shipped in budget boards. Workable but sub-par for VR.',
    quirks: [
      'Commonly found on $100-180 motherboards and low-cost laptops.',
      'Passes basic Wi-Fi benchmarks but often stumbles under sustained 150+ Mbps UDP (wireless VR\'s exact profile).',
      'Mitigations: disable Windows power saving on adapter; force 5 GHz SSID; reduce VR bitrate to 120 Mbps.',
      'Upgrade path: AX210 ($25) or AX200 ($20) M.2 swap. Single best wireless-VR upgrade on affected systems.',
    ],
  },
  {
    matchPatterns: ['rtl8822'],
    vendor: 'Realtek',
    family: 'Realtek RTL8822 (Wi-Fi 5)',
    releaseYear: 2019,
    standard: 'Wi-Fi 5 (ac)',
    maxChannelWidthMHz: 80,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'poor',
    driverNotes: {
      preferredSource: 'varies',
      vrQuirk: 'RTL8822 has a documented driver bug where the adapter enters a deep sleep state after ~90 seconds of sustained VR streaming, causing a dropout.',
    },
    oneLiner: 'Older Realtek Wi-Fi 5. Power-saving bugs + 80 MHz cap make VR painful.',
    quirks: [
      'Driver issue: after sustained sleep, sometimes requires Device Manager disable/enable to recover.',
      'Windows 11 Mobility Center "Wi-Fi power saving" must be OFF; so must Device Manager → Adapter Properties → Power Management.',
      'Upgrade is the right answer — any Intel Wi-Fi 6+ chip is dramatically better.',
    ],
  },
  {
    matchPatterns: ['rtl8188', 'rtl8192', 'rtl8812'],
    vendor: 'Realtek',
    family: 'Realtek RTL81xx (legacy Wi-Fi 4/5)',
    releaseYear: 2014,
    standard: 'Wi-Fi 4 (n)',
    maxChannelWidthMHz: 40,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'poor',
    driverNotes: {
      preferredSource: 'varies',
    },
    oneLiner: 'Legacy budget Realtek. Wi-Fi 4/5 only, not suitable for VR.',
    quirks: [
      'Usually ships with cheap USB Wi-Fi dongles and very old laptops.',
      'Will NOT deliver acceptable wireless VR. Period.',
      'Any $25+ Wi-Fi 6 USB dongle is a dramatic upgrade.',
    ],
  },
]

// ── Broadcom ────────────────────────────────────────────────

const broadcomChipsets: WifiChipsetEntry[] = [
  {
    matchPatterns: ['bcm4356', 'bcm4366', 'bcm4371'],
    vendor: 'Broadcom',
    family: 'Broadcom BCM-series (mostly Apple / legacy PC)',
    releaseYear: 2015,
    standard: 'Wi-Fi 5 (ac)',
    maxChannelWidthMHz: 80,
    supports6GHz: false,
    supportsMLO: false,
    vrSuitability: 'mediocre',
    driverNotes: {
      preferredSource: 'oem-only',
      vrQuirk: 'Broadcom Wi-Fi is primarily found in older Apple hardware where driver support on Windows via Boot Camp has been abandoned.',
    },
    oneLiner: 'Broadcom Wi-Fi 5 — mostly in Apple devices. Works but dated.',
    quirks: [
      'Rare on modern Windows PCs. When present, usually indicates a Hackintosh, older Mac, or specific legacy dongle.',
      'Windows drivers are unmaintained — stuck on vendor-provided versions from 2019 or earlier.',
    ],
  },
]

// ── Combined Export ──────────────────────────────────────────

export const WIFI_CHIPSET_DATABASE: WifiChipsetEntry[] = [
  ...intelChipsets,
  ...qualcommChipsets,
  ...mediaTekChipsets,
  ...realtekChipsets,
  ...broadcomChipsets,
]

/**
 * Look up a specific chipset entry by InterfaceDescription string.
 * Matches case-insensitively, first hit wins, returns null if no match.
 */
export function findWifiChipset(interfaceDescription: string): WifiChipsetEntry | null {
  if (!interfaceDescription) return null
  const lower = interfaceDescription.toLowerCase()
  for (const entry of WIFI_CHIPSET_DATABASE) {
    for (const pattern of entry.matchPatterns) {
      if (lower.includes(pattern.toLowerCase())) return entry
    }
  }
  return null
}
