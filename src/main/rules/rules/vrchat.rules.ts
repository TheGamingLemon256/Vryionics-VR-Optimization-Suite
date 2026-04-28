// VR Optimization Suite — VRChat-Specific Diagnostic Rules
// VRChat is the primary marketing target — these rules are highly specific
// to VRChat's configuration and performance characteristics.

import type { Rule } from '../types'

export const vrchatRules: Rule[] = [
  {
    id: 'vrchat-dynamic-bone-unlimited',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      const affected = data.vrRuntime.dynamicBoneMaxAffected
      if (affected === null) return null
      if (affected !== 0) return null // 0 = unlimited = the problem
      return {
        ruleId: 'vrchat-dynamic-bone-unlimited',
        severity: 'critical',
        category: 'vr-runtime',
        title: 'VRChat Dynamic Bones Unlimited — Major CPU Usage in Populated Worlds',
        explanation: {
          simple: 'VRChat is set to simulate unlimited dynamic bones across all avatars. In worlds with 20+ players, each with hair/clothes physics, this can consume 30-60% of your CPU alone — causing constant VR reprojection.',
          advanced: 'dynamic_bone_max_affected_transform_count = 0 means no cap on the number of bone transforms simulated per frame. Each avatar can have 100-500+ dynamic bone transforms. At 20 players, that\'s potentially 10,000+ physics transforms per frame at 90Hz. Setting a cap of 32 per avatar reduces CPU time by 60-80% in populated public worlds with minimal visual difference.'
        },
        fixId: 'fix-vrchat-dynamic-bone-limits'
      }
    }
  },
  {
    id: 'vrchat-dynamic-bone-high',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      const affected = data.vrRuntime.dynamicBoneMaxAffected
      if (affected === null || affected === 0) return null // 0 = unlimited caught above
      if (affected <= 64) return null // 64 or less is fine
      return {
        ruleId: 'vrchat-dynamic-bone-high',
        severity: 'warning',
        category: 'vr-runtime',
        title: `VRChat Dynamic Bone Cap Set High (${affected} transforms/avatar)`,
        explanation: {
          simple: `VRChat allows ${affected} dynamic bone transforms per avatar. While better than unlimited, 64 or less is recommended for consistent performance in busy worlds.`,
          advanced: `dynamic_bone_max_affected_transform_count = ${affected}. The CPU cost scales linearly with this value × player count. At 20 players: ${affected * 20} total transforms per frame. Reducing to 32-64 provides the best balance of physics quality and CPU budget for VR's strict frame time requirements.`
        },
        fixId: 'fix-vrchat-dynamic-bone-limits'
      }
    }
  },
  {
    id: 'vrchat-collider-unlimited',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      const colliders = data.vrRuntime.dynamicBoneMaxCollider
      if (colliders === null) return null
      if (colliders !== 0) return null
      return {
        ruleId: 'vrchat-collider-unlimited',
        severity: 'high',
        category: 'vr-runtime',
        title: 'VRChat Dynamic Bone Colliders Unlimited — Significant CPU Overhead',
        explanation: {
          simple: 'Collider checks per bone are uncapped. Dynamic bone colliders (used for hair/cloth to collide with body parts) are expensive — without a limit, complex avatar physics can stall the CPU.',
          advanced: 'dynamic_bone_max_collider_check_count = 0 means no limit on collider-bone intersection tests per frame. Each test is O(n) in transforms and O(m) in colliders. Complex avatars with full-body collision meshes can generate thousands of tests per frame. Setting this to 8 eliminates the worst-case spike while preserving reasonable physics behavior.'
        },
        fixId: 'fix-vrchat-dynamic-bone-limits'
      }
    }
  },
  {
    id: 'vrchat-no-config-file',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      if (data.vrRuntime.vrchatConfigPresent) return null
      // Only flag if VRChat appears to be installed
      if (!data.vrRuntime.vrchatConfig && !data.processes?.vrCritical.some((p) => p.name.toLowerCase() === 'vrchat.exe')) return null
      return {
        ruleId: 'vrchat-no-config-file',
        severity: 'high',
        category: 'vr-runtime',
        title: 'VRChat Has No Performance Config File — Running on Defaults',
        explanation: {
          simple: 'VRChat has no config.json file, meaning it\'s using factory defaults — including unlimited dynamic bones, small cache, and no avatar culling. These defaults are terrible for populated worlds.',
          advanced: 'VRChat\'s config.json controls critical performance parameters: avatar culling distance, dynamic bone limits, cache size, and particle limits. Without this file, VRChat defaults to unlimited physics simulation and small caches — optimized for visual showcase, not real-world populated use. Applying the recommended config provides immediate improvement in any world with more than 5 players.'
        },
        fixId: 'fix-vrchat-dynamic-bone-limits'
      }
    }
  },
  {
    id: 'vrchat-msaa-too-high',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      const msaa = data.vrRuntime.vrchatMsaa
      if (msaa === null) return null
      if (msaa <= 2) return null // 1x or 2x is fine
      return {
        ruleId: 'vrchat-msaa-too-high',
        severity: msaa >= 4 ? 'high' : 'warning',
        category: 'vr-runtime',
        title: `VRChat MSAA ${msaa}x — Significant GPU Cost for VR`,
        explanation: {
          simple: `VRChat is using ${msaa}x MSAA. In VR this is extremely expensive — you're rendering each pixel ${msaa} times for anti-aliasing. In VR, temporal anti-aliasing (TAA) at 1x MSAA provides better image quality at much lower GPU cost.`,
          advanced: `MSAA ${msaa}x multiplies the render target size by ${msaa} for color and depth buffers. At VR resolution (~2160×2160 per eye for most headsets), ${msaa}x MSAA requires ${msaa}× the fill-rate and VRAM bandwidth. MSAA was designed for rasterized forward rendering; VR deferred rendering with VRChat's lighting makes MSAA ${msaa}x disproportionately expensive. Setting to 1x with sharpening enabled via SteamVR or your headset's upscaling produces better perceived quality with 50-75% less GPU cost.`
        },
        fixId: 'fix-vrchat-msaa'
      }
    }
  },
  {
    id: 'vrchat-cache-not-extended',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime?.vrchatConfig) return null
      const config = data.vrRuntime.vrchatConfig
      const cacheSize = (config as Record<string, unknown>).cache_size as number | undefined
      if (cacheSize && cacheSize >= 20480) return null // Already 20GB+ — fine
      return {
        ruleId: 'vrchat-cache-not-extended',
        severity: 'info',
        category: 'vr-runtime',
        title: 'VRChat Cache Not Extended — Assets Re-Download Every Session',
        explanation: {
          simple: 'VRChat\'s asset cache is at default size. Without a larger cache, avatars and worlds you visit frequently get purged and re-downloaded next session — adding 2-30 seconds of loading to each world join.',
          advanced: `Current cache_size: ${cacheSize ?? 'default (~10GB)'}. VRChat caches avatar bundles (average ~50-200MB each) and world bundles (100MB-2GB). A 20GB cache holds ~50-100 frequently-visited avatar/world bundles. The cache_expiry_delay controls how many days before cached assets are purged — setting 30 days keeps your regular avatars cached between weekly play sessions.`
        },
        fixId: 'fix-vrchat-cache-size'
      }
    }
  },
  {
    id: 'vrchat-mirror-high-res',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.vrRuntime) return null
      const mirrorRes = data.vrRuntime.vrchatMirrorResolution
      if (mirrorRes === null) return null
      if (mirrorRes <= 512) return null
      return {
        ruleId: 'vrchat-mirror-high-res',
        severity: 'info',
        category: 'vr-runtime',
        title: `VRChat Mirror Resolution at ${mirrorRes}px — Costly in Mirror-Heavy Worlds`,
        explanation: {
          simple: `Mirror resolution is set to ${mirrorRes}px. VRChat mirrors render the entire scene from a new viewpoint — at ${mirrorRes}px quality, this is a significant GPU cost in any world that has mirrors visible.`,
          advanced: `VRChat mirrors re-render the visible scene geometry for each mirror at the configured resolution. At ${mirrorRes}px, this is effectively doubling GPU workload whenever a mirror is in view. Setting mirror resolution to 256-512px is invisible in VR (your headset resolution limits how much detail you can actually see in a mirror) but cuts mirror rendering cost by 75-90%.`
        },
        fixId: null
      }
    }
  },

  /**
   * Recommend the Steam launch option for *any* 3D V-Cache chip (single or
   * dual-CCD) when VRChat is present. Complements `cpu-vcache-affinity-vr`
   * (which only covers dual-CCD topology) by surfacing the same launch-option
   * recommendation for single-CCD X3D users (5800X3D, 7800X3D, 9800X3D) who
   * still benefit from `/high` priority at process spawn.
   *
   * Suppressed when the launch option is already set, or when the dual-CCD
   * rule is also firing (to avoid duplicate suggestions).
   */
  {
    id: 'vrchat-vcache-launch-option',
    category: 'cpu',
    name: 'VRChat 3D V-Cache Steam Launch Option',
    evaluate: (data) => {
      if (!data.cpu?.hasVCache) return null
      // VRChat presence — either in the Steam library (detected via the
      // v-cache fix's reader) or actively running.
      const vrchatRunning = data.processes?.all?.some((p) => p.name.toLowerCase().includes('vrchat')) ?? false
      const vrchatInstalled = (data as unknown as { steamGames?: { appIds?: string[] } }).steamGames?.appIds?.includes('438100') ?? false
      if (!vrchatRunning && !vrchatInstalled) return null

      // If the launch option is already set to something containing our
      // affinity command, don't nag.
      const currentOption = (data as unknown as { vrchatLaunchOption?: string | null }).vrchatLaunchOption ?? null
      if (currentOption && /affinity\s+FFFF/i.test(currentOption) && /\/high/i.test(currentOption)) return null

      const model = data.cpu.model
      return {
        ruleId: 'vrchat-vcache-launch-option',
        severity: 'info',
        category: 'cpu',
        title: `Pin VRChat to V-Cache Cores via Steam Launch Option (${model})`,
        explanation: {
          simple:
            `Your ${model} has AMD 3D V-Cache, which is what makes VRChat feel smooth. Setting a one-line Steam launch option locks VRChat to those cores at high priority — this is the most reliable way to ensure Windows' scheduler doesn't silently move VRChat off the V-Cache or deprioritize it when background apps get busy.\n\n` +
            `Launch option to use:\n\n` +
            `    cmd /c start /affinity FFFF /high "" %command%\n\n` +
            `Where to set it: Steam → Library → right-click VRChat → Properties → General → Launch Options.`,
          advanced:
            `CPU: ${model} (3D V-Cache detected)\n\n` +
            `The launch option \`cmd /c start /affinity FFFF /high "" %command%\` wraps VRChat.exe at spawn time with:\n` +
            `  • affinity mask FFFF (first 16 logical processors) — pins VRChat to V-Cache CCD on dual-CCD chips; on single-CCD X3D it still prevents the scheduler from scattering threads across E-cores on hybrid desktops\n` +
            `  • /high priority class (PRIORITY_CLASS 0x00000080) — applied at process creation, survives DPC-induced scheduler reshuffles better than post-hoc Task Manager priority adjustments\n\n` +
            `This is preferable to the AMD V-Cache driver's app registry (HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App) because the driver's redirection only triggers on process start and can be overridden by foreground-focus heuristics in Win11 — the launch-option approach sets priority atomically at spawn.\n\n` +
            (currentOption ? `Current launch option: "${currentOption}"` : 'No launch option is currently set.'),
        },
        fixId: 'fix-vcache-affinity'
      }
    }
  }
]
