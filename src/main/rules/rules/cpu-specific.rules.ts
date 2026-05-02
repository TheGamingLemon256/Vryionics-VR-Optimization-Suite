// Vryionics VR Optimization Suite — CPU-Specific Diagnostic Rules
// Uses the baked-in CPU database to provide per-model, per-socket guidance.
// All rules are null-safe: every evaluate() guards on required data fields.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import {
  findCpuEntry,
  isDualCcdVCache,
  getVCacheCCD,
  getStandardCCD,
  affinityMaskToDecimal,
} from '../../data/cpu-database'


/** Returns true if the model string (lowercased) looks like an AM4 Zen 2/3 processor. */
function isAm4Model(model: string): boolean {
  const lower = model.toLowerCase()
  // Match Ryzen 3000, 4000G (APU), and 5000 series on AM4
  return (
    /\b3[3-9]\d{2}x?\b/.test(lower) ||
    /\b5[0-9]\d{2}x?(3d)?\b/.test(lower) ||
    /\b4[0-9]\d{2}g\b/.test(lower)
  )
}

/** Returns true if the model string looks like an AM5 Zen 4/5 processor. */
function isAm5Model(model: string): boolean {
  const lower = model.toLowerCase()
  return /\b[79][679]\d{2}x?(3d)?\b/.test(lower) || /\b9[0-9]\d{2}x?(3d)?\b/.test(lower)
}

/** Format a core range as a human-readable string, e.g. "0–7". */
function formatCoreRange(range: [number, number]): string {
  return `${range[0]}–${range[1]}`
}


const cpuAm4RamSuboptimal: Rule = {
  id: 'cpu-am4-ram-suboptimal',
  category: 'cpu',
  name: 'AM4 RAM Speed Below Optimal for VR',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu || !data.ram) return null
    if (data.ram.type !== 'DDR4') return null

    const model = data.cpu.model
    const entry = findCpuEntry(model)

    // Must be a known AM4 entry or pass the heuristic
    const isAm4 = entry ? entry.socket === 'AM4' : isAm4Model(model)
    if (!isAm4) return null

    const optimalMHz = entry?.optimalRamMHz ?? 3600
    const threshold = optimalMHz - 200
    const actualMHz = data.ram.speed

    if (actualMHz >= threshold) return null

    // Calculate FCLK values for educational purposes
    const actualFclk = Math.round(actualMHz / 2)
    const optimalFclk = Math.round(optimalMHz / 2)
    const optimalNote =
      entry?.optimalRamNote ??
      `DDR4-${optimalMHz} achieves FCLK ${optimalFclk} MHz in 1:1 mode — lowest Infinity Fabric latency for this CPU.`

    return {
      ruleId: 'cpu-am4-ram-suboptimal',
      severity: 'warning',
      category: 'cpu',
      explanation: {
        simple: `Your AMD Ryzen ${model} on AM4 works best with DDR4-${optimalMHz}. Running at ${actualMHz} MHz means your Infinity Fabric — the internal "highway" connecting your CPU cores and memory — runs slower than it could. This directly increases latency for VR frame delivery and world streaming. Enabling XMP in your BIOS and targeting DDR4-${optimalMHz} is one of the most impactful free upgrades for VR on this platform.`,
        advanced:
          `CPU: ${model} | Socket: AM4 | RAM type: DDR4\n` +
          `Actual speed: ${actualMHz} MHz (FCLK ~${actualFclk} MHz)\n` +
          `Optimal speed: ${optimalMHz} MHz (FCLK ~${optimalFclk} MHz)\n\n` +
          `On AM4, the Infinity Fabric (FCLK), memory controller (UCLK), and memory bus (MCLK) all run in a 1:1:1 ratio up to ~FCLK 1900 MHz. ` +
          `At 1:1, FCLK = MCLK = UCLK = RAM_MHz / 2. ` +
          `Your current FCLK of ${actualFclk} MHz introduces additional latency on every cross-core and CPU-to-RAM access. ` +
          `${optimalNote}\n\n` +
          `Action: Enter BIOS → DOCP/XMP → enable profile. Verify FCLK is set to ${optimalFclk} MHz in Ryzen Master or HWiNFO64 sensors.`,
      },
    }
  },
}


const cpuAm5RamSuboptimal: Rule = {
  id: 'cpu-am5-ram-suboptimal',
  category: 'cpu',
  name: 'AM5 RAM Speed Below DDR5-6000 Sweet Spot',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu || !data.ram) return null
    if (data.ram.type !== 'DDR5') return null

    const model = data.cpu.model
    const entry = findCpuEntry(model)

    const isAm5 = entry ? entry.socket === 'AM5' : isAm5Model(model)
    if (!isAm5) return null

    const actualMHz = data.ram.speed

    // Only fire when meaningfully below the 6000 sweet spot
    if (actualMHz >= 5600) return null

    const actualFclk = Math.round(actualMHz / 2)

    return {
      ruleId: 'cpu-am5-ram-suboptimal',
      severity: 'warning',
      category: 'cpu',
      explanation: {
        simple: `Your ${model} on AM5 is running RAM at ${actualMHz} MHz — well below the sweet spot of DDR5-6000. On AMD AM5, 6000 MHz is the "magic number": it sets the Infinity Fabric to 2000 MHz in 1:1 mode, giving you the lowest possible memory latency. Going faster (above 6400 MHz) can actually hurt VR performance by forcing a slower 2:1 mode. Going slower (like ${actualMHz} MHz) leaves significant performance on the table. Try enabling EXPO/XMP in your BIOS and targeting DDR5-6000 CL30.`,
        advanced:
          `CPU: ${model} | Socket: AM5 | RAM type: DDR5\n` +
          `Actual speed: ${actualMHz} MHz (FCLK ~${actualFclk} MHz)\n` +
          `Target speed: 6000 MHz (FCLK 2000 MHz — 1:1 UCLK mode)\n\n` +
          `AM5 Infinity Fabric operates in two modes:\n` +
          `  1:1 mode (FCLK = UCLK = MCLK / 2): Up to DDR5-6400. Best latency.\n` +
          `  2:1 mode (FCLK decoupled from UCLK): Above DDR5-6400. UCLK stays at 2000 MHz but MCLK continues increasing, adding cross-clock-domain latency.\n\n` +
          `At ${actualMHz} MHz (FCLK ~${actualFclk} MHz) vs optimal 6000 MHz (FCLK 2000 MHz), ` +
          `the Infinity Fabric is running ${2000 - actualFclk} MHz slower than optimal. ` +
          `This affects every CPU-to-memory access, cache miss penalty, and cross-CCD transfer.\n\n` +
          `Action: BIOS → EXPO/XMP profile → set DDR5-6000 CL30. Verify FCLK = 2000 MHz in HWiNFO64 or Ryzen Master.`,
      },
    }
  },
}


const cpuAm5RamAboveSweetSpot: Rule = {
  id: 'cpu-am5-ram-above-sweet-spot',
  category: 'cpu',
  name: 'AM5 RAM Above DDR5-6400 — Possible 2:1 UCLK Latency Penalty',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu || !data.ram) return null
    if (data.ram.type !== 'DDR5') return null

    const model = data.cpu.model
    const entry = findCpuEntry(model)

    const isAm5 = entry ? entry.socket === 'AM5' : isAm5Model(model)
    if (!isAm5) return null

    const actualMHz = data.ram.speed
    if (actualMHz <= 6400) return null

    const actualFclk = Math.round(actualMHz / 2)

    return {
      ruleId: 'cpu-am5-ram-above-sweet-spot',
      severity: 'info',
      category: 'cpu',
      explanation: {
        simple: `Your ${model} is running RAM at ${actualMHz} MHz — above the AM5 sweet spot of DDR5-6000. This sounds like "faster = better," but on AM5 going above 6400 MHz forces a mode where the Infinity Fabric runs at a fixed 2000 MHz while your RAM runs faster. The mismatch adds latency on every memory access. For VR, where consistent low latency matters more than peak bandwidth, DDR5-6000 CL30 is usually faster in practice than DDR5-${actualMHz}. Consider testing with DDR5-6000 to compare frame time stability.`,
        advanced:
          `CPU: ${model} | Socket: AM5 | RAM type: DDR5\n` +
          `Actual speed: ${actualMHz} MHz (FCLK ~${actualFclk} MHz)\n\n` +
          `AM5 UCLK mode analysis:\n` +
          `  DDR5 ≤ 6400 MHz → 1:1 mode: FCLK = UCLK = MCLK / 2. Lowest latency.\n` +
          `  DDR5 > 6400 MHz → 2:1 mode: MCLK continues rising but UCLK is capped at 2000 MHz.\n` +
          `    FCLK stays at 2000 MHz, UCLK stays at 2000 MHz, MCLK = ${actualFclk} MHz.\n` +
          `    A clock-domain crossing penalty is added to every CPU→memory access.\n\n` +
          `At ${actualMHz} MHz in 2:1 mode, bandwidth is higher than 6000 MHz but latency is worse. ` +
          `VR workloads are latency-sensitive (vrcompositor, vrserver, VRChat world cache hits) — ` +
          `high bandwidth does not compensate for the latency hit.\n\n` +
          `Recommendation: Test DDR5-6000 CL30 vs current ${actualMHz} MHz using OCAT or fpsVR frame time graphs in a VR title. ` +
          `99th-percentile frame time is the key metric. DDR5-6000 CL30 often wins on 99p frametimes even if average FPS is similar.`,
      },
    }
  },
}


const cpuVcacheAffinityVr: Rule = {
  id: 'cpu-vcache-affinity-vr',
  category: 'cpu',
  name: 'Dual-CCD V-Cache: VR Affinity Not Set to V-Cache Cores',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu) return null
    if (!data.cpu.hasVCache) return null

    const model = data.cpu.model
    const entry = findCpuEntry(model)
    if (!entry) return null

    // Only fire on dual-CCD V-Cache chips (7900X3D, 7950X3D, 9950X3D)
    if (!isDualCcdVCache(entry)) return null

    const vcacheCCD = getVCacheCCD(entry)
    const standardCCD = getStandardCCD(entry)
    if (!vcacheCCD || !standardCCD) return null

    const mask = entry.vrAffinityMask ?? '0xFF'
    const decimalMask = affinityMaskToDecimal(mask)
    const vcacheRange = formatCoreRange(vcacheCCD.coreRange)
    const standardRange = formatCoreRange(standardCCD.coreRange)

    // Check if VRChat app entries are already present in the V-Cache driver registry
    // If they are, Windows scheduler is handling it — still warn at info level since manual is more reliable
    const vrAppNames = ['vrchat', 'vrserver', 'vrcompositor']
    const entries = data.cpu.vcacheAppEntries ?? {}
    const hasVrEntry = Object.keys(entries).some((name) =>
      vrAppNames.some((vr) => name.toLowerCase().includes(vr))
    )

    // If driver entries are present, downgrade severity to info (driver handles it)
    const severity = hasVrEntry ? 'info' : 'warning'

    const driverNote = hasVrEntry
      ? 'AMD V-Cache driver entries are present for VR apps — the driver handles scheduling, but manual affinity is more reliable for VRChat.'
      : 'AMD V-Cache driver entries for VRChat/vrserver are NOT present — Windows may schedule VR on the wrong CCD.'

    return {
      ruleId: 'cpu-vcache-affinity-vr',
      severity,
      category: 'cpu',
      fixId: 'fix-vcache-affinity',
      explanation: {
        simple: `Your ${model} has two clusters of cores — only cores ${vcacheRange} have the high-speed 3D V-Cache. VRChat and VR apps run significantly better when locked to those cores (${vcacheRange}). The other cores (${standardRange}) run at higher clock speeds but have much less cache, which hurts VR world loading and avatar streaming. ${hasVrEntry ? 'Your AMD V-Cache driver has VR apps registered, but manual affinity is more reliable.' : 'Currently, Windows may be running VRChat on the wrong core cluster.'}`,
        advanced:
          `CPU: ${model} | Socket: ${entry.socket} | Codename: ${entry.codename}\n\n` +
          `CCD topology:\n` +
          `  CCD${vcacheCCD.ccdIndex} (cores ${vcacheRange}): 3D V-Cache — 97 MB L3. ${vcacheCCD.clockNote ?? ''}\n` +
          `  CCD${standardCCD.ccdIndex} (cores ${standardRange}): Standard cache — 32 MB L3. ${standardCCD.clockNote ?? ''}\n\n` +
          `For cache-heavy workloads (VRChat world streaming, avatar loading, physics): cache size wins over raw clock speed.\n\n` +
          `Recommended affinity mask: ${mask} (decimal: ${decimalMask ?? 'N/A'})\n` +
          `Applies to: VRChat.exe, vrserver.exe, vrcompositor.exe\n\n` +
          `${driverNote}\n\n` +
          `Method 1 (manual, most reliable): Task Manager → Details tab → right-click VRChat.exe → Set Affinity → uncheck cores ${standardRange}, leave ${vcacheRange} checked.\n\n` +
          `Method 2 (persistent via AMD driver): Register apps in:\n` +
          `  HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App\\VRChat.exe\n` +
          `  Set value "EndsWith" = "VRChat.exe", "Type" = 1\n\n` +
          `Note: ${entry.vrAffinityNote ?? ''}`,
      },
    }
  },
}


const cpuMixedRamFourSticks: Rule = {
  id: 'cpu-mixed-ram-four-sticks',
  category: 'cpu',
  name: '4-Stick RAM: Running Below XMP Speed (Mixed Kit Likely)',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu || !data.ram) return null

    // Need XMP speed to be available and significantly higher than actual speed
    if (data.ram.xmpSpeed === null || data.ram.xmpSpeed === undefined) return null

    const actual = data.ram.speed
    const xmp = data.ram.xmpSpeed
    const delta = xmp - actual

    // Only fire when running >300 MHz below XMP — suggests a stability compromise
    if (delta <= 300) return null

    // Only fire on AM4/AM5 platforms
    const model = data.cpu.model
    const entry = findCpuEntry(model)
    const isAmd = entry ? true : isAm4Model(model) || isAm5Model(model)
    if (!isAmd) return null

    const ramTypeLabel = data.ram.type === 'DDR5' ? 'DDR5' : 'DDR4'
    const optimalMHz = entry?.optimalRamMHz ?? (data.ram.type === 'DDR5' ? 6000 : 3600)
    const isAtOptimal = Math.abs(actual - optimalMHz) <= 200

    const upgradeNote =
      data.ram.type === 'DDR5'
        ? `When budget allows, replacing your RAM with a single matched 2×32 GB DDR5-${optimalMHz} CL30 kit will achieve your CPU's optimal FCLK and give the best VR performance.`
        : `When budget allows, replacing your RAM with a matched 2×16 GB DDR4-${optimalMHz} CL16 kit will achieve optimal Infinity Fabric speed.`

    return {
      ruleId: 'cpu-mixed-ram-four-sticks',
      severity: 'info',
      category: 'cpu',
      explanation: {
        simple: `Your ${ramTypeLabel} is running at ${actual} MHz, but your XMP profile is rated for ${xmp} MHz — a ${delta} MHz gap. This usually means you have two different-speed kits (4 sticks total) and had to drop to the slower speed for stability. This is the RIGHT choice — running mismatched kits at the faster speed risks crashes and data corruption. ${isAtOptimal ? `Your current ${actual} MHz is close to your CPU's sweet spot, so this is a reasonable configuration.` : `Your CPU's optimal speed is ${optimalMHz} MHz. ${upgradeNote}`}`,
        advanced:
          `CPU: ${model} | RAM type: ${ramTypeLabel}\n` +
          `Actual speed: ${actual} MHz | XMP/EXPO profile: ${xmp} MHz | Gap: ${delta} MHz\n\n` +
          `Running 4 sticks of ${ramTypeLabel} significantly stresses the integrated memory controller (IMC). ` +
          `With two different-speed kits, the memory controller must train to the slower kit's rated speed, ` +
          `which is why your system is running at ${actual} MHz instead of the XMP-rated ${xmp} MHz.\n\n` +
          `This is the correct stability choice. Forcing ${xmp} MHz with mismatched kits risks:\n` +
          `  • Failed memory training (system won't POST or posts at JEDEC fallback)\n` +
          `  • Random BSODs under VR load (memory controller overcurrent)\n` +
          `  • Silent memory corruption at extreme speeds\n\n` +
          `Current configuration assessment:\n` +
          `  CPU optimal RAM speed: ${optimalMHz} MHz\n` +
          `  Your actual speed: ${actual} MHz\n` +
          `  Difference: ${Math.abs(actual - optimalMHz)} MHz ${actual < optimalMHz ? 'below' : 'above'} optimal\n\n` +
          upgradeNote +
          `\n\nFor VR specifically: ${data.ram.type === 'DDR5' ? '64 GB (2×32 GB)' : '32 GB (2×16 GB)'} in a matched single-kit configuration gives the best combination of stability, latency, and capacity for modern VR titles.`,
      },
    }
  },
}


const cpuZen4ModelSpecificNote: Rule = {
  id: 'cpu-zen4-model-specific-note',
  category: 'cpu',
  name: 'Zen 4 CPU: VR Configuration Notes',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu || !data.ram) return null

    const model = data.cpu.model
    const lower = model.toLowerCase()

    // Match Ryzen 7000 series non-X3D (Zen 4)
    // Exclude X3D variants — they have more specific rules
    const isZen4NonX3D =
      /\b7[0-9]\d{2}x?\b/.test(lower) && !lower.includes('x3d') && !lower.includes('3d')
    if (!isZen4NonX3D) return null

    const entry = findCpuEntry(model)
    const isAm5 = entry ? entry.socket === 'AM5' : isAm5Model(model)
    if (!isAm5) return null

    const optimalMHz = entry?.optimalRamMHz ?? 6000
    const actualMHz = data.ram.speed
    const ramAtOptimal = Math.abs(actualMHz - optimalMHz) <= 200
    const vrProfile = entry?.vrProfile ?? 'single-thread-dominant'
    const vrTier = entry?.vrTier ?? 'high'
    const quirks = entry?.quirks ?? []

    const ramStatus = ramAtOptimal
      ? `RAM is at ${actualMHz} MHz — close to the ${optimalMHz} MHz sweet spot.`
      : `RAM is at ${actualMHz} MHz — ${actualMHz < optimalMHz ? `${optimalMHz - actualMHz} MHz below` : `${actualMHz - optimalMHz} MHz above`} the ${optimalMHz} MHz sweet spot.`

    const profileNote =
      vrProfile === 'single-thread-dominant'
        ? 'This CPU excels in single-thread VR workloads — high per-core IPC and boost clocks are its strength.'
        : vrProfile === 'balanced'
          ? 'This CPU balances core count with single-thread performance — well-suited to VR + simultaneous streaming or capture.'
          : 'Cache-dominant profile — 3D V-Cache provides the primary VR advantage.'

    return {
      ruleId: 'cpu-zen4-model-specific-note',
      severity: 'info',
      category: 'cpu',
      explanation: {
        simple: `Your ${model} is a Zen 4 processor on AM5. ${profileNote} For best VR performance: target DDR5-6000 CL30 RAM, keep the CPU cool (Zen 4 boosts aggressively when thermal headroom exists), and ensure your game/VR runtime is using all available cores. ${ramStatus}`,
        advanced:
          `CPU: ${model} | Socket: AM5 | Codename: ${entry?.codename ?? 'Zen 4'}\n` +
          `Cores: ${data.cpu.cores} | Threads: ${data.cpu.threads} | CCDs: ${entry?.ccdCount ?? 'unknown'}\n` +
          `VR profile: ${vrProfile} | VR tier: ${vrTier}\n\n` +
          `RAM configuration:\n` +
          `  Current: ${actualMHz} MHz ${data.ram.type}\n` +
          `  Optimal: ${optimalMHz} MHz (FCLK 2000 MHz, 1:1 UCLK mode)\n` +
          `  ${ramStatus}\n\n` +
          `Zen 4 VR configuration checklist:\n` +
          `  • DDR5-6000 CL30 XMP/EXPO enabled — FCLK 2000 MHz in 1:1 mode\n` +
          `  • Avoid DDR5 above 6400 MHz (forces 2:1 UCLK mode, adds latency)\n` +
          `  • Ensure Precision Boost is active (do not undervolt aggressively)\n` +
          `  • Keep package temps below 85°C for full boost; Zen 4 throttles at 95°C (Tjmax)\n` +
          `  • BIOS: enable Re-Size BAR (Smart Access Memory) if on NVIDIA RTX 30/40 series\n` +
          `  • Disable SMT (Hyper-Threading) only if recommended by specific VR title; usually SMT ON is better\n\n` +
          (quirks.length > 0
            ? `CPU-specific notes:\n${quirks.map((q) => `  • ${q}`).join('\n')}`
            : ''),
      },
    }
  },
}


const cpu7950x3dVrchatAffinity: Rule = {
  id: 'cpu-7950x3d-vrchat-affinity',
  category: 'cpu',
  name: '7950X3D / 9950X3D: VRChat Running on Wrong Core Cluster',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu) return null

    const model = data.cpu.model
    const lower = model.toLowerCase()

    const is7950x3d = lower.includes('7950x3d') || lower.includes('7950 x3d')
    const is9950x3d = lower.includes('9950x3d') || lower.includes('9950 x3d')

    if (!is7950x3d && !is9950x3d) return null

    const chipLabel = is7950x3d ? '7950X3D' : '9950X3D'
    const ipcNote = is9950x3d ? ' (with Zen 5\'s ~16% IPC improvement over Zen 4)' : ''

    // Check if VRChat app entries are present in the V-Cache driver registry
    const entries = data.cpu.vcacheAppEntries ?? {}
    const vrAppNames = ['vrchat', 'vrserver', 'vrcompositor']
    const hasVrEntry = Object.keys(entries).some((name) =>
      vrAppNames.some((vr) => name.toLowerCase().includes(vr))
    )

    // If both vrserver and VRChat are registered, the driver handles it — lower severity
    const vrserverRegistered = Object.keys(entries).some((n) => n.toLowerCase().includes('vrserver'))
    const vrchatRegistered = Object.keys(entries).some((n) => n.toLowerCase().includes('vrchat'))
    const fullyConfigured = vrserverRegistered && vrchatRegistered

    if (fullyConfigured) {
      // Driver is fully configured — emit info instead of warning
      return {
        ruleId: 'cpu-7950x3d-vrchat-affinity',
        severity: 'info',
        category: 'cpu',
        fixId: 'fix-vcache-affinity',
        explanation: {
          simple: `Your Ryzen 9 ${chipLabel} is configured with AMD V-Cache driver entries for both VRChat.exe and vrserver.exe. This means the driver should automatically schedule these apps on the V-Cache cores (0–7). If you still experience stutters in VRChat, consider also setting manual affinity (cores 0–7) as a belt-and-suspenders approach — the manual setting is more immediate than the driver scheduler.`,
          advanced:
            `CPU: ${model} | Socket: AM5 | Codename: Zen ${is9950x3d ? '5' : '4'} + 3D V-Cache${ipcNote}\n\n` +
            `V-Cache driver status:\n` +
            `  vrserver.exe: ${vrserverRegistered ? 'REGISTERED' : 'NOT registered'}\n` +
            `  VRChat.exe: ${vrchatRegistered ? 'REGISTERED' : 'NOT registered'}\n\n` +
            `CCD topology reminder:\n` +
            `  CCD0 (cores 0–7): 97 MB 3D V-Cache, max boost ~${is9950x3d ? '4.6' : '4.2'} GHz\n` +
            `  CCD1 (cores 8–15): 32 MB standard L3, max boost ~${is9950x3d ? '5.9' : '5.7'} GHz\n\n` +
            `The driver scheduler uses process name matching to redirect registered apps to CCD0. ` +
            `Manual affinity (Task Manager → Details → Set Affinity) is more immediate and unaffected by driver restarts.\n\n` +
            `Registry verification path:\n` +
            `  HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App`,
        },
      }
    }

    return {
      ruleId: 'cpu-7950x3d-vrchat-affinity',
      severity: 'warning',
      category: 'cpu',
      fixId: 'fix-vcache-affinity',
      explanation: {
        simple: `Your Ryzen 9 ${chipLabel} has two clusters of cores — the 3D V-Cache cluster (cores 0–7) is what makes VRChat and social VR worlds smooth. However, Windows often schedules VRChat on the WRONG cluster (cores 8–15, which have higher raw clocks but a much smaller 32 MB cache vs 97 MB). You need to manually tell VRChat to use only cores 0–7 for best performance. The difference can be dramatic in busy VRChat worlds with many avatars.${hasVrEntry ? ' Your AMD V-Cache driver has partial VR app registration — complete the setup for both VRChat.exe and vrserver.exe.' : ''}`,
        advanced:
          `CPU: ${model} | Socket: AM5 | Codename: Zen ${is9950x3d ? '5' : '4'} + 3D V-Cache${ipcNote}\n\n` +
          `${chipLabel} topology:\n` +
          `  CCD0 = cores 0–7 (97 MB 3D V-Cache, ~${is9950x3d ? '4.6' : '4.2'} GHz max boost)\n` +
          `  CCD1 = cores 8–15 (32 MB standard L3, ~${is9950x3d ? '5.9' : '5.7'} GHz max boost)\n\n` +
          `Why CCD0 wins for VRChat despite lower clocks:\n` +
          `  VRChat world streaming, avatar loading, and physics simulation are cache-thrashing workloads. ` +
          `  The 97 MB V-Cache on CCD0 fits significantly more world geometry and shader data than CCD1's 32 MB. ` +
          `  Cache misses stall the CPU pipeline — a cache miss at 4.2 GHz (CCD0) is faster than repeated misses at 5.7 GHz (CCD1).\n\n` +
          `Affinity mask for VR processes: 0xFF (decimal: 255) = cores 0–7\n` +
          `Applies to: VRChat.exe, vrserver.exe, vrcompositor.exe\n\n` +
          `V-Cache driver status:\n` +
          `  vrserver.exe: ${vrserverRegistered ? 'REGISTERED' : 'NOT registered'}\n` +
          `  VRChat.exe: ${vrchatRegistered ? 'REGISTERED' : 'NOT registered'}\n\n` +
          `Method 1 — Manual affinity (immediate, per-session):\n` +
          `  Task Manager → Details tab → right-click VRChat.exe → Set Affinity\n` +
          `  Uncheck cores 8–15, leave cores 0–7 checked → OK\n` +
          `  Repeat for vrserver.exe\n\n` +
          `Method 2 — AMD V-Cache driver (persistent across sessions):\n` +
          `  Registry path: HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App\\VRChat.exe\n` +
          `  Add REG_SZ values: "EndsWith" = "VRChat.exe", "Type" = 1\n` +
          `  Repeat for vrserver.exe at: ...\\App\\vrserver.exe\n` +
          `  Restart the amd3dvcacheSvc service or reboot for changes to take effect.\n\n` +
          `Note: If using SteamVR, also consider setting affinity for vrcompositor.exe, though the VR runtime may reassign threads dynamically.`,
      },
    }
  },
}


export const cpuSpecificRules: Rule[] = [
  cpuAm4RamSuboptimal,
  cpuAm5RamSuboptimal,
  cpuAm5RamAboveSweetSpot,
  cpuVcacheAffinityVr,
  cpuMixedRamFourSticks,
  cpuZen4ModelSpecificNote,
  cpu7950x3dVrchatAffinity,
]
