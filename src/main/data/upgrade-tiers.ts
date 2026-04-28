// VR Optimization Suite — Hardware Upgrade Tier Knowledge Base
// Baked-in tier tables and upgrade suggestions for the recommendation engine.
// Prices are approximate USD as of 2024/2025; used-market prices noted explicitly.

// ── Types ─────────────────────────────────────────────────────

export type UpgradeBudget = 'under-100' | '100-250' | '250-500' | '500-1000' | 'any'

export interface UpgradeProduct {
  name: string
  approxPriceUSD: string      // e.g. "$279" or "$150-200 used"
  tier: 'budget' | 'mid' | 'high' | 'ultra'
  vrImpactSummary: string     // 1 sentence
  notes?: string              // caveats, platform requirements, etc.
}

export interface ComponentTier {
  component: 'gpu' | 'cpu' | 'ram' | 'storage' | 'network' | 'headset'
  tierName: string            // e.g. "RTX 3070 Ti Class"
  tierLevel: number           // 1 = entry VR, 10 = overkill
  matchPatterns: string[]     // case-insensitive substrings matching model/name strings
}

export interface UpgradeSuggestion {
  fromTierLevel: number       // current hardware is at this tier
  toTierLevel: number         // suggested upgrade target
  component: 'gpu' | 'cpu' | 'ram' | 'storage' | 'network'
  reason: string              // why this upgrade helps VR specifically
  products: UpgradeProduct[]
}

// ── GPU Tiers ──────────────────────────────────────────────────
// Covers all mainstream NVIDIA, AMD, and Intel Arc cards relevant for VR.
// Tier 1 = bare minimum VR capable; Tier 10 = current-gen flagship.

export const GPU_TIERS: ComponentTier[] = [
  {
    component: 'gpu',
    tierName: 'GTX 1060 / RX 580 Class — Bare Minimum VR',
    tierLevel: 1,
    matchPatterns: [
      'gtx 1060', 'gtx1060',
      'rx 580', 'rx580',
      'rx 590', 'rx590',
      'gtx 970', 'gtx970',
      'gtx 980', 'gtx980',
      'rx 480', 'rx480',
    ]
  },
  {
    component: 'gpu',
    tierName: 'GTX 1070 / GTX 1080 / RX 5700 / GTX 1660 Ti Class',
    tierLevel: 2,
    matchPatterns: [
      'gtx 1070', 'gtx1070',
      'gtx 1080', 'gtx1080',
      'rx 5700 ', 'rx5700 ',   // trailing space avoids matching 5700 XT
      'vega 56', 'vega56',
      'vega 64', 'vega64',
      'gtx 1660 super', 'gtx1660 super',
      'gtx 1660 ti', 'gtx1660 ti',
      'gtx 1660', 'gtx1660',    // plain 1660 — Super/Ti caught above first in same tier
      'rtx 2060', 'rtx2060',    // plain 2060 — 2060 Super at tier 3 caught first (higher tier walk)
      'arc a580', 'arc a750',   // Intel Arc mid-range
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 2070 / RTX 2080 / RX 5700 XT / RTX 3060 Class',
    tierLevel: 3,
    matchPatterns: [
      'rtx 2070', 'rtx2070',
      'rtx 2080', 'rtx2080',   // NOTE: 2080 Ti is caught at tier 4 first (walk order: high→low)
      'rx 5700 xt', 'rx5700 xt',
      'gtx 1080 ti', 'gtx1080ti',
      'rtx 2060 super', 'rtx2060 super',
      'arc a770', 'a770',
      'rtx 3060', 'rtx3060',   // plain 3060 (3060 Ti caught at tier 4 first during high→low walk)
      'rx 6600 xt', 'rx6600 xt',
      'rx 6600', 'rx6600',     // plain 6600 (6600 XT caught above first in same tier iteration)
      'rx 7600', 'rx7600',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 3060 Ti / RTX 3070 / RTX 4060 / RX 6700 XT Class',
    tierLevel: 4,
    matchPatterns: [
      'rtx 2080 ti', 'rtx2080 ti', 'rtx2080ti',  // caught here before tier 3 "rtx 2080"
      'rtx 3060 ti', 'rtx3060 ti',
      'rtx 3060ti',
      'rtx 3070', 'rtx3070',
      'rtx 4060', 'rtx4060',    // plain 4060 — 4060 Ti at tier 5 caught first during high→low walk
      'rx 6700 xt', 'rx6700 xt',
      'rx 6750 xt', 'rx6750 xt',
      'rx 6700', 'rx6700',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 3070 Ti / RTX 3080 / RTX 4060 Ti / RX 6800 Class',
    tierLevel: 5,
    matchPatterns: [
      'rtx 4060 ti', 'rtx4060 ti', 'rtx4060ti',  // caught here before tier 4 "rtx 4060"
      'rtx 3070 ti', 'rtx3070 ti',
      'rtx 3070ti',
      'rtx 3080', 'rtx3080',
      'rx 6800 xt', 'rx6800 xt',
      'rx 6800', 'rx6800',
      'rx 7700 xt', 'rx7700 xt',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 3080 Ti / RTX 3090 / RX 6900 XT Class',
    tierLevel: 6,
    matchPatterns: [
      'rtx 3080 ti', 'rtx3080 ti',
      'rtx 3080ti',
      'rtx 3090', 'rtx3090',
      'rx 6900 xt', 'rx6900 xt',
      'rx 6950 xt', 'rx6950 xt',
      'rtx 3090 ti', 'rtx3090 ti',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 4070 / RTX 4070 Ti / RX 7900 GRE Class',
    tierLevel: 7,
    matchPatterns: [
      'rtx 4070 ti', 'rtx4070 ti',  // check Ti before plain 4070
      'rtx 4070ti',
      'rtx 4070 super', 'rtx4070 super',
      'rtx 4070', 'rtx4070',
      'rx 7900 gre', 'rx7900 gre',
      'rx 7800 xt', 'rx7800 xt',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 4070 Ti Super / RTX 4080 / RX 7900 XT Class',
    tierLevel: 8,
    matchPatterns: [
      'rtx 4070 ti super', 'rtx4070 ti super',
      'rtx 4080', 'rtx4080',
      'rx 7900 xt ', 'rx7900 xt ',  // trailing space avoids matching 7900 XTX
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 4080 Super / RTX 4090 / RTX 5070 / RX 7900 XTX Class',
    tierLevel: 9,
    matchPatterns: [
      'rtx 4080 super', 'rtx4080 super',
      'rtx 4090', 'rtx4090',
      'rx 7900 xtx', 'rx7900 xtx',
      'rtx 5070', 'rtx5070',    // plain 5070 — 5070 Ti at tier 10 caught first during high→low walk
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 5070 Ti / RTX 5080 / RX 9070 XT — 2025 Upper Mid',
    tierLevel: 10,
    matchPatterns: [
      'rtx 5080', 'rtx5080',
      'rtx 5070 ti', 'rtx5070 ti',     // caught here before tier 9 "rtx 5070 "
      'rx 9070 xt', 'rx9070 xt',       // AMD RDNA4 2025 upper mid
      'rx 9080', 'rx9080',             // if AMD releases a 9080
    ]
  },
  {
    component: 'gpu',
    tierName: 'RX 9070 / RX 9060 XT — RDNA4 Mid-Range',
    tierLevel: 9,                       // slots alongside RTX 4080 class
    matchPatterns: [
      'rx 9070 ', 'rx9070 ',           // trailing space — XT matched above first
      'rx 9060 xt', 'rx9060 xt',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 5090 — 2025 Flagship',
    tierLevel: 11,                      // adds a new top tier above the previous 10
    matchPatterns: [
      'rtx 5090', 'rtx5090',
    ]
  },
  {
    component: 'gpu',
    tierName: 'RTX 5060 / RX 9060 — Entry RDNA4 / Blackwell',
    tierLevel: 6,                       // slots between 4060 and 4060 Ti class
    matchPatterns: [
      'rtx 5060 ti', 'rtx5060 ti',     // catch Ti first
      'rtx 5060', 'rtx5060',
      'rx 9060 ', 'rx9060 ',           // non-XT 9060
    ]
  }
]

// ── CPU Tiers ──────────────────────────────────────────────────
// V-Cache variants are rated higher within their generation due to
// dramatically lower VR game CPU overhead (especially VRChat).

export const CPU_TIERS: ComponentTier[] = [
  {
    component: 'cpu',
    tierName: 'Core i5-8600K / Ryzen 5 2600 — Legacy VR',
    tierLevel: 1,
    matchPatterns: [
      'i5-8600', 'i5 8600',
      'i7-7700', 'i7 7700',
      'i5-7600', 'i5 7600',
      'ryzen 5 2600', 'r5 2600',
      'ryzen 3 3100', 'r3 3100',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Core i7-9700K / Ryzen 5 3600 Class',
    tierLevel: 2,
    matchPatterns: [
      'i7-9700', 'i7 9700',
      'i5-9600', 'i5 9600',
      'ryzen 5 3600', 'r5 3600',
      'ryzen 5 3500', 'r5 3500',
      'ryzen 7 2700', 'r7 2700',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 7 3700X / Core i7-10700K Class',
    tierLevel: 3,
    matchPatterns: [
      'ryzen 7 3700', 'r7 3700',
      'ryzen 9 3900', 'r9 3900',
      'i7-10700', 'i7 10700',
      'i9-9900', 'i9 9900',
      'i5-10600', 'i5 10600',
      'i5-10500', 'i5 10500',
      'i5-10400', 'i5 10400',
      'i5-11400', 'i5 11400',
      'i5-11600', 'i5 11600',
      'ryzen 5 5500', 'r5 5500',   // weaker than 5600X; 5600 caught at tier 4 first
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 5 5600X / Core i5-12600K / Ryzen 7 5700X Class',
    tierLevel: 4,
    matchPatterns: [
      'ryzen 5 5600x', 'r5 5600x',
      'ryzen 5 5600 ', 'r5 5600 ',  // not 5600X (caught above) or 5600G (caught below)
      'ryzen 5 5600g', 'r5 5600g',  // iGPU G-series — similar IPC to 5600X
      'ryzen 7 5700x', 'r7 5700x',
      'ryzen 7 5700 ', 'r7 5700 ',
      'ryzen 7 5700g', 'r7 5700g',  // iGPU G-series
      'i5-12600', 'i5 12600',
      'i5-12400', 'i5 12400',
      'i7-11700', 'i7 11700',
      'i5-13400', 'i5 13400',
      'i5-13500', 'i5 13500',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 7 5800X / Core i7-12700K / Core i9-12900K / Ryzen 9 5900X Class',
    tierLevel: 5,
    matchPatterns: [
      'ryzen 7 5800x', 'r7 5800x',
      'ryzen 9 5900x', 'r9 5900x',
      'ryzen 9 5900 ', 'r9 5900 ',
      'i7-12700', 'i7 12700',
      'i9-11900', 'i9 11900',
      'i9-12900', 'i9 12900',   // very popular 12th-gen flagship; stronger than i7-12700K
      'i5-13600', 'i5 13600',
      'ryzen 5 7500f', 'r5 7500f',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 5 7600X / Core i7-13700K / Ryzen 7 7700X Class',
    tierLevel: 6,
    matchPatterns: [
      'ryzen 5 7600x', 'r5 7600x',
      'ryzen 5 7600 ', 'r5 7600 ',
      'ryzen 7 7700x', 'r7 7700x',
      'ryzen 7 7700 ', 'r7 7700 ',
      'i7-13700', 'i7 13700',
      'i5-14600', 'i5 14600',
      'i7-14700', 'i7 14700',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 9 7900X / Core i9-13900K / Ryzen 7 7700 Class',
    tierLevel: 7,
    matchPatterns: [
      'ryzen 9 7900x', 'r9 7900x',
      'ryzen 9 7900 ', 'r9 7900 ',
      'i9-13900', 'i9 13900',
      'i9-14900', 'i9 14900',
      'ryzen 9 5950x', 'r9 5950x',
    ]
  },
  {
    component: 'cpu',
    // V-Cache CPUs punch well above their tier for VR due to massive L3 cache reducing
    // draw-call overhead in VRChat and other CPU-heavy VR applications.
    tierName: 'Ryzen 7 5800X3D / Ryzen 7 7800X3D / Ryzen 9 7900X3D — V-Cache VR Champions',
    tierLevel: 8,
    matchPatterns: [
      'ryzen 7 5800x3d', 'r7 5800x3d',
      '5800x3d',
      'ryzen 7 7800x3d', 'r7 7800x3d',
      '7800x3d',
      'ryzen 9 7900x3d', 'r9 7900x3d',
      '7900x3d',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 9 7950X / Ryzen 9 7950X3D / Ryzen 9 9950X Class',
    tierLevel: 9,
    matchPatterns: [
      'ryzen 9 7950x', 'r9 7950x',
      'ryzen 9 9900x', 'r9 9900x',
      'ryzen 9 9950x', 'r9 9950x',
      'i9-14900k', 'i9 14900k',
    ]
  },
  {
    component: 'cpu',
    tierName: 'Ryzen 9 9950X3D / Ryzen 7 9800X3D — Current Gen Top',
    tierLevel: 10,
    matchPatterns: [
      'ryzen 9 9950x3d', 'r9 9950x3d',
      '9950x3d',
      'ryzen 7 9800x3d', 'r7 9800x3d',
      '9800x3d',
      'ryzen 9 9900x3d', 'r9 9900x3d',
    ]
  }
]

// ── RAM Tiers ──────────────────────────────────────────────────
// Derived from totalGB + speed + type in the engine (not name matching).
// tierLevel here is referenced by the engine's RAM detection logic.

export const RAM_TIERS: ComponentTier[] = [
  {
    component: 'ram',
    tierName: '8GB DDR4 — Insufficient for VR',
    tierLevel: 1,
    matchPatterns: []   // engine matches on totalGB < 12 && type === 'DDR4'
  },
  {
    component: 'ram',
    tierName: '16GB DDR4 sub-3200 — Minimum but Slow',
    tierLevel: 2,
    matchPatterns: []   // engine matches on totalGB 12-20 && speed < 3200
  },
  {
    component: 'ram',
    tierName: '16GB DDR4-3600 — Adequate for VR',
    tierLevel: 3,
    matchPatterns: []
  },
  {
    component: 'ram',
    tierName: '32GB DDR4-3600 — Good VR Kit',
    tierLevel: 4,
    matchPatterns: []
  },
  {
    component: 'ram',
    tierName: '32GB DDR5-5200 — Modern Platform Entry',
    tierLevel: 5,
    matchPatterns: []
  },
  {
    component: 'ram',
    tierName: '32GB DDR5-6000 CL30 — Sweet Spot',
    tierLevel: 6,
    matchPatterns: []
  },
  {
    component: 'ram',
    tierName: '64GB DDR5-6000 CL30 — Content Creator / Heavy VR',
    tierLevel: 7,
    matchPatterns: []
  },
  {
    component: 'ram',
    tierName: '64GB DDR5-6400+ — Enthusiast (diminishing VR returns)',
    tierLevel: 8,
    matchPatterns: []
  }
]

// ── Network Tiers ──────────────────────────────────────────────
// Relevant for wireless VR streaming quality. Wired = best for PCVR server.

export const NETWORK_TIERS: ComponentTier[] = [
  {
    component: 'network',
    tierName: '2.4GHz Wi-Fi — Unusable for Wireless VR',
    tierLevel: 1,
    matchPatterns: ['2.4ghz', '2.4 ghz', '2.4g']
  },
  {
    component: 'network',
    tierName: '5GHz Wi-Fi 5 (802.11ac) — Barely Workable',
    tierLevel: 2,
    matchPatterns: ['5ghz', '5 ghz', '802.11ac', 'wi-fi 5']
  },
  {
    component: 'network',
    tierName: '5GHz Wi-Fi 6 (802.11ax) — Good Wireless VR',
    tierLevel: 3,
    matchPatterns: ['wi-fi 6 ', 'wifi 6 ', '802.11ax', 'wi-fi6']
  },
  {
    component: 'network',
    tierName: '6GHz Wi-Fi 6E — Excellent Wireless VR',
    tierLevel: 4,
    matchPatterns: ['6ghz', '6 ghz', 'wi-fi 6e', 'wifi 6e', '6e']
  },
  {
    component: 'network',
    tierName: 'Wired Gigabit Ethernet — Best for Streaming PC',
    tierLevel: 5,
    matchPatterns: ['ethernet', '1gbe', '1000mbps', 'gigabit']
  },
  {
    component: 'network',
    tierName: '2.5GbE Ethernet — Future-Proof',
    tierLevel: 6,
    matchPatterns: ['2.5gbe', '2500mbps', '2.5 gbe', '2.5g ethernet']
  }
]

// ── Upgrade Suggestions ────────────────────────────────────────
// fromTierLevel → toTierLevel upgrade paths with specific product picks.

export const UPGRADE_SUGGESTIONS: UpgradeSuggestion[] = [

  // ── GPU Upgrades ───────────────────────────────────────────

  {
    fromTierLevel: 1,
    toTierLevel: 4,
    component: 'gpu',
    reason: 'Tier 1 GPUs (GTX 1060, RX 580) are at the absolute floor of VR capability. You will experience frequent reprojection and cannot run high-resolution VR or newer VR titles at acceptable quality. A jump to Tier 4 delivers 2-3× more GPU headroom for a dramatically smoother experience.',
    products: [
      {
        name: 'NVIDIA RTX 3060 Ti',
        approxPriceUSD: '$230-280 used',
        tier: 'mid',
        vrImpactSummary: 'Eliminates reprojection in most VR titles at native resolution and provides DLSS support for extra headroom.',
        notes: 'Excellent used-market value. 8GB VRAM is adequate for most VR workloads.'
      },
      {
        name: 'AMD RX 6700 XT',
        approxPriceUSD: '$200-250 used',
        tier: 'mid',
        vrImpactSummary: 'Strong rasterization performance for VR; 12GB VRAM future-proofs texture budgets.',
        notes: 'No DLSS; FSR 2/3 available as alternative upscaling. Great value.'
      },
      {
        name: 'NVIDIA RTX 3070',
        approxPriceUSD: '$250-320 used',
        tier: 'mid',
        vrImpactSummary: 'Comfortable 90fps in demanding VR titles with headroom to spare.',
        notes: 'Only 8GB VRAM — acceptable for current VR but watch future titles.'
      }
    ]
  },

  {
    fromTierLevel: 2,
    toTierLevel: 4,
    component: 'gpu',
    reason: 'GTX 1070/1080 class GPUs lack hardware ray tracing and modern upscaling (DLSS/FSR 3). Moving to RTX 3000-series dramatically improves VR rendering quality and adds reprojection-free headroom at higher resolutions.',
    products: [
      {
        name: 'NVIDIA RTX 3070',
        approxPriceUSD: '$250-320 used',
        tier: 'mid',
        vrImpactSummary: 'Doubles GPU headroom over GTX 1080 — enables 120Hz/144Hz VR at comfortable settings.',
        notes: 'Widely available used. Excellent price-to-performance for VR.'
      },
      {
        name: 'NVIDIA RTX 3060 Ti',
        approxPriceUSD: '$230-280 used',
        tier: 'budget',
        vrImpactSummary: 'Strong step up from GTX 1070/1080 class; DLSS 2/3 support unlocks upscaling flexibility.',
        notes: 'Best budget option in this upgrade path.'
      },
      {
        name: 'AMD RX 6700 XT',
        approxPriceUSD: '$200-250 used',
        tier: 'budget',
        vrImpactSummary: '12GB VRAM gives generous texture budget for high-resolution VR rendering.',
        notes: 'Great option for AMD platform users; FSR 2/3 upscaling available.'
      }
    ]
  },

  {
    fromTierLevel: 3,
    toTierLevel: 5,
    component: 'gpu',
    reason: 'RTX 2070/2080 class GPUs handle VR well but begin to show limits at high supersampling or in demanding social VR worlds. An RTX 3080 or RX 6800 provides 40-60% more raw GPU throughput.',
    products: [
      {
        name: 'NVIDIA RTX 3080 10GB',
        approxPriceUSD: '$350-430 used',
        tier: 'high',
        vrImpactSummary: 'Unlocks high supersampling in SteamVR and comfortable 90fps in all current VR titles.',
        notes: '10GB VRAM is sufficient for current VR workloads; 12GB variant costs more but adds future headroom.'
      },
      {
        name: 'AMD RX 6800 XT',
        approxPriceUSD: '$300-380 used',
        tier: 'high',
        vrImpactSummary: '16GB VRAM gives generous headroom for high-resolution VR rendering and future titles.',
        notes: 'Excellent for AMD platform; FSR 3 with frame generation available on newer titles.'
      },
      {
        name: 'NVIDIA RTX 3070 Ti',
        approxPriceUSD: '$280-350 used',
        tier: 'mid',
        vrImpactSummary: 'Meaningful step up from RTX 2080 with DLSS 3 support via driver updates.',
        notes: 'More affordable entry point; slightly less headroom than RTX 3080.'
      }
    ]
  },

  {
    fromTierLevel: 4,
    toTierLevel: 6,
    component: 'gpu',
    reason: 'RTX 3060 Ti/3070 class GPUs handle most VR well but struggle at high supersampling or in graphically demanding VR titles. Moving to RTX 3080 Ti/3090 class provides 35-50% more headroom for ultra-quality VR rendering.',
    products: [
      {
        name: 'NVIDIA RTX 3090',
        approxPriceUSD: '$450-550 used',
        tier: 'high',
        vrImpactSummary: '24GB VRAM and top-tier Ampere performance; handles all current VR at max quality.',
        notes: 'Best used-value flagship for VR enthusiasts; massive VRAM headroom.'
      },
      {
        name: 'NVIDIA RTX 3080 Ti',
        approxPriceUSD: '$420-500 used',
        tier: 'high',
        vrImpactSummary: 'Near-RTX 3090 performance at lower cost; excellent for high-resolution VR.',
        notes: '12GB VRAM is comfortable for current VR titles.'
      },
      {
        name: 'AMD RX 6900 XT',
        approxPriceUSD: '$350-450 used',
        tier: 'high',
        vrImpactSummary: '16GB VRAM with top-tier RDNA2 performance for demanding VR workloads.',
        notes: 'Strong option for AMD users; FSR 3 frame generation support.'
      }
    ]
  },

  {
    fromTierLevel: 5,
    toTierLevel: 7,
    component: 'gpu',
    reason: 'RTX 3080/3070 Ti class performs well but RTX 4000-series brings DLSS 3 Frame Generation, Ada Lovelace efficiency gains, and AV1 encoding — particularly relevant for wireless VR streaming quality.',
    products: [
      {
        name: 'NVIDIA RTX 4070 Ti Super',
        approxPriceUSD: '$749 new / $600-680 used',
        tier: 'high',
        vrImpactSummary: 'DLSS 3 Frame Generation doubles effective framerate headroom in supported VR titles.',
        notes: '16GB VRAM — best value RTX 4000 for demanding VR. AV1 encoding benefits wireless VR quality.'
      },
      {
        name: 'NVIDIA RTX 4070 Ti',
        approxPriceUSD: '$649 new / $520-580 used',
        tier: 'high',
        vrImpactSummary: 'Strong uplift over RTX 3080 with DLSS 3 and improved AV1 encoding for wireless VR.',
        notes: '12GB VRAM; excellent for 90Hz/120Hz VR at high resolutions.'
      },
      {
        name: 'AMD RX 7900 GRE',
        approxPriceUSD: '$429-499 new',
        tier: 'mid',
        vrImpactSummary: '16GB VRAM and strong rasterization for high-resolution VR; FSR 3 frame generation support.',
        notes: 'Great value; no equivalent to DLSS 3 Frame Generation but competitive raw performance.'
      }
    ]
  },

  {
    fromTierLevel: 6,
    toTierLevel: 8,
    component: 'gpu',
    reason: 'RTX 3090/3080 Ti class is already excellent for VR, but RTX 4080 brings generational efficiency improvements, DLSS 3 Frame Generation, and significantly better AV1 hardware encoding for wireless VR streaming.',
    products: [
      {
        name: 'NVIDIA RTX 4080 Super',
        approxPriceUSD: '$999 new / $870-950 used',
        tier: 'ultra',
        vrImpactSummary: 'Top-end RTX 4000 performance with 16GB VRAM; handles 120Hz VR at max quality effortlessly.',
        notes: 'DLSS 3 Frame Generation support; best AV1 encoding for wireless VR at this tier.'
      },
      {
        name: 'NVIDIA RTX 4080',
        approxPriceUSD: '$850-950 used',
        tier: 'ultra',
        vrImpactSummary: 'Dramatic step up with Frame Generation unlocking near-reprojection-free VR at extreme settings.',
        notes: '16GB GDDR6X; excellent choice if available at used pricing.'
      },
      {
        name: 'AMD RX 7900 XT',
        approxPriceUSD: '$649-749 new',
        tier: 'high',
        vrImpactSummary: '20GB VRAM and strong RDNA3 performance; competitive with RTX 4080 in rasterization.',
        notes: 'No Frame Generation equivalent to DLSS 3; great for AMD platform users.'
      }
    ]
  },

  {
    fromTierLevel: 7,
    toTierLevel: 9,
    component: 'gpu',
    reason: 'RTX 4070/4070 Ti class handles modern VR well; moving to RTX 4090 or 4080 Super is primarily beneficial for extreme supersampling, 120Hz+ at ultra quality, or future-proofing for next-gen VR headsets.',
    products: [
      {
        name: 'NVIDIA RTX 4090',
        approxPriceUSD: '$1599 new / $1350-1500 used',
        tier: 'ultra',
        vrImpactSummary: 'The undisputed VR king — handles any current headset at maximum quality and resolution.',
        notes: 'Overkill for most current headsets, but future-proof for next-gen PCVR. 24GB VRAM.'
      },
      {
        name: 'NVIDIA RTX 4080 Super',
        approxPriceUSD: '$999 new',
        tier: 'ultra',
        vrImpactSummary: 'Excellent high-resolution VR performance with 16GB VRAM and full Ada feature set.',
        notes: 'More cost-effective than RTX 4090 with 80-85% of its VR performance.'
      },
      {
        name: 'AMD RX 7900 XTX',
        approxPriceUSD: '$899-999 new',
        tier: 'ultra',
        vrImpactSummary: '24GB VRAM and RDNA3 efficiency; strong competitor to RTX 4080 Super in VR workloads.',
        notes: 'AMD platform pick; FSR 3 frame generation and AV1 encode support.'
      }
    ]
  },

  {
    fromTierLevel: 8,
    toTierLevel: 10,
    component: 'gpu',
    reason: 'RTX 4080 class is extremely capable for current VR, but the RTX 5000 series (Blackwell) brings next-gen neural rendering, DLSS 4 Multi-Frame Generation, and substantially better performance-per-watt.',
    products: [
      {
        name: 'NVIDIA RTX 5090',
        approxPriceUSD: '$1999 new',
        tier: 'ultra',
        vrImpactSummary: 'Next-generation Blackwell architecture with DLSS 4 Multi-Frame Generation for unprecedented VR headroom.',
        notes: '32GB GDDR7; the absolute pinnacle of current-gen PCVR performance. Limited availability.'
      },
      {
        name: 'NVIDIA RTX 5080',
        approxPriceUSD: '$999 new',
        tier: 'ultra',
        vrImpactSummary: 'Blackwell efficiency and DLSS 4 support at a more accessible price point than the 5090.',
        notes: '16GB GDDR7; strong generational leap for wireless VR AV1 encoding quality.'
      }
    ]
  },

  // ── CPU Upgrades ───────────────────────────────────────────

  {
    fromTierLevel: 1,
    toTierLevel: 4,
    component: 'cpu',
    reason: 'Tier 1 CPUs (i5-8600K, Ryzen 5 2600 era) create serious CPU bottlenecks in VR — VR compositors, physics engines, and social VR (VRChat) are heavily CPU-bound. Upgrading to Ryzen 5000 or 12th-gen Intel dramatically reduces VR frame time variance.',
    products: [
      {
        name: 'AMD Ryzen 5 5600X',
        approxPriceUSD: '$130-160 new / $90-120 used',
        tier: 'budget',
        vrImpactSummary: 'Ryzen 5000 IPC leap eliminates most CPU-side VR stutter; huge real-world VR performance gain.',
        notes: 'Best value CPU upgrade for VR. Requires AM4 motherboard (may need upgrade too).'
      },
      {
        name: 'AMD Ryzen 7 5700X',
        approxPriceUSD: '$150-180 new',
        tier: 'mid',
        vrImpactSummary: 'Eight Zen 3 cores handle VR compositor, game, and background loads simultaneously without bottlenecks.',
        notes: 'AM4 platform; great if you already have a compatible B450/X570 board.'
      },
      {
        name: 'Intel Core i5-12600K',
        approxPriceUSD: '$160-200 used',
        tier: 'mid',
        vrImpactSummary: 'Strong single-thread performance critical for VR compositor; hybrid core design handles background tasks efficiently.',
        notes: 'Requires LGA1700 motherboard and DDR4/DDR5 RAM. Platform upgrade likely needed.'
      }
    ]
  },

  {
    fromTierLevel: 2,
    toTierLevel: 5,
    component: 'cpu',
    reason: 'Ryzen 5 3600 and i7-9700K era CPUs have adequate IPC but lack the cache and efficiency of newer designs, causing micro-stutters in CPU-heavy VR workloads like VRChat populated worlds and physics-heavy games.',
    products: [
      {
        name: 'AMD Ryzen 7 5800X',
        approxPriceUSD: '$180-220 new / $130-160 used',
        tier: 'mid',
        vrImpactSummary: 'Eight fast Zen 3 cores with large L3 cache dramatically improve VR frame consistency.',
        notes: 'Drop-in upgrade for AM4 boards. Excellent price-to-performance after Ryzen 7000 launch.'
      },
      {
        name: 'AMD Ryzen 7 5800X3D',
        approxPriceUSD: '$230-280 used',
        tier: 'mid',
        vrImpactSummary: '96MB 3D V-Cache makes this the best VR CPU at any price for cache-sensitive VR workloads.',
        notes: 'AM4 drop-in. If your board is AM4, this is the single best VR CPU upgrade possible.'
      },
      {
        name: 'Intel Core i7-12700K',
        approxPriceUSD: '$220-270 used',
        tier: 'mid',
        vrImpactSummary: 'Strong single-thread performance and efficient P+E core design for VR plus background apps.',
        notes: 'LGA1700 platform required; check motherboard compatibility.'
      }
    ]
  },

  {
    fromTierLevel: 3,
    toTierLevel: 5,
    component: 'cpu',
    reason: 'Ryzen 7 3700X and i7-10700K processors are capable but Zen 3 and Alder Lake CPUs offer meaningfully better single-thread performance and cache — critical for VR compositor scheduling and game physics.',
    products: [
      {
        name: 'AMD Ryzen 7 5800X3D',
        approxPriceUSD: '$230-280 used',
        tier: 'mid',
        vrImpactSummary: 'The definitive AM4 VR CPU — 96MB V-Cache slashes VRChat and game CPU stutter by 20-40%.',
        notes: 'Best bang-for-buck VR CPU upgrade if you have an AM4 motherboard.'
      },
      {
        name: 'AMD Ryzen 9 5900X',
        approxPriceUSD: '$220-260 new / $160-200 used',
        tier: 'mid',
        vrImpactSummary: '12 Zen 3 cores handle VR plus streaming plus background apps with zero competition for resources.',
        notes: 'AM4 platform. Excellent if you stream VR gameplay or run face-tracking alongside VR.'
      },
      {
        name: 'Intel Core i5-13600K',
        approxPriceUSD: '$240-290 new',
        tier: 'mid',
        vrImpactSummary: 'Strong hybrid architecture with excellent single-thread scores for VR compositor deadlines.',
        notes: 'Requires LGA1700 board — factor in platform cost if upgrading from older Intel.'
      }
    ]
  },

  {
    fromTierLevel: 4,
    toTierLevel: 6,
    component: 'cpu',
    reason: 'Ryzen 5 5600X/i5-12600K class CPUs handle most VR well but can bottleneck in highly populated VRChat worlds and physics-heavy games. Ryzen 7000 or i7-13000 series provide meaningful IPC uplift and platform modernization.',
    products: [
      {
        name: 'AMD Ryzen 7 7800X3D',
        approxPriceUSD: '$379-449 new',
        tier: 'high',
        vrImpactSummary: '96MB 3D V-Cache on Zen 4 — the best VR gaming CPU available, period.',
        notes: 'AM5 platform required (new motherboard + DDR5 RAM). Investment pays off for serious VR users.'
      },
      {
        name: 'AMD Ryzen 7 7700X',
        approxPriceUSD: '$249-299 new',
        tier: 'mid',
        vrImpactSummary: 'Zen 4 IPC and DDR5 bandwidth improvements benefit VR scene loading and physics.',
        notes: 'AM5 platform required. Consider 7800X3D for VR-specific use cases.'
      },
      {
        name: 'Intel Core i7-13700K',
        approxPriceUSD: '$300-370 new / $240-290 used',
        tier: 'mid',
        vrImpactSummary: '8P+8E cores balance VR game, compositor, and background workload scheduling efficiently.',
        notes: 'LGA1700 platform — compatible with existing 12th-gen boards.'
      }
    ]
  },

  {
    fromTierLevel: 5,
    toTierLevel: 8,
    component: 'cpu',
    reason: 'The Ryzen 7 5800X3D and 7800X3D represent a unique class of VR-optimized CPUs. Their massive 3D V-Cache reduces the memory latency bottleneck that limits VR in complex scenes, delivering 20-40% lower CPU frame times in cache-sensitive VR workloads.',
    products: [
      {
        name: 'AMD Ryzen 7 7800X3D',
        approxPriceUSD: '$379-449 new',
        tier: 'high',
        vrImpactSummary: 'The current gold standard for VR gaming — 96MB V-Cache dramatically reduces CPU stutter in VRChat and VR games.',
        notes: 'Requires AM5 platform (new board + DDR5). Worth the platform cost for serious PCVR users.'
      },
      {
        name: 'AMD Ryzen 7 5800X3D',
        approxPriceUSD: '$230-280 used',
        tier: 'mid',
        vrImpactSummary: 'Drop-in AM4 upgrade; cache-optimized for VRChat with 20-35% lower CPU frame times vs non-3D CPUs.',
        notes: 'Best value VR CPU on AM4 platform. Socket-compatible with most B450/X570/B550 boards.'
      }
    ]
  },

  // ── RAM Upgrades ───────────────────────────────────────────

  {
    fromTierLevel: 1,
    toTierLevel: 4,
    component: 'ram',
    reason: '8GB RAM is critically insufficient for modern VR. VRChat alone can consume 6-10GB, leaving nothing for the OS, VR runtime, and game simultaneously. Upgrading to 32GB eliminates RAM-related VR crashes and reduces background-pressure stutter.',
    products: [
      {
        name: 'Corsair Vengeance 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$65-80',
        tier: 'budget',
        vrImpactSummary: 'Eliminates RAM shortage crashes and gives VRChat, SteamVR, and Windows ample breathing room.',
        notes: 'Enable XMP/DOCP in BIOS for full 3600MHz speed. Compatible with most Intel/AMD DDR4 boards.'
      },
      {
        name: 'G.Skill Ripjaws V 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$60-75',
        tier: 'budget',
        vrImpactSummary: 'Proven DDR4-3600 kit with reliable XMP support; addresses all VR RAM shortage issues.',
        notes: 'Low-profile heatsink; fits most builds. Enable XMP in BIOS.'
      },
      {
        name: 'Kingston Fury Beast 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$65-80',
        tier: 'budget',
        vrImpactSummary: 'Solid 3600MHz DDR4 that meets the sweet spot for Ryzen and Intel VR platforms.',
        notes: 'Good plug-and-play XMP kit for budget-conscious upgrades.'
      }
    ]
  },

  {
    fromTierLevel: 2,
    toTierLevel: 4,
    component: 'ram',
    reason: '16GB DDR4 below 3200MHz creates a memory bandwidth bottleneck for both CPU and GPU (on AMD systems with integrated fabric). Upgrading to 32GB at 3600MHz significantly improves VR world loading, texture streaming, and physics simulation.',
    products: [
      {
        name: 'G.Skill Trident Z 32GB DDR4-3600 CL16 (2×16GB)',
        approxPriceUSD: '$75-95',
        tier: 'budget',
        vrImpactSummary: 'DDR4-3600 CL16 is the Ryzen sweet spot — improves Infinity Fabric bandwidth for better VR frame pacing.',
        notes: 'Best-in-class DDR4 kit for AM4 Ryzen systems. Enable XMP/DOCP profile in BIOS.'
      },
      {
        name: 'Corsair Vengeance RGB Pro 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$80-100',
        tier: 'budget',
        vrImpactSummary: 'Reliable 3600MHz DDR4 with strong XMP compatibility across Intel and AMD platforms.',
        notes: 'RGB version; functionally identical to non-RGB at same latency.'
      }
    ]
  },

  {
    fromTierLevel: 3,
    toTierLevel: 4,
    component: 'ram',
    reason: 'Doubling from 16GB to 32GB at the same speed reduces OS memory pressure and eliminates RAM-related frame drops in memory-hungry VR applications like VRChat with full-body tracking and avatar shaders loaded.',
    products: [
      {
        name: 'Corsair Vengeance 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$65-80',
        tier: 'budget',
        vrImpactSummary: 'Adds enough headroom for VRChat, SteamVR runtime, OVR Toolkit, and Windows without memory pressure.',
        notes: 'Match existing RAM spec if possible, or replace both sticks for guaranteed dual-channel operation.'
      },
      {
        name: 'Kingston Fury Beast 32GB DDR4-3600 (2×16GB)',
        approxPriceUSD: '$65-80',
        tier: 'budget',
        vrImpactSummary: 'Doubles RAM capacity with minimal investment; addresses VR memory headroom immediately.',
        notes: 'Verify your motherboard has 4 DIMM slots and check QVL for compatibility.'
      }
    ]
  },

  {
    fromTierLevel: 4,
    toTierLevel: 6,
    component: 'ram',
    reason: 'Moving to a DDR5 platform (AM5 or Intel 12th/13th gen with DDR5) and targeting DDR5-6000 CL30 provides better memory bandwidth for GPU data transfer and supports future VR workload growth.',
    products: [
      {
        name: 'G.Skill Trident Z5 32GB DDR5-6000 CL30 (2×16GB)',
        approxPriceUSD: '$100-130',
        tier: 'mid',
        vrImpactSummary: 'DDR5-6000 CL30 is the sweet spot for Ryzen 7000 — maximizes Infinity Fabric bandwidth for VR scene loads.',
        notes: 'Requires DDR5 motherboard (AM5 or Intel 12th/13th/14th gen with DDR5 support). Enable EXPO/XMP.'
      },
      {
        name: 'Corsair Dominator Titanium 32GB DDR5-6000 CL30 (2×16GB)',
        approxPriceUSD: '$120-160',
        tier: 'mid',
        vrImpactSummary: 'Premium DDR5-6000 with excellent stability and high overclocking headroom for Ryzen 7000 platforms.',
        notes: 'DDR5 platform required. Best-in-class stability for 6000MHz operation.'
      },
      {
        name: 'Kingston Fury Beast 32GB DDR5-6000 CL30 (2×16GB)',
        approxPriceUSD: '$95-120',
        tier: 'mid',
        vrImpactSummary: 'Value DDR5-6000 CL30 kit that hits the Ryzen 7000 memory bandwidth sweet spot.',
        notes: 'More affordable entry into DDR5-6000; slightly less overclocking headroom than premium kits.'
      }
    ]
  },

  // ── Storage Upgrades ───────────────────────────────────────

  {
    fromTierLevel: 1,
    toTierLevel: 3,
    component: 'storage',
    reason: 'Running VR games from a spinning hard drive (HDD) causes severe shader compilation stutter and world loading delays. VRChat and other VR titles read textures and shaders continuously during play. An NVMe SSD provides 10-30× faster sequential reads.',
    products: [
      {
        name: 'Samsung 870 EVO 1TB SATA SSD',
        approxPriceUSD: '$79-99',
        tier: 'budget',
        vrImpactSummary: 'Eliminates HDD-caused world-load stutter; 5-10× faster shader reads reduce in-game hitching.',
        notes: 'SATA SSD option if no M.2 slot is available. Significant improvement over HDD.'
      },
      {
        name: 'WD Black SN770 1TB NVMe',
        approxPriceUSD: '$69-89',
        tier: 'budget',
        vrImpactSummary: 'PCIe 4.0 NVMe delivers near-instant world loads and eliminates shader-compile stutter in VR.',
        notes: 'Best budget NVMe for VR. Requires M.2 PCIe slot. Install VR games here.'
      },
      {
        name: 'Crucial P3 Plus 1TB NVMe PCIe 4.0',
        approxPriceUSD: '$59-79',
        tier: 'budget',
        vrImpactSummary: 'Affordable NVMe that eliminates HDD bottleneck for VR game installs.',
        notes: 'Budget pick; lower sustained write speeds than SN770 but adequate for VR game reads.'
      },
      {
        name: 'Samsung 990 Pro 1TB NVMe PCIe 4.0',
        approxPriceUSD: '$99-119',
        tier: 'mid',
        vrImpactSummary: 'Top-tier random read performance minimizes hitching during dynamic VR world loading.',
        notes: 'Premium pick with excellent thermals and longevity. Recommended for heavy VR users.'
      }
    ]
  },

  {
    fromTierLevel: 2,
    toTierLevel: 3,
    component: 'storage',
    reason: 'SATA SSDs top out at ~550 MB/s sequential and ~100K IOPS random. NVMe PCIe 4.0 delivers 3,000-7,000 MB/s sequential and 700K-1M IOPS random — the difference is noticeable in VRChat world load times, shader pre-compilation, and texture streaming during VR gameplay.',
    products: [
      {
        name: 'WD Black SN770 1TB NVMe PCIe 4.0',
        approxPriceUSD: '$69-89',
        tier: 'budget',
        vrImpactSummary: 'Entry-level NVMe delivers 5× faster random reads vs SATA SSD — noticeably faster VR world loads.',
        notes: 'Best budget NVMe for VR. Requires M.2 PCIe slot. Install VR games here.'
      },
      {
        name: 'Samsung 990 Pro 1TB NVMe PCIe 4.0',
        approxPriceUSD: '$99-119',
        tier: 'mid',
        vrImpactSummary: 'Top random-read NVMe — minimises hitching during dynamic VR world asset streaming.',
        notes: 'Premium pick; excellent thermals and longevity. Recommended for heavy VR and VRChat users.'
      },
      {
        name: 'WD Black SN850X 1TB NVMe PCIe 4.0',
        approxPriceUSD: '$119-149',
        tier: 'high',
        vrImpactSummary: 'Among the fastest random-read SSDs available; ideal for large VR game libraries with frequent world changes.',
        notes: 'PCIe 4.0 flagship; includes heatspreader. Requires M.2 PCIe 4.0 slot for full speed.'
      }
    ]
  },

  // ── Network Upgrades ───────────────────────────────────────

  {
    fromTierLevel: 1,
    toTierLevel: 3,
    component: 'network',
    reason: '2.4GHz Wi-Fi is completely unsuitable for wireless VR streaming — the bandwidth is insufficient and interference causes dropouts that trigger VR sickness. Upgrading to a Wi-Fi 6 router enables reliable wireless VR at 150+ Mbps.',
    products: [
      {
        name: 'TP-Link Archer AXE75 (Wi-Fi 6E Tri-Band Router)',
        approxPriceUSD: '$129-159',
        tier: 'mid',
        vrImpactSummary: 'Wi-Fi 6E 6GHz band provides dedicated, interference-free channel for wireless VR streaming.',
        notes: 'Dedicated 6GHz band is ideal for Meta AirLink and Virtual Desktop. Place router in same room as PC.'
      },
      {
        name: 'ASUS RT-AX86U (Wi-Fi 6 Router)',
        approxPriceUSD: '$179-229',
        tier: 'mid',
        vrImpactSummary: 'Reliable Wi-Fi 6 5GHz band with low latency; handles AirLink and Virtual Desktop at 200+ Mbps.',
        notes: 'Well-supported for VR streaming. Wired backhaul to PC strongly recommended.'
      },
      {
        name: 'TP-Link Deco XE75 Pro (Wi-Fi 6E Mesh)',
        approxPriceUSD: '$199-249',
        tier: 'high',
        vrImpactSummary: 'Mesh Wi-Fi 6E for larger homes; dedicated 6GHz backhaul ensures low-latency wireless VR anywhere.',
        notes: 'Best for larger spaces; 6GHz band is key for wireless VR headsets.'
      }
    ]
  },

  {
    fromTierLevel: 2,
    toTierLevel: 4,
    component: 'network',
    reason: 'Wi-Fi 5 5GHz can support wireless VR but lacks the bandwidth headroom for high-bitrate streaming and is susceptible to interference from neighboring networks. Wi-Fi 6E\'s 6GHz band is uncrowded and delivers 150-300 Mbps with low latency for excellent wireless VR.',
    products: [
      {
        name: 'TP-Link Archer BE550 (Wi-Fi 7 Router)',
        approxPriceUSD: '$149-189',
        tier: 'mid',
        vrImpactSummary: 'Wi-Fi 7 with 6GHz support future-proofs wireless VR and delivers excellent bandwidth for AirLink/Virtual Desktop.',
        notes: 'More affordable Wi-Fi 7 option; excellent for wireless VR headsets that support 6GHz.'
      },
      {
        name: 'ASUS RT-AXE7800 (Wi-Fi 6E Tri-Band)',
        approxPriceUSD: '$199-249',
        tier: 'mid',
        vrImpactSummary: 'Tri-band Wi-Fi 6E with dedicated 6GHz frequency for interference-free wireless VR streaming.',
        notes: 'Place near both PC and play area for best results. Wired connection to gaming PC strongly preferred.'
      },
      {
        name: 'Netgear Orbi 960 (Wi-Fi 6E Mesh)',
        approxPriceUSD: '$599-699',
        tier: 'ultra',
        vrImpactSummary: 'Premium whole-home Wi-Fi 6E mesh with 10Gbps wired backhaul — optimal for wireless VR in large spaces.',
        notes: 'High cost; only recommended for large homes where router placement near play area is impossible.'
      }
    ]
  },

  {
    fromTierLevel: 3,
    toTierLevel: 4,
    component: 'network',
    reason: 'Wi-Fi 6 5GHz is good for wireless VR but the 6GHz band offered by Wi-Fi 6E is cleaner (no legacy device congestion), allows wider 160MHz channels, and provides more consistent low-latency streaming for demanding wireless VR.',
    products: [
      {
        name: 'TP-Link Archer AXE5400 (Wi-Fi 6E)',
        approxPriceUSD: '$99-129',
        tier: 'budget',
        vrImpactSummary: 'Entry-level Wi-Fi 6E adds the uncongested 6GHz band for noticeably smoother wireless VR.',
        notes: 'Most affordable Wi-Fi 6E router. Significant wireless VR improvement if in a congested 5GHz environment.'
      },
      {
        name: 'ASUS RT-AXE7800 (Wi-Fi 6E Tri-Band)',
        approxPriceUSD: '$199-249',
        tier: 'mid',
        vrImpactSummary: 'Reliable 6GHz Wi-Fi 6E with gaming-optimized QoS for consistent wireless VR latency.',
        notes: 'Widely recommended for Meta Quest wireless VR (AirLink and Virtual Desktop).'
      }
    ]
  },

  {
    fromTierLevel: 3,
    toTierLevel: 5,
    component: 'network',
    reason: 'Switching from Wi-Fi to a wired Ethernet connection to your PC eliminates all wireless-related VR streaming latency, jitter, and interference. The PC can then relay a stable encoded stream to the headset regardless of Wi-Fi quality.',
    products: [
      {
        name: 'Cat 6 Ethernet Cable (25ft / 50ft)',
        approxPriceUSD: '$12-25',
        tier: 'budget',
        vrImpactSummary: 'Wired Ethernet eliminates all PC-side network jitter; the single best network upgrade for VR streaming PCs.',
        notes: 'Run cable from router/switch to gaming PC. Even Wi-Fi-connected headsets benefit when the PC is wired.'
      },
      {
        name: 'TP-Link TL-SG108 8-Port Gigabit Switch',
        approxPriceUSD: '$18-25',
        tier: 'budget',
        vrImpactSummary: 'Expands wired ports near your PC so both desktop and router can be on stable Ethernet.',
        notes: 'Unmanaged switch; plug-and-play. No configuration needed.'
      }
    ]
  },

  {
    fromTierLevel: 4,
    toTierLevel: 6,
    component: 'network',
    reason: '2.5GbE Ethernet future-proofs your PC network connection for next-gen high-bitrate wireless VR streaming and high-speed NAS/content transfers. Standard gigabit can become a bottleneck with 200Mbps+ VR streaming bitrates.',
    products: [
      {
        name: 'ASUS XG-C100C 10GbE PCIe NIC',
        approxPriceUSD: '$59-79',
        tier: 'budget',
        vrImpactSummary: 'Adds 10GbE to any PC for future-proof high-speed networking; overkill for current wireless VR but ideal for NAS or streaming setups.',
        notes: 'Requires 10GbE switch or router port to be useful; most routers top out at 2.5GbE.'
      },
      {
        name: 'TP-Link 2.5G USB Ethernet Adapter (UE306)',
        approxPriceUSD: '$22-29',
        tier: 'budget',
        vrImpactSummary: 'Plug-in 2.5GbE adapter if your motherboard lacks a 2.5G port; practical future-proofing.',
        notes: 'USB 3.0 required. Easy installation, no PCIe slot needed.'
      }
    ]
  }
]
