// VR Optimization Suite — Hardware Upgrade Recommendation Engine
// Analyzes ScanData and produces personalized upgrade recommendations
// sorted by urgency. Does NOT modify system — read-only analysis.

import {
  GPU_TIERS,
  CPU_TIERS,
  RAM_TIERS,
  NETWORK_TIERS,
  UPGRADE_SUGGESTIONS,
} from '../data/upgrade-tiers'
import type { ComponentTier, UpgradeProduct, UpgradeSuggestion } from '../data/upgrade-tiers'
import type { ScanData } from '../scanner/types'


export interface UpgradeRecommendation {
  id: string
  component: 'gpu' | 'cpu' | 'ram' | 'storage' | 'network'
  currentDescription: string       // e.g. "RTX 3070 (Tier 5)"
  upgradeTitle: string             // e.g. "Upgrade GPU for better VR resolution"
  urgency: 'now' | 'soon' | 'eventual'
  vrImpact: string                 // "Higher resolution at 90fps without reprojection"
  products: UpgradeProduct[]       // sorted budget first
  reasoning: string                // why this matters specifically for VR
  estimatedPerformanceGain: string // e.g. "~30-50% more GPU headroom"
}


/** Returns the best-matching tier level for a display name, or null if unrecognised. */
function detectTierLevel(name: string, tiers: ComponentTier[]): number | null {
  const lower = name.toLowerCase()
  // Walk tiers from highest to lowest so a more-specific pattern wins
  // (e.g. "RTX 3070 Ti" is matched before plain "RTX 3070")
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]
    for (const pattern of tier.matchPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return tier.tierLevel
      }
    }
  }
  return null
}

/** Find a named tier by level number. */
function tierByLevel(tiers: ComponentTier[], level: number): ComponentTier | undefined {
  return tiers.find((t) => t.tierLevel === level)
}

/** Find the best matching UpgradeSuggestion for a component + from-tier. */
function findSuggestion(
  component: UpgradeSuggestion['component'],
  fromTierLevel: number,
  suggestions: UpgradeSuggestion[]
): UpgradeSuggestion | undefined {
  // Prefer exact from-tier match; fall back to closest lower tier
  const candidates = suggestions.filter(
    (s) => s.component === component && s.fromTierLevel <= fromTierLevel
  )
  if (candidates.length === 0) return undefined
  // Pick the one whose fromTierLevel is closest to (but not exceeding) fromTierLevel
  return candidates.reduce((best, s) =>
    s.fromTierLevel > best.fromTierLevel ? s : best
  )
}

/** Sort products so budget items appear first, ultra items last. */
function sortProductsByTier(products: UpgradeProduct[]): UpgradeProduct[] {
  const order: Record<UpgradeProduct['tier'], number> = {
    budget: 0,
    mid: 1,
    high: 2,
    ultra: 3
  }
  return [...products].sort((a, b) => order[a.tier] - order[b.tier])
}


function analyzeGpu(scanData: ScanData): UpgradeRecommendation | null {
  const gpuData = scanData.gpu
  if (!gpuData || gpuData.devices.length === 0) {
    console.log('[upgrade:gpu] No GPU data — skipping')
    return null
  }

  const primary = gpuData.devices[gpuData.primaryGpuIndex] ?? gpuData.devices[0]
  if (!primary) {
    console.log('[upgrade:gpu] No primary GPU device — skipping')
    return null
  }

  console.log(`[upgrade:gpu] Analysing: "${primary.name}" — utilization=${primary.utilization.toFixed(0)}%`)

  const tierLevel = detectTierLevel(primary.name, GPU_TIERS)

  // Unknown GPU — skip rather than give bad advice
  if (tierLevel === null) {
    console.warn(`[upgrade:gpu] SKIPPED — no tier match for "${primary.name}". Add pattern to GPU_TIERS in upgrade-tiers.ts`)
    return null
  }

  console.log(`[upgrade:gpu] Matched tier ${tierLevel}`)

  const tierInfo = tierByLevel(GPU_TIERS, tierLevel)
  const currentDescription = `${primary.name} (Tier ${tierLevel})`

  // Determine urgency
  let urgency: UpgradeRecommendation['urgency']
  let upgradeTitle: string
  let vrImpact: string
  let reasoning: string
  let estimatedPerformanceGain: string

  if (tierLevel <= 2) {
    // Critical — below what VR needs to be enjoyable
    urgency = 'now'
    upgradeTitle = 'Upgrade GPU — Current Card is Below VR Minimum'
    vrImpact =
      'Prevents constant reprojection and allows running modern VR titles at full quality and frame rate.'
    reasoning =
      `${primary.name} is a Tier ${tierLevel} GPU, which is at or below the minimum for a smooth VR experience. ` +
      'Current-generation VR games and VRChat with populated worlds will run with constant reprojection (frame duplication), ' +
      'causing a visually unpleasant "smearing" effect and increased motion sickness risk. ' +
      'A GPU upgrade is the single highest-impact hardware change you can make for VR quality.'
    estimatedPerformanceGain = '2-4× more GPU headroom; elimination of reprojection in most titles'
  } else if (tierLevel === 3) {
    urgency = 'now'
    upgradeTitle = 'Upgrade GPU for Comfortable High-Quality VR'
    vrImpact =
      'Enables stable 90fps at native headset resolution without reprojection in demanding VR titles.'
    reasoning =
      `${primary.name} can run VR but struggles in demanding scenarios — high supersampling, ` +
      'graphically intensive VR titles, and populous VRChat worlds will cause frequent reprojection. ' +
      'Upgrading to RTX 3000 / RX 6000 series or newer dramatically improves the VR experience at a cost-effective price point.'
    estimatedPerformanceGain = '40-80% more GPU headroom for VR rendering'
  } else if (tierLevel === 4) {
    // RTX 3060 Ti / RTX 3070 / RX 6700 XT — capable but has clear headroom to gain
    // Always recommend; urgency reflects whether VR is actively stressing the GPU right now
    if (primary.utilization >= 85) {
      urgency = 'soon'
      upgradeTitle = 'GPU Upgrade Recommended — Utilization Near Limit'
      vrImpact = 'Creates headroom to run higher render resolution or enable more graphical quality settings.'
      reasoning =
        `${primary.name} (Tier ${tierLevel}) is running at ${primary.utilization.toFixed(0)}% GPU utilization during VR. ` +
        'At this level, any spike in scene complexity triggers reprojection. Upgrading to the next tier ' +
        'provides the overhead needed for consistent 90fps delivery even in demanding scenarios.'
      estimatedPerformanceGain = '30-50% more GPU headroom; comfortable margin for demanding VR worlds'
    } else {
      urgency = 'eventual'
      upgradeTitle = 'GPU Upgrade for Higher-Quality VR'
      vrImpact = 'Provides headroom for higher supersampling, demanding VRChat worlds with many players, and 120Hz+ play.'
      reasoning =
        `${primary.name} (Tier ${tierLevel}) handles most VR well, but can struggle at high supersampling, ` +
        'with high-resolution headsets, or in demanding VRChat worlds packed with avatars and particle effects. ' +
        'Upgrading to RTX 3080 Ti / RTX 3090 class provides comfortable headroom for all current VR workloads ' +
        'and eliminates reprojection in graphically intense scenarios.'
      estimatedPerformanceGain = '35-50% more GPU headroom; smooth VR even in the most demanding VRChat worlds'
    }
  } else if (tierLevel === 5) {
    // RTX 3070 Ti / RTX 3080 — strong VR card, but RTX 4000-series brings real improvements
    if (primary.utilization >= 90) {
      urgency = 'soon'
      upgradeTitle = 'GPU Nearing Limits — Upgrade for Ultra-Quality VR'
      vrImpact = 'Enables higher supersampling and render resolution without reprojection at 90Hz+.'
      reasoning =
        `${primary.name} (Tier ${tierLevel}) is a strong VR card but sustained ${primary.utilization.toFixed(0)}% utilization ` +
        'means complex scenes will trigger reprojection. Upgrading to RTX 4070 Ti / RTX 4090 class ' +
        'also adds DLSS 3 Frame Generation support for dramatically improved effective frame rates.'
      estimatedPerformanceGain = '25-45% raw headroom increase plus DLSS 3 Frame Generation availability'
    } else {
      urgency = 'eventual'
      upgradeTitle = 'GPU Upgrade — RTX 4000-Series Improvements for VR'
      vrImpact = 'DLSS 3 Frame Generation and Ada efficiency gains meaningfully improve VR performance headroom.'
      reasoning =
        `${primary.name} (Tier ${tierLevel}) performs excellently for most VR workloads. However, RTX 4000-series ` +
        'GPUs bring DLSS 3 Frame Generation (doubles effective framerate in supported VR titles), improved AV1 hardware encoding ' +
        'for better wireless VR streaming quality, and 25-40% better performance-per-watt efficiency. Worth considering on your next upgrade.'
      estimatedPerformanceGain = 'DLSS 3 Frame Generation; 25-40% more raw headroom; improved wireless VR AV1 encoding quality'
    }
  } else if (tierLevel >= 6 && tierLevel <= 7) {
    // RTX 3090 / RTX 4070 Ti class — excellent GPUs; only flag if actively saturated
    if (primary.utilization >= 85) {
      urgency = 'eventual'
      upgradeTitle = 'GPU Upgrade — High Utilization at This Tier'
      vrImpact = 'Allows running next-generation VR headsets and higher supersampling targets.'
      reasoning =
        `${primary.name} (Tier ${tierLevel}) performs excellently but ${primary.utilization.toFixed(0)}% utilization ` +
        'leaves little headroom for higher-resolution headsets or demanding VR mods. ' +
        'An upgrade is worth considering when budget allows.'
      estimatedPerformanceGain = '20-35% more GPU overhead; future-proofing for next-gen VR headsets'
    } else {
      // Tier 6-7 GPU with manageable utilization — genuinely no upgrade needed
      return null
    }
  } else {
    // Tier 8+ — top-of-the-line, no recommendation needed
    return null
  }

  const suggestion = findSuggestion('gpu', tierLevel, UPGRADE_SUGGESTIONS)
  if (!suggestion || suggestion.products.length === 0) {
    console.warn(`[upgrade:gpu] SKIPPED — no UPGRADE_SUGGESTION found for tier ${tierLevel}`)
    return null
  }

  console.log(`[upgrade:gpu] → recommendation urgency=${urgency} ("${upgradeTitle}")`)

  return {
    id: `upgrade-gpu-${tierLevel}`,
    component: 'gpu',
    currentDescription,
    upgradeTitle,
    urgency,
    vrImpact,
    products: sortProductsByTier(suggestion.products),
    reasoning,
    estimatedPerformanceGain
  }
}


function analyzeCpu(scanData: ScanData): UpgradeRecommendation | null {
  const cpu = scanData.cpu
  if (!cpu) {
    console.log('[upgrade:cpu] No CPU data — skipping')
    return null
  }

  console.log(`[upgrade:cpu] Analysing: "${cpu.model}" — hasVCache=${cpu.hasVCache}`)

  const tierLevel = detectTierLevel(cpu.model, CPU_TIERS)
  if (tierLevel === null) {
    console.warn(`[upgrade:cpu] SKIPPED — no tier match for "${cpu.model}". Add pattern to CPU_TIERS in upgrade-tiers.ts`)
    return null
  }

  console.log(`[upgrade:cpu] Matched tier ${tierLevel}`)

  const currentDescription = `${cpu.model} (Tier ${tierLevel})`
  const hasVCache = cpu.hasVCache

  // Already at top tier
  if (tierLevel >= 9) {
    console.log(`[upgrade:cpu] SKIPPED — tier ${tierLevel} is top-tier, no upgrade needed`)
    return null
  }

  let urgency: UpgradeRecommendation['urgency']
  let upgradeTitle: string
  let vrImpact: string
  let reasoning: string
  let estimatedPerformanceGain: string

  if (tierLevel <= 2) {
    urgency = 'now'
    upgradeTitle = 'Upgrade CPU — Processing Bottleneck for VR'
    vrImpact = 'Eliminates CPU-side frame drops, allows VR compositor to meet frame deadlines reliably.'
    reasoning =
      `${cpu.model} (Tier ${tierLevel}) is an older CPU that creates a significant bottleneck for VR. ` +
      'The VR compositor, game physics, inverse kinematics (IK), and audio processing all compete for CPU time. ' +
      'On older hardware, this causes frame time spikes that manifest as "jumpy" motion in the headset. ' +
      'Upgrading to Ryzen 5000 or 12th-gen Intel dramatically reduces VR CPU overhead.'
    estimatedPerformanceGain = '30-60% reduction in VR CPU frame time; fewer compositor deadline misses'
  } else if (tierLevel <= 3) {
    urgency = 'soon'
    upgradeTitle = 'CPU Upgrade Recommended for Modern VR Workloads'
    vrImpact = 'Reduces micro-stutter in complex VR scenes and improves VR compositor scheduling reliability.'
    reasoning =
      `${cpu.model} (Tier ${tierLevel}) handles lighter VR workloads but shows its age in demanding scenarios ` +
      'such as VRChat with many players, physics-heavy games, or running VR alongside streaming software. ' +
      'Upgrading to Ryzen 5000/7000 series or newer Intel provides meaningfully better single-thread performance ' +
      'and cache that VR games depend on.'
    estimatedPerformanceGain = '20-40% lower CPU frame times in complex VR scenarios'
  } else if (tierLevel <= 5 && !hasVCache) {
    // Good tier but no V-Cache — mention V-Cache upgrade path
    urgency = 'eventual'
    upgradeTitle = 'Consider V-Cache CPU for Best-in-Class VR Performance'
    vrImpact = 'V-Cache CPUs reduce VRChat and VR game CPU overhead by 20-40% through lower memory latency.'
    reasoning =
      `${cpu.model} (Tier ${tierLevel}) is a capable CPU for VR, but V-Cache variants (Ryzen 7 5800X3D, Ryzen 7 7800X3D) ` +
      'deliver significantly better VR-specific performance due to their massive L3 cache. ' +
      'In VR games and VRChat, draw calls and physics queries are extremely cache-sensitive. ' +
      'The 3D V-Cache reduces the memory latency for these operations, resulting in fewer CPU-related VR frame drops.'
    estimatedPerformanceGain = '20-40% lower CPU frame times in cache-sensitive VR workloads (VRChat, physics-heavy games)'
  } else if (tierLevel === 6 && !hasVCache) {
    urgency = 'eventual'
    upgradeTitle = 'Ryzen 7 7800X3D — The VR-Optimal CPU Upgrade'
    vrImpact = '96MB 3D V-Cache on Zen 4 delivers the lowest VR CPU frame times of any current CPU.'
    reasoning =
      `${cpu.model} is a strong CPU for VR, but the Ryzen 7 7800X3D's 3D V-Cache architecture ` +
      'reduces memory latency for the tight render loops VR engines use. In VRChat and other ' +
      'CPU-bound VR games, this translates to 20-40% fewer CPU-caused frame time spikes, ' +
      'even at the same clock speed.'
    estimatedPerformanceGain = '20-40% reduction in VR-specific CPU frame times (V-Cache effect)'
  } else {
    console.log(`[upgrade:cpu] SKIPPED — tier ${tierLevel} with hasVCache=${hasVCache} does not qualify for upgrade recommendation`)
    return null
  }

  const suggestion = findSuggestion('cpu', tierLevel, UPGRADE_SUGGESTIONS)
  if (!suggestion || suggestion.products.length === 0) {
    console.warn(`[upgrade:cpu] SKIPPED — no UPGRADE_SUGGESTION found for tier ${tierLevel}`)
    return null
  }

  console.log(`[upgrade:cpu] → recommendation urgency=${urgency} ("${upgradeTitle}")`)

  return {
    id: `upgrade-cpu-${tierLevel}`,
    component: 'cpu',
    currentDescription,
    upgradeTitle,
    urgency,
    vrImpact,
    products: sortProductsByTier(suggestion.products),
    reasoning,
    estimatedPerformanceGain
  }
}


export function detectRamTierLevel(scanData: ScanData): number | null {
  const ram = scanData.ram
  if (!ram) return null

  const { totalGB, speed, type } = ram

  // Capacity is plenty regardless of speed/type guesses. The only realistic
  // upgrade path from 32 GB+ is a generational platform move, which we
  // surface as tier 5+ only on confirmed DDR5. With unknown type+speed and
  // 32 GB+ already installed, there's no meaningful recommendation to make.
  if (totalGB >= 32 && (type !== 'DDR5' || speed === 0)) return null

  if (type === 'DDR5') {
    if (totalGB >= 64) return speed >= 6400 ? 8 : 7
    if (totalGB >= 32) return speed >= 6000 ? 6 : 5
    return 4  // DDR5 but low capacity
  }

  // DDR4 (or DDR4-shaped unknown). If we don't know the speed, skip rather
  // than firing a "your RAM is slow" recommendation against fabricated zero.
  if (speed === 0) return null

  if (totalGB < 12) return 1
  if (totalGB < 24) return speed >= 3200 ? 3 : 2
  // 24GB+
  return speed >= 3600 ? 4 : 3
}

function analyzeRam(scanData: ScanData): UpgradeRecommendation | null {
  const ram = scanData.ram
  if (!ram) {
    console.log('[upgrade:ram] No RAM data — skipping')
    return null
  }

  const tierLevel = detectRamTierLevel(scanData)
  if (tierLevel === null) {
    console.log('[upgrade:ram] Could not determine RAM tier — skipping')
    return null
  }

  console.log(`[upgrade:ram] ${ram.totalGB}GB ${ram.type}-${ram.speed} → tier ${tierLevel}`)

  // Comfortable — no recommendation
  if (tierLevel >= 5) {
    console.log(`[upgrade:ram] SKIPPED — tier ${tierLevel} is adequate for VR (DDR5 or high-spec DDR4)`)
    return null
  }

  const currentDescription = `${ram.totalGB}GB ${ram.type}-${ram.speed} (Tier ${tierLevel})`
  let urgency: UpgradeRecommendation['urgency']
  let upgradeTitle: string
  let vrImpact: string
  let reasoning: string
  let estimatedPerformanceGain: string

  if (tierLevel === 1) {
    // 8GB — critical
    urgency = 'now'
    upgradeTitle = 'Upgrade RAM — 8GB is Critically Low for VR'
    vrImpact =
      'Prevents RAM-shortage crashes and enables VRChat, SteamVR, and the OS to coexist without memory pressure.'
    reasoning =
      `You have ${ram.totalGB}GB of RAM, which is critically insufficient for modern VR. ` +
      'VRChat alone can consume 6-10GB of RAM with avatars and shaders loaded. Add SteamVR runtime, ' +
      'OVR Toolkit, Windows, and background apps — a system with 8GB will frequently crash or ' +
      'heavily stutter due to paging to disk. 32GB is the recommended minimum for comfortable VR.'
    estimatedPerformanceGain = 'Eliminates RAM-caused crashes; dramatically reduces disk paging stutter'
  } else if (tierLevel === 2) {
    urgency = 'now'
    upgradeTitle = 'Upgrade RAM — 16GB at Low Speed is Suboptimal for VR'
    vrImpact = 'Doubles headroom for VR apps and improves memory bandwidth for Ryzen systems.'
    reasoning =
      `${ram.totalGB}GB at ${ram.speed}MHz is below the recommended VR specification. ` +
      'Memory speed below DDR4-3200 creates a bandwidth bottleneck, especially on AMD Ryzen systems ' +
      "where RAM speed directly gates the CPU's Infinity Fabric clock. " +
      'For VR, 32GB at DDR4-3600 is the sweet spot — affordable and sufficient for all current VR workloads.'
    estimatedPerformanceGain = '15-25% improvement in memory-bandwidth-limited VR scenarios; elimination of OOM pressure'
  } else if (tierLevel === 3) {
    // 16GB DDR4-3600 — adequate but 32GB would be better
    urgency = 'soon'
    upgradeTitle = 'Upgrade to 32GB RAM for Comfortable VR'
    vrImpact = 'Gives VRChat, SteamVR, and the OS enough RAM to coexist without competing for resources.'
    reasoning =
      `You have ${ram.totalGB}GB of RAM. While 16GB can run VR, you're leaving little headroom for ` +
      'VRChat with many players, high-resolution VR texture streaming, and background applications. ' +
      'Doubling to 32GB eliminates background RAM pressure and prevents the OS from paging VR assets to disk.'
    estimatedPerformanceGain = 'Eliminates RAM-pressure stutter; smoother VR world transitions'
  } else if (tierLevel === 4) {
    // 32GB DDR4-3600 — fine, but mention DDR5 for next platform
    urgency = 'eventual'
    upgradeTitle = 'DDR5 Upgrade for Next Platform Generation'
    vrImpact = 'DDR5-6000 improves memory bandwidth by 40%+ over DDR4, benefiting GPU data transfer and future VR workloads.'
    reasoning =
      `Your ${ram.totalGB}GB ${ram.type}-${ram.speed} setup is solid for current VR workloads. When you upgrade ` +
      'your CPU or motherboard to an AM5 or Intel 12th/13th-gen DDR5 platform, targeting DDR5-6000 CL30 ' +
      'is the new sweet spot — it provides significantly more bandwidth that benefits texture streaming ' +
      'and reduces latency for CPU-to-GPU data transfer in VR rendering pipelines.'
    estimatedPerformanceGain = '15-30% memory bandwidth improvement over DDR4; reduced CPU-GPU transfer latency'
  } else {
    return null
  }

  const suggestion = findSuggestion('ram', tierLevel, UPGRADE_SUGGESTIONS)
  if (!suggestion || suggestion.products.length === 0) {
    console.warn(`[upgrade:ram] SKIPPED — no UPGRADE_SUGGESTION found for tier ${tierLevel}`)
    return null
  }

  console.log(`[upgrade:ram] → recommendation urgency=${urgency} ("${upgradeTitle}")`)

  return {
    id: `upgrade-ram-${tierLevel}`,
    component: 'ram',
    currentDescription,
    upgradeTitle,
    urgency,
    vrImpact,
    products: sortProductsByTier(suggestion.products),
    reasoning,
    estimatedPerformanceGain
  }
}

// Storage tiers: 1 = HDD, 2 = SATA SSD, 3 = NVMe (no further sub-tiers without PCIe gen data)

function analyzeStorage(scanData: ScanData): UpgradeRecommendation | null {
  const storage = scanData.storage
  if (!storage) {
    console.log('[upgrade:storage] No storage data — skipping')
    return null
  }

  const vrDriveLetter = storage.vrInstallDrive
  if (!vrDriveLetter) {
    console.log('[upgrade:storage] vrInstallDrive is null — Steam/VR not detected, skipping')
    return null
  }

  const vrDrive = storage.drives.find(
    (d) => d.letter.toUpperCase() === vrDriveLetter.toUpperCase()
  )
  if (!vrDrive) {
    console.warn(`[upgrade:storage] VR drive ${vrDriveLetter}: listed as install drive but not found in drives array`)
    return null
  }

  // Map drive type to tier: 1=HDD, 2=SATA SSD, 3=NVMe
  const storageTier = vrDrive.type === 'HDD' ? 1 : vrDrive.type === 'SSD' ? 2 : 3
  const freePercent = (vrDrive.freeGB / vrDrive.totalGB) * 100

  console.log(
    `[upgrade:storage] VR drive ${vrDriveLetter}: type=${vrDrive.type} tier=${storageTier} ` +
    `size=${vrDrive.totalGB}GB free=${vrDrive.freeGB.toFixed(0)}GB (${freePercent.toFixed(0)}%)`
  )

  if (freePercent < 10 && vrDrive.freeGB < 20) {
    console.log(`[upgrade:storage] → Low free space warning: ${vrDrive.freeGB.toFixed(0)}GB / ${freePercent.toFixed(0)}% remaining`)
    return {
      id: 'upgrade-storage-space',
      component: 'storage',
      currentDescription: `VR drive ${vrDriveLetter}: only ${vrDrive.freeGB.toFixed(0)}GB free of ${vrDrive.totalGB}GB`,
      upgradeTitle: 'Low Free Space on VR Drive — Risk of Shader Cache Corruption',
      urgency: 'soon',
      vrImpact: 'Adequate free space prevents shader cache corruption and allows VR games to pre-compile shaders.',
      products: [
        {
          name: 'WD Black SN770 2TB NVMe PCIe 4.0',
          approxPriceUSD: '$99-129',
          tier: 'mid',
          vrImpactSummary: 'Doubles storage space with fast NVMe speeds; plenty of room for large VR game libraries.',
          notes: 'Requires M.2 PCIe slot. Migrate existing VR install with Steam "Move Install Folder" feature.'
        },
        {
          name: 'Samsung 990 Pro 2TB NVMe PCIe 4.0',
          approxPriceUSD: '$149-179',
          tier: 'high',
          vrImpactSummary: 'Premium 2TB NVMe with excellent sustained performance for large VR game libraries.',
          notes: 'Top-tier reliability and speed; recommended for serious VR enthusiasts.'
        }
      ],
      reasoning:
        `Drive ${vrDriveLetter}: has only ${vrDrive.freeGB.toFixed(0)}GB free (${freePercent.toFixed(0)}% free). ` +
        'VR shader caches, VRChat caches, and SteamVR logs require consistent free space. ' +
        'Below ~10% free, shader cache writes can fail silently, causing in-game hitching when shaders must be recompiled at runtime.',
      estimatedPerformanceGain: 'Prevents shader cache corruption; maintains consistent VR load performance'
    }
  }

  // ── Tier 1: HDD — critical; include SATA SSD as affordable first step ──
  if (storageTier === 1) {
    console.log('[upgrade:storage] → HDD detected — generating critical storage upgrade recommendation')
    const suggestion = findSuggestion('storage', 1, UPGRADE_SUGGESTIONS)
    const products = suggestion ? sortProductsByTier(suggestion.products) : []

    return {
      id: 'upgrade-storage-hdd',
      component: 'storage',
      currentDescription: `VR installed on HDD (${vrDriveLetter}: ${vrDrive.totalGB}GB)`,
      upgradeTitle: 'Move VR to SSD/NVMe — Critical for Smooth Gameplay',
      urgency: 'now',
      vrImpact: 'Eliminates shader-compile stutter and world load delays. Budget SATA SSD is a huge improvement; NVMe is the ideal.',
      products,
      reasoning:
        `Your VR installation is on a spinning hard drive (${vrDriveLetter}:). VR engines stream textures, ` +
        'shader caches, and audio assets continuously — HDDs deliver 0.5-1 MB/s random reads, ' +
        'a SATA SSD delivers ~50 MB/s, and NVMe SSDs reach 700 MB/s+. Even a budget SATA SSD eliminates ' +
        'the "stutter bursts" caused by HDD seek latency during world loads and shader compilation. ' +
        'NVMe is the ideal target, but any SSD is a dramatic improvement over HDD for VR.',
      estimatedPerformanceGain: 'SATA SSD: ~50× faster random reads; NVMe: ~700× faster — eliminates all HDD-caused VR stutter'
    }
  }

  // ── Tier 2: SATA SSD — functional but NVMe meaningfully better for VR ──
  if (storageTier === 2) {
    console.log('[upgrade:storage] → SATA SSD detected — generating eventual NVMe upgrade recommendation')
    const suggestion = findSuggestion('storage', 2, UPGRADE_SUGGESTIONS)
    if (!suggestion || suggestion.products.length === 0) {
      console.warn('[upgrade:storage] SKIPPED — no UPGRADE_SUGGESTION found for storage tier 2')
      return null
    }

    return {
      id: 'upgrade-storage-sata-ssd',
      component: 'storage',
      currentDescription: `VR installed on SATA SSD (${vrDriveLetter}: ${vrDrive.totalGB}GB)`,
      upgradeTitle: 'Upgrade VR Drive to NVMe for Faster World Loads',
      urgency: 'eventual',
      vrImpact: 'NVMe PCIe 4.0 delivers 5-14× faster random reads than SATA SSD — directly reduces VRChat world load times and eliminates shader hitching.',
      products: sortProductsByTier(suggestion.products),
      reasoning:
        `Your VR installation is on a SATA SSD (${vrDriveLetter}:), which is adequate but not optimal. ` +
        'NVMe SSDs have dramatically higher random read IOPS (700K-1M vs ~100K for SATA), which directly ' +
        'affects VRChat world loading, shader pre-compilation at game launch, and texture streaming mid-session. ' +
        'An NVMe upgrade is inexpensive and provides a noticeable improvement in VR responsiveness.',
      estimatedPerformanceGain: '5-14× faster random reads vs SATA SSD; noticeably faster VRChat world transitions'
    }
  }

  console.log('[upgrade:storage] NVMe detected with adequate free space — no storage upgrade needed')
  return null
}


function analyzeNetwork(scanData: ScanData): UpgradeRecommendation | null {
  const network = scanData.network
  const headset = scanData.headsetConnection

  if (!network) {
    console.log('[upgrade:network] No network data — skipping')
    return null
  }

  // Only relevant if using wireless VR
  const isWirelessVr =
    headset?.method === 'airlink' ||
    headset?.method === 'virtual-desktop' ||
    headset?.method === 'alvr' ||
    headset?.method === 'unknown-wireless'

  // For wired connections, only flag if they're on Wi-Fi 5 or below AND wireless VR is active
  const wifi = network.wifi
  const hasWiredEthernet = network.adapters.some(
    (a) => a.type === 'Ethernet' && a.connected && a.speed >= 100
  )

  console.log(
    `[upgrade:network] wifi=${wifi?.band ?? 'none'} linkSpeed=${wifi?.linkSpeed ?? '?'} Mbps ` +
    `wiredEthernet=${hasWiredEthernet} wirelessVR=${isWirelessVr} headsetMethod=${headset?.method ?? 'unknown'}`
  )

  if (!wifi && hasWiredEthernet) {
    console.log('[upgrade:network] SKIPPED — wired Ethernet PC, network is not the bottleneck')
    return null
  }

  if (!wifi) {
    console.log('[upgrade:network] SKIPPED — no Wi-Fi adapter detected and no wired Ethernet')
    return null
  }

  const band = wifi.band ?? ''
  const tierLevel = detectTierLevel(band, NETWORK_TIERS) ?? 1
  console.log(`[upgrade:network] Wi-Fi band="${band}" → tier ${tierLevel}`)

  // Determine urgency based on band
  let urgency: UpgradeRecommendation['urgency']
  let upgradeTitle: string
  let vrImpact: string
  let reasoning: string
  let estimatedPerformanceGain: string

  if (band === '2.4GHz' || tierLevel <= 1) {
    urgency = 'now'
    upgradeTitle = 'Upgrade Wi-Fi — 2.4GHz is Unusable for Wireless VR'
    vrImpact = 'A Wi-Fi 6/6E router with 5GHz or 6GHz connection makes wireless VR actually functional.'
    reasoning =
      '2.4GHz Wi-Fi has insufficient bandwidth for wireless VR streaming (maximum ~150 Mbps theoretical, ' +
      'far less in practice) and is extremely susceptible to interference from neighboring networks and ' +
      'household devices. AirLink and Virtual Desktop require at least 5GHz Wi-Fi 5, and strongly ' +
      'recommend Wi-Fi 6 for reliable 200-250 Mbps streaming without dropouts.'
    estimatedPerformanceGain = 'Transforms wireless VR from unusable to functional; eliminates bandwidth dropouts'
  } else if (tierLevel <= 2) {
    // Wi-Fi 5 5GHz
    urgency = isWirelessVr ? 'soon' : 'eventual'
    upgradeTitle = 'Upgrade to Wi-Fi 6E for Better Wireless VR'
    vrImpact = 'Wi-Fi 6E 6GHz band provides dedicated, interference-free wireless VR streaming bandwidth.'
    reasoning =
      'Wi-Fi 5 (802.11ac) on 5GHz can support wireless VR but lacks the bandwidth headroom and ' +
      '160MHz channel support of Wi-Fi 6, and is susceptible to congestion from neighboring 5GHz networks. ' +
      "Wi-Fi 6E's uncrowded 6GHz band provides a dedicated, interference-free channel for consistent " +
      'wireless VR streaming at 200-300+ Mbps. The headset must also support 6GHz (Quest 3, Quest 3S, Quest Pro).'
    estimatedPerformanceGain = '50-100% more wireless bandwidth headroom; dramatically lower wireless VR dropout rate'
  } else if (tierLevel === 3 && isWirelessVr) {
    // Wi-Fi 6 5GHz — good but 6GHz would be better
    urgency = 'eventual'
    upgradeTitle = 'Consider Wi-Fi 6E for Premium Wireless VR Quality'
    vrImpact = 'The 6GHz band eliminates 5GHz congestion for the most consistent wireless VR experience possible.'
    reasoning =
      "You're on Wi-Fi 6 5GHz, which handles wireless VR well. If you experience occasional dropouts " +
      'or quality degradation (especially in dense Wi-Fi environments like apartments), upgrading your ' +
      "router to Wi-Fi 6E gives the 6GHz band for VR — completely separate from other devices' 5GHz traffic."
    estimatedPerformanceGain = '20-40% more consistent wireless VR bitrate; reduced interference dropout rate'
  } else {
    // Wi-Fi 6E or better — no recommendation needed
    console.log(`[upgrade:network] SKIPPED — Wi-Fi tier ${tierLevel} is adequate (6GHz or wired)`)
    return null
  }

  const suggestion = findSuggestion('network', tierLevel, UPGRADE_SUGGESTIONS)
  if (!suggestion || suggestion.products.length === 0) {
    console.warn(`[upgrade:network] SKIPPED — no UPGRADE_SUGGESTION found for network tier ${tierLevel}`)
    return null
  }

  console.log(`[upgrade:network] → recommendation urgency=${urgency} ("${upgradeTitle}")`)

  const currentDescription =
    `Wi-Fi ${band} ${wifi.linkSpeed ? `@ ${wifi.linkSpeed} Mbps` : ''} (Tier ${tierLevel})`

  return {
    id: `upgrade-network-${tierLevel}`,
    component: 'network',
    currentDescription,
    upgradeTitle,
    urgency,
    vrImpact,
    products: sortProductsByTier(suggestion.products),
    reasoning,
    estimatedPerformanceGain
  }
}


const URGENCY_ORDER: Record<UpgradeRecommendation['urgency'], number> = {
  now: 0,
  soon: 1,
  eventual: 2
}

/**
 * Analyse ScanData and return upgrade recommendations sorted by urgency.
 * Returns an empty array if no upgrades are warranted or if scan data is incomplete.
 */
export function buildUpgradeRecommendations(scanData: ScanData): UpgradeRecommendation[] {
  console.log('[upgrade:engine] ─── Starting upgrade analysis ───')

  const recommendations: UpgradeRecommendation[] = []

  const gpu = analyzeGpu(scanData)
  if (gpu) recommendations.push(gpu)

  const cpu = analyzeCpu(scanData)
  if (cpu) recommendations.push(cpu)

  const ram = analyzeRam(scanData)
  if (ram) recommendations.push(ram)

  const storage = analyzeStorage(scanData)
  if (storage) recommendations.push(storage)

  const network = analyzeNetwork(scanData)
  if (network) recommendations.push(network)

  // Sort: now → soon → eventual; within same urgency sort by component order
  const componentOrder: Record<UpgradeRecommendation['component'], number> = {
    gpu: 0,
    cpu: 1,
    ram: 2,
    storage: 3,
    network: 4
  }

  recommendations.sort((a, b) => {
    const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
    if (urgencyDiff !== 0) return urgencyDiff
    return componentOrder[a.component] - componentOrder[b.component]
  })

  if (recommendations.length === 0) {
    console.log('[upgrade:engine] ─── No upgrade recommendations generated ───')
  } else {
    const summary = recommendations.map(r => `${r.component}(${r.urgency})`).join(', ')
    console.log(`[upgrade:engine] ─── ${recommendations.length} recommendation(s): ${summary} ───`)
  }

  return recommendations
}
