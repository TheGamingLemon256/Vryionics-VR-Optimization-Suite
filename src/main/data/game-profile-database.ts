// Vryionics VR Optimization Suite — VR Game Profile Database
//
// Per-title VR optimization knowledge. Complements the existing
// VRChat-specific scanner by adding recommendation packs for the top
// ~15 VR titles in the install base.

export type VrTitleCategory = 'social-vr' | 'simulation' | 'fitness' | 'action-games' | 'productivity'
export type BottleneckType = 'cpu' | 'gpu' | 'vram' | 'ram' | 'network'

export interface VrGameProfile {
  id: string
  /** Official title name. */
  name: string
  category: VrTitleCategory
  /** Steam App ID where applicable. Used for install detection and config lookup. */
  steamAppId?: string
  /** Process executable names used for runtime detection. */
  processNames: string[]
  /** Primary bottleneck — drives which fixes surface first. */
  primaryBottleneck: BottleneckType
  /** Secondary bottleneck(s). */
  secondaryBottlenecks: BottleneckType[]
  /** Recommended SteamVR per-app render resolution multiplier. */
  recommendedSteamvrResolution: number
  /** Recommended reprojection mode. */
  recommendedReprojection: 'motion-smoothing' | 'asw' | 'none' | 'auto'
  /** VR-optimized in-app settings hints (one-liners the user can apply manually). */
  inAppTips: string[]
  /** VR-critical known issues specific to this title. */
  knownIssues: string[]
  /** Minimum GPU tier level (from GPU_TIERS) for 90Hz at native res. */
  minGpuTier: number
  /** Recommended GPU tier for 90Hz with max settings. */
  recommendedGpuTier: number
  /** Minimum RAM in GB for populated sessions / heavy loads. */
  minRamGB: number
  /** Title-specific notes that don't fit other fields. */
  notes: string[]
}


const socialVr: VrGameProfile[] = [
  {
    id: 'vrchat',
    name: 'VRChat',
    category: 'social-vr',
    steamAppId: '438100',
    processNames: ['VRChat.exe', 'VRChat'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['ram', 'vram'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'auto',
    inAppTips: [
      'Safety Settings → Show Avatar for Friends Only (dramatic FPS gain in populated worlds).',
      'Max Shown Avatars: 10-20 depending on your CPU (40+ drops most mid-range CPUs to 45 fps).',
      'Graphics Quality: Medium (not High) — High enables expensive per-material shaders.',
      'Anti-Aliasing: OFF in-app + enable MSAA 2x via Unity PlayerPrefs (see VRChat MSAA fix).',
      'Shadow Distance: Low — VRChat shadows rarely add to the experience.',
      'Audio: use voice-only (not world ambient audio) in very populated worlds.',
    ],
    knownIssues: [
      'Cache exhaustion: %AppData%\\..\\LocalLow\\VRChat\\VRChat cache can bloat to 20+ GB and slow world loads.',
      'Avatar physics with default "max affected transforms" (0 = unlimited) is the #1 CPU killer. The config key is still named dynamic_bone_max_affected_transform_count for legacy reasons but actually controls PhysBones since the 2022 conversion.',
      'Populated clubs (30+ avatars) are CPU-bound — a 5800X3D / 7800X3D V-Cache chip is the biggest possible upgrade.',
      'Windows 10 pre-Thread-Director routes VRChat.exe to E-cores on 12/13/14th gen Intel — upgrade to Win 11 for hybrid scheduling.',
    ],
    minGpuTier: 3,       // RTX 2070 class
    recommendedGpuTier: 5, // RTX 3080 class
    minRamGB: 16,
    notes: [
      'The most CPU-demanding mainstream VR title. CPU matters more than GPU.',
      'Our suite has VRChat-specific rules (avatar physics caps, cache, MSAA) that fire for deep diagnosis.',
      'AMD V-Cache (X3D) CPUs give 30-50% better frame times in populated worlds.',
    ],
  },
  {
    id: 'resonite',
    name: 'Resonite',
    category: 'social-vr',
    steamAppId: '2519830',
    processNames: ['Resonite.exe', 'Resonite'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['ram', 'gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Set World Settings → Particle Limit to 1000 or lower in populated worlds.',
      'Audio → spatial voice range: reduce to 10m in clubs to cut audio processing cost.',
      'Dynamic bone approximations: enable for smoother performance.',
    ],
    knownIssues: [
      'Similar to VRChat — CPU-heavy in populated instances, benefits enormously from V-Cache.',
      'Asset streaming can spike RAM usage past 16 GB in complex worlds.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 5,
    minRamGB: 32,
    notes: [
      'Successor to NeosVR. Similar performance characteristics.',
      'Less aggressive avatar culling than VRChat — RAM pressure is higher per-avatar.',
    ],
  },
  {
    id: 'chillout-vr',
    name: 'ChilloutVR',
    category: 'social-vr',
    steamAppId: '661130',
    processNames: ['ChilloutVR.exe', 'ChilloutVR'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['vram'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Avatar Performance Filter: Excellent / Good only in populated worlds.',
      'Disable Particle Systems for Strangers in crowded spaces.',
    ],
    knownIssues: [
      'Smaller community so populated worlds are rarer than VRChat, but same CPU sensitivity.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 4,
    minRamGB: 16,
    notes: ['Alternative to VRChat with less performance-punishing avatar culture.'],
  },
]


const simulation: VrGameProfile[] = [
  {
    id: 'msfs2020',
    name: 'Microsoft Flight Simulator',
    category: 'simulation',
    steamAppId: '1250410',
    processNames: ['FlightSimulator.exe', 'FlightSimulator2024.exe'],
    primaryBottleneck: 'gpu',
    secondaryBottlenecks: ['vram', 'cpu'],
    recommendedSteamvrResolution: 0.8,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Render Scale: 70-90% (NOT 100% — MSFS upscales internally).',
      'Enable DLSS/FSR/DLSS-Frame-Gen in-app — substantial VR gains.',
      'Terrain Level of Detail: High (Ultra is the killer).',
      'Clouds: High, not Ultra — Ultra can cut VR framerate in half.',
      'Glass Cockpit Refresh Rate: 1x (Medium) — 2x wastes GPU.',
      'Traffic settings: reduce AI traffic density to 50%.',
    ],
    knownIssues: [
      'VRAM-hungry at high settings — 12 GB minimum for native-res Quest 3 at reasonable settings.',
      'OpenXR Toolkit with foveated rendering is a game-changer for high-res headsets (Pimax, Varjo).',
      'Dev Mode toggle doesn\'t belong on — causes VR compositor stalls.',
      '2024 version has DLSS 3.5 Frame Gen in VR — MASSIVE uplift on RTX 40+.',
    ],
    minGpuTier: 5,       // RTX 3080 class
    recommendedGpuTier: 8, // RTX 4080 class
    minRamGB: 32,
    notes: [
      'One of the most demanding VR titles. VRAM capacity matters.',
      'Third-party OpenXR Toolkit strongly recommended for foveated rendering.',
      'Pair with DLSS-capable NVIDIA GPU for best quality-per-fps.',
    ],
  },
  {
    id: 'dcs-world',
    name: 'DCS World',
    category: 'simulation',
    steamAppId: '223750',
    processNames: ['DCS.exe'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['gpu', 'ram'],
    recommendedSteamvrResolution: 0.9,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'PIXEL DENSITY: 1.0 (do not go higher in DCS — performance cliff is severe).',
      'MSAA: 2x (4x/8x tanks performance for minimal VR gain).',
      'Shadows: Medium — Flat Only or Low on lower-end GPUs.',
      'Water: Medium — Ultra is triple the cost for minimal visual gain in VR.',
      'Use the in-game DLAA / DLSS option where available (MT build).',
      'VR Zoom: OFF (causes stutters).',
    ],
    knownIssues: [
      'DCS has historically been DX11 — CPU-bound. The Multi-Threaded (MT) branch on DX11 is the default now.',
      'Module asset streaming from disk is HDD-punishing — install DCS on NVMe.',
      'Large multiplayer servers (WWII / Modern Air Combat) scale CPU load dramatically.',
    ],
    minGpuTier: 4,
    recommendedGpuTier: 7,
    minRamGB: 32,
    notes: [
      'DX11-MT branch is stable and preferred for VR as of 2024.',
      'AMD X3D CPUs give major gains in multiplayer due to draw-call overhead reduction.',
    ],
  },
  {
    id: 'iracing',
    name: 'iRacing',
    category: 'simulation',
    steamAppId: '266410',
    processNames: ['iRacingSim64DX11.exe', 'iRacingSim64DX12.exe'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'none',  // iRacing users strongly prefer native
    inAppTips: [
      'DX12 branch: use it over DX11 — multi-threaded rendering is a big VR uplift.',
      'Shadow Maps: Medium — High has huge cost for minimal gain.',
      'Crowd Detail: Low (spectators are invisible in VR anyway at race pace).',
      'Driver count in-race: practice with your typical race field size to check frame budget.',
    ],
    knownIssues: [
      'Large grid races (50+ cars) are CPU-bound even on flagship hardware.',
      'VR mirror rendering is expensive — keep mirrors at Medium.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 6,
    minRamGB: 16,
    notes: ['Sim-racers generally prefer no reprojection (latency > smoothness for close-quarters wheel-to-wheel).'],
  },
  {
    id: 'ets2',
    name: 'Euro Truck Simulator 2 (VR)',
    category: 'simulation',
    steamAppId: '227300',
    processNames: ['eurotrucks2.exe'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Launch with -oculus or -openxr flag depending on runtime.',
      'Scaling: 100% — don\'t supersample, VR is already demanding.',
      'Traffic Density: Medium (High stacks CPU load quickly).',
      'Mirror Rendering: Low to Medium.',
    ],
    knownIssues: [
      'Single-threaded game engine — benefits from fastest single-thread CPU.',
      'Large mod loads (custom traffic, map mods) are additional CPU cost.',
    ],
    minGpuTier: 2,
    recommendedGpuTier: 4,
    minRamGB: 16,
    notes: ['CPU-single-thread-bound. Ryzen X3D / Intel K-class high-clock chips preferred.'],
  },
]


const fitness: VrGameProfile[] = [
  {
    id: 'beat-saber',
    name: 'Beat Saber',
    category: 'fitness',
    steamAppId: '620980',
    processNames: ['Beat Saber.exe'],
    primaryBottleneck: 'network',  // wireless users
    secondaryBottlenecks: ['cpu', 'gpu'],
    recommendedSteamvrResolution: 1.5,  // Beat Saber is cheap — can push SS hard
    recommendedReprojection: 'none',
    inAppTips: [
      'Supersample aggressively: 150-200% is realistic even on mid-range GPUs.',
      'Reprojection should be OFF — Beat Saber\'s strict 90fps requirement makes reprojection very noticeable.',
      'Smoke/effect intensity: user preference (performance is usually not the gate).',
    ],
    knownIssues: [
      'Latency-critical — wireless VR users need dedicated 5GHz/6GHz for lag-free scoring.',
      'Mod packs (Beat Saver custom songs + BMBF) can inflate RAM via cached song assets.',
    ],
    minGpuTier: 2,       // runs on anything modern
    recommendedGpuTier: 3,
    minRamGB: 16,
    notes: [
      'Latency over smoothness — reprojection adds motion-to-photon delay that hurts scoring.',
      'Wireless VR users: prefer wired Link / tethered connection for competitive play.',
    ],
  },
  {
    id: 'supernatural',
    name: 'Supernatural',
    category: 'fitness',
    processNames: ['Supernatural.exe'],
    primaryBottleneck: 'network',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'none',
    inAppTips: ['Native Quest app primarily — PC use is rare via streaming.'],
    knownIssues: ['Not natively on PC; wireless streaming via VD/AL-series if used with PCVR.'],
    minGpuTier: 2,
    recommendedGpuTier: 3,
    minRamGB: 16,
    notes: ['Subscription-based Meta Quest fitness app; mostly standalone.'],
  },
  {
    id: 'synth-riders',
    name: 'Synth Riders',
    category: 'fitness',
    steamAppId: '885000',
    processNames: ['Synth Riders.exe'],
    primaryBottleneck: 'network',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.3,
    recommendedReprojection: 'none',
    inAppTips: ['Low GPU cost — push supersampling up.'],
    knownIssues: [],
    minGpuTier: 2,
    recommendedGpuTier: 3,
    minRamGB: 16,
    notes: ['Similar performance profile to Beat Saber.'],
  },
]


const actionGames: VrGameProfile[] = [
  {
    id: 'half-life-alyx',
    name: 'Half-Life: Alyx',
    category: 'action-games',
    steamAppId: '546560',
    processNames: ['hlvr.exe'],
    primaryBottleneck: 'gpu',
    secondaryBottlenecks: ['vram'],
    recommendedSteamvrResolution: 1.2,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Texture: Ultra if 10+ GB VRAM, High otherwise.',
      'Shadow Quality: High (balanced — Ultra has diminishing returns).',
      'Anti-Aliasing: In-game TAA is tuned for VR; don\'t override with MSAA.',
    ],
    knownIssues: [
      'Source 2 engine handles VR excellently — few VR-specific issues.',
      'Loading new areas is disk-bound — NVMe strongly preferred.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 5,
    minRamGB: 16,
    notes: ['One of the best-optimized VR titles. Minimal tuning needed.'],
  },
  {
    id: 'boneworks',
    name: 'Boneworks / Bonelab',
    category: 'action-games',
    steamAppId: '823500',
    processNames: ['Boneworks.exe', 'BONELAB_Steam_Windows64.exe'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Physics-heavy — CPU is the limiting factor.',
      'Mod support (Bonelab) can add huge CPU/GPU cost.',
    ],
    knownIssues: [
      'Physics engine scales poorly to many-object scenes — mod-heavy users feel it.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 5,
    minRamGB: 16,
    notes: ['Physics sandbox — CPU matters more than GPU.'],
  },
  {
    id: 'blade-and-sorcery',
    name: 'Blade & Sorcery',
    category: 'action-games',
    steamAppId: '629730',
    processNames: ['BladeAndSorcery.exe'],
    primaryBottleneck: 'cpu',
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.1,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Enemy count in custom mods is the main CPU gate — reduce if struggling.',
      'Shadow Resolution: 1024 (2048 stresses lower-end GPUs).',
      'Bloom + HDR Effects: OFF for VR comfort + performance.',
    ],
    knownIssues: ['Nomad build is Quest-only and not PCVR.'],
    minGpuTier: 3,
    recommendedGpuTier: 5,
    minRamGB: 16,
    notes: ['Heavy melee physics — CPU-sensitive.'],
  },
  {
    id: 'pavlov',
    name: 'Pavlov VR',
    category: 'action-games',
    steamAppId: '555160',
    processNames: ['Pavlov.exe'],
    primaryBottleneck: 'network',  // competitive multiplayer
    secondaryBottlenecks: ['cpu', 'gpu'],
    recommendedSteamvrResolution: 1.2,
    recommendedReprojection: 'none',
    inAppTips: [
      'Reprojection OFF — precision aim matters.',
      'Shadow Quality: Low (competitive players always lower).',
      'View Distance: Medium (tradeoff — higher reveals enemies sooner but costs FPS).',
    ],
    knownIssues: [
      'Network latency is THE competitive gate. Wired PC, wired or excellent-Wi-Fi headset.',
      'Shack-only (console port) has different perf characteristics — not covered here.',
    ],
    minGpuTier: 3,
    recommendedGpuTier: 5,
    minRamGB: 16,
    notes: ['Competitive shooter — latency + precision prioritized over smoothness.'],
  },
]


const productivity: VrGameProfile[] = [
  {
    id: 'immersed',
    name: 'Immersed',
    category: 'productivity',
    processNames: ['Immersed.exe'],
    primaryBottleneck: 'network',  // wireless streaming is the dominant usage
    secondaryBottlenecks: ['gpu'],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: [
      'Wired USB for best productivity use (desktop text readability).',
      'Wireless users: 6GHz Wi-Fi 6E + AV1 codec if GPU supports it.',
    ],
    knownIssues: ['Primary use case is desktop streaming — same rules as general wireless VR apply.'],
    minGpuTier: 2,
    recommendedGpuTier: 3,
    minRamGB: 16,
    notes: ['Low rendering cost; network quality and display latency dominate UX.'],
  },
  {
    id: 'vspatial',
    name: 'vSpatial',
    category: 'productivity',
    processNames: ['vSpatial.exe'],
    primaryBottleneck: 'network',
    secondaryBottlenecks: [],
    recommendedSteamvrResolution: 1.0,
    recommendedReprojection: 'motion-smoothing',
    inAppTips: ['Wired connection preferred for text-heavy work.'],
    knownIssues: [],
    minGpuTier: 2,
    recommendedGpuTier: 3,
    minRamGB: 16,
    notes: ['Alternative to Immersed.'],
  },
]


export const GAME_PROFILE_DATABASE: VrGameProfile[] = [
  ...socialVr,
  ...simulation,
  ...fitness,
  ...actionGames,
  ...productivity,
]

/** Find a game profile by process name (exact match against processNames array). */
export function findGameByProcess(processName: string): VrGameProfile | null {
  if (!processName) return null
  const lower = processName.toLowerCase()
  for (const entry of GAME_PROFILE_DATABASE) {
    for (const p of entry.processNames) {
      if (p.toLowerCase() === lower) return entry
    }
  }
  return null
}

/** Find a game profile by Steam App ID. */
export function findGameBySteamAppId(appId: string): VrGameProfile | null {
  if (!appId) return null
  return GAME_PROFILE_DATABASE.find((e) => e.steamAppId === appId) ?? null
}

/** Find a game profile by id. */
export function findGameById(id: string): VrGameProfile | null {
  return GAME_PROFILE_DATABASE.find((e) => e.id === id) ?? null
}

/** Games matching a primary-use-case category (from wizard). */
export function getGamesByCategory(category: VrTitleCategory): VrGameProfile[] {
  return GAME_PROFILE_DATABASE.filter((e) => e.category === category)
}
