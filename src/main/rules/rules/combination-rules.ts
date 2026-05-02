// VR Optimization Suite — Combination / Multi-Factor Rules
//
// These rules fire when MULTIPLE signals combine into a specific problem.
// Single-factor rules (gpu-temp-high, wifi-2.4ghz, etc.) live in their own files.
// This file encodes the "if A and B and C, then this specific diagnosis" knowledge
// that distinguishes a VR expert from a generic checklist.
//
// Categories covered here:
//   • GPU + CPU simultaneous bottleneck
//   • Wireless VR combined deficiencies
//   • Thermal compound issues (multiple modules hot)
//   • Memory pressure combinations
//   • VR streaming quality combinations
//   • Power + OS tuning combinations
//   • Process interference combinations
//   • Storage + VR combinations

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { dedupeProcesses, formatDedupedNames, summariseProcessList } from '../process-dedupe'

export const combinationRules: Rule[] = [

  // ═══════════════════════════════════════════════════
  // GPU + CPU COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-gpu-cpu-both-high',
    category: 'gpu',
    name: 'GPU and CPU Both Bottlenecked',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.cpu) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const gpuHigh = gpu.utilization > 85
      const cpuHigh = data.cpu.avgUsage > 75
      if (!gpuHigh || !cpuHigh) return null
      return {
        ruleId: 'combo-gpu-cpu-both-high',
        severity: 'critical',
        category: 'gpu',
        explanation: {
          simple: `Both your CPU (${data.cpu.avgUsage.toFixed(0)}%) and GPU (${gpu.utilization.toFixed(0)}%) are maxed out at the same time. VR needs both working smoothly — when either falls behind, you get visual glitches and reprojection. The most effective fix is lowering in-game graphics settings to give both some breathing room.`,
          advanced: `CPU avg: ${data.cpu.avgUsage.toFixed(1)}% | GPU util: ${gpu.utilization.toFixed(1)}%. When both CPU and GPU are simultaneously saturated, VR frame delivery degrades from two directions: the CPU can't deliver draw calls fast enough, and the GPU can't render them. This manifests as double-frequency reprojection artifacts. No single setting change fixes both — start by reducing render resolution (GPU relief) and disabling CPU-heavy effects (draw call count, physics quality).`
        }
      }
    }
  },

  {
    id: 'combo-gpu-cpu-mixed-bottleneck',
    category: 'cpu',
    name: 'CPU May Be Hiding a GPU Bottleneck (or Vice Versa)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.cpu) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      // One is high, the other is suspiciously moderate — could be a false ceiling
      const gpuHigh = gpu.utilization > 90
      const cpuModerate = data.cpu.avgUsage > 50 && data.cpu.avgUsage < 75
      const cpuHigh = data.cpu.avgUsage > 80
      const gpuModerate = gpu.utilization > 55 && gpu.utilization < 80
      if (!((gpuHigh && cpuModerate) || (cpuHigh && gpuModerate))) return null
      const bottleneck = gpuHigh ? 'GPU' : 'CPU'
      const secondary = gpuHigh ? 'CPU' : 'GPU'
      return {
        ruleId: 'combo-gpu-cpu-mixed-bottleneck',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: `Your ${bottleneck} is maxed out while your ${secondary} has spare capacity. This suggests the ${bottleneck} is the limiting factor — the ${secondary} is waiting on it. Optimizing for the ${bottleneck} will give you the most performance improvement.`,
          advanced: `${bottleneck} utilization is the binding constraint. ${secondary} util of ${gpuHigh ? data.cpu.avgUsage.toFixed(0) : gpu.utilization.toFixed(0)}% confirms the ${secondary} is stalled waiting on the ${bottleneck}. For ${bottleneck === 'GPU' ? 'GPU-limited scenarios: reduce render resolution, shadow quality, MSAA level' : 'CPU-limited scenarios: reduce NPC/AI density, physics quality, enable frame-rate limiting to reduce redraw overhead'}.`
        }
      }
    }
  },

  {
    id: 'combo-cpu-high-context-switches',
    category: 'cpu',
    name: 'High CPU Context Switching Under VR Load',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      const highUsage = data.cpu.avgUsage > 65
      const highContextSwitches = data.cpu.contextSwitchesPerSec > 80000
      if (!highUsage || !highContextSwitches) return null
      return {
        ruleId: 'combo-cpu-high-context-switches',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: `Your CPU is busy (${data.cpu.avgUsage.toFixed(0)}%) AND is spending a lot of time switching between different tasks (${(data.cpu.contextSwitchesPerSec / 1000).toFixed(0)}k/s switches). In VR, the game engine needs consistent, uninterrupted CPU time. Many background apps are competing for CPU attention.`,
          advanced: `CPU usage: ${data.cpu.avgUsage.toFixed(1)}% | Context switches/sec: ${data.cpu.contextSwitchesPerSec.toLocaleString()}. Elevated context switches under VR load indicate OS scheduler interference. VR compositor threads need real-time priority and minimal pre-emption. Causes: background processes, antivirus scans, Windows Update, browser tabs. Close non-essential applications. Check for processes with high interrupt counts in Resource Monitor.`
        }
      }
    }
  },

  {
    id: 'combo-bloat-plus-cpu',
    category: 'processes',
    name: 'Background Apps Stealing CPU from VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes || !data.cpu) return null
      if (data.processes.bloat.length < 2) return null
      if (data.cpu.avgUsage < 55) return null
      const bloatCpu = data.processes.bloat.reduce((s, p) => s + p.cpuPercent, 0)
      if (bloatCpu < 5) return null
      const deduped = dedupeProcesses(data.processes.bloat)
      const topNames = formatDedupedNames(deduped, 3)
      const advancedBreakdown = deduped
        .slice(0, 8)
        .map((d) => `${d.name}${d.count > 1 ? ` ×${d.count}` : ''} (${d.totalCpuPercent.toFixed(1)}%)`)
        .join(', ')
      return {
        ruleId: 'combo-bloat-plus-cpu',
        severity: 'warning',
        category: 'processes',
        explanation: {
          simple: `${deduped.length} background apps are using ${bloatCpu.toFixed(1)}% of your CPU while VR is running: ${topNames}. Close these before putting on your headset for smoother performance.`,
          advanced: `Bloat apps consuming ${bloatCpu.toFixed(1)}% CPU aggregate: ${advancedBreakdown}. Combined with ${data.cpu.avgUsage.toFixed(0)}% total CPU, these processes are competing with VR game threads for scheduler time. Add Steam/SteamVR/game folder paths to Windows Defender exclusions to eliminate AV scanning overhead.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // WIRELESS VR COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-wireless-vr-all-issues',
    category: 'network',
    name: 'Multiple Wireless VR Problems Compounding',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      const w = data.network.wifi
      let issueCount = 0
      const issues: string[] = []

      if (w.band === '2.4GHz') { issueCount += 2; issues.push('2.4GHz band') }
      if (w.signalStrength !== null && w.signalStrength < 65) { issueCount++; issues.push(`weak signal (${w.signalStrength}%)`) }
      if (w.linkSpeed !== null && w.linkSpeed < 866) { issueCount++; issues.push(`low link speed (${w.linkSpeed} Mbps)`) }
      if (w.powerSavingEnabled === true) { issueCount++; issues.push('power saving on') }
      if (issueCount < 2) return null

      return {
        ruleId: 'combo-wireless-vr-all-issues',
        severity: issueCount >= 3 ? 'critical' : 'warning',
        category: 'network',
        explanation: {
          simple: `You have ${issues.length} Wi-Fi problems stacking on top of each other: ${issues.join(', ')}. Each one alone would cause issues — together they make wireless VR nearly unusable. Fix them in order: band first, then signal, then adapter settings.`,
          advanced: `${issues.length} compounding wireless VR issues: ${issues.join(' | ')}. Total effect is multiplicative, not additive — a 2.4GHz connection with weak signal and low link speed means the video codec must drastically reduce quality and/or bitrate, causing severe compression artifacts, stutter, and latency. The 2.4GHz issue alone should be treated as blocking; fix it first before evaluating remaining issues.`
        }
      }
    }
  },

  {
    id: 'combo-wireless-encoder-bandwidth',
    category: 'gpu',
    name: 'Wireless VR Encoding Exceeding Bandwidth',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.network?.wifi) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const highEncoder = gpu.encoderUtilization > 75
      const lowBandwidth = data.network.wifi.linkSpeed !== null && data.network.wifi.linkSpeed < 600
      if (!highEncoder || !lowBandwidth) return null
      return {
        ruleId: 'combo-wireless-encoder-bandwidth',
        severity: 'warning',
        category: 'gpu',
        explanation: {
          simple: `Your GPU encoder (${gpu.encoderUtilization.toFixed(0)}%) is working hard to compress video, but your Wi-Fi can only carry ${data.network.wifi.linkSpeed} Mbps. The compression is fighting a bandwidth ceiling — lower your streaming bitrate in Virtual Desktop or Air Link settings to match what your network can actually handle.`,
          advanced: `Encoder util: ${gpu.encoderUtilization.toFixed(1)}% | Wi-Fi link speed: ${data.network.wifi.linkSpeed} Mbps. The encoder is attempting to push more data than the link supports, causing buffer buildup and increased encode-to-decode latency. Target bitrate should not exceed 80% of link speed. At ${data.network.wifi.linkSpeed} Mbps, cap bitrate at ${Math.round((data.network.wifi.linkSpeed ?? 0) * 0.8)} Mbps. Use HEVC (H.265) codec if available — same quality at 30-40% lower bitrate vs H.264.`
        }
      }
    }
  },

  {
    id: 'combo-headset-not-detected-wireless',
    category: 'network',
    name: 'Wireless Headset — Runtime Not Active',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      const hc = data.headsetConnection
      if (hc.detected) return null
      if (hc.method !== 'none') return null
      // Only fire if wireless archetype is set but nothing is running
      return {
        ruleId: 'combo-headset-not-detected-wireless',
        severity: 'warning',
        category: 'network',
        explanation: {
          simple: 'No VR streaming software appears to be running. For wireless PCVR (Quest, Pico), you need either Meta Air Link, Virtual Desktop, or ALVR running on your PC before putting on the headset. None of these were detected during the scan.',
          advanced: `VR processes detected: none. Expected for wireless PCVR: OVRServer_x64 (Air Link), VirtualDesktop.Streamer (VD), or ALVRServer (ALVR). If you use Virtual Desktop, ensure the Streamer app is installed separately from the store version and is running in the system tray. If Air Link: Oculus PC app must be open and Air Link enabled in headset settings.`
        }
      }
    }
  },

  {
    id: 'combo-airlink-no-5ghz',
    category: 'network',
    name: 'Wireless VR — PC Not on 5GHz',
    // Dual-gate: runs for any wireless-declared user (from the setup wizard),
    // even if the scan happened while VR wasn't running. Previously this only
    // fired when a wireless runtime was actively detected, silently skipping
    // wireless users who scan their PC between VR sessions.
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      // Still accept runtime detection as a secondary signal — it produces a
      // more specific advanced explanation when we know exactly what's running.
      const method = data.headsetConnection?.method
      const runtimeDetected =
        method === 'airlink' || method === 'virtual-desktop' || method === 'alvr' || method === 'steam-link-vr'
      const band = data.network.wifi.band
      if (band === '5GHz' || band === '6GHz') return null
      const methodLabel = runtimeDetected
        ? `Wireless streaming detected (${method})`
        : 'You selected a wireless connection in setup'
      return {
        ruleId: 'combo-airlink-no-5ghz',
        severity: 'critical',
        category: 'network',
        explanation: {
          simple: `You're using wireless PC VR streaming but your PC is connected to ${band ?? 'an unknown'} Wi-Fi. For Air Link, Virtual Desktop, ALVR or Steam Link VR to work well, your PC must be on 5GHz or 6GHz Wi-Fi — or ideally wired via Ethernet so it's not competing for Wi-Fi bandwidth with your headset.`,
          advanced: `${methodLabel}. PC Wi-Fi band: ${band ?? 'unknown'}. Best practice: PC on wired Ethernet, headset on dedicated 5GHz or 6GHz Wi-Fi router. If PC must use Wi-Fi, use a different band than the headset to avoid co-channel interference. Air Link requires Wi-Fi 5 or Wi-Fi 6 router; Virtual Desktop / ALVR / Steam Link VR all support 5/6GHz with quality degrading significantly below 5GHz.`
        }
      }
    }
  },

  {
    id: 'combo-wireless-vr-low-bitrate-set',
    category: 'network',
    name: 'Streaming Bitrate Set Too Low for Resolution',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      const bitrate = data.headsetConnection.streamingBitrateMbps
      if (!bitrate || bitrate > 100) return null
      return {
        ruleId: 'combo-wireless-vr-low-bitrate-set',
        severity: 'warning',
        category: 'network',
        explanation: {
          simple: `Your streaming bitrate is set to ${bitrate} Mbps, which is quite low. At this bitrate, the video will look visually degraded — especially in bright, detailed scenes. Try raising it to 150-200 Mbps if your Wi-Fi can handle it.`,
          advanced: `Detected streaming bitrate: ${bitrate} Mbps. Recommended minimums: H.264 at 150 Mbps (720p-equivalent quality), HEVC at 100 Mbps (equivalent quality). For Quest 3 (2064×2208/eye), target 150-300 Mbps HEVC. Current encoder: ${data.headsetConnection.encoderInUse ?? 'unknown'}. NVENC HEVC at 150 Mbps provides better visual quality than x264 at 200 Mbps.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // USB / WIRED CONNECTION COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-usb-link-bad-controller',
    category: 'network',
    name: 'USB VR Link — Suboptimal USB Controller',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      const hc = data.headsetConnection
      if (hc.method !== 'usb-link' && hc.method !== 'steamvr-usb') return null
      if (!hc.usbGeneration) return null
      const gen = parseFloat(hc.usbGeneration)
      if (gen >= 3.1) return null
      return {
        ruleId: 'combo-usb-link-bad-controller',
        severity: gen < 3.0 ? 'critical' : 'warning',
        category: 'network',
        explanation: {
          simple: `Your headset is connected via USB ${hc.usbGeneration}, but USB 3.2 Gen 2 (10 Gbps) is recommended for wired VR streaming. ${gen < 3.0 ? 'USB 2.0 will not work at all for Oculus Link — the bandwidth is far too low.' : 'USB 3.0 may work but can cause video quality or tracking issues in some setups.'}`,
          advanced: `USB controller detected: ${hc.usbControllerType ?? 'unknown'} (Gen ${hc.usbGeneration}). Oculus Link requires USB 3.0+ (5 Gbps minimum), with USB 3.2 Gen 2 (10 Gbps) recommended for full quality. Known-good controllers: Intel USB 3.2, AMD 400/500-series USB 3.2, Renesas USB 3.1. If using a USB hub, it degrades bandwidth. Connect directly to the motherboard USB port.`
        }
      }
    }
  },

  {
    id: 'combo-wired-headset-no-runtime',
    category: 'vr-runtime',
    name: 'Wired Headset — VR Runtime Not Running',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      const hc = data.headsetConnection
      // USB device present but no runtime process
      if (hc.method !== 'unknown-wired') return null
      return {
        ruleId: 'combo-wired-headset-no-runtime',
        severity: 'warning',
        category: 'vr-runtime',
        explanation: {
          simple: 'A VR headset appears to be plugged in (USB device detected) but the VR software is not running. Make sure SteamVR, the Oculus PC App, or Windows Mixed Reality is installed and launched.',
          advanced: `USB VR device detected: ${hc.detectedDeviceName ?? 'Unknown device'}. No VR runtime processes found (vrserver, OVRServer_x64, MixedRealityPortal). This suggests the headset hardware is recognized by Windows but the VR software hasn't started. Check: SteamVR auto-start is enabled, Oculus PC App is set to launch on startup, or WMR is set up. Alternatively, the headset may be in charging-only mode.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // THERMAL COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-thermal-both-cpu-gpu',
    category: 'cpu',
    name: 'Both CPU and GPU Running Hot — Case Airflow Issue',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.cpu) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const cpuHot = data.cpu.temperature !== null && data.cpu.temperature > 80
      const gpuHot = gpu.temperature > 82
      if (!cpuHot || !gpuHot) return null
      return {
        ruleId: 'combo-thermal-both-cpu-gpu',
        severity: 'critical',
        category: 'cpu',
        explanation: {
          simple: `Both your CPU (${data.cpu.temperature}°C) and GPU (${gpu.temperature}°C) are running hot simultaneously. When both are hot at the same time, it usually means the whole case is heat-saturated — hot air has nowhere to go. This will cause both components to throttle and deliver choppy VR performance.`,
          advanced: `CPU: ${data.cpu.temperature}°C | GPU: ${gpu.temperature}°C. Concurrent thermal stress on both primary components indicates system-level airflow failure. Possible causes: (1) Case fans not spinning at full speed — check fan curves in BIOS, (2) Cable management blocking airflow, (3) Intake/exhaust imbalance — aim for positive pressure (more intake than exhaust), (4) CPU cooler thermal paste dried out (especially >2 years old), (5) GPU heatsink clogged with dust. Sustained simultaneous throttling from both chips will compound VR frame delivery failures.`
        }
      }
    }
  },

  {
    id: 'combo-gpu-temp-power-constrained',
    category: 'gpu',
    name: 'GPU Thermal + Power Throttling Together',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const gpu = data.gpu.devices[0]
      if (!gpu || gpu.temperature === 0 || gpu.powerLimit === 0) return null
      const tempThrottling = gpu.temperature > 88
      const powerThrottling = (gpu.powerDraw / gpu.powerLimit) > 0.97
      if (!tempThrottling || !powerThrottling) return null
      return {
        ruleId: 'combo-gpu-temp-power-constrained',
        severity: 'critical',
        category: 'gpu',
        explanation: {
          simple: `Your GPU is being slowed down by both heat (${gpu.temperature}°C) AND hitting its power limit (${gpu.powerDraw.toFixed(0)}W / ${gpu.powerLimit.toFixed(0)}W). It's trying to do too much work in too little space. The most effective fix is an undervolt — it reduces heat and power while maintaining or even improving performance.`,
          advanced: `GPU temp: ${gpu.temperature}°C | Power: ${gpu.powerDraw.toFixed(1)}W / ${gpu.powerLimit.toFixed(1)}W (${((gpu.powerDraw / gpu.powerLimit) * 100).toFixed(0)}%). Dual thermal+power throttle is the worst-case scenario for VR frame consistency, as both constraints simultaneously reduce clocks. An undervolt (MSI Afterburner → Ctrl+F → voltage-frequency curve) typically reduces both by 10-20% while maintaining 98-100% of performance. This is the single highest-ROI GPU optimization available.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // MEMORY COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-ram-speed-xmp-disabled',
    category: 'ram',
    name: 'RAM Running Below Rated Speed — XMP/EXPO Not Enabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (!data.ram.xmpSpeed) return null
      const speedDiff = data.ram.xmpSpeed - data.ram.speed
      if (speedDiff < 400) return null // Small difference might be rounding
      return {
        ruleId: 'combo-ram-speed-xmp-disabled',
        severity: 'warning',
        category: 'ram',
        explanation: {
          simple: `Your RAM is running at ${data.ram.speed} MHz but it's rated for ${data.ram.xmpSpeed} MHz. It's like buying a sports car and leaving it in slow mode. Enable XMP (Intel) or EXPO (AMD) in your BIOS to unlock its full speed. This is a free performance boost.`,
          advanced: `Actual RAM speed: ${data.ram.speed} MHz | Rated XMP/EXPO speed: ${data.ram.xmpSpeed} MHz (delta: ${data.ram.xmpSpeed - data.ram.speed} MHz). For AMD Ryzen systems (Zen 2+), fast RAM has a significant impact on the Infinity Fabric (FCLK) performance — especially for VR rendering latency. Enable XMP/EXPO in BIOS → Advanced → DRAM Configuration → Memory Profile. May require a reboot. Ensure kit is installed in the correct dual-channel slots (A2+B2 on most boards).`
        },
        fixId: undefined // User must do this in BIOS
      }
    }
  },

  {
    id: 'combo-low-ram-vr',
    category: 'ram',
    name: 'Insufficient RAM for PCVR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (data.ram.totalGB >= 16) return null
      return {
        ruleId: 'combo-low-ram-vr',
        severity: data.ram.totalGB < 12 ? 'critical' : 'warning',
        category: 'ram',
        explanation: {
          simple: `You have ${data.ram.totalGB.toFixed(0)}GB of RAM. Modern PCVR games require 16GB as a minimum — some (VRChat, Horizon Worlds, Praydog mods) need 32GB. With ${data.ram.totalGB.toFixed(0)}GB, Windows is likely using the hard drive as extra memory (page file), which causes severe stutters and long loading times.`,
          advanced: `System RAM: ${data.ram.totalGB.toFixed(1)} GB (${data.ram.type} @ ${data.ram.speed} MHz). VR memory requirements: SteamVR compositor ~1.5GB, game engine ~4-8GB, Windows + background processes ~4GB, VR overlay software ~0.5GB. Total floor: 10-12GB, comfortable: 16GB, ideal for content creation/heavy VR: 32GB. ${data.ram.totalGB < 12 ? 'At current level, page file spill is almost certain under VR load.' : 'Consider upgrading to 32GB if running VRChat, visual novels, or modded games.'}  Commit charge: ${data.ram.commitChargePercent.toFixed(0)}%.`
        }
      }
    }
  },

  {
    id: 'combo-vram-and-ram-both-high',
    category: 'ram',
    name: 'Both System RAM and GPU VRAM Under Pressure',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram || !data.gpu) return null
      const gpu = data.gpu.devices[0]
      if (!gpu || gpu.vramTotal === 0 || gpu.vramUsed === 0) return null
      const ramHigh = data.ram.usagePercent > 85
      const vramHigh = (gpu.vramUsed / gpu.vramTotal) > 0.85
      if (!ramHigh || !vramHigh) return null
      return {
        ruleId: 'combo-vram-and-ram-both-high',
        severity: 'critical',
        category: 'ram',
        explanation: {
          simple: `Both your regular memory (${data.ram.usagePercent.toFixed(0)}% full) and your GPU's video memory (${((gpu.vramUsed / gpu.vramTotal) * 100).toFixed(0)}% full) are nearly maxed out. When both run out simultaneously, the system starts swapping textures between them — causing severe hitching. This is one of the worst performance states for VR.`,
          advanced: `System RAM: ${data.ram.usedGB.toFixed(1)}/${data.ram.totalGB.toFixed(1)} GB (${data.ram.usagePercent.toFixed(0)}%) | VRAM: ${gpu.vramUsed}/${gpu.vramTotal} MB (${((gpu.vramUsed / gpu.vramTotal) * 100).toFixed(0)}%). When both memory tiers are saturated, VRAM evictions go to system RAM which then pages to disk — a cascade that can spike frame times to 200ms+. Immediate fixes: (1) close browser and Discord before VR, (2) reduce texture quality in game, (3) lower SteamVR render resolution, (4) clear SteamVR shader cache if > 5GB.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // STREAMING / OBS COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-streaming-plus-gpu-high',
    category: 'processes',
    name: 'Streaming / Recording Sharing GPU With VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes || !data.gpu) return null
      const hasStreaming = data.processes.streaming.length > 0
      if (!hasStreaming) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const gpuHigh = gpu.utilization > 80 || gpu.encoderUtilization > 70
      if (!gpuHigh) return null
      const streamers = data.processes.streaming.map((p) => p.name).join(', ')
      return {
        ruleId: 'combo-streaming-plus-gpu-high',
        severity: 'warning',
        category: 'processes',
        explanation: {
          simple: `You're running ${streamers} (streaming/recording) at the same time as VR, and your GPU is under heavy load. The encoder shared between VR streaming and recording is likely competing. Use NVENC (hardware encoder) in OBS, not the software encoder — it runs on a separate chip and doesn't reduce game performance.`,
          advanced: `Streaming software running: ${streamers}. GPU util: ${gpu.utilization.toFixed(0)}% | Encoder: ${gpu.encoderUtilization.toFixed(0)}%. For wireless VR: the GPU encoder handles both stream compression and VR video compression simultaneously — at >70% encoder util, quality degradation in one or both is inevitable. Fix: In OBS → Settings → Output → Encoder → NVIDIA NVENC H.265 (or AV1 for RTX 40-series). Set rate control to CQP, quality preset 'fast'. This isolates recording from the VR encode pipeline.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // POWER + OS COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-balanced-power-low-cpu',
    category: 'os-config',
    name: 'Balanced Power Plan Causing CPU Clock Suppression',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig || !data.cpu) return null
      const isBalanced = data.osConfig.powerPlan.toLowerCase().includes('balanced') ||
                         data.osConfig.powerPlan.toLowerCase().includes('power saver')
      if (!isBalanced) return null
      // CPU under load but not at maximum — hallmark of throttled clocks
      const suspiciouslyModerate = data.cpu.avgUsage > 40 && data.cpu.avgUsage < 65
      if (!suspiciouslyModerate) return null
      return {
        ruleId: 'combo-balanced-power-low-cpu',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `You're on the "${data.osConfig.powerPlan}" power plan while running VR. This tells Windows to save power by keeping your CPU slower. Your CPU is working at ${data.cpu.avgUsage.toFixed(0)}% but may be running at half its potential clock speed. Switch to "High Performance" or "Ultimate Performance" power plan.`,
          advanced: `Power plan: "${data.osConfig.powerPlan}" (should be "High Performance" or "Ultimate Performance"). Balanced power plan caps CPU P-states, increasing boost-clock response time from ~1ms (High Perf) to ~15-30ms. For VR rendering, this means the CPU can't respond instantly to sudden frame work spikes — the most common cause of unexpected stutter in "otherwise healthy" VR setups. CPU avg ${data.cpu.avgUsage.toFixed(0)}% may under-represent peak frame demands.`
        }
      }
    }
  },

  {
    id: 'combo-game-mode-off-high-process-count',
    category: 'os-config',
    name: 'Game Mode Disabled With Many Background Processes',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig || !data.processes) return null
      if (data.osConfig.gameModeEnabled) return null
      if (data.processes.all.length < 60) return null
      return {
        ruleId: 'combo-game-mode-off-high-process-count',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: `Windows Game Mode is turned off, and you have ${data.processes.all.length} processes running. Game Mode tells Windows to prioritize your VR game over background tasks and suspend Windows Update while you're playing. Enable it in Windows Settings → Gaming → Game Mode.`,
          advanced: `Game Mode: disabled | Active processes: ${data.processes.all.length}. Windows Game Mode suppresses automatic maintenance tasks (Windows Update, driver downloads, disk defrag) and gives the foreground game process higher CPU scheduling priority. With ${data.processes.all.length} background processes, the scheduling benefit is non-trivial. Enable via HKCU\\Software\\Microsoft\\GameBar → AllowAutoGameMode = 1.`,
          fixId: 'fix-game-mode-disabled'
        } as any
      }
    }
  },

  {
    id: 'combo-hyperv-vr-running',
    category: 'os-config',
    name: 'Virtualization Drivers Active Under VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      const virtDrivers = data.osConfig.virtualizationDrivers
      if (virtDrivers.length === 0) return null
      const problematic = virtDrivers.filter((d) =>
        d.toLowerCase().includes('hyper-v') ||
        d.toLowerCase().includes('hypervisor') ||
        d.toLowerCase().includes('wsl')
      )
      if (problematic.length === 0) return null
      return {
        ruleId: 'combo-hyperv-vr-running',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `Hyper-V or WSL2 virtualization is active on your system (${problematic.join(', ')}). These technologies prevent Windows from accessing hardware with the lowest latency, which can add milliseconds of unpredictable delay to VR rendering. Disabling Hyper-V when gaming can help with frame time consistency.`,
          advanced: `Virtualization drivers active: ${problematic.join(', ')}. When Hyper-V is enabled, Windows itself runs inside a virtual machine (Type-1 hypervisor). This moves GPU access through a virtualization layer, adding interrupt latency of 2-5ms per frame. For VR at 90Hz (11.1ms frame budget), this is a significant overhead. Disable: Control Panel → Programs → Turn Windows features on/off → uncheck Hyper-V. Note: disables WSL2 and Android emulators.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // STORAGE COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-vr-on-hdd',
    category: 'storage',
    name: 'VR Games Installed on Hard Drive',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const vrDrive = data.storage.drives.find((d) =>
        d.letter === data.storage?.vrInstallDrive
      )
      if (!vrDrive) return null
      if (vrDrive.type !== 'HDD') return null
      return {
        ruleId: 'combo-vr-on-hdd',
        severity: 'critical',
        category: 'storage',
        explanation: {
          simple: `Your VR games are installed on a hard drive (${vrDrive.letter}:), not a solid-state drive. VR games stream textures and assets constantly — hard drives are 10-50x slower than SSDs, causing long loading times and texture pop-in during gameplay. Move your VR games to an SSD.`,
          advanced: `VR install drive ${vrDrive.letter}: is a ${vrDrive.type}. HDDs have ~100-200 MB/s sequential read and 0.5-2 MB/s random read — orders of magnitude below NVMe SSDs (3500-7000 MB/s). VR texture streaming requires low-latency random access; HDDs have 5-15ms seek time vs <0.1ms on NVMe. This causes: (1) long level load times, (2) texture pop-in / streaming artifacts during play, (3) shader compilation stalls.`
        }
      }
    }
  },

  {
    id: 'combo-shader-cache-bloated',
    category: 'storage',
    name: 'Shader Cache May Be Causing Stutter',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const cacheGB = data.storage.shaderCacheSizeMB / 1024
      if (cacheGB < 8) return null
      return {
        ruleId: 'combo-shader-cache-bloated',
        severity: 'info',
        category: 'storage',
        explanation: {
          simple: `Your shader cache has grown to ${cacheGB.toFixed(1)} GB. A very large shader cache can actually cause stutters when VR needs to look up shaders — it becomes like searching a filing cabinet that's never been organized. Clearing it takes 10 seconds and Steam will rebuild it automatically.`,
          advanced: `Shader cache size: ${cacheGB.toFixed(1)} GB (recommended max: 5-10 GB). The shader cache stores compiled GPU shaders to avoid recompilation. However, an oversized cache increases lookup time and can cause seek latency on slower drives. Clear via Steam → Settings → Shader Pre-Caching → Clear shader cache. SteamVR also has its own cache: %localappdata%\\openvr\\shadercache. Clearing forces a one-time recompilation on next game launch.`
        }
      }
    }
  },

  {
    id: 'combo-low-disk-space-vr',
    category: 'storage',
    name: 'Low Free Space on VR Install Drive',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const vrDrive = data.storage.drives.find((d) =>
        d.letter === data.storage?.vrInstallDrive
      )
      const checkDrive = vrDrive ?? data.storage.drives[0]
      if (!checkDrive) return null
      if (checkDrive.freeGB > 15) return null
      return {
        ruleId: 'combo-low-disk-space-vr',
        severity: checkDrive.freeGB < 5 ? 'critical' : 'warning',
        category: 'storage',
        explanation: {
          simple: `Only ${checkDrive.freeGB.toFixed(1)} GB free on drive ${checkDrive.letter}:. VR needs free space for shader compilation, asset decompression, and temporary files. Below 10 GB, games may fail to load or corrupt assets. Free up space by uninstalling unused games or clearing caches.`,
          advanced: `Drive ${checkDrive.letter}: has ${checkDrive.freeGB.toFixed(1)} GB free (${checkDrive.totalGB.toFixed(0)} GB total). Critical threshold for VR: 10 GB. Shader cache alone can be 1-5 GB per game; decompression of packed assets requires temporary space equal to the asset size. Windows page file also requires free space. VRChat cache: ${data.storage.vrchatCacheSizeGB.toFixed(1)} GB (can be cleared safely).`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // VR RUNTIME COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-steamvr-ss-too-high',
    category: 'vr-runtime',
    name: 'Supersampling Too High for Current GPU',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime || !data.gpu) return null
      const ss = data.vrRuntime.supersampling
      if (!ss || ss <= 1.4) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const gpuHigh = gpu.utilization > 80 || gpu.vramUsed > gpu.vramTotal * 0.85
      if (!gpuHigh) return null
      return {
        ruleId: 'combo-steamvr-ss-too-high',
        severity: 'warning',
        category: 'vr-runtime',
        explanation: {
          simple: `Your VR supersampling is set to ${(ss * 100).toFixed(0)}%, and your GPU is struggling (${gpu.utilization.toFixed(0)}% utilization). Supersampling renders at higher than headset resolution for sharper visuals — but at this level, your GPU can't keep up. Lower SteamVR render resolution to 80-100% to get smooth frames.`,
          advanced: `SteamVR render resolution: ${(ss * 100).toFixed(0)}% | GPU: ${gpu.utilization.toFixed(0)}% util, ${gpu.vramUsed}/${gpu.vramTotal} MB VRAM (${gpu.name}). At ${(ss * 100).toFixed(0)}% SS, the render target is ${(ss * 100).toFixed(0)}% of pixels in each dimension → ${(ss * ss * 100).toFixed(0)}% total pixel count increase. For a headset with 2064×2208/eye, ${(ss).toFixed(1)}× SS = ${Math.round(2064 * ss)}×${Math.round(2208 * ss)}/eye. Recommended: start at 80% and increase until GPU hits 80% under typical game load.`
        }
      }
    }
  },

  {
    id: 'combo-motion-smoothing-masking-issues',
    category: 'vr-runtime',
    name: 'Motion Smoothing May Be Masking a Real Performance Issue',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime || !data.gpu) return null
      if (data.vrRuntime.motionSmoothingEnabled !== true) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      if (gpu.utilization < 85) return null
      return {
        ruleId: 'combo-motion-smoothing-masking-issues',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple: `SteamVR Motion Smoothing is on, and your GPU is at ${gpu.utilization.toFixed(0)}%. Motion Smoothing makes missed frames "feel" smoother by generating fake in-between frames — but it doesn't fix the underlying problem. Temporarily disable it, check your actual frame rate, then optimize settings to hit the target naturally.`,
          advanced: `Motion Smoothing active | GPU util: ${gpu.utilization.toFixed(0)}%. Motion Smoothing (a form of reprojection) activates when the GPU can't maintain the target refresh rate. While it prevents motion sickness from hard frame drops, it introduces motion artifacts in fast movement and slightly increases motion-to-photon latency. The correct approach: fix the GPU bottleneck (settings reduction, render scale decrease) until smooth frames are maintained without reprojection. Use SteamVR Frame Timing overlay (SteamVR → Settings → Performance → Show GPU/CPU performance graph) to observe real frame delivery.`
        }
      }
    }
  },

  {
    id: 'combo-no-steamvr-but-steam-process',
    category: 'vr-runtime',
    name: 'Steam Running But SteamVR Not Started',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime || !data.processes) return null
      if (data.vrRuntime.steamvrInstalled !== true) return null
      if (data.vrRuntime.activeRuntime === 'steamvr') return null
      // Steam process running but SteamVR compositor not
      const steamRunning = data.processes.all.some((p) =>
        p.name.toLowerCase() === 'steam'
      )
      const vrServerRunning = data.processes.all.some((p) =>
        p.name.toLowerCase() === 'vrserver'
      )
      if (!steamRunning || vrServerRunning) return null
      return {
        ruleId: 'combo-no-steamvr-but-steam-process',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple: 'Steam is running but SteamVR is not started. If you plan to use a SteamVR headset (Valve Index, HTC Vive, Pimax, etc.), SteamVR needs to be launched before putting on the headset. Open Steam → Library → SteamVR and launch it.',
          advanced: `Steam process detected, vrserver.exe not running. SteamVR must be launched for OpenVR/OpenXR applications. If SteamVR is set as the OpenXR runtime, all OpenXR games will fail to start without it. Enable auto-start: SteamVR → Settings → General → Launch SteamVR when a headset is detected.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // INTERNET SPEED + VR CONTEXT
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-slow-internet-cloud-vr',
    category: 'network',
    name: 'Internet Speed May Limit Cloud VR or Downloads',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.speedTest) return null
      if (data.speedTest.skipped) return null
      const dl = data.speedTest.downloadMbps
      if (dl === null || dl > 50) return null
      return {
        ruleId: 'combo-slow-internet-cloud-vr',
        severity: dl < 10 ? 'warning' : 'info',
        category: 'network',
        explanation: {
          simple: `Your internet download speed is ${dl.toFixed(0)} Mbps. While this doesn't affect local PCVR (AirLink/Virtual Desktop use your home Wi-Fi, not the internet), it means game downloads will be slow and cloud VR services like GeForce NOW in VR or streaming VR content will be limited.`,
          advanced: `Internet download: ${dl.toFixed(1)} Mbps | Upload: ${data.speedTest.uploadMbps?.toFixed(1) ?? 'N/A'} Mbps | CDN ping: ${data.speedTest.pingMs ?? 'N/A'} ms. For PCVR streaming (AirLink, VD, ALVR), only LAN bandwidth matters — internet speed is irrelevant. For cloud gaming VR (GeForce NOW, Shadow): requires 35 Mbps minimum for 1080p, 60+ Mbps for 4K VR. For VRChat content downloads: lower speed = longer loading in social VR worlds.`
        }
      }
    }
  },

  {
    id: 'combo-high-internet-latency',
    category: 'network',
    name: 'High Internet Latency — Cloud VR / Online VR Games',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.speedTest) return null
      if (data.speedTest.skipped) return null
      const ping = data.speedTest.pingMs
      if (ping === null || ping < 40) return null
      return {
        ruleId: 'combo-high-internet-latency',
        severity: ping > 100 ? 'warning' : 'info',
        category: 'network',
        explanation: {
          simple: `Your internet ping is ${ping.toFixed(0)}ms. For competitive online VR games or cloud VR, high ping adds visible delay to other players' movements. Local PCVR (SteamVR, Air Link) is unaffected by internet latency — it's your gateway latency (router) that matters for those.`,
          advanced: `CDN ping: ${ping.toFixed(0)}ms | Jitter: ${data.speedTest.jitterMs?.toFixed(1) ?? 'N/A'} ms. ${ping > 100 ? 'At >100ms, online VR multiplayer is noticeably laggy.' : 'At 40-100ms, most social VR is acceptable.'} Causes: ISP routing, distance to CDN node, or router QoS queuing. For cloud VR (GeForce NOW, Shadow), <20ms is ideal. Note: this test measures internet CDN latency, not the local gateway latency relevant to AirLink — see the gateway metric in the Network section for that.`
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // COMPLETE SYSTEM HEALTH
  // ═══════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════
  // DEEPER MULTI-FACTOR COMBINATIONS
  // ═══════════════════════════════════════════════════

  {
    id: 'combo-gpu-thermal-throttle-cascade',
    category: 'gpu',
    name: 'GPU Thermal Throttle Cascade — Heat + Load + Supersampling',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.vrRuntime) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      const gpuTempHigh = gpu.temperature > 85
      const gpuUtilHigh = gpu.utilization > 85
      const ssHigh =
        (data.vrRuntime.supersampling !== null && data.vrRuntime.supersampling > 1.3)
      if (!gpuTempHigh || !gpuUtilHigh || !ssHigh) return null
      const ss = data.vrRuntime.supersampling ?? 0
      return {
        ruleId: 'combo-gpu-thermal-throttle-cascade',
        severity: 'critical',
        category: 'gpu',
        explanation: {
          simple: `Your GPU is overheating (${gpu.temperature}°C) AND running at high utilization (${gpu.utilization.toFixed(0)}%) AND rendering at above-native resolution (${(ss * 100).toFixed(0)}% supersampling) — this is a reprojection cascade. You'll get severe dropped frames.`,
          advanced: `GPU temp: ${gpu.temperature}°C | GPU util: ${gpu.utilization.toFixed(1)}% | Supersampling: ${(ss * 100).toFixed(0)}%. This combination triggers a vicious cycle: GPU thermal throttle → clock drops → can't maintain frame rate → reprojection kicks in → reprojection requires additional GPU render passes → more GPU work → more heat → further throttle. Breaking the cycle requires at minimum reducing supersampling to ≤100% immediately, then addressing thermals (fan curve, undervolt) before raising SS again.`
        }
      }
    }
  },

  {
    id: 'combo-core-parking-cpu-spikes',
    category: 'cpu',
    name: 'CPU Core Parking Active Under Heavy CPU Load',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig || !data.cpu) return null
      if (data.osConfig.coresMinParkedPercent >= 100) return null
      if (data.cpu.avgUsage <= 60) return null
      return {
        ruleId: 'combo-core-parking-cpu-spikes',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: `CPU core parking is active while your CPU is already heavily loaded (${data.cpu.avgUsage.toFixed(0)}%). Parked cores take 1-10ms to wake up — during that wake-up window, VR frame delivery stalls.`,
          advanced: `CPU avg usage: ${data.cpu.avgUsage.toFixed(1)}% | Min parked cores: ${data.osConfig.coresMinParkedPercent}% (not fully unparked). When CPU usage exceeds 60% and cores are parked, Windows must rapidly unpark cores when VR demands burst work. The unpark latency (1-10ms, entering from C6/C7 sleep states) appears as micro-stutters coinciding with complex scene transitions — physics bursts, avatar loads, or shader compilations. Set CPMINCORES to 100 to keep all cores hot and ready.`
        }
      }
    }
  },

  {
    id: 'combo-usb-suspend-wired-headset',
    category: 'os-config',
    name: 'USB Selective Suspend + Wired Headset (WMR / Non-Oculus)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig || !data.headsetConnection) return null
      if (!data.osConfig.usbSelectiveSuspendEnabled) return null
      const method = data.headsetConnection.method
      const isWired =
        method === 'usb-link' ||
        method === 'steamvr-usb' ||
        method === 'wmr'
      if (!isWired) return null
      return {
        ruleId: 'combo-usb-suspend-wired-headset',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'USB selective suspend is enabled with a wired VR headset. When USB suspend activates between tracking data bursts, your headset connection briefly drops — causing tracking glitches or momentary blackouts.',
          advanced: `Headset connection: ${method} (wired) | USB selective suspend: enabled. USB selective suspend powers down the USB port controller between data transmissions by transitioning devices through D2/D3 power states. VR headsets send tracking data continuously at 72-120Hz — the suspend/resume cycle adds variable latency to tracking packets and can cause the headset to appear disconnected for 50-200ms. This manifests as tracking freezes, audio dropouts, or brief display blackouts. Disable via Power Options → USB settings → USB selective suspend → Disabled.`
        },
        fixId: 'fix-usb-selective-suspend'
      }
    }
  },

  {
    id: 'combo-hyper-v-gpu-pressure',
    category: 'os-config',
    name: 'Hyper-V Running Under High GPU Load',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig || !data.gpu) return null
      if (!data.osConfig.hyperVRunning) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      if (gpu.utilization <= 70) return null
      return {
        ruleId: 'combo-hyper-v-gpu-pressure',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `Hyper-V is running while your GPU is under heavy load (${gpu.utilization.toFixed(0)}%). Hyper-V's virtualization layer adds interrupt overhead that disrupts VR compositor frame timing — the effect is worse when the GPU is already stressed.`,
          advanced: `Hyper-V active | GPU util: ${gpu.utilization.toFixed(1)}%. Hyper-V places Windows itself in a VM (root partition), adding microsecond-level interrupt virtualization overhead to every GPU interrupt. Under high GPU load (>70%), GPU interrupts arrive more frequently — multiplying the Hyper-V overhead. This manifests as irregular frame timing (high frame time variance) even when the average frame rate appears acceptable in SteamVR's performance graph. Disabling Hyper-V restores native interrupt processing.`
        }
      }
    }
  },

  {
    id: 'combo-low-vram-high-ss',
    category: 'gpu',
    name: 'VRAM Near Capacity With High Supersampling',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.vrRuntime) return null
      const gpu = data.gpu.devices[0]
      if (!gpu || gpu.vramTotal === 0 || gpu.vramUsed === 0) return null
      const vramRatio = gpu.vramUsed / gpu.vramTotal
      if (vramRatio <= 0.85) return null
      const ss = data.vrRuntime.supersampling
      if (ss === null || ss <= 1.3) return null
      return {
        ruleId: 'combo-low-vram-high-ss',
        severity: 'warning',
        category: 'gpu',
        explanation: {
          simple: `Your GPU VRAM is over 85% full (${gpu.vramUsed}/${gpu.vramTotal} MB) while running above-native VR supersampling (${(ss * 100).toFixed(0)}%). When VRAM fills, textures spill to system RAM — causing multi-millisecond stalls when the GPU needs them.`,
          advanced: `VRAM: ${gpu.vramUsed}/${gpu.vramTotal} MB (${(vramRatio * 100).toFixed(0)}%) | Supersampling: ${(ss * 100).toFixed(0)}%. At >85% VRAM usage with high SS, the supersampled render targets compete with game textures for VRAM. The supersampled frame requires proportionally more VRAM — at ${(ss * 100).toFixed(0)}% SS, the render target is ${(ss * ss * 100).toFixed(0)}% of the native pixel count, significantly larger than native. When textures are evicted to system RAM, PCIe transfer latency (microseconds to milliseconds) is added whenever those textures are re-read by the GPU — appearing as random stutters in complex scenes. Reduce SS to ≤100% to free VRAM.`
        }
      }
    }
  },

  {
    id: 'combo-wifi-2ghz-high-bitrate-encoding',
    category: 'network',
    name: '2.4GHz Wi-Fi With High GPU Encoder Utilization',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi || !data.gpu || !data.headsetConnection) return null
      if (data.network.wifi.band !== '2.4GHz') return null
      if (data.headsetConnection.encoderInUse === null) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null
      if (gpu.encoderUtilization <= 50) return null
      return {
        ruleId: 'combo-wifi-2ghz-high-bitrate-encoding',
        severity: 'warning',
        category: 'network',
        explanation: {
          simple: `You're streaming wireless VR over 2.4GHz with your GPU encoder running hot (${gpu.encoderUtilization.toFixed(0)}%). 2.4GHz bandwidth (max ~300Mbps shared) is not enough for the bitrate your encoder is trying to push — you'll see compression artifacts and dropped frames.`,
          advanced: `Wi-Fi band: 2.4GHz | Encoder: ${data.headsetConnection.encoderInUse} at ${gpu.encoderUtilization.toFixed(1)}% utilization. GPU VR encoders at >50% utilization are encoding at high bitrate (150Mbps+). 2.4GHz 802.11n/ac theoretical max is ~300Mbps (half-duplex, shared with neighbors and other devices). Real-world sustained throughput is often 80-150Mbps in congested environments. The encoder fills the wireless transmit buffer faster than it can drain → frame drops in the wireless stack and severe compression artifacts. Switch to 5GHz or 6GHz — minimum fix is moving the PC to wired Ethernet so the headset's 5GHz channel is uncontested.`
        }
      }
    }
  },

  {
    id: 'combo-startup-bloat-vr-overhead',
    category: 'processes',
    name: 'Multiple Startup Bloat Processes Running During VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes) return null
      if (data.processes.bloat.length < 3) return null
      if (data.processes.vrCritical.length === 0) return null
      const deduped = dedupeProcesses(data.processes.bloat)
      const topBreakdown = deduped
        .slice(0, 6)
        .map((d) => `${d.name}${d.count > 1 ? ` ×${d.count}` : ''} (${d.totalCpuPercent.toFixed(1)}% CPU, ${d.totalRamMB.toFixed(0)} MB)`)
        .join(', ')
      return {
        ruleId: 'combo-startup-bloat-vr-overhead',
        severity: 'info',
        category: 'processes',
        explanation: {
          simple: `${deduped.length} resource-wasting apps are running during your active VR session. Each one steals CPU cycles and RAM that VR needs for stable frame delivery.`,
          advanced: `${deduped.length} unique bloat apps active (${data.processes.bloat.length} total instances) alongside ${data.processes.vrCritical.length} VR critical processes. ${topBreakdown}. Background bloat competes with vrserver/vrcompositor for scheduler time. Even 2-3% aggregate CPU contention can push VR frame delivery over budget during complex scenes — avatar loads, physics bursts, shader compilations. Close these before VR, or create a startup script that terminates them before launching SteamVR.`
        }
        // NOTE: no fixId — startup-bloat auto-disable fix was removed (too broad + no visible improvement after apply)
      }
    }
  },

  {
    id: 'combo-system-all-clear',
    category: 'os-config',
    name: 'System Appears Well-Optimized for VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu || !data.cpu || !data.ram || !data.osConfig) return null
      const gpu = data.gpu.devices[0]
      if (!gpu) return null

      // Only fire if everything is in good shape
      const gpuOk = gpu.utilization < 80 && (gpu.temperature === 0 || gpu.temperature < 83)
      const cpuOk = data.cpu.avgUsage < 70 && (data.cpu.temperature == null || data.cpu.temperature < 80)
      const ramOk = data.ram.usagePercent < 80
      const powerOk = data.osConfig.powerPlan.toLowerCase().includes('high')

      if (!gpuOk || !cpuOk || !ramOk || !powerOk) return null

      return {
        ruleId: 'combo-system-all-clear',
        severity: 'ok',
        category: 'os-config',
        explanation: {
          simple: 'Your system is well-configured for VR. CPU and GPU usage are healthy, memory is not under pressure, and the power plan is correct. Any remaining improvements are incremental: supersampling, per-game settings, or hardware upgrades.',
          advanced: `System health summary: GPU ${gpu.utilization.toFixed(0)}% util at ${gpu.temperature > 0 ? gpu.temperature + '°C' : 'unknown temp'} | CPU ${data.cpu.avgUsage.toFixed(0)}% | RAM ${data.ram.usagePercent.toFixed(0)}% | Power: ${data.osConfig.powerPlan}. All primary performance metrics within acceptable VR ranges. Next optimizations: increase SteamVR render resolution until GPU hits 80-85%, enable ReBAR if not already set, consider upgrading to Wi-Fi 6E if on wireless VR.`
        }
      }
    }
  }
]
