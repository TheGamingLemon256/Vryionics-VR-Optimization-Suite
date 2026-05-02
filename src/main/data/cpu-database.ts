// Vryionics VR Optimization Suite — CPU Knowledge Base
// Baked-in AMD CPU database for VR-specific diagnostics.
// No LLM required at runtime — all knowledge is static and curated.


export interface VCacheCCD {
  /** 0-indexed CCD number */
  ccdIndex: number
  /** Inclusive logical core range, e.g. [0, 7] means cores 0–7 */
  coreRange: [number, number]
  hasVCache: boolean
  /** Human-readable note about this CCD's performance characteristics */
  clockNote?: string
}

/**
 * Intel-hybrid topology. Populated for Alder Lake (12th gen) and later chips
 * that combine Performance cores with Efficient cores. VR rules use this to
 * advise pinning VR processes to P-cores and preventing Windows from
 * migrating them to E-cores.
 */
export interface HybridTopology {
  /** Performance-core physical count (e.g. 8 on 12900K). */
  pCores: number
  /** Efficient-core physical count (e.g. 8 on 12900K, 16 on 13900K/14900K). */
  eCores: number
  /**
   * Affinity mask that targets ONLY the P-cores with SMT pairs.
   * e.g. on 12900K (8P / 16 logical): '0xFFFF' → P-core logicals 0-15.
   */
  pCoreAffinityMask: string
  /** Per-core-type clock notes. */
  pCoreMaxGHz: number
  eCoreMaxGHz: number
  /** Human-readable note about hybrid scheduling for this specific chip. */
  hybridNote: string
}

export interface CpuDbEntry {
  /** Match patterns checked case-insensitively against CpuData.model */
  modelPatterns: string[]
  /**
   * Physical socket. AM4/AM5 are AMD; LGA1151/1200/1700/1851 are Intel.
   * Rules use this to branch on platform-specific advice.
   */
  socket: 'AM4' | 'AM5' | 'LGA1151' | 'LGA1200' | 'LGA1700' | 'LGA1851'
  /** Vendor for fast filtering — derived from socket but explicit for clarity. */
  vendor: 'AMD' | 'Intel'
  /** Microarchitecture codename, e.g. 'Zen 3 + 3D V-Cache', 'Raptor Lake Refresh'. */
  codename: string
  cores: number
  /** Number of Core Complex Dies (AMD only). 0 for Intel. */
  ccdCount: number

  ramType: 'DDR4' | 'DDR5' | 'DDR4/DDR5'  // Alder Lake supports both
  /** JEDEC-rated maximum officially supported speed (MHz) */
  maxOfficialRamMHz: number
  /** Sweet-spot speed for this CPU — best latency/bandwidth ratio for VR */
  optimalRamMHz: number
  /** Human-readable explanation of why this speed is optimal */
  optimalRamNote: string

  hasVCache: boolean
  /** Per-CCD breakdown — only present on V-Cache CPUs */
  vcacheCCDs?: VCacheCCD[]
  /**
   * Hex affinity mask string for VR processes (e.g. '0xFF').
   * Targets the V-Cache CCD on dual-CCD chips; all cores on single-CCD chips.
   */
  vrAffinityMask?: string
  vrAffinityNote?: string
  /**
   * Hex affinity mask (no '0x' prefix) for the Steam launch-option fix.
   * Only set on single-CCD X3D parts where every core has V-Cache and is
   * therefore a safe target. Dual-CCD X3D parts omit this: the V-Cache CCD
   * index varies by BIOS, and shipping the wrong mask silently de-optimizes.
   * Real runtime CCD detection lands in v0.3.
   */
  vcacheAffinityMask?: string

  /** Only set for Alder Lake+ hybrid chips (12th gen and later, Core Ultra). */
  hybrid?: HybridTopology

  /**
   * - 'single-thread-dominant': raw IPC/clock wins (e.g. 7700X, 14900K stock)
   * - 'cache-dominant': 3D V-Cache provides the biggest VR gains (e.g. 7950X3D)
   * - 'balanced': good all-rounder (e.g. 7900X, 13700K)
   * - 'hybrid-scheduling': Intel P/E core mix; VR perf depends on scheduling
   */
  vrProfile: 'single-thread-dominant' | 'cache-dominant' | 'balanced' | 'hybrid-scheduling'

  /** VR-specific quirks for this CPU */
  quirks: string[]

  /**
   * VR gaming performance tier.
   * 'top' = 7950X3D / 9950X3D / 14900K / 285K class
   * 'high' = 7800X3D / 9800X3D / 7700X / 14700K / 13700K class
   * 'mid'  = 5800X3D / 7600X / 12700K / 13600K class
   * 'budget' = 3600 / 5600 / 12400F / 13400 class
   */
  vrTier: 'top' | 'high' | 'mid' | 'budget'
}


export interface MixedRamGuidance {
  situation: string
  recommendation: string
  riskLevel: 'low' | 'medium' | 'high'
}

export const MIXED_RAM_GUIDANCE: MixedRamGuidance[] = [
  {
    situation: '4 sticks DDR5 — two matched kits of the same speed',
    recommendation:
      'Enable XMP/EXPO at rated speed. Four sticks stress the memory controller more than two, so if you see instability, reduce the speed by one step (e.g. 6000 → 5600). Subtimings may also need relaxation.',
    riskLevel: 'low',
  },
  {
    situation: '4 sticks DDR5 — two kits with different rated speeds (e.g. 2×5400 + 2×6000)',
    recommendation:
      'Run all four sticks at the speed of the slower kit (5400 MHz in this example). This is the correct stability choice. The memory controller on AM5 struggles significantly with four mismatched sticks above 5400 MHz. When budget allows, replace the entire set with a single matched 2×32 GB DDR5-6000 CL30 kit for best results.',
    riskLevel: 'medium',
  },
  {
    situation: '4 sticks DDR4 — two kits with different rated speeds',
    recommendation:
      'Run at the speed of the slower kit. For AM4, the 1:1 FCLK sweet spot is 3600–3800 MHz, so if your slower kit is DDR4-3200, consider whether upgrading makes sense.',
    riskLevel: 'medium',
  },
  {
    situation: '2 sticks DDR5 — both the same speed and capacity (matched kit)',
    recommendation:
      'Ideal configuration. Enable XMP/EXPO and target DDR5-6000 for AM5 processors. This achieves FCLK 2000 MHz in 1:1 mode with lowest latency.',
    riskLevel: 'low',
  },
  {
    situation: '2 sticks DDR4 — both the same speed (matched kit)',
    recommendation:
      'Ideal configuration. Enable XMP/EXPO and target DDR4-3600 (FCLK 1800, 1:1) for Zen 2 or DDR4-3600–3800 for Zen 3.',
    riskLevel: 'low',
  },
  {
    situation: 'DDR5 capacity: 32 GB (2×16 GB)',
    recommendation:
      'Sweet spot for VR gaming. Sufficient for all current VR titles including VRChat with populated worlds and streaming software running simultaneously.',
    riskLevel: 'low',
  },
  {
    situation: 'DDR5 capacity: 64 GB (2×32 GB)',
    recommendation:
      'Recommended for VR content creators running Blender, DaVinci Resolve, or game capture alongside VR. Minimal gaming benefit over 32 GB but provides headroom.',
    riskLevel: 'low',
  },
]


export const CPU_DATABASE: CpuDbEntry[] = [
  // AM4 — Zen 2 (Ryzen 3000 series)

  {
    modelPatterns: ['3600xt', '3600 xt'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 sets FCLK to 1800 MHz, achieving 1:1 FCLK/MCLK/UCLK mode — lowest latency on Zen 2. Going above 3733 often forces 2:1 mode and hurts performance.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Zen 2 Infinity Fabric has the tightest FCLK ceiling of Zen 2/3/4 — 1900 MHz is only achievable on the best silicon.',
      'DDR4-3600 with CL16 timings is the universally safe and optimal configuration.',
      '3600XT has slightly higher boost bins than 3600X but same architecture.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['3600x', '3600 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 sets FCLK to 1800 MHz, achieving 1:1 FCLK/MCLK/UCLK mode — lowest latency on Zen 2.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Identical die to 3600 but with higher boost clocks.',
      '1:1 FCLK at 1800 MHz (DDR4-3600) is essential for minimizing Infinity Fabric latency.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['ryzen 5 3600', ' 3600 '],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 (FCLK 1800 MHz, 1:1 mode) is the universally recommended speed for all Zen 2 AM4 processors.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Six-core Zen 2 is the minimum practical core count for modern PCVR. Can struggle with demanding titles plus background apps.',
      'FCLK 1800 MHz (DDR4-3600) is the sweet spot — do not try DDR4-3800 unless silicon is confirmed stable.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['3800xt', '3800 xt'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 at CL16 is optimal for Zen 2. Eight cores provides good VR headroom.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Single 8-core CCD — no cross-CCD latency penalty unlike Zen 2 12/16-core parts.',
      'Highest-clocked Zen 2 8-core; all boost improvements are within the same CCD.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['3800x', '3800 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 at FCLK 1800 MHz (1:1) is optimal. Tighten secondary/tertiary timings for best VR frame pacing.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Single CCD — good single-thread performance without cross-CCD latency.',
      'Competitive VR performer for its era; single-core clocks are the main limit.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['3700x', '3700 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 with 1:1 FCLK is the optimal and safest configuration for Zen 2.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Lower TDP than 3800X; boost clocks are slightly lower but thermal headroom is better.',
      'Single CCD topology is beneficial for VR workloads.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['3900xt', '3900 xt'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 at FCLK 1800 MHz is optimal. Dual-CCD design means cross-CCD latency exists but is managed by the Infinity Fabric.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×6-core). Cross-CCD latency is ~100ns when a VR thread migrates between CCDs.',
      'Windows scheduler may not always keep VR threads on the same CCD — MMCSS priority helps.',
      'Overkill core count for gaming; single-thread performance matters more for VR.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['3900x', '3900 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 (1:1 FCLK 1800) is the sweet spot for Zen 2 across all configurations.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD. For pure VR gaming, the 3800X often outperforms this CPU in single-thread tasks.',
      'Excellent for simultaneous content creation and VR streaming.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['3950x', '3950 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 2',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 (FCLK 1800, 1:1) is optimal. Higher latency concern than 8-core due to dual-CCD cross-CCD migrations.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD, 8 cores per CCD. Cross-CCD thread migrations can spike VR frame times.',
      'More cores than any single VR title can use efficiently; single-thread IPC is the limit.',
      'Excellent for VR creators and streamers — VR + OBS + editing simultaneously is viable.',
    ],
    vrTier: 'mid',
  },

  // AM4 — Zen 3 (Ryzen 5000 series)

  {
    modelPatterns: ['5600x3d', '5600 x3d'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3 + 3D V-Cache',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1 mode) is optimal. The V-Cache adds 64 MB L3 to this 6-core chip.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 5],
        hasVCache: true,
        clockNote: 'All 6 cores have 3D V-Cache. Boost clocks are slightly lower than non-V-Cache 5600X due to thermal constraints.',
      },
    ],
    vrAffinityMask: '0x3F',
    vrAffinityNote: 'All 6 cores have V-Cache — affinity mask 0x3F (all cores) is correct.',
    vrProfile: 'cache-dominant',
    quirks: [
      'All 6 cores on the single CCD have 3D V-Cache — no split like dual-CCD X3D CPUs.',
      'Cannot be overclocked; Precision Boost Overdrive is disabled by AMD.',
      'Rare part — only sold in certain markets. Good budget V-Cache option.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['5600x', '5600 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 with FCLK 1800 MHz is optimal. DDR4-3800 CL16 is possible on good silicon (FCLK 1900, borderline 1:1) but test for stability.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Excellent single-core performance for its price point.',
      'Single CCD — no cross-CCD latency. Good budget PCVR processor.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['ryzen 5 5600 ', ' 5600 '],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800) is optimal and safest for Zen 3.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Non-X variant; slightly lower boost clocks than 5600X but still Zen 3 IPC.',
      'Best budget entry point for Zen 3 PCVR.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['5700x3d', '5700 x3d'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3 + 3D V-Cache',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1). The 3D V-Cache on all 8 cores makes this an excellent mid-tier VR CPU.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote: 'All 8 cores have 3D V-Cache. Boost clocks capped lower than 5700X due to V-Cache thermal overhead.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote: 'All 8 cores are V-Cache cores — no affinity adjustment needed; use all cores.',
    vrProfile: 'cache-dominant',
    quirks: [
      'All 8 cores on single CCD have 3D V-Cache — identical topology to 5800X3D but newer revision.',
      'Cannot be overclocked; Precision Boost Overdrive is disabled.',
      'DDR4-3600 1:1 FCLK is especially important here — V-Cache latency benefits are best realized with low IF latency.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['5700x', '5700 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1). Some samples support DDR4-3800 CL16 (FCLK 1900 borderline 1:1) — test with memtest86 before relying on it.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      '65W TDP with strong single-core boost — often competes with 5800X in practice.',
      'Single CCD topology is ideal for VR workloads.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['5800x3d', '5800 x3d'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3 + 3D V-Cache',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1) is strongly recommended. The V-Cache amplifies Infinity Fabric efficiency — running with slow RAM wastes the cache advantage.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote:
          '96 MB 3D V-Cache stacked on all 8 cores. Boost clock is lower (~4.5 GHz) vs non-V-Cache 5800X (~4.7 GHz) — intentional, cache wins over clocks for VR.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote: 'All 8 cores are V-Cache cores — no affinity split needed. All cores are equivalent.',
    vcacheAffinityMask: 'FF',
    vrProfile: 'cache-dominant',
    quirks: [
      'THE original 3D V-Cache CPU — all 8 cores have V-Cache, no split topology.',
      'Cannot be overclocked via PBO or manual voltage. AMD locked it to protect the V-Cache solder.',
      'Lower max boost (~4.5 GHz) than 5800X but cache size dominates for VR workloads.',
      'Best AM4 gaming CPU ever made. Still competitive with modern AM5 non-X3D parts in VR.',
      'Register vrserver.exe and VRChat.exe in AMD V-Cache driver if amd3dvcacheSvc is present.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['5800x', '5800 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1). Aggressive manual subtimings (tRCDRD, tRP, tRFC) can further reduce Infinity Fabric latency.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Highest single-thread boost clocks of any Zen 3 8-core non-X3D part.',
      'Single CCD — optimal topology for VR workloads.',
      'Runs hotter than 5600X/5700X — ensure adequate cooling for sustained boost.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['5900x', '5900 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1). Dual CCD — both CCDs share the same FCLK, so 1:1 mode benefits all inter-CCD traffic.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×6-core). Cross-CCD thread migration adds ~100ns latency.',
      'Windows may schedule VR threads across CCDs — not a problem in practice but MMCSS priority helps keep key threads stable.',
      'Excellent all-rounder: VR gaming + streaming + content creation simultaneously.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['5950x', '5950 x'],
    socket: 'AM4',
    vendor: 'AMD',
    codename: 'Zen 3',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'DDR4-3600 CL16 (FCLK 1800, 1:1). The highest-tier Zen 3 AM4 CPU benefits from low-latency RAM to minimize cross-CCD Infinity Fabric overhead.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×8-core). For pure VR gaming, the 5800X3D often outperforms this CPU.',
      'Ideal for VR content creators who need CPU rendering + VR simultaneously.',
      'Highest Zen 3 AM4 boost clocks — single-thread performance is excellent.',
    ],
    vrTier: 'high',
  },

  // AM5 — Zen 4 (Ryzen 7000 series, non-X3D)

  {
    modelPatterns: ['7600x', '7600 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 sets FCLK to 2000 MHz in 1:1 mode — the "magic number" for AM5. Above DDR5-6400, the controller enters 2:1 UCLK mode which INCREASES latency.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Highest single-thread boost of any 6-core on AM5.',
      'Single CCD — great VR topology with no cross-CCD latency.',
      'DDR5-6000 CL30 is non-negotiable for realizing full Zen 4 performance.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['ryzen 5 7600', ' 7600 '],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 for FCLK 2000 MHz 1:1 mode. Budget Zen 4 part with excellent VR single-thread performance.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Non-X variant; slightly lower boost than 7600X but lower TDP.',
      'Single CCD is ideal for VR — all cache is local, no cross-CCD overhead.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['7700x', '7700 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Single CCD with 32 MB L3 — strong VR performer for non-X3D Zen 4.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Single CCD with 8 cores — ideal topology for VR.',
      'High boost clocks; runs warm under sustained load. Adequate cooling is important.',
      'For pure VR gaming, the 7800X3D is usually preferred over this CPU.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['ryzen 7 7700', ' 7700 '],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 is the sweet spot. Lower TDP than 7700X with similar real-world boost thanks to better thermal headroom.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      '65W TDP — often sustains boost better than 7700X in poorly cooled systems.',
      'Single CCD is perfect for VR workload locality.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['7900x', '7900 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Dual CCD — optimal RAM speed reduces the cost of cross-CCD Infinity Fabric traffic.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×6-core). Cross-CCD latency exists but is less impactful than on Zen 2/3 at the same FCLK.',
      'Excellent all-rounder; pairs well with VR streaming and content creation.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['ryzen 9 7900', ' 7900 '],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30. Lower TDP variant; similar real-world VR performance to 7900X in most workloads.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD. For pure VR gaming the 7800X3D or 7700X may edge this out in single-thread scenarios.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['7950x', '7950 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Highest-end non-X3D Zen 4. DDR5-6000 minimizes the cross-CCD latency cost of dual-CCD operation.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×8-core). Raw gaming performance is high but the 7950X3D adds V-Cache for a meaningful VR boost.',
      'Best Zen 4 CPU for combined VR + workstation tasks.',
      'High boost clocks (~5.7 GHz) give strong single-thread performance for game engine main threads.',
    ],
    vrTier: 'high',
  },

  // AM5 — Zen 4 + 3D V-Cache (Ryzen 7000X3D series)

  {
    modelPatterns: ['7800x3d', '7800 x3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4 + 3D V-Cache',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1) is essential. The V-Cache amplifies the benefit of low-latency memory — running below 5600 MHz noticeably reduces cache efficiency.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote:
          '96 MB 3D V-Cache on all 8 cores. Boost clock ~5.0 GHz (lower than 7700X\'s ~5.4 GHz) — intentional; cache wins for gaming and VR.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote:
      'All 8 cores are V-Cache cores — no affinity split needed. Windows scheduler (with AMD driver) handles this correctly for single-CCD chips.',
    vcacheAffinityMask: 'FF',
    vrProfile: 'cache-dominant',
    quirks: [
      'Best single-GPU gaming CPU as of 2024 — single CCD with full V-Cache coverage.',
      'Windows 11 V-Cache-aware scheduler correctly prioritizes this CPU for games with no manual intervention.',
      'Cannot be overclocked via PBO; AMD locked voltages to protect the V-Cache bonding.',
      'All 8 cores are equal — no affinity mask needed. Register VRChat.exe and vrserver.exe in AMD V-Cache driver for best results.',
      'DDR5-6000 CL30 is non-negotiable — the V-Cache effectiveness is directly tied to Infinity Fabric latency.',
    ],
    vrTier: 'top',
  },
  {
    modelPatterns: ['7900x3d', '7900 x3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4 + 3D V-Cache',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Reducing IF latency is especially important on dual-CCD X3D parts where VR threads should stay on CCD0.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 5],
        hasVCache: true,
        clockNote:
          'CCD0: 6 cores with 97 MB 3D V-Cache. Boost clock ~5.4 GHz (throttled vs CCD1). This CCD handles cache-sensitive VR workloads.',
      },
      {
        ccdIndex: 1,
        coreRange: [6, 11],
        hasVCache: false,
        clockNote:
          'CCD1: 6 standard cores, 32 MB L3. Boost clock ~5.6 GHz. Better for lightly-threaded, clock-speed-sensitive workloads.',
      },
    ],
    vrAffinityMask: '0x3F',
    vrAffinityNote:
      'Mask 0x3F = cores 0–5 (CCD0, V-Cache). Set VRChat.exe and vrserver.exe affinity to this mask for best VR performance.',
    vrProfile: 'cache-dominant',
    quirks: [
      'Dual CCD: CCD0 (cores 0–5) has 3D V-Cache, CCD1 (cores 6–11) does not.',
      'Windows may schedule VR processes on CCD1 (higher clocks) — this is suboptimal for VRChat.',
      'Manual affinity mask 0x3F (decimal 63) forces cores 0–5 for VRChat.exe and vrserver.exe.',
      'AMD V-Cache driver (amd3dvcacheSvc) handles scheduling automatically if apps are registered.',
      'Fewer V-Cache cores (6) than 7950X3D (8) — consider 7800X3D for pure VR gaming.',
    ],
    vrTier: 'top',
  },
  {
    modelPatterns: ['7950x3d', '7950 x3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 4 + 3D V-Cache',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1) is critical. The V-Cache on CCD0 is directly aided by low IF latency — suboptimal RAM speed undermines the 3D V-Cache advantage.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote:
          'CCD0: 8 cores with 97 MB 3D V-Cache. Max boost ~4.2 GHz (throttled by V-Cache stacking thermal). This is INTENTIONAL — cache beats clocks for VRChat/VR world streaming.',
      },
      {
        ccdIndex: 1,
        coreRange: [8, 15],
        hasVCache: false,
        clockNote:
          'CCD1: 8 standard cores, 32 MB L3. Max boost ~5.7 GHz. Windows sometimes schedules games here — suboptimal for VR/VRChat.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote:
      'Mask 0xFF = cores 0–7 (CCD0, V-Cache). Manually setting VRChat.exe and vrserver.exe affinity to cores 0–7 forces the 3D V-Cache CCD and can significantly improve VRChat performance over letting Windows decide.',
    vrProfile: 'cache-dominant',
    quirks: [
      'Dual CCD: CCD0 (cores 0–7) has 97 MB 3D V-Cache; CCD1 (cores 8–15) has 32 MB standard cache.',
      'CCD0 boost clocks (~4.2 GHz) are LOWER than CCD1 (~5.7 GHz) — this is intentional. Cache size beats clock speed for VRChat world loading and avatar streaming.',
      'Windows may schedule VRChat on CCD1 (higher clocks) — this is the wrong choice for VR. Manual affinity to cores 0–7 (mask 0xFF) fixes this.',
      'AMD V-Cache driver (amd3dvcacheSvc) can handle this automatically when VRChat.exe and vrserver.exe are registered.',
      'Registry path for permanent affinity: HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App\\VRChat.exe',
      'Best CPU for combined VR + workstation workloads (content creation on CCD1, VR on CCD0).',
    ],
    vrTier: 'top',
  },

  // AM5 — Zen 5 (Ryzen 9000 series, non-X3D)

  {
    modelPatterns: ['9600x', '9600 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5',
    cores: 6,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Zen 5 gains ~16% IPC over Zen 4 — the same DDR5-6000 sweet spot applies.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Zen 5 brings ~16% IPC improvement over Zen 4 at equivalent clocks.',
      'Single CCD — ideal for VR workload locality.',
      'Competitive budget VR option with strong single-core performance.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['9700x', '9700 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Single CCD Zen 5 with 32 MB L3 — excellent VR all-rounder.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Zen 5 IPC ~16% ahead of equivalent Zen 4.',
      'Single CCD with 8 cores — ideal topology for VR.',
      'For pure VR gaming, the 9800X3D is significantly better; this CPU is best when VR + productivity loads share the system.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['9900x', '9900 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5',
    cores: 12,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Dual CCD — 1:1 FCLK reduces the cost of cross-CCD Infinity Fabric traffic.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×6-core). Cross-CCD latency is mitigated by Zen 5\'s improved IF speeds.',
      'Good balance of core count and single-thread performance for VR + multitasking.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['9950x', '9950 x'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Flagship non-X3D Zen 5. Low IF latency is important to minimize dual-CCD cross-die penalties.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Dual CCD (2×8-core). Highest performance Zen 5 non-X3D.',
      'For pure VR gaming the 9950X3D is preferred; this CPU excels when mixing VR with heavy compute tasks.',
      'Zen 5 IPC improvement makes this faster than 7950X in most workloads.',
    ],
    vrTier: 'high',
  },

  // AM5 — Zen 5 + 3D V-Cache (Ryzen 9000X3D series)

  {
    modelPatterns: ['9800x3d', '9800 x3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5 + 3D V-Cache',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1) is optimal. As with 7800X3D, V-Cache effectiveness is tied to IF latency — low-latency DDR5-6000 is mandatory for full performance.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote:
          'All 8 cores have 3D V-Cache. Zen 5 IPC + V-Cache = highest gaming performance per core ever achieved as of 2025.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote:
      'All 8 cores are V-Cache cores — single CCD, no affinity split needed. Windows scheduler handles this correctly with AMD driver.',
    vcacheAffinityMask: 'FF',
    vrProfile: 'cache-dominant',
    quirks: [
      'Best single-CCD gaming CPU as of 2024/2025 — Zen 5 IPC + 96 MB V-Cache on all 8 cores.',
      'Single CCD means all cores are equal V-Cache cores; no manual affinity adjustment needed.',
      'Windows 11 V-Cache-aware scheduler works correctly. Register VRChat.exe and vrserver.exe in AMD V-Cache driver for explicit priority.',
      'V-Cache voltage protection prevents manual overclocking — operates on AMD\'s Precision Boost algorithm.',
      'The combination of Zen 5 IPC and V-Cache makes this the definitive VR gaming CPU for single-GPU VR setups.',
    ],
    vrTier: 'top',
  },
  {
    // TODO: verify the dual-CCD V-cache layout against a real 9950X3D when one
    // shows up in the wild — copying assumptions from the 7950X3D for now.
    modelPatterns: ['9950x3d', '9950 x3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Zen 5 + 3D V-Cache',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 (FCLK 2000, 1:1). Critical for minimizing cross-CCD latency and maximizing V-Cache efficiency on CCD0.',
    hasVCache: true,
    vcacheCCDs: [
      {
        ccdIndex: 0,
        coreRange: [0, 7],
        hasVCache: true,
        clockNote:
          'CCD0: 8 Zen 5 cores with 97 MB 3D V-Cache. Lower boost clock than CCD1 — cache > clocks for VR.',
      },
      {
        ccdIndex: 1,
        coreRange: [8, 15],
        hasVCache: false,
        clockNote:
          'CCD1: 8 standard Zen 5 cores, 32 MB L3. Higher boost clocks. Ideal for workstation/productivity tasks running alongside VR.',
      },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote:
      'Mask 0xFF = cores 0–7 (CCD0, V-Cache). Set VRChat.exe and vrserver.exe affinity to cores 0–7 for best VR performance. Same topology as 7950X3D but with Zen 5 IPC.',
    vrProfile: 'cache-dominant',
    quirks: [
      'Dual CCD: CCD0 (cores 0–7) has 3D V-Cache; CCD1 (cores 8–15) does not. Same layout as 7950X3D.',
      'Windows may schedule VRChat on CCD1 (higher clocks) — incorrect for VR. Set manual affinity to cores 0–7.',
      'AMD V-Cache driver with registered app entries handles this automatically.',
      'Registry path: HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App\\VRChat.exe',
      'Zen 5 IPC makes this faster than 7950X3D across all workloads while sharing the same V-Cache topology.',
      'Best CPU for users who run VR gaming AND heavy workstation loads (rendering, simulation) simultaneously.',
    ],
    vrTier: 'top',
  },

  // LGA1200 — Intel 10th/11th gen (Comet Lake / Rocket Lake)
  // Not hybrid — all P-cores. Limited VR-specific tuning value vs
  // modern hybrid chips, but still common in the install base.

  {
    modelPatterns: ['i5-10400', 'i5 10400'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Comet Lake',
    cores: 6,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 2666,
    optimalRamMHz: 3200,
    optimalRamNote:
      'Comet Lake memory controllers are rated for DDR4-2666 official but comfortably run DDR4-3200 via XMP. Above 3200 requires manual trim and rarely helps VR — latency-limited. The non-K variant has a locked multiplier, so don\'t waste time overclocking.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Minimum-spec VR CPU by 2025 standards. Capable of 90 Hz VR in most mid-weight titles but struggles with CPU-heavy games (VRChat, MSFS, DCS).',
      'Locked multiplier — no meaningful overclocking, so focus on RAM XMP and thermal tuning.',
      'DDR4 memory is cheap — upgrading to 32 GB DDR4-3200 is the best performance/dollar upgrade.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['i5-10600k', 'i5 10600k', 'i5-10600', 'i5 10600'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Comet Lake',
    cores: 6,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 2666,
    optimalRamMHz: 3600,
    optimalRamNote:
      'i5-10600K unlocked multiplier allows mild all-core OC to 4.7-4.8 GHz. DDR4-3600 with tightened timings (CL16 or better) improves 1% lows in VRChat. Above DDR4-3800 has rapid diminishing returns on this platform.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Unlocked K-series — mild all-core overclock to 4.7 GHz is safe with a 240mm AIO.',
      'Hyperthreading enabled in this generation. Disabling HT sometimes improves min FPS in old DX11 VR titles but hurts modern DX12/Vulkan.',
      'Competes well with Ryzen 5 5600X in VR due to monolithic die (lower memory latency).',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i7-10700k', 'i7 10700k', 'i7-10700', 'i7 10700'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Comet Lake',
    cores: 8,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 2933,
    optimalRamMHz: 3600,
    optimalRamNote:
      '10700K supports DDR4-2933 officially; 3600 with CL16 is the sweet spot for VR. Don\'t exceed 4000 — memory controller instability is common above that.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Solid all-round VR CPU for its generation — 8 cores / 16 threads handles VRChat populated instances better than 6-core peers.',
      'Gains ~5-10% over 10600K in CPU-bound VR due to extra cores/cache.',
      'Replace-it-outright-before-upgrading-RAM candidate if budget allows — still strong, but 5800X3D / 12700K / 13600K beat it handily.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i9-10900k', 'i9 10900k', 'i9-10900', 'i9 10900'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Comet Lake',
    cores: 10,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 2933,
    optimalRamMHz: 3800,
    optimalRamNote:
      'i9-10900K\'s ring bus scales with RAM speed. DDR4-3800 CL16 1:1 mode (Gear 1) is the ideal target. Above this, the controller often forces Gear 2 which doubles memory latency.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      '10 cores of identical high-clock P-cores — no hybrid scheduling concerns.',
      'TVB (Thermal Velocity Boost) to 5.3 GHz under ideal cooling. Needs a 280mm+ AIO to hold boost.',
      'Still a very capable VR CPU — beats 11900K in most VR titles due to higher core count.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i5-11400', 'i5 11400'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Rocket Lake',
    cores: 6,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3600,
    optimalRamNote:
      'Rocket Lake added Gear 1/Gear 2 modes. Keep DDR4-3600 in Gear 1 for best VR latency. Above DDR4-3733 forces Gear 2 which doubles memory access latency — catastrophic for VR.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Rocket Lake IPC uplift (~19%) over Comet Lake, but at cost of higher power draw.',
      'Critical: verify Gear 1 mode in BIOS/HWiNFO. Gear 2 has been mis-defaulted on many B560 boards.',
      'Locked multiplier — XMP and BIOS Gear 1 are the only meaningful tuning knobs.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['i5-11600k', 'i5 11600k', 'i5-11600', 'i5 11600'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Rocket Lake',
    cores: 6,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3733,
    optimalRamNote:
      'i5-11600K maxes out Rocket Lake Gear 1 at DDR4-3733 CL16 on most samples. This is THE memory sweet spot for this chip — above it, Gear 2 halves memory throughput for VR workloads.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Unlocked K-series with decent thermal headroom — modest all-core OC to 4.9 GHz is viable on a 240mm AIO.',
      'Gear 1 mode at DDR4-3733 is the critical config. Verify in BIOS and HWiNFO sensors.',
      'For VRChat populated worlds, this chip is borderline — expect occasional stutters with 40+ avatars.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i7-11700k', 'i7 11700k', 'i7-11700', 'i7 11700'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Rocket Lake',
    cores: 8,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3800,
    optimalRamNote:
      'i7-11700K stable Gear 1 maximum is typically DDR4-3800 CL16. This is the ideal VR config — higher speeds push into Gear 2 and lose the benefit.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      '8P/16T, no hybrid scheduling headaches. Handles VR + streaming simultaneously better than 10700K.',
      'Runs hot — expect 85-95°C on stock cooler under all-core loads. Budget for a 240mm+ AIO.',
      'Direct upgrade path: i9-11900K is marginal (same core count, ~5% higher clocks). 12700K is a far better upgrade.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i9-11900k', 'i9 11900k', 'i9-11900', 'i9 11900'],
    socket: 'LGA1200',
    vendor: 'Intel',
    codename: 'Rocket Lake',
    cores: 8,
    ccdCount: 0,
    ramType: 'DDR4',
    maxOfficialRamMHz: 3200,
    optimalRamMHz: 3800,
    optimalRamNote:
      'Same memory controller as 11700K; DDR4-3800 Gear 1 is the VR sweet spot. Above this forces Gear 2 and hurts more than it helps.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      'Only 8 cores despite being flagship — Intel cut core count from 10900K (10 cores) to 8 for the Cypress Cove redesign.',
      'Highest single-thread perf of any Rocket Lake — good for legacy DX11 VR titles.',
      '12700K matches or beats it in VR for less money and cooler operation.',
    ],
    vrTier: 'high',
  },

  // LGA1700 — Intel 12th/13th/14th gen (Alder Lake / Raptor Lake / Refresh)
  // First Intel hybrid architecture. Proper P/E core awareness matters
  // for VR — background apps on E-cores is fine, but VR processes MUST
  // run on P-cores or performance collapses.

  {
    modelPatterns: ['i5-12400f', 'i5 12400f', 'i5-12400', 'i5 12400'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Alder Lake',
    cores: 6,
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 4800,
    optimalRamMHz: 5200,
    optimalRamNote:
      '12400 is all P-cores (no E-cores), so hybrid scheduling is irrelevant. On DDR5 boards target DDR5-5200 CL38 (Gear 2, the DDR5 default). On DDR4 boards DDR4-3600 Gear 1 is the VR sweet spot. DDR4 build saves money with minimal VR perf loss vs DDR5.',
    hasVCache: false,
    vrProfile: 'single-thread-dominant',
    quirks: [
      '6P / 0E / 12T — no hybrid scheduling concerns. Simpler than 12600K+ for VR.',
      'Locked multiplier — XMP/EXPO and RAM choice are the only tuning levers.',
      'Excellent VR value — matches Ryzen 5 5600X at noticeably lower cost in 2025.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['i5-12600k', 'i5 12600k'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Alder Lake',
    cores: 10, // 6P + 4E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 4800,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30-36 is the best VR config on 12600K. Some boards need manual voltage (1.35 V VDD/VDDQ) for stable 6000. DDR4 option is DDR4-3600 CL16 Gear 1 — still viable but 15-20% slower in VRChat.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 4,
      pCoreAffinityMask: '0xFFF',  // 12 logical P-core threads (6P × SMT)
      pCoreMaxGHz: 4.9,
      eCoreMaxGHz: 3.6,
      hybridNote:
        'Windows 11 scheduler handles P/E core routing well for gaming by default — if you see VR apps being pushed to E-cores in Task Manager, it\'s usually a specific VR app misreading the Intel Thread Director hints. Manual affinity to 0xFFF forces P-core only.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      '6P + 4E hybrid — first Intel hybrid chip, Thread Director handles routing.',
      'VR apps should run on P-cores; E-cores should handle Discord, streamers, browsers.',
      'If on DDR4 board: DDR4-3600 Gear 1 is fine; DDR5 build is noticeably better for VRChat.',
      'Windows 10 users: strongly consider upgrading to Win 11 — Win 10 pre-Thread Director scheduling can push VR to E-cores and tank performance.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i7-12700k', 'i7 12700k', 'i7-12700', 'i7 12700'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Alder Lake',
    cores: 12, // 8P + 4E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 4800,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 is the 12700K sweet spot for VR. Above DDR5-6400, some samples need Gear 4 which erases the latency benefit. DDR4 path: DDR4-3800 CL16 Gear 1.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 4,
      pCoreAffinityMask: '0xFFFF',  // 16 logical P-core threads (8P × SMT)
      pCoreMaxGHz: 5.0,
      eCoreMaxGHz: 3.8,
      hybridNote:
        '8P + 4E — excellent balance for VR + streaming. Thread Director defaults are usually correct; only override if HWiNFO shows VR processes hopping to E-cores during gameplay.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      '8P/4E — one of the best VR CPUs from 12th gen, comparable to 5800X3D in non-cache-bound titles.',
      'Runs hotter than AMD equivalents — 240mm+ AIO recommended for sustained VR sessions.',
      'For VRChat populated worlds, 5800X3D / 7800X3D still ahead due to 3D V-Cache.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i9-12900k', 'i9 12900k', 'i9-12900', 'i9 12900'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Alder Lake',
    cores: 16, // 8P + 8E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 4800,
    optimalRamMHz: 6400,
    optimalRamNote:
      '12900K supports DDR5-6400 officially and reaches ~6800 in Gear 2. For VR prefer DDR5-6000 CL30 over 6400 CL32 — lower CL wins for latency-sensitive VR workloads.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 8,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.2,
      eCoreMaxGHz: 3.9,
      hybridNote:
        '8P + 8E — 24 threads total. Thread Director handles routing well in Win11. In VRChat populated worlds the 8 E-cores absorb Discord / browser / overlay background load so P-cores stay free for the VR runtime.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Top-tier 12th gen; still strong in 2025 for VR.',
      'Power-hungry — PL1/PL2 should be capped at 150/200W for thermal headroom during long VR sessions.',
      'High-end alternative: 13700K (same price bracket, 20% better VR perf from Raptor Lake IPC).',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i5-13400', 'i5 13400'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake',
    cores: 10, // 6P + 4E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 4800,
    optimalRamMHz: 5600,
    optimalRamNote:
      'i5-13400 memory controller is rated lower than the K-SKUs. DDR5-5600 CL36 is the reliable sweet spot — 6000 works on some boards but needs manual tuning.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 4,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 4.6,
      eCoreMaxGHz: 3.3,
      hybridNote:
        '6P + 4E — Raptor Lake refresh of Alder Lake. Thread Director handles routing.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Budget VR tier — beats 12400 by ~5-8% thanks to added E-cores and slightly higher boost.',
      'Locked multiplier — XMP/EXPO and cooler are the only tuning levers.',
      'DDR4 build at DDR4-3600 is a fine cost-save path with modest VR performance cost.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['i5-13600k', 'i5 13600k', 'i5-13600', 'i5 13600'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake',
    cores: 14, // 6P + 8E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 is the VR sweet spot — same as AM5. Above DDR5-6400 most boards drop to Gear 4 and the latency cost negates the bandwidth benefit.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 5.1,
      eCoreMaxGHz: 3.9,
      hybridNote:
        '6P + 8E — the "VRChat E-core sink" chip. 8 E-cores soak up Discord, browsers, and streamer overhead while P-cores stay free. Windows 11 Thread Director defaults are correct for VR.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'One of the best mid-range VR CPUs of 2023-2025 — matches or beats 7700X in CPU-heavy VR, cheaper.',
      'E-core-heavy design shines in VR+streaming combos.',
      '5800X3D / 7800X3D beat it in VRChat due to V-Cache, but 13600K is the better all-rounder.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i7-13700k', 'i7 13700k', 'i7-13700', 'i7 13700'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake',
    cores: 16, // 8P + 8E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 is the sweet spot. 13700K can run DDR5-7200 on premium boards but VR doesn\'t benefit — latency-bound, not bandwidth-bound.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 8,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.4,
      eCoreMaxGHz: 4.2,
      hybridNote:
        '8P + 8E — 24 threads. Near-ideal VR config: enough P-cores for VR + main game, enough E-cores to absorb everything else.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Raptor Lake refined Thread Director — routing is more reliable than Alder Lake.',
      'Pairs well with DDR5-6000 CL30 kits (~$120 for 32GB in 2025).',
      'In VRChat 50-avatar lobbies: ~10% behind 7800X3D, ~15% ahead of 12700K.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i9-13900k', 'i9 13900k', 'i9-13900', 'i9 13900'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake',
    cores: 24, // 8P + 16E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6400,
    optimalRamNote:
      'DDR5-6400 CL32 is achievable on most kits and gives a small VR advantage. DDR5-6000 CL30 also excellent. Avoid DDR5-7200+ — forces Gear 4, worse for VR.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 16,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.8,
      eCoreMaxGHz: 4.3,
      hybridNote:
        '8P + 16E — huge E-core count. Perfect for VR+streaming+recording combo workloads.',
    },
    vrProfile: 'balanced',
    quirks: [
      'IMPORTANT: 13900K / 14900K are subject to the Intel oxidation / Vmin shift issue. Apply the 0x12B microcode (BIOS update released mid-2024) to prevent degradation.',
      'Power capping to 188W PL1 / 253W PL2 has negligible VR impact and significantly reduces thermals.',
      'Best Intel VR CPU alongside 14900K — near-parity with 7950X3D in non-VRChat VR.',
    ],
    vrTier: 'top',
  },
  {
    modelPatterns: ['i5-14600k', 'i5 14600k', 'i5-14600', 'i5 14600'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake Refresh',
    cores: 14, // 6P + 8E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'Same memory controller as 13600K. DDR5-6000 CL30 is the sweet spot. 14600K binning is slightly better for memory OC but VR doesn\'t benefit above DDR5-6000.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 5.3,
      eCoreMaxGHz: 4.0,
      hybridNote:
        '6P + 8E — refresh of 13600K with ~3-5% higher clocks. Same excellent VR+streaming characteristics.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Refresh of 13600K with +200-300 MHz boost. Real-world VR gain vs 13600K is 3-5%.',
      'Pairs best with DDR5-6000 CL30.',
      'Before buying new: 13600K at the same price often makes more sense given the marginal gain.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i7-14700k', 'i7 14700k', 'i7-14700', 'i7 14700'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake Refresh',
    cores: 20, // 8P + 12E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6000,
    optimalRamNote:
      'DDR5-6000 CL30 remains the sweet spot. 14700K added 4 more E-cores over 13700K, so background workload scaling is better with DDR5 vs DDR4.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 12,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.6,
      eCoreMaxGHz: 4.3,
      hybridNote:
        '8P + 12E (up from 8P+8E on 13700K) — the refresh sweet spot for VR+productivity.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Biggest real gain of the 14th-gen refresh — 12 E-cores vs 13700K\'s 8.',
      'Excellent for VR streamers running OBS + Discord + browser on E-cores while VR locks to P-cores.',
      'Subject to the same Intel Vmin oxidation issue — apply 0x12B microcode via BIOS.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i9-14900k', 'i9 14900k', 'i9-14900', 'i9 14900'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake Refresh',
    cores: 24, // 8P + 16E
    ccdCount: 0,
    ramType: 'DDR4/DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 6400,
    optimalRamNote:
      'Top-bin memory controller of the LGA1700 generation. DDR5-6400 CL32 is consistently achievable; DDR5-6000 CL30 is equally good for VR. Above 7200 drops to Gear 4 and hurts VR latency.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 16,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 6.0,
      eCoreMaxGHz: 4.4,
      hybridNote:
        '8P + 16E, boost up to 6.0 GHz — Intel\'s highest stock clock ever. Thread Director routing is well-tuned at this point.',
    },
    vrProfile: 'balanced',
    quirks: [
      'CRITICAL: verify 0x12B microcode (August 2024 BIOS release) to prevent oxidation-related instability.',
      'Cap PL1 to 188W and PL2 to 253W for thermal sustainability during 2+ hour VR sessions.',
      'Top-tier Intel VR CPU — near-parity with 9950X3D in non-VRChat VR titles.',
      '9800X3D / 7800X3D still ahead for VRChat populated worlds due to 3D V-Cache.',
    ],
    vrTier: 'top',
  },

  // LGA1851 — Intel Core Ultra (Series 2 — Arrow Lake, late 2024)
  // No hyperthreading on P-cores (design change). Large Thread Director
  // rework for VR+productivity. Early BIOS had VR-impactful bugs fixed
  // in early 2025 releases.

  {
    modelPatterns: ['core ultra 5 245k', 'ultra 5 245k', '245k'],
    socket: 'LGA1851',
    vendor: 'Intel',
    codename: 'Arrow Lake',
    cores: 14, // 6P + 8E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 6400,
    optimalRamMHz: 6400,
    optimalRamNote:
      'Arrow Lake dropped DDR4 support entirely. DDR5-6400 CL32 is the officially rated sweet spot. Above 7200 forces Gear 4. Watch for early-BIOS issues where memory training fails above DDR5-6000 — update to 2025+ BIOS.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0x3F',  // 6P, no HT → 6 logical P-threads
      pCoreMaxGHz: 5.2,
      eCoreMaxGHz: 4.6,
      hybridNote:
        'No SMT/hyperthreading on Arrow Lake P-cores — 6P means 6 P-threads (not 12). E-cores gained major IPC.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'No hyperthreading on P-cores — reduces total thread count but simplifies scheduling.',
      'Arrow Lake early BIOS (Oct 2024-Jan 2025) had documented VR performance regressions. Update to Feb 2025+ BIOS.',
      'VR performance parity with 14600K at launch; small uplift after BIOS + microcode patches.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['core ultra 7 265k', 'ultra 7 265k', '265k'],
    socket: 'LGA1851',
    vendor: 'Intel',
    codename: 'Arrow Lake',
    cores: 20, // 8P + 12E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 6400,
    optimalRamMHz: 6400,
    optimalRamNote:
      'DDR5-6400 CL32 is the stock-supported sweet spot. Some kits run DDR5-8000 in Gear 4 but VR doesn\'t benefit from the bandwidth and loses 5-8% to the added latency.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 12,
      pCoreAffinityMask: '0xFF',  // 8P, no HT → 8 logical P-threads
      pCoreMaxGHz: 5.5,
      eCoreMaxGHz: 4.6,
      hybridNote:
        '8P + 12E, no HT on P-cores. Thread Director on Arrow Lake handles VR+streaming well after the Jan 2025 Windows scheduler update.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Requires Win 11 24H2 + Jan 2025 KB updates for best VR scheduling. Older Win 11 versions route poorly.',
      'Launch reviews under-sold this chip — post-BIOS VR performance competitive with 14700K.',
      'Paired with DDR5-6400 CL32 and latest BIOS: ~5-10% behind 7800X3D in VR, comparable to 14700K.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['core ultra 9 285k', 'ultra 9 285k', '285k'],
    socket: 'LGA1851',
    vendor: 'Intel',
    codename: 'Arrow Lake',
    cores: 24, // 8P + 16E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 6400,
    optimalRamMHz: 6400,
    optimalRamNote:
      'Top-bin Arrow Lake memory controller. DDR5-6400 CL32 is the VR sweet spot — matches 14900K. Memory OC above DDR5-7200 has no VR benefit and may introduce stability issues.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 16,
      pCoreAffinityMask: '0xFF',
      pCoreMaxGHz: 5.7,
      eCoreMaxGHz: 4.6,
      hybridNote:
        '8P + 16E, no HT on P-cores. Highest core-count Arrow Lake. Thread Director + Win 11 24H2+ scheduling is essential for VR performance.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Launch VR performance trailed 14900K until Feb 2025 BIOS + Win 11 24H2 patches fixed Thread Director routing.',
      'No oxidation issue like 13900K/14900K — architectural rework avoids the Vmin problem.',
      '9800X3D still significantly ahead for VRChat; 285K is competitive in sim/action VR.',
      'Pairs best with DDR5-6400 CL32 (rated, no tuning needed).',
    ],
    vrTier: 'top',
  },

  // LAPTOP — Intel H / HX / Core Ultra H (gaming + thin-and-light)
  // Laptop CPUs share silicon with desktops but ship with much tighter
  // thermal/power limits. VR rules account for sustained-load throttling
  // and hybrid GPU routing. For VR, HX-class and dedicated dGPU are
  // effectively required; H-class is marginal; LP-series is unsuitable.

  {
    modelPatterns: ['i7-13700h', 'i7 13700h', 'i7-13620h', 'i7 13620h'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake-H (mobile)',
    cores: 14, // 6P + 8E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 5200,
    optimalRamNote:
      'Mobile H-series typically uses DDR5 SO-DIMM or soldered LPDDR5 at 5200 MT/s. No user-accessible memory tuning on most laptops — the OEM BIOS caps what\'s available.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 5.0,
      eCoreMaxGHz: 3.7,
      hybridNote:
        '6P + 8E mobile — 45-55W sustained power envelope. Thread Director routing is good in Win 11.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Mobile 45W TDP — sustained multi-hour VR thermal-throttles on most chassis. 10-20% perf loss typical after 10-15 min boost window.',
      'Hybrid GPU systems: verify VR apps pinned to dGPU in Windows Graphics Settings — default often routes to iGPU.',
      'Plug into AC power for VR — battery mode severely throttles CPU/GPU on most laptops.',
      'Undervolting disabled on Intel 13/14th gen mobile. XTU / ThrottleStop only change power limits, not voltage.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i9-13900h', 'i9 13900h', 'i9-13905h', 'i9 13905h'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake-H (mobile)',
    cores: 14, // 6P + 8E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 5200,
    optimalRamNote:
      'Same 45W H-series memory spec as 13700H. Higher clock binning but same thermal envelope.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 5.4,
      eCoreMaxGHz: 4.1,
      hybridNote:
        '6P + 8E — top-bin Raptor H. Thread Director routing is the same as 13700H.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Top H-series but still 45W sustained. Expect parity with 13700H during long sessions once both throttle.',
      'For VR-focused laptops, HX-class (below) is almost always a better choice.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['i9-13980hx', 'i9 13980hx', 'i9-13950hx', 'i9 13950hx', 'i7-13700hx', 'i7 13700hx'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake-HX (mobile)',
    cores: 24, // 8P + 16E (HX is desktop silicon)
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'HX-series uses desktop 13900K silicon with laptop power limits. Most HX laptops ship DDR5-5600 SO-DIMMs. Premium gaming laptops may unlock DDR5-6400 but this is OEM-dependent.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 16,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.6,
      eCoreMaxGHz: 4.0,
      hybridNote:
        'HX = desktop 13900K silicon in a laptop. Thread Director handles routing. Despite 24 cores, sustained VR is heavily thermal-limited.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Desktop-class silicon — highest mobile VR performance on Intel 13th gen.',
      'Sustained TDP typically 55-75W (vs 253W desktop). Expect 20-30% lower perf than 13900K in long VR sessions.',
      'Vapor-chamber / dual-fan cooling chassis sustain boost longer. Thin-and-light = severe throttling.',
      'Apply 0x12B microcode BIOS update — same Vmin oxidation risk as desktop 13900K/14900K.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['i9-14900hx', 'i9 14900hx', 'i7-14700hx', 'i7 14700hx', 'i9-14950hx', 'i9 14950hx'],
    socket: 'LGA1700',
    vendor: 'Intel',
    codename: 'Raptor Lake-HX Refresh',
    cores: 24, // 8P + 16E
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Same memory controller as desktop 14900K, limited to DDR5-5600 in most laptops. Flagship gaming laptops (Razer Blade 18, ROG Scar 18) may unlock DDR5-6400.',
    hasVCache: false,
    hybrid: {
      pCores: 8,
      eCores: 16,
      pCoreAffinityMask: '0xFFFF',
      pCoreMaxGHz: 5.8,
      eCoreMaxGHz: 4.1,
      hybridNote:
        '8P + 16E refresh. Same as 14900K desktop with laptop power envelope.',
    },
    vrProfile: 'balanced',
    quirks: [
      'Top-tier mobile VR CPU. Desktop performance parity only at PL2 boost (~2-3 min), then throttles.',
      'Vapor-chamber cooling required for sustained VR. Thin-chassis designs lose 30-40% vs their benchmarks.',
      'Verify 0x12B microcode applied via latest OEM BIOS (oxidation risk inherits from desktop silicon).',
      'For VR-primary laptops, MSI GT / ROG Strix Scar / Razer Blade 18 class chassis are preferred.',
    ],
    vrTier: 'top',
  },
  {
    modelPatterns: ['core ultra 7 155h', 'ultra 7 155h', '155h'],
    socket: 'LGA1851',
    vendor: 'Intel',
    codename: 'Meteor Lake (mobile)',
    cores: 16, // 6P + 8E + 2 LP-E (SoC tile)
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Meteor Lake uses LPDDR5x-7467 or DDR5-5600 SO-DIMM depending on chassis. Low-power mobile-first design.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8, // Plus 2 LP-E cores on SoC tile (not counted as E-cores)
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 4.8,
      eCoreMaxGHz: 3.8,
      hybridNote:
        '6P + 8E + 2 LP-E cores on a separate SoC tile. VR must pin to P-cores — LP-E cores on the SoC tile have catastrophic IPC for VR workloads.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      'Thin-and-light / Copilot+ chip — not designed for sustained VR. Typical 28W sustained TDP.',
      'Low-Power E-cores on the SoC tile are a trap for VR — ensure Win 11 24H2+ so Thread Director routes correctly.',
      'Hybrid dGPU systems: dGPU routing is CRITICAL — the Xe iGPU cannot drive VR adequately.',
      'Mostly ships in AI-focused productivity laptops; expect a compromised VR experience.',
    ],
    vrTier: 'budget',
  },
  {
    modelPatterns: ['core ultra 9 185h', 'ultra 9 185h', '185h'],
    socket: 'LGA1851',
    vendor: 'Intel',
    codename: 'Meteor Lake (mobile)',
    cores: 16,
    ccdCount: 0,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Same memory controller as 155H with slightly higher rated binning. Still capped by laptop BIOS in most chassis.',
    hasVCache: false,
    hybrid: {
      pCores: 6,
      eCores: 8,
      pCoreAffinityMask: '0xFFF',
      pCoreMaxGHz: 5.1,
      eCoreMaxGHz: 3.8,
      hybridNote:
        'Top-bin Meteor Lake mobile. Same architecture as 155H with higher clocks.',
    },
    vrProfile: 'hybrid-scheduling',
    quirks: [
      '45W TDP variant is better suited to VR than 28W 155H.',
      'Still Meteor Lake — NOT Arrow Lake desktop. VR perf below 13700H/14700HX.',
      'For VR-focused use, prefer laptops with HX-series or Ryzen HX/HX3D.',
    ],
    vrTier: 'mid',
  },

  // LAPTOP — AMD HS / HX / HX3D (gaming + enthusiast)
  // Dragon Range (HX) = desktop Zen 4 silicon in a laptop.
  // Phoenix (HS) = monolithic APU with integrated Radeon graphics.
  // Fire Range (HX3D) = 2024/25 mobile V-Cache variants — rare, excellent.
  // Strix Point (AI 9 HX 370) = Zen 5 + Zen 5c asymmetric mobile.

  {
    modelPatterns: ['ryzen 7 7840hs', 'r7 7840hs', 'ryzen 7 7840h', 'r7 7840h'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Phoenix (mobile)',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Phoenix mobile supports DDR5-5600 or LPDDR5x-7500. SO-DIMM laptops typically ship at DDR5-5200 but can run DDR5-5600 if the OEM BIOS allows. No FCLK overclocking on mobile.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      '35W TDP — sustained VR is chassis-dependent. Gaming chassis (ROG Zephyrus, Legion) sustain boost well; ultrabooks throttle.',
      'Monolithic die (no CCDs) — lower memory latency than desktop Ryzen 7000. Helps VRChat.',
      'Radeon 780M iGPU is strong but inadequate for VR — dGPU routing critical.',
      'Competes with Intel 13700H / 14700H in VR; wins in CPU-heavy titles thanks to monolithic design.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['ryzen 9 7940hs', 'r9 7940hs', 'ryzen 9 7940h', 'r9 7940h'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Phoenix (mobile)',
    cores: 8,
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Same memory controller as 7840HS. Higher clock binning gives a small VR advantage; laptop VR is typically GPU-limited anyway.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Same architecture as 7840HS with ~200 MHz higher boost.',
      'Good balance for VR+streaming; V-Cache HX3D parts are better for CPU-bound VR.',
    ],
    vrTier: 'mid',
  },
  {
    modelPatterns: ['ryzen 9 7945hx', 'r9 7945hx', 'ryzen 9 7845hx', 'r9 7845hx', '7945hx'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Dragon Range (mobile)',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 5200,
    optimalRamNote:
      'Dragon Range = desktop 7950X silicon in a laptop package. DDR5-5200 officially in SO-DIMM form. Some gaming laptops unlock DDR5-6000 (OEM-dependent).',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Desktop-class Zen 4 16-core in a laptop — enormous VR potential if cooled adequately.',
      'Sustained power typically 55-75W (vs 170W desktop 7950X). Expect 20-30% below desktop 7950X.',
      'Two CCDs — cross-CCD memory latency matters. Many VR apps benefit from manual affinity to a single CCD (cores 0-7 or 8-15).',
      'Competes with Intel i9-14900HX directly. AMD has slightly better sustained thermals due to lower peak power.',
    ],
    vrTier: 'high',
  },
  {
    modelPatterns: ['ryzen 9 7945hx3d', 'r9 7945hx3d', '7945hx3d'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Dragon Range + 3D V-Cache (mobile)',
    cores: 16,
    ccdCount: 2,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5200,
    optimalRamMHz: 5200,
    optimalRamNote:
      'Same memory specs as non-X3D 7945HX. V-Cache benefit is from increased L3, not memory bandwidth, so DDR5-5200 SO-DIMM is fine.',
    hasVCache: true,
    vcacheCCDs: [
      { ccdIndex: 0, coreRange: [0, 7], hasVCache: true,  clockNote: '97 MB 3D V-Cache; boost capped ~5.0 GHz (vs 5.4 on CCD1).' },
      { ccdIndex: 1, coreRange: [8, 15], hasVCache: false, clockNote: 'Standard 32 MB L3; higher boost. Windows may mis-route VR here.' },
    ],
    vrAffinityMask: '0xFF',
    vrAffinityNote:
      'VRChat.exe, vrserver.exe, vrcompositor.exe should be pinned to cores 0-7 (0xFF). AMD V-Cache driver usually handles this; verify registered apps in HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App.',
    vrProfile: 'cache-dominant',
    quirks: [
      'V-Cache in a laptop — exceptionally rare. Top VRChat mobile CPU by a wide margin.',
      'Same dual-CCD scheduling quirks as 7950X3D desktop — register VR apps with the V-Cache driver or set manual affinity.',
      'Thermal-limited: V-Cache caps max boost, so sustained-load numbers are closer to desktop 7950X3D than to the non-X3D HX version.',
      'Primarily shipped in enthusiast gaming laptops (MSI Raider GE78, ASUS Scar 18).',
    ],
    vrTier: 'top',
  },
  {
    modelPatterns: ['ryzen ai 9 hx 370', 'ai 9 hx 370', 'hx 370', 'ryzen 9 hx 370'],
    socket: 'AM5',
    vendor: 'AMD',
    codename: 'Strix Point (mobile)',
    cores: 12, // 4 Zen5 + 8 Zen5c
    ccdCount: 1,
    ramType: 'DDR5',
    maxOfficialRamMHz: 5600,
    optimalRamMHz: 5600,
    optimalRamNote:
      'Strix Point uses LPDDR5x-7500 or DDR5-5600 SO-DIMM. Asymmetric Zen 5 + Zen 5c architecture — classical cores have higher clocks; compact cores have higher density but lower ceiling.',
    hasVCache: false,
    vrProfile: 'balanced',
    quirks: [
      'Zen 5 + Zen 5c hybrid (homogeneous ISA, different physical implementations — unlike Intel heterogeneous P/E).',
      'VR workloads should prefer the 4 Zen 5 classical cores (usually cores 0-3). Zen 5c cores have lower single-thread perf.',
      'Windows scheduler handles the split reasonably in Win 11 24H2+; older Windows may mis-route.',
      'Targets Copilot+ / productivity laptops, not VR gaming. Pair with a capable dGPU and expect limited VR.',
    ],
    vrTier: 'mid',
  },
]


/**
 * Find a database entry for the given CPU model string.
 * Performs case-insensitive substring matching against all modelPatterns.
 * Returns the first match, or null if no match is found.
 */
export function findCpuEntry(model: string): CpuDbEntry | null {
  if (!model) return null
  const lower = model.toLowerCase()
  for (const entry of CPU_DATABASE) {
    for (const pattern of entry.modelPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return entry
      }
    }
  }
  return null
}

/**
 * Returns true if the CPU entry has a dual-CCD V-Cache topology
 * (i.e., some CCDs have V-Cache and some do not).
 */
export function isDualCcdVCache(entry: CpuDbEntry): boolean {
  if (!entry.hasVCache || !entry.vcacheCCDs || entry.vcacheCCDs.length < 2) return false
  const hasVCacheCount = entry.vcacheCCDs.filter((c) => c.hasVCache).length
  const noVCacheCount = entry.vcacheCCDs.filter((c) => !c.hasVCache).length
  return hasVCacheCount > 0 && noVCacheCount > 0
}

/**
 * Get the V-Cache CCD for a dual-CCD chip (the CCD with V-Cache).
 * Returns null if not a dual-CCD V-Cache chip.
 */
export function getVCacheCCD(entry: CpuDbEntry): VCacheCCD | null {
  if (!entry.vcacheCCDs) return null
  return entry.vcacheCCDs.find((c) => c.hasVCache) ?? null
}

/**
 * Get the standard (non-V-Cache) CCD for a dual-CCD X3D chip.
 * Returns null if not a dual-CCD V-Cache chip.
 */
export function getStandardCCD(entry: CpuDbEntry): VCacheCCD | null {
  if (!entry.vcacheCCDs) return null
  return entry.vcacheCCDs.find((c) => !c.hasVCache) ?? null
}

/**
 * Convert a hex affinity mask string (e.g. '0xFF') to its decimal equivalent.
 * Returns null if the string is invalid.
 */
export function affinityMaskToDecimal(hexMask: string): number | null {
  try {
    const parsed = parseInt(hexMask, 16)
    return isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}
