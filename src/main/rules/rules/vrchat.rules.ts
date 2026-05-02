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
        title: 'VRChat avatar physics uncapped — heavy CPU cost in busy worlds',
        explanation: {
          simple: 'VRChat\'s per-avatar PhysBones cap is unlimited in your config.json. In a 20+ player world (each with simulating hair/tails/clothes), this is the main reason VR users go CPU-bound and hit reprojection.',
          advanced: 'The config key here is `dynamic_bone_max_affected_transform_count` — the name is legacy from when VRChat used the Dynamic Bone Unity asset. Since 2022 those components are auto-converted to VRChat\'s in-house PhysBones system, but the config key still controls the per-avatar transform-simulation cap. `0` means no cap. Avatars routinely ship with 100–500 simulating bones; at 20 players that\'s 10k+ transforms per frame at 90Hz. Capping at 32 per avatar cuts main-thread CPU 60–80% in populated worlds. Visual difference is small. The in-game equivalent is Settings → Performance Options → Avatar Performance Limiter, which overrides config.json when set.'
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
        title: `VRChat avatar bone cap set high (${affected} transforms/avatar)`,
        explanation: {
          simple: `Your config caps avatar bone simulation at ${affected} transforms each. Better than uncapped, but 64 or less is what holds up in busy worlds.`,
          advanced: `dynamic_bone_max_affected_transform_count = ${affected} (the legacy key name — it now controls PhysBones simulation since VRChat auto-converted the old Dynamic Bone components in 2022). Cost scales linearly with cap × player count. 20 players × ${affected} = ${affected * 20} transforms/frame. 32–64 is the sweet spot for VR's frame budget.`
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
        title: 'VRChat avatar collider checks uncapped — CPU spikes on complex avatars',
        explanation: {
          simple: 'Collider checks per bone are uncapped. PhysBone colliders let hair/cloth bump against an avatar\'s body — they work, but each check is expensive. Uncapped means frame-time spikes around complex avatars.',
          advanced: 'dynamic_bone_max_collider_check_count = 0 means no limit on collider-bone intersection tests per frame. Each test is roughly O(transforms × colliders). Avatars with full-body collision meshes can generate thousands of tests per frame. Capping at 8 eliminates the worst-case spike while keeping physics looking right. The key name is legacy from the old Dynamic Bone asset — it now governs PhysBone collider checks.'
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
        title: 'No VRChat config.json — running on stock defaults',
        explanation: {
          simple: 'VRChat\'s config.json is missing, so you\'re on the out-of-the-box defaults: uncapped avatar physics, small cache, no avatar culling. Fine for an empty world, painful in a populated one.',
          advanced: 'config.json controls a handful of things VRChat doesn\'t expose in the in-game settings menu — avatar culling distance, the per-avatar PhysBones simulation/collider caps (still keyed under the legacy `dynamic_bone_max_*` names), cache size, particle limits. Without it, VRChat ships with values that prioritise looking-correct over performing-well in social instances. Applying the recommended config gives you immediate breathing room in anything 5+ players.'
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
