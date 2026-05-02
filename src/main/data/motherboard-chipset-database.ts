// Vryionics VR Optimization Suite — Motherboard Chipset Knowledge Base
//
// Per-chipset deep knowledge. Chipset determines PCIe generation exposed
// to the GPU, number of USB 3.x ports, maximum memory speed supported,
// BIOS feature availability (ReBAR, Above 4G, MMCSS tuning, fan curves),
// and platform-wide VR quirks.
//
// Detected via Win32_BaseBoard.Product (motherboard model) and parsed
// to extract the chipset name. Rules surface per-chipset guidance.


export type ChipsetVendor = 'AMD' | 'Intel'
export type ChipsetTier = 'flagship' | 'enthusiast' | 'mainstream' | 'budget' | 'entry'

export interface MotherboardChipsetEntry {
  /** Chipset codename as shipped — e.g. 'X670E', 'B650', 'Z890', 'B760'. */
  name: string
  /** Match patterns used on board model string (case-insensitive substrings). */
  matchPatterns: string[]
  vendor: ChipsetVendor
  /** Socket the chipset pairs with — must match CPU socket to be legitimate. */
  socket: 'AM4' | 'AM5' | 'LGA1151' | 'LGA1200' | 'LGA1700' | 'LGA1851'
  /** Release year. */
  releaseYear: number
  tier: ChipsetTier

  /** Maximum PCIe generation on the GPU slot (CPU-direct lane). */
  pcieGpuGen: 3 | 4 | 5
  /** Max memory speed officially rated (manual overclocking can exceed). */
  maxMemorySpeedMHz: number
  /** Supports ReBAR in factory BIOS without vendor update? */
  reBarSupported: boolean
  /** PCIe bifurcation support for multi-GPU / M.2 adapters. */
  bifurcationSupported: boolean

  /** VR-relevant BIOS features usually available on this chipset. */
  biosFeatures: {
    /** Can enable Gen 1 / Gear 1 memory mode on Intel. */
    memoryGear1Available: boolean
    /** Supports per-profile fan curves for thermal sustain. */
    fanCurveControls: boolean
    /** Supports BCLK overclocking (non-K Intel, non-X3D AMD benefit). */
    bclkOverclocking: boolean
  }

  /** One-liner summary for UI. */
  oneLiner: string
  /** Detailed VR quirks & chipset-specific VR tuning notes. */
  quirks: string[]
}


const am4Chipsets: MotherboardChipsetEntry[] = [
  {
    name: 'X570',
    matchPatterns: ['x570'],
    vendor: 'AMD',
    socket: 'AM4',
    releaseYear: 2019,
    tier: 'enthusiast',
    pcieGpuGen: 4,
    maxMemorySpeedMHz: 3600,
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: false,  // AMD doesn't use Gear modes
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: 'AM4 flagship. PCIe 4.0 to GPU + M.2. Good for Zen 3 VR.',
    quirks: [
      'Requires active chipset fan on most boards — audible during idle. Fan-curve control recommended.',
      'ReBAR was added via AGESA update (1.2.0.3+) — early 2019-2020 BIOS may need update.',
      'DDR4-3600 CL16 is the VR sweet spot on this chipset paired with 5800X3D.',
      'Full 4.0 x16 to GPU + 4.0 x4 to primary M.2 — best AM4 PCIe layout.',
    ],
  },
  {
    name: 'B550',
    matchPatterns: ['b550'],
    vendor: 'AMD',
    socket: 'AM4',
    releaseYear: 2020,
    tier: 'mainstream',
    pcieGpuGen: 4,
    maxMemorySpeedMHz: 3600,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Mid-range AM4. PCIe 4.0 to GPU + M.2, no chipset fan. Strong VR value.',
    quirks: [
      'Most B550 boards match X570 feature-for-feature for VR use — at lower cost.',
      'No chipset fan (passive heatsink) — quieter system.',
      'USB 3.2 Gen 2 port count varies wildly — check board specs before relying on high-bandwidth USB VR.',
      'ReBAR support added mid-2021 via BIOS. Update to latest AGESA for full compatibility.',
    ],
  },
  {
    name: 'X470 / B450',
    matchPatterns: ['x470', 'b450'],
    vendor: 'AMD',
    socket: 'AM4',
    releaseYear: 2018,
    tier: 'mainstream',
    pcieGpuGen: 3,
    maxMemorySpeedMHz: 3600,
    reBarSupported: true,  // some boards, with BIOS update
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Older AM4 (400-series). PCIe 3.0 only — limits modern GPU potential.',
    quirks: [
      'PCIe 3.0 to GPU — RTX 40/50-series and RX 7000/9000 bandwidth is throttled vs PCIe 4.0 boards (~3-5% VR perf loss).',
      'ReBAR support is board-vendor-dependent — some got BIOS updates, others didn\'t.',
      'CPU compatibility: up to Ryzen 5000 with BIOS update on most boards. Check QVL before swapping.',
      'Good budget platform but modern GPUs are partially wasted here.',
    ],
  },
]


const am5Chipsets: MotherboardChipsetEntry[] = [
  {
    name: 'X870E / X870',
    matchPatterns: ['x870e', 'x870 '],
    vendor: 'AMD',
    socket: 'AM5',
    releaseYear: 2024,
    tier: 'flagship',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 8000,  // via memory overclock on best kits
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: '2024 AM5 flagship. PCIe 5.0 GPU + M.2, USB4. Top-tier VR platform.',
    quirks: [
      'USB4 / Thunderbolt 4 supported natively — useful for some high-end VR peripherals.',
      'PCIe 5.0 to GPU matters only for RTX 5090 + heavy VR + next-gen titles; most VR users don\'t notice.',
      'DDR5-6000 EXPO is the VR sweet spot — avoid pushing DDR5-6400+ unless you enjoy BIOS troubleshooting.',
      'BIOS AGESA 1.2.0.2c+ (late 2024) is required for stable 9000-series CPU support.',
    ],
  },
  {
    name: 'X670E / X670',
    matchPatterns: ['x670e', 'x670 '],
    vendor: 'AMD',
    socket: 'AM5',
    releaseYear: 2022,
    tier: 'enthusiast',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 8000,
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: 'Launch AM5 enthusiast tier. Dual-chipset design, PCIe 5.0 throughout.',
    quirks: [
      'Dual-chipset design (two IO hubs) — more USB ports and M.2 slots vs X870.',
      'Early 2022-2023 BIOS was buggy with EXPO / DDR5-6000 on some boards — update to AGESA 1.1.0.0+ for stability.',
      'DDR5-6000 CL30 EXPO is the recommended VR memory config.',
      'PCIe 5.0 x16 GPU slot (X670E) or PCIe 4.0 x16 (X670 non-E) — check specific board.',
    ],
  },
  {
    name: 'B850 / B840',
    matchPatterns: ['b850', 'b840'],
    vendor: 'AMD',
    socket: 'AM5',
    releaseYear: 2025,
    tier: 'mainstream',
    pcieGpuGen: 5,  // B850 has 5.0; B840 is 4.0
    maxMemorySpeedMHz: 8000,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: '2025 mid-range AM5. B850 = PCIe 5.0; B840 = PCIe 4.0. Good VR value.',
    quirks: [
      'B850 has PCIe 5.0 to GPU + M.2 — parity with X670E for VR use at lower cost.',
      'B840 is the budget refresh (PCIe 4.0) — fine for VR but no 5.0 headroom.',
      'DDR5-6000 EXPO widely validated on B850 launch BIOSes.',
    ],
  },
  {
    name: 'B650E / B650',
    matchPatterns: ['b650e', 'b650 '],
    vendor: 'AMD',
    socket: 'AM5',
    releaseYear: 2022,
    tier: 'mainstream',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 8000,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Mainstream AM5. B650E has PCIe 5.0 GPU; B650 is 4.0 GPU.',
    quirks: [
      'B650E = PCIe 5.0 GPU slot; B650 (non-E) = PCIe 4.0 GPU slot.',
      'Both have PCIe 5.0 to primary M.2 regardless of suffix.',
      'Popular budget VR-capable platform. DDR5-6000 EXPO widely supported.',
      'Early 2022 BIOS had EXPO instability on some boards — AGESA 1.0.0.7c+ resolved most issues.',
    ],
  },
  {
    name: 'A620',
    matchPatterns: ['a620'],
    vendor: 'AMD',
    socket: 'AM5',
    releaseYear: 2023,
    tier: 'budget',
    pcieGpuGen: 4,
    maxMemorySpeedMHz: 6400,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: false,
      bclkOverclocking: false,
    },
    oneLiner: 'Budget AM5. PCIe 4.0 only, limited VRM — not ideal for X3D CPUs + heavy VR.',
    quirks: [
      'Memory capped at DDR5-6400 on most A620 boards — sub-optimal for flagship AM5 CPUs.',
      'VRM quality varies dramatically by board vendor — some can\'t sustain Ryzen 9 under VR load without throttling.',
      'No CPU overclocking support — fine if you\'re using non-X3D Ryzen 5 / 7 for VR.',
      'Budget sweet spot is a B650 board at ~$40 more — gets you better VRM and EXPO headroom.',
    ],
  },
]


const lga1200Chipsets: MotherboardChipsetEntry[] = [
  {
    name: 'Z590',
    matchPatterns: ['z590'],
    vendor: 'Intel',
    socket: 'LGA1200',
    releaseYear: 2021,
    tier: 'enthusiast',
    pcieGpuGen: 4,
    maxMemorySpeedMHz: 3200,  // official; XMP exceeds
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: true,
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: '11th-gen enthusiast chipset. PCIe 4.0, Gear 1/Gear 2 controls for VR RAM tuning.',
    quirks: [
      'Gear 1 mode (1:1 MC:RAM clock) is CRITICAL for VR — Gear 2 halves memory throughput.',
      'Rocket Lake memory controller maxes at DDR4-3800 Gear 1 on most samples.',
      '10th-gen CPUs: PCIe 3.0 only. 11th-gen: PCIe 4.0 to GPU.',
    ],
  },
  {
    name: 'B560 / B660',
    matchPatterns: ['b560', 'b660'],
    vendor: 'Intel',
    socket: 'LGA1200',
    releaseYear: 2021,
    tier: 'mainstream',
    pcieGpuGen: 4,
    maxMemorySpeedMHz: 3200,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: true,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Mainstream 11th/12th-gen Intel. PCIe 4.0, Gear 1 memory for VR.',
    quirks: [
      'Gear 1 mode access unlocked on B560 (was Z-only on B460) — critical BIOS setting for VR memory latency.',
      'No CPU overclocking but memory XMP is supported.',
    ],
  },
]


const lga1700Chipsets: MotherboardChipsetEntry[] = [
  {
    name: 'Z790',
    matchPatterns: ['z790'],
    vendor: 'Intel',
    socket: 'LGA1700',
    releaseYear: 2022,
    tier: 'enthusiast',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 5600,  // official; XMP/manual exceeds
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: true,
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: '12/13/14th-gen enthusiast chipset. PCIe 5.0 GPU, DDR5 high-speed.',
    quirks: [
      'Both DDR4 and DDR5 board variants exist — you must use the matching RAM type.',
      'DDR5 boards support DDR5-7200+ on Z790 but VR doesn\'t benefit above DDR5-6000 CL30.',
      'Early Z790 BIOS had Thread Director bugs on 12th-gen — update to late-2022 BIOS if on Alder Lake.',
      'Intel Default Settings profile (post-0x12B microcode) is required for 13/14900K Vmin stability.',
    ],
  },
  {
    name: 'B760',
    matchPatterns: ['b760'],
    vendor: 'Intel',
    socket: 'LGA1700',
    releaseYear: 2023,
    tier: 'mainstream',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 5600,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: true,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Mainstream 12/13/14th-gen. PCIe 5.0 GPU, DDR5 support. Great VR value.',
    quirks: [
      'No CPU overclocking (K-series can only change power limits, not voltage/multiplier).',
      'Memory XMP / EXPO fully supported — DDR5-6000 CL30 is the VR sweet spot.',
      'Thread Director + Win 11 works identically to Z790 for VR performance.',
    ],
  },
  {
    name: 'H770 / H610',
    matchPatterns: ['h770', 'h610'],
    vendor: 'Intel',
    socket: 'LGA1700',
    releaseYear: 2023,
    tier: 'budget',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 4800,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,  // H610 locks Gear 1 on DDR5
      fanCurveControls: false,
      bclkOverclocking: false,
    },
    oneLiner: 'Budget Intel 12/13/14th-gen. Limited tuning — fine for stock VR but leaves performance on the table.',
    quirks: [
      'H610 boards often lack XMP/EXPO support — memory runs at JEDEC baseline (DDR5-4800 CL40).',
      'VR memory latency on H610 + DDR5-4800 is ~20% worse than B760 + DDR5-6000 CL30.',
      'No CPU power-limit adjustment on most H610 boards — chip runs at stock PL1 (125W or lower), limiting sustained VR perf.',
      'Budget VR build path — B760 at +$30-50 is a meaningful upgrade.',
    ],
  },
]


const lga1851Chipsets: MotherboardChipsetEntry[] = [
  {
    name: 'Z890',
    matchPatterns: ['z890'],
    vendor: 'Intel',
    socket: 'LGA1851',
    releaseYear: 2024,
    tier: 'enthusiast',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 6400,
    reBarSupported: true,
    bifurcationSupported: true,
    biosFeatures: {
      memoryGear1Available: false,  // Arrow Lake dropped Gear terminology
      fanCurveControls: true,
      bclkOverclocking: true,
    },
    oneLiner: 'Arrow Lake enthusiast chipset. PCIe 5.0, DDR5-6400+ officially rated.',
    quirks: [
      'Arrow Lake launch BIOS (Oct 2024-Jan 2025) had memory training issues above DDR5-6000. Feb 2025+ BIOS fixes.',
      'No DDR4 support on LGA1851 — DDR5 only.',
      'Intel Default Settings profile is the correct baseline; avoid "Extreme" / "Unlimited" modes for VR stability.',
      'Thread Director for Arrow Lake requires Win 11 24H2 + Jan 2025 KB updates for correct routing.',
    ],
  },
  {
    name: 'B860',
    matchPatterns: ['b860'],
    vendor: 'Intel',
    socket: 'LGA1851',
    releaseYear: 2025,
    tier: 'mainstream',
    pcieGpuGen: 5,
    maxMemorySpeedMHz: 6400,
    reBarSupported: true,
    bifurcationSupported: false,
    biosFeatures: {
      memoryGear1Available: false,
      fanCurveControls: true,
      bclkOverclocking: false,
    },
    oneLiner: 'Mainstream Arrow Lake. PCIe 5.0 + DDR5-6400. Solid VR platform.',
    quirks: [
      'Supports full Core Ultra 2 lineup — 245K, 265K, 285K.',
      'Memory XMP to DDR5-6400 CL32 is the recommended VR config.',
      'Launch chipset — BIOS maturity will improve through 2025.',
    ],
  },
]


export const MOTHERBOARD_CHIPSET_DATABASE: MotherboardChipsetEntry[] = [
  ...am4Chipsets,
  ...am5Chipsets,
  ...lga1200Chipsets,
  ...lga1700Chipsets,
  ...lga1851Chipsets,
]

/**
 * Find a chipset entry from a motherboard model string (e.g. "MSI MAG
 * B650 TOMAHAWK WIFI" → B650).
 *
 * Matches case-insensitively, first hit wins. Walks from most-specific
 * (e.g. X870E) to less-specific (X870) to catch subvariants correctly.
 */
export function findMotherboardChipset(boardModel: string): MotherboardChipsetEntry | null {
  if (!boardModel) return null
  const lower = boardModel.toLowerCase()
  // Walk in order — patterns are arranged most-specific first in each section
  for (const entry of MOTHERBOARD_CHIPSET_DATABASE) {
    for (const pattern of entry.matchPatterns) {
      if (lower.includes(pattern.toLowerCase())) return entry
    }
  }
  return null
}
