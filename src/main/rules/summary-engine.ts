// VR Optimization Suite — Executive Summary Engine
//
// Translates raw findings into a prioritized, actionable plan.
// Output: ActionPlan[] — each item is one clear, specific thing the user should do.
//
// Philosophy:
//   1. One action per root cause (don't list the same fix three times)
//   2. Ranked by impact × ease (critical+instant beats high+research)
//   3. Step-by-step instructions written for a non-technical user
//   4. Include the "why" so the user understands the stakes

import type { Finding, ActionPlan, ActionStep } from './types'
import type { ScanData } from '../scanner/types'
import { dedupeProcesses } from './process-dedupe'

// ── Impact weight for sorting ─────────────────────────────────
const IMPACT_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
const EFFORT_ORDER = { instant: 0, minutes: 1, hours: 2, research: 3 }

function planScore(p: ActionPlan): number {
  return IMPACT_ORDER[p.impact] * 10 + EFFORT_ORDER[p.effort]
}

// ── Complaint-based plan boosting ─────────────────────────────
//
// Returns a matcher function that answers "is this plan relevant to the
// user's declared main complaint?". Used by buildActionPlan to bias sort
// order — complaint-matching plans get a small boost so they surface first
// within their impact band.
//
// Match signals (any hit = boosted):
//   • Plan title substrings
//   • Plan category
//   • Related rule IDs
//
// Returns null when no complaint is set (or when it's 'none') — the sort
// then falls back to pure impact × effort ordering.
function getComplaintBoostMap(
  complaint: 'stutters' | 'blurry' | 'latency' | 'drops' | 'crashes' | 'thermals' | 'none' | null
): ((p: ActionPlan) => boolean) | null {
  if (!complaint || complaint === 'none') return null

  // Keywords that indicate a plan addresses each complaint type. Kept broad
  // on purpose — we'd rather over-boost than miss a relevant plan.
  const keywordMap: Record<string, string[]> = {
    stutters:  ['stutter', 'frame', 'timer resolution', 'standby', 'mmcss', 'core park', 'priority', 'background', 'shader', 'hags'],
    blurry:    ['supersampl', 'resolution', 'render', 'foveat', 'fsr', 'dlss', 'texture', 'vram', 'upscal'],
    latency:   ['latency', 'lag', 'reflex', 'aspm', 'interrupt', 'wifi 6', 'wifi signal', 'wifi band', 'wifi power saving', 'nagle', 'timer'],
    drops:     ['wifi', 'usb', 'cable', 'tracking', 'connection', 'disconnect', 'power saving', 'aspm', 'suspend'],
    crashes:   ['crash', 'overlay', 'defender', 'tdr', 'hags', 'driver', 'hyper-v', 'memory integrity', 'core isolation'],
    thermals:  ['thermal', 'undervolt', 'cool', 'temperature', 'throttle', 'power plan', 'fan'],
  }
  const keywords = keywordMap[complaint] ?? []
  if (keywords.length === 0) return null

  return (p: ActionPlan): boolean => {
    const haystack = (
      p.title + ' ' +
      p.summary + ' ' +
      p.category + ' ' +
      (p.relatedRuleIds ?? []).join(' ')
    ).toLowerCase()
    return keywords.some((kw) => haystack.includes(kw))
  }
}

// ── Builder Helpers ───────────────────────────────────────────

function step(text: string, type: ActionStep['type'] = 'do'): ActionStep {
  return { text, type }
}

// ═══════════════════════════════════════════════════
// PLAN BUILDERS — one function per root cause
// ═══════════════════════════════════════════════════

function buildWifi24GhzPlan(data: ScanData): ActionPlan | null {
  if (!data.network?.wifi) return null
  if (data.network.wifi.band !== '2.4GHz') return null
  const ssid = data.network.wifi.ssid ?? 'your router'
  return {
    id: 'action-wifi-band',
    priority: 1,
    category: 'Network',
    title: 'Switch to 5GHz or 6GHz Wi-Fi for Wireless VR',
    summary: '2.4GHz Wi-Fi doesn\'t have enough bandwidth for wireless VR — this is the #1 cause of wireless VR problems.',
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Likely eliminates 80% of wireless VR artifacts, lag, and video quality issues.',
    appliesToArchetypes: ['wifi-wireless'],
    steps: [
      step(`Log into your router settings (usually 192.168.1.1 or 192.168.0.1 in your browser)`, 'open'),
      step('Find the 5GHz Wi-Fi settings (may be under "Wireless" or "Advanced Wireless")'),
      step('Create a dedicated 5GHz SSID — name it something like "VR-5GHz" so you can identify it'),
      step('On your headset: Settings → Wi-Fi → Connect to the new 5GHz SSID'),
      step(`You were connected to "${ssid}" — make sure your headset switches to the 5GHz network`),
      step('If your router doesn\'t have a 5GHz band, you need a Wi-Fi 5 or Wi-Fi 6 router', 'info')
    ],
    relatedRuleIds: ['wifi-band-24ghz', 'combo-wireless-vr-all-issues', 'combo-airlink-no-5ghz']
  }
}

function buildWifiSignalPlan(data: ScanData): ActionPlan | null {
  if (!data.network?.wifi) return null
  const signal = data.network.wifi.signalStrength
  if (signal === null || signal >= 65) return null
  return {
    id: 'action-wifi-signal',
    priority: 3,
    category: 'Network',
    title: 'Improve Wi-Fi Signal Strength for Your Play Space',
    summary: `Signal is only ${signal}% — packet drops from weak signal cause visual glitches and freezes in wireless VR.`,
    impact: signal < 45 ? 'critical' : 'high',
    effort: 'hours',
    expectedGain: 'Reduces visual glitches and freeze frames in wireless VR.',
    appliesToArchetypes: ['wifi-wireless'],
    steps: [
      step(`Current signal: ${signal}%. Target: >70% (-65 dBm or better)`),
      step('Move your Wi-Fi router or access point closer to your VR play area'),
      step('Remove obstacles between router and headset (walls, metal shelves, microwaves)'),
      step('If possible, place the router at headset height (not on the floor)'),
      step('Consider a dedicated Wi-Fi 6 access point mounted near the play space ceiling', 'install'),
      step('If using a mesh network, ensure the node nearest your play space is the primary connection')
    ],
    relatedRuleIds: ['wifi-signal-weak', 'combo-wireless-vr-all-issues']
  }
}

function buildWifi6ePlan(data: ScanData): ActionPlan | null {
  if (!data.network?.wifi) return null
  if (data.network.wifi.band !== '5GHz') return null
  // Only relevant for wireless VR connections
  const method = data.headsetConnection?.method
  const isWireless = method === 'airlink' || method === 'virtual-desktop' || method === 'alvr' || method === 'unknown-wireless'
  if (!isWireless) return null
  return {
    id: 'action-wifi-6e',
    priority: 11,
    category: 'Network',
    title: 'Upgrade to Wi-Fi 6E (6GHz) for Wireless VR',
    summary: 'You\'re streaming VR over 5GHz Wi-Fi. 6GHz (Wi-Fi 6E) offers dedicated uncongested spectrum with 2.4x more bandwidth — the biggest single upgrade for AirLink/Virtual Desktop quality.',
    impact: 'medium',
    effort: 'hours',
    expectedGain: 'Cleaner 200Mbps+ sustained wireless stream, lower latency jitter, fewer compression artifacts — especially noticeable in busy scenes.',
    steps: [
      step('Current band: 5GHz — 6GHz is available on Wi-Fi 6E routers + compatible headsets', 'info'),
      step('Quest 3 and Quest Pro support 6GHz — check your headset specs'),
      step('Routers with 6GHz: TP-Link Deco XE75, ASUS ROG GT-AXE11000, Eero Pro 6E, Netgear RAXE500'),
      step('For the best VR experience: place the 6GHz router within line-of-sight of your play space, no more than 4-6 meters away'),
      step('After upgrading: in Meta Quest settings → Wi-Fi → connect to your 6GHz SSID (usually labeled with "6G" suffix)', 'setting'),
      step('In Virtual Desktop Streamer: set bitrate to 150-200Mbps and codec to H.265 or AV1 after switching to 6GHz', 'setting')
    ],
    relatedRuleIds: ['wifi-6e-upgrade-opportunity']
  }
}

function buildWifiPowerSavingPlan(data: ScanData): ActionPlan | null {
  if (data.network?.wifi?.powerSavingEnabled !== true) return null
  return {
    id: 'action-wifi-power-saving',
    priority: 4,
    category: 'Network',
    title: 'Disable Wi-Fi Adapter Power Saving',
    summary: 'Power saving makes your Wi-Fi adapter "sleep" between packets, adding unpredictable delay spikes.',
    impact: 'medium',
    effort: 'minutes',
    expectedGain: 'Reduces unpredictable latency spikes during wireless VR.',
    fixId: 'fix-wifi-power-saving',
    steps: [
      step('Open Device Manager: right-click Start → Device Manager', 'open'),
      step('Expand "Network adapters" → right-click your Wi-Fi adapter → Properties'),
      step('Click the "Power Management" tab'),
      step('Uncheck "Allow the computer to turn off this device to save power"'),
      step('Click OK. Also: right-click the desktop → Display settings → Power & battery → Power mode: Best performance')
    ],
    relatedRuleIds: ['wifi-power-saving-on']
  }
}

function buildReBarPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[0]
  if (!gpu || gpu.rebarEnabled || gpu.vendor !== 'nvidia') return null
  return {
    id: 'action-rebar',
    priority: 9,
    category: 'GPU',
    title: 'Enable Resizable BAR (ReBAR) — NVIDIA Only',
    summary: 'ReBAR lets your CPU access all GPU VRAM at once, improving texture streaming performance.',
    impact: 'low',
    effort: 'minutes',
    expectedGain: '5-15% improvement in GPU-limited VR scenarios.',
    steps: [
      step('Reboot and enter BIOS (Del or F2 at startup)', 'reboot'),
      step('Find "Above 4G Decoding" — enable it first (required for ReBAR)'),
      step('Find "Resizable BAR" or "Smart Access Memory" — enable it'),
      step('Save and exit BIOS. Then in Windows: NVIDIA Control Panel → Manage 3D Settings → Resizable BAR → Enabled', 'setting'),
      step('AMD GPU users: use Smart Access Memory (SAM) — see AMD SAM action above', 'info')
    ],
    relatedRuleIds: ['gpu-rebar-disabled']
  }
}

function buildAmdSamPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
  if (!gpu) return null
  if (gpu.vendor !== 'amd') return null
  if (gpu.isIntegrated) return null
  if (gpu.samEnabled) return null
  if (gpu.gpuGeneration !== 'RDNA2' && gpu.gpuGeneration !== 'RDNA3') return null
  return {
    id: 'action-amd-sam',
    category: 'GPU',
    priority: 9,
    impact: 'medium',
    effort: 'minutes',
    title: `Enable AMD Smart Access Memory (SAM) — ${gpu.name}`,
    summary: `SAM lets your CPU access all GPU VRAM at once. On ${gpu.name}, this can improve VR texture streaming by 5–15%.`,
    expectedGain: '5-15% improvement in GPU-limited VR scenarios with heavy world/avatar loading.',
    relatedRuleIds: ['gpu-sam-disabled'],
    steps: [
      step('Reboot and enter BIOS (Del, F2, or F12 at startup)', 'reboot'),
      step('Enable "Above 4G Decoding" first — required for SAM to work'),
      step('Find "Resizable BAR", "Smart Access Memory", or "SAM" and enable it'),
      step('Save and exit BIOS, then boot Windows'),
      step('Open AMD Radeon Software → Performance → Tuning → confirm "AMD Smart Access Memory: Enabled"', 'setting'),
      step('Verify in Radeon Software — if still showing disabled, ensure your CPU also supports SAM (Ryzen 4000+ or Intel 11th gen+)', 'info')
    ]
  }
}

function buildIntegratedGpuPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
  if (!gpu || !gpu.isIntegrated) return null

  const gen = gpu.gpuGeneration ?? ''
  const isCapableIgpu =
    gen.toLowerCase().includes('iris xe') ||
    gen.toLowerCase().includes('arc') ||
    gen.toLowerCase().includes('rdna') ||
    gpu.name.toLowerCase().includes('iris xe') ||
    gpu.name.toLowerCase().includes('arc')

  const vramLabel = gpu.vramTotal > 0 ? `${gpu.vramTotal}MB` : 'system RAM'

  if (isCapableIgpu) {
    return {
      id: 'action-integrated-gpu',
      category: 'GPU',
      priority: 2,
      impact: 'high',
      effort: 'research',
      title: `Integrated GPU — Light VR Only (${gpu.name})`,
      summary: `${gpu.name} is an integrated GPU sharing ${vramLabel} as VRAM. Light VR is possible but a dedicated GPU is strongly recommended for full VR experiences.`,
      expectedGain: 'Proper settings squeeze the most from integrated graphics; a dedicated GPU would give 10× better VR performance.',
      relatedRuleIds: ['gpu-integrated-vr-warning'],
      steps: [
        step(`${gpu.name} is integrated — shares ${vramLabel} as VRAM`, 'info'),
        step('Light VR is possible: SteamVR at low/medium settings, VRChat at minimum quality'),
        step('Set Windows → Display → Graphics → GPU preference for SteamVR and VRChat to "High performance"', 'setting'),
        step('Ensure maximum RAM allocation in BIOS: look for "UMA Frame Buffer Size" or "iGPU Memory" — set to 4GB if available'),
        step('Close ALL background apps during VR — every MB of RAM shared with GPU matters'),
        step('A dedicated GPU (NVIDIA RTX 3060 or AMD RX 6600 or better) would give 10× better VR performance', 'info')
      ]
    }
  } else {
    return {
      id: 'action-integrated-gpu',
      category: 'GPU',
      priority: 2,
      impact: 'high',
      effort: 'research',
      title: `Dedicated GPU Strongly Recommended for VR`,
      summary: `${gpu.name} is an older integrated GPU. VR may not be viable at acceptable quality — a dedicated GPU is strongly recommended.`,
      expectedGain: 'A dedicated GPU (NVIDIA RTX 3060 / AMD RX 6600) delivers 10× better VR performance than older integrated graphics.',
      relatedRuleIds: ['gpu-integrated-vr-warning'],
      steps: [
        step(`${gpu.name} — VR may not be viable at acceptable quality`),
        step('If you must try: use the absolute lowest VR resolution (60-80% in SteamVR)'),
        step('A dedicated GPU is strongly recommended. Entry options: NVIDIA RTX 3060 (~$250 used), AMD RX 6600 (~$180 used)')
      ]
    }
  }
}

function buildGpuDriverUpdatePlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
  if (!gpu) return null
  if (gpu.driverDate === null) return null
  const daysOld = Math.floor((Date.now() - new Date(gpu.driverDate).getTime()) / (1000 * 60 * 60 * 24))
  if (daysOld < 90) return null

  const monthsOld = Math.floor(daysOld / 30)

  const vendorSteps = gpu.vendor === 'nvidia'
    ? [
        step('Open GeForce Experience → click the "Drivers" tab', 'open'),
        step('Click "Check for updates" — download and install the latest Game Ready Driver'),
        step('Or visit nvidia.com/drivers → select your GPU + "Game Ready Driver" → download and install', 'info')
      ]
    : gpu.vendor === 'amd'
    ? [
        step('Open AMD Radeon Software → click the gear icon → Updates', 'open'),
        step('Click "Check for Updates" and install the latest Adrenalin driver'),
        step('Or visit amd.com/support → search your GPU model → download the latest driver', 'info')
      ]
    : gpu.vendor === 'intel' && !gpu.isIntegrated
    ? [
        step('Open Intel Arc Control app → Software Updates tab', 'open'),
        step('Download and install the latest Arc driver'),
        step('Or visit intel.com/arc for the latest discrete GPU driver package', 'info')
      ]
    : [
        step('Open Intel Driver & Support Assistant (dsaoverride.intel.com) for automatic detection', 'open'),
        step('Or check Windows Update — Settings → Windows Update → Check for updates → Advanced options → Optional updates'),
        step('Intel integrated GPU drivers are often distributed via Windows Update', 'info')
      ]

  return {
    id: 'action-gpu-driver-update',
    category: 'GPU',
    priority: 8,
    impact: 'medium',
    effort: 'minutes',
    title: `Update ${gpu.name} GPU Driver (${gpu.driverDate})`,
    summary: `Driver from ${gpu.driverDate} (${monthsOld} months old). Driver updates include VR-specific fixes, reprojection improvements, and encoder optimizations.`,
    expectedGain: 'Newer drivers often fix VR compositor bugs, improve encoder latency, and add OpenXR optimizations.',
    relatedRuleIds: ['gpu-driver-old'],
    steps: vendorSteps
  }
}

function buildArcAv1Plan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
  if (!gpu) return null
  if (gpu.vendor !== 'intel') return null
  if (gpu.isIntegrated) return null
  const gen = gpu.gpuGeneration ?? ''
  if (!gen.toLowerCase().includes('arc')) return null
  const method = data.headsetConnection?.method
  const isWireless =
    method === 'airlink' ||
    method === 'virtual-desktop' ||
    method === 'alvr' ||
    method === 'unknown-wireless'
  if (!isWireless) return null
  return {
    id: 'action-arc-av1',
    priority: 8,
    category: 'GPU',
    impact: 'medium',
    effort: 'minutes',
    title: 'Enable AV1 Encoding for Wireless VR (Intel Arc Advantage)',
    summary: 'Your Intel Arc GPU has hardware AV1 encoding — sharper wireless VR at the same bitrate versus H.264/HEVC.',
    expectedGain: 'Noticeably sharper image quality at the same wireless bitrate, or equal quality at ~30% lower bitrate.',
    relatedRuleIds: ['gpu-arc-wireless-av1'],
    steps: [
      step('Virtual Desktop: Settings → Video → Codec → select "AV1 (H.265 quality at lower bitrate)"', 'setting'),
      step('Set bitrate to 150+ Mbps with AV1 for best quality — Arc handles this efficiently', 'info'),
      step('Air Link: Meta does not support AV1 yet — switch to Virtual Desktop for Arc AV1 benefits'),
      step('Verify in Virtual Desktop stats overlay: Codec should show AV1')
    ]
  }
}

function buildXmpPlan(data: ScanData): ActionPlan | null {
  if (!data.ram?.xmpSpeed) return null
  if ((data.ram.xmpSpeed - data.ram.speed) < 400) return null
  return {
    id: 'action-xmp',
    priority: 6,
    category: 'Memory',
    title: `Enable XMP/EXPO to Unlock RAM Speed (${data.ram.speed}→${data.ram.xmpSpeed} MHz)`,
    summary: `Your RAM is running at ${data.ram.speed} MHz but rated for ${data.ram.xmpSpeed} MHz — a free speed boost sitting in your BIOS.`,
    impact: 'medium',
    effort: 'minutes',
    expectedGain: 'Faster RAM reduces CPU-to-memory latency, helping CPU-limited VR scenarios.',
    steps: [
      step('Reboot and enter BIOS (Del or F2 during startup)', 'reboot'),
      step('Go to: AI Tweaker / OC / DRAM Configuration → Memory Profile or XMP/EXPO'),
      step('Select the XMP profile (Intel) or EXPO profile (AMD)'),
      step('Confirm your RAM is in the correct dual-channel slots (check your motherboard manual — usually A2+B2)'),
      step('Save and exit. On next boot, confirm RAM speed in Task Manager → Performance → Memory', 'setting')
    ],
    relatedRuleIds: ['combo-ram-speed-xmp-disabled']
  }
}

function buildGpuUndervoltPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[0]
  if (!gpu || gpu.temperature === 0 || gpu.powerLimit === 0) return null
  const tempHigh = gpu.temperature > 85
  const powerHigh = (gpu.powerDraw / gpu.powerLimit) > 0.95
  if (!tempHigh && !powerHigh) return null

  const isAmd = gpu.vendor === 'amd'
  const isNvidia = gpu.vendor === 'nvidia'

  const steps_list = isAmd ? [
    step(`Detected GPU: ${gpu.name} (AMD)`, 'info'),
    step('Option 1 — AMD Adrenalin Software: open Radeon Software → Performance → Tuning → enable Manual Tuning → reduce GPU clock voltage curve', 'open'),
    step('Option 2 — Power Limit: Radeon Software → Performance → Tuning → Power Limit → set to -10% as a safe starting point', 'setting'),
    step('Option 3 — MSI Afterburner: also works for AMD. Ctrl+F to open voltage-frequency curve editor (same process as NVIDIA)', 'install'),
    step('Test stability by running VR for 10-15 minutes after each adjustment'),
    step('If it crashes or artifacts appear, increase voltage/power limit by one step and retest', 'info'),
    step('Save as a profile in Afterburner or AMD Adrenalin for automatic application on startup')
  ] : isNvidia ? [
    step(`Detected GPU: ${gpu.name} (NVIDIA)`, 'info'),
    step('Download MSI Afterburner (free, safe, works with all GPU brands)', 'install'),
    step('Open Afterburner → Ctrl+F to open the voltage-frequency curve editor'),
    step('Find the highest frequency point on the curve. Click on it'),
    step('Lower it 50-100 MHz and lower its voltage by 50-100mV (start conservative)'),
    step('Select all points to the right and drag them down to the same voltage level'),
    step('Press Ctrl+Enter to apply, then run VR for 10-15 minutes to test stability'),
    step('If it crashes, add 25mV back. Repeat until stable', 'info'),
    step('Save as a profile in Afterburner for automatic application on startup')
  ] : [
    step(`Detected GPU: ${gpu.name}`, 'info'),
    step('Download MSI Afterburner (free, works with most GPU brands)', 'install'),
    step('Open Afterburner → Ctrl+F to open the voltage-frequency curve editor'),
    step('Lower the highest frequency point by 50-100 MHz and reduce voltage by 50-100mV'),
    step('Press Ctrl+Enter to apply, then run VR for 10-15 minutes to test stability'),
    step('If it crashes, add 25mV back. Repeat until stable', 'info'),
    step('Save as a profile in Afterburner for automatic application on startup')
  ]

  return {
    id: 'action-undervolt',
    priority: 4,
    category: 'GPU',
    title: 'Undervolt Your GPU to Reduce Heat and Power Throttling',
    summary: 'Your GPU is hitting thermal/power limits — an undervolt maintains performance at lower temps and power.',
    impact: 'high',
    effort: 'hours',
    expectedGain: 'Eliminates thermal/power throttling. Often improves performance while running cooler.',
    steps: steps_list,
    relatedRuleIds: ['gpu-temperature-high', 'gpu-power-throttled', 'combo-gpu-temp-power-constrained']
  }
}

function buildPeripheralSoftwarePlan(data: ScanData): ActionPlan | null {
  const antiCheat = data.processes?.antiCheat ?? []
  const peripheral = data.processes?.peripheralSoftware ?? []
  if (antiCheat.length === 0 && peripheral.length === 0) return null

  const allOverhead = [...antiCheat, ...peripheral]
  const totalCpu = allOverhead.reduce((s, p) => s + p.cpuPercent, 0)
  const totalRam = allOverhead.reduce((s, p) => s + p.ramMB, 0)

  const steps: ActionStep[] = []
  if (antiCheat.length > 0) {
    steps.push(step(`Anti-cheat detected: ${antiCheat.map((p) => p.name).join(', ')}`, 'info'))
    steps.push(step('If not actively playing a game that requires anti-cheat, close it or disable the service via services.msc'))
    steps.push(step('Riot Vanguard (vgc.exe): right-click system tray → Exit Vanguard — or disable the "vgc" service in services.msc', 'setting'))
  }
  if (peripheral.length > 0) {
    steps.push(step(`Peripheral software detected: ${peripheral.map((p) => p.name).join(', ')}`, 'info'))
    steps.push(step('Close iCUE, G Hub, Armoury Crate, or Synapse from the system tray before starting VR — RGB lighting continues without the software'))
    steps.push(step('Configure your RGB software to start with Windows but remain minimized, or use a lighter alternative like SignalRGB', 'info'))
  }
  steps.push(step(`Total overhead from these processes: ${totalCpu.toFixed(1)}% CPU, ${totalRam.toFixed(0)}MB RAM`, 'info'))

  return {
    id: 'action-peripheral-overhead',
    priority: 10,
    category: 'Processes',
    title: 'Close Anti-Cheat and RGB Software Before VR',
    summary: `${allOverhead.length} peripheral/anti-cheat processes found consuming ${totalCpu.toFixed(1)}% CPU and ${totalRam.toFixed(0)}MB RAM in the background.`,
    impact: 'low',
    effort: 'minutes',
    expectedGain: 'Frees background CPU cycles and reduces DPC interrupt overhead during VR.',
    steps,
    relatedRuleIds: ['anticheat-vr-overhead', 'peripheral-software-overhead']
  }
}

function buildCloseBackgroundAppsPlan(data: ScanData): ActionPlan | null {
  if (!data.processes) return null
  const bloat = data.processes.bloat
  if (bloat.length < 2) return null
  const cpuBloat = bloat.reduce((s, p) => s + p.cpuPercent, 0)
  if (cpuBloat < 3) return null
  return {
    id: 'action-close-bloat',
    priority: 3,
    category: 'Processes',
    title: `Close ${bloat.length} Background Apps Before VR`,
    summary: `${bloat.slice(0, 3).map((p) => p.name).join(', ')} and ${bloat.length - 3 > 0 ? `${bloat.length - 3} more apps are` : 'other apps are'} using CPU/GPU while VR is trying to run.`,
    impact: 'medium',
    effort: 'minutes',
    expectedGain: 'Frees CPU/GPU headroom, reducing unexpected frame drops.',
    steps: [
      step('Before starting VR, close these detected apps:'),
      ...bloat.slice(0, 8).map((p) => step(`• ${p.name} (${p.cpuPercent.toFixed(1)}% CPU, ${p.ramMB.toFixed(0)} MB RAM)`, 'info')),
      step('Create a "VR mode" shortcut: a .bat file that kills known bloat processes'),
      step('Add SteamVR / game folder paths to Windows Defender exclusions to prevent scan interference', 'setting')
    ],
    relatedRuleIds: ['combo-bloat-plus-cpu', 'processes-bloat']
  }
}

function buildSteamVrSettingsPlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime) return null
  const ss = data.vrRuntime.supersampling
  if (!data.gpu) return null
  const gpu = data.gpu.devices[0]
  if (!gpu) return null

  const ssTooHigh = ss !== null && ss > 1.4 && gpu.utilization > 80
  const motionSmoothing = data.vrRuntime.motionSmoothingEnabled === true && gpu.utilization > 85

  if (!ssTooHigh && !motionSmoothing) return null

  const actions: ActionStep[] = []
  if (ssTooHigh) {
    actions.push(step(`Current render resolution: ${(ss! * 100).toFixed(0)}%. Lower to 80-100% in SteamVR → Settings → Video → Render Resolution`))
    actions.push(step('Set to "Custom" and drag slider until GPU usage stays below 80% in typical scenes'))
  }
  if (motionSmoothing) {
    actions.push(step('Temporarily disable Motion Smoothing: SteamVR → Settings → Video → disable "Motion Smoothing"', 'setting'))
    actions.push(step('Check real frame rate with the Performance overlay (SteamVR → Settings → Performance → Show Performance Graph)'))
    actions.push(step('Optimize settings until frames are stable, then re-enable Motion Smoothing as a safety net'))
  }
  actions.push(step('Use fpsVR (Steam tool) for ongoing performance monitoring inside headset', 'install'))

  return {
    id: 'action-steamvr-settings',
    priority: 3,
    category: 'VR Runtime',
    title: 'Reduce SteamVR Render Resolution to Match Your GPU',
    summary: 'SteamVR is set higher than your GPU can handle at full frame rate, causing reprojection.',
    impact: 'high',
    effort: 'minutes',
    expectedGain: 'Achieves stable frame rate without reprojection artifacts.',
    fixId: ssTooHigh ? 'fix-steamvr-supersampling' : 'fix-steamvr-motion-smoothing',
    steps: actions,
    relatedRuleIds: ['combo-steamvr-ss-too-high', 'combo-motion-smoothing-masking-issues']
  }
}

function buildDisplayRefreshRatePlan(data: ScanData): ActionPlan | null {
  if (!data.display) return null
  const hz = data.display.primaryRefreshRateHz
  if (hz === 0 || hz >= 90) return null
  return {
    id: 'action-display-refresh-rate',
    priority: 5,
    category: 'Display',
    title: `Increase Primary Monitor Refresh Rate (Currently ${hz}Hz)`,
    summary: `Your monitor is set to ${hz}Hz. The SteamVR compositor and some VR runtimes benefit from a 90Hz+ desktop display.`,
    impact: hz < 75 ? 'medium' : 'low',
    effort: 'minutes',
    expectedGain: 'Smoother desktop mirror view; avoids VR runtime compositor issues tied to display rate.',
    steps: [
      step('Right-click desktop → Display settings → Advanced display settings', 'open'),
      step(`Select highest available refresh rate (your monitor supports up to ${hz}Hz shown — check manufacturer spec for higher modes)`),
      step('If your monitor supports 144Hz but only shows 60Hz: check your cable (HDMI 2.0+ or DisplayPort 1.4 required for 144Hz at 1440p)', 'info'),
      step('No reboot required — change takes effect immediately')
    ],
    relatedRuleIds: ['display-low-refresh-rate']
  }
}

function buildDisplayHdrPlan(data: ScanData): ActionPlan | null {
  if (!data.display?.anyHdrEnabled) return null
  return {
    id: 'action-display-hdr',
    priority: 9,
    category: 'Display',
    title: 'Disable HDR During VR Sessions to Reduce Compositor Overhead',
    summary: 'Windows HDR adds a tone-mapping pass to the desktop compositor, consuming GPU time that VR needs.',
    impact: 'low',
    effort: 'minutes',
    expectedGain: 'Frees ~1-3ms GPU compositor time; eliminates potential HDR color-space conflicts with VR preview.',
    steps: [
      step('Press Win + I → System → Display → HDR', 'open'),
      step('Toggle "Use HDR" to Off before launching VR', 'setting'),
      step('Re-enable after your VR session if you want HDR for movies/games', 'info'),
      step('Tip: create a desktop shortcut to toggle HDR via PowerShell: Set-ItemProperty HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings -Name EnableHDROutput -Value 0', 'setting')
    ],
    relatedRuleIds: ['display-hdr-overhead']
  }
}

function buildHeadsetConnectivityPlan(data: ScanData): ActionPlan | null {
  if (!data.headsetConnection) return null
  if (data.headsetConnection.detected) return null
  return {
    id: 'action-headset-connection',
    priority: 1,
    category: 'VR Runtime',
    title: 'Start VR Software Before Scanning for Accurate Results',
    summary: 'No headset was active during this scan — results won\'t reflect actual VR performance.',
    impact: 'high',
    effort: 'minutes',
    expectedGain: 'Enables accurate GPU encoder, VR process, and Wi-Fi metrics.',
    steps: [
      step('For Meta Quest/AirLink: Open Oculus PC App → enable Air Link, put headset on and connect'),
      step('For Virtual Desktop: Launch VD Streamer from system tray, launch VD on headset'),
      step('For Valve Index/SteamVR wired: Plug in headset, launch SteamVR from Steam'),
      step('For Windows Mixed Reality: Connect headset, open Mixed Reality Portal'),
      step('Then run the scan again for headset-specific recommendations', 'info')
    ],
    relatedRuleIds: ['headset-not-detected', 'combo-headset-not-detected-wireless']
  }
}

function buildThermalPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu || !data.cpu) return null
  const gpu = data.gpu.devices[0]
  if (!gpu) return null
  const cpuHot = data.cpu.temperature !== null && data.cpu.temperature > 80
  const gpuHot = gpu.temperature > 82
  if (!cpuHot && !gpuHot) return null
  const both = cpuHot && gpuHot
  return {
    id: 'action-thermal',
    priority: 2,
    category: both ? 'CPU + GPU' : gpuHot ? 'GPU' : 'CPU',
    title: both ? 'Address Case Thermals (Both CPU and GPU Running Hot)' :
           gpuHot ? `Reduce GPU Temperature (${gpu.temperature}°C)` : `Reduce CPU Temperature (${data.cpu.temperature}°C)`,
    summary: both ? 'Both chips are hot — the whole case is heat-saturated. They\'re throttling performance to cool down.' :
             'Thermal throttling is reducing performance to protect the hardware.',
    impact: both ? 'critical' : 'high',
    effort: 'hours',
    expectedGain: 'Eliminates thermal throttling. Sustained higher clocks = smoother VR.',
    steps: both ? [
      step(`CPU: ${data.cpu.temperature}°C | GPU: ${gpu.temperature}°C — both above safe VR operating temps`),
      step('Clean all dust from case fans, heatsinks, and GPU heat sink fins with compressed air'),
      step('Check case fan direction: front/bottom = intake, rear/top = exhaust'),
      step('Add more intake fans if case only has exhaust fans (aim for positive pressure)'),
      step('Consider reapplying thermal paste on CPU if it\'s been 2+ years'),
      step('Check GPU fans are spinning (GPU fans only run when needed — they should spin under VR load)')
    ] : gpuHot ? [
      step(`GPU temperature: ${gpu.temperature}°C (safe max for most GPUs: 83°C)`),
      step('Open GPU fan curve: MSI Afterburner → Fan → enable custom fan curve', 'open'),
      step('Set 100% fan speed at 80°C, 85% at 70°C (louder but cooler)'),
      step('Clean GPU heatsink with compressed air — especially if GPU is 2+ years old'),
      step('Consider an undervolt (see GPU section) — reduces heat AND maintains performance')
    ] : [
      step(`CPU temperature: ${data.cpu.temperature}°C`),
      step('Check that CPU cooler is properly seated and fan is running at full speed under load'),
      step('In BIOS, set fan curve to aggressive — prefer noise over heat'),
      step('Consider reapplying thermal paste if CPU is 2+ years old'),
      step('If on a laptop: use a cooling pad, and ensure laptop vents are not blocked')
    ],
    relatedRuleIds: ['gpu-temperature-high', 'cpu-temperature-high', 'combo-thermal-both-cpu-gpu']
  }
}

function buildInternetSpeedPlan(data: ScanData): ActionPlan | null {
  if (!data.speedTest || data.speedTest.skipped) return null
  const dl = data.speedTest.downloadMbps
  if (dl === null || dl > 25) return null
  return {
    id: 'action-internet-speed',
    priority: 9,
    category: 'Network',
    title: 'Improve Internet Speed for VR Content Downloads',
    summary: `${dl.toFixed(0)} Mbps download is slow for updating VR games and downloading worlds.`,
    impact: 'low',
    effort: 'research',
    expectedGain: 'Faster game updates, quicker VRChat world loading.',
    steps: [
      step(`Internet download: ${dl.toFixed(0)} Mbps | Upload: ${data.speedTest.uploadMbps?.toFixed(0) ?? 'N/A'} Mbps`),
      step('Note: internet speed does NOT affect AirLink/Virtual Desktop quality — that uses local Wi-Fi only', 'info'),
      step('Run a full speed test at fast.com or speedtest.net to confirm the result'),
      step('If speed is consistently low: restart your router, check for other devices using bandwidth'),
      step('Contact your ISP if speeds are significantly below your plan\'s advertised rate')
    ],
    relatedRuleIds: ['combo-slow-internet-cloud-vr']
  }
}

function buildXboxDvrPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig?.xboxDvrEnabled) return null
  return {
    id: 'action-xbox-dvr',
    priority: 6,
    category: 'OS Config',
    title: 'Disable Xbox Game Bar & DVR Overlay',
    summary: 'Xbox Game Bar hooks into every application — including VR. Its background recording process adds measurable CPU/GPU overhead even when you never record.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Removes hidden CPU/GPU hooks from every process, reducing background overhead in VR.',
    fixId: 'fix-disable-xbox-dvr',
    steps: [
      step('Open Settings → Gaming → Xbox Game Bar → toggle "Enable Xbox Game Bar" to Off', 'setting'),
      step('Also open Settings → Gaming → Captures → toggle "Record in the background while I\'m playing a game" to Off', 'setting'),
      step('This can be applied automatically via the "Apply Fix" button below — sets registry keys directly', 'info'),
      step('Note: Game Bar can be re-enabled anytime from Settings → Gaming → Xbox Game Bar', 'info')
    ],
    relatedRuleIds: ['xbox-dvr-enabled']
  }
}

function buildStartupBloatPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig) return null
  const count = data.osConfig.startupItems.filter((i) => i.enabled).length
  if (count < 10) return null
  return {
    id: 'action-startup-bloat',
    priority: 7,
    category: 'OS Config',
    title: `Disable Background Startup Apps (${count} running)`,
    summary: `${count} programs launch at startup and stay running in the background, competing with VR for RAM and CPU.`,
    impact: 'medium',
    effort: 'minutes',
    expectedGain: 'Frees RAM and reduces background CPU usage, giving VR more headroom.',
    // No fixId — the auto-disable startup fix was removed (too broad; no
    // measurable VR frame-time improvement). Guidance-only now.
    steps: [
      step('Press Ctrl + Shift + Esc to open Task Manager → click the "Startup apps" tab', 'open'),
      step(`You have ${count} startup items enabled — disable anything you don\'t need for VR`),
      step('Common safe-to-disable items: Teams, Discord (can be opened manually), Spotify, OneDrive, printer software, RGB utilities'),
      step('Click each item → click "Disable" at the top right — these apps can still be opened manually whenever you need them', 'setting'),
      step('Reboot once to verify nothing critical was disabled', 'reboot')
    ],
    relatedRuleIds: ['too-many-startup-items']
  }
}

function buildUsbSuspendPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig?.usbSelectiveSuspendEnabled) return null
  const isUsbHeadset =
    data.headsetConnection?.method === 'usb-link' ||
    data.headsetConnection?.method === 'steamvr-usb'
  if (!isUsbHeadset) return null
  return {
    id: 'action-usb-suspend',
    priority: 7,
    category: 'OS Config',
    title: 'Disable USB Selective Suspend for VR Headset',
    summary: 'USB selective suspend powers down ports between data bursts — causing brief dropouts when your USB VR headset tries to send tracking data.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Eliminates USB-induced tracking glitches and audio dropouts on wired VR headsets.',
    fixId: 'fix-usb-selective-suspend',
    steps: [
      step('Open Control Panel → Power Options → Change plan settings → Change advanced power settings', 'open'),
      step('Expand "USB settings" → "USB selective suspend setting"'),
      step('Set both "On battery" and "Plugged in" to "Disabled"'),
      step('Click OK — takes effect immediately, no reboot needed', 'setting'),
      step('This can be applied automatically via the "Apply Fix" button below', 'info')
    ],
    relatedRuleIds: ['usb-selective-suspend-active']
  }
}

function buildCoreParkingPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig || data.osConfig.coresMinParkedPercent >= 100) return null
  return {
    id: 'action-core-parking',
    priority: 7,
    category: 'CPU',
    title: 'Disable CPU Core Parking for VR',
    summary: `Core parking is allowing Windows to power down CPU cores at low load. Parked cores take time to wake up — causing micro-stutters when VR suddenly needs them (currently: ${data.osConfig.coresMinParkedPercent}% minimum active cores).`,
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Keeps all CPU cores instantly available, reducing micro-stutters caused by core wake-up latency.',
    fixId: 'fix-core-parking-disable',
    steps: [
      step(`Current minimum active cores: ${data.osConfig.coresMinParkedPercent}% — target: 100% (all cores always ready)`, 'info'),
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or manually: open an admin PowerShell and run:', 'open'),
      step('powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100', 'setting'),
      step('powercfg /setactive SCHEME_CURRENT', 'setting'),
      step('No reboot required — takes effect immediately')
    ],
    relatedRuleIds: ['cpu-core-parking-active']
  }
}

function buildNaglePlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig?.nagleEnabled) return null
  const isWireless =
    data.headsetConnection?.method === 'virtual-desktop' ||
    data.headsetConnection?.method === 'airlink' ||
    data.headsetConnection?.method === 'alvr' ||
    data.headsetConnection?.method === 'unknown-wireless'
  if (!isWireless) return null
  return {
    id: 'action-nagle',
    priority: 8,
    category: 'Network',
    title: 'Disable Nagle Algorithm for Lower Wireless VR Latency',
    summary: 'TCP Nagle algorithm is bundling packets together — adding consistent latency to your wireless VR stream. Disabling it lets packets send immediately.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Reduces consistent TCP packet latency by 1-5ms for wireless VR streaming.',
    fixId: 'fix-nagle-disable',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below (sets TcpAckFrequency + TCPNoDelay per adapter)', 'info'),
      step('Or manually: open regedit → HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces', 'open'),
      step('For each adapter GUID subkey: add DWORD "TcpAckFrequency" = 1 and "TCPNoDelay" = 1', 'setting'),
      step('No reboot required — changes take effect on next TCP connection')
    ],
    relatedRuleIds: ['nagle-algorithm-active']
  }
}

function buildGpuTdrPlan(data: ScanData): ActionPlan | null {
  if (!data.eventLog) return null
  if (data.eventLog.gpuTdrEvents < 2) return null
  return {
    id: 'action-gpu-tdr',
    priority: 2,
    category: 'GPU',
    title: `Fix GPU Driver Timeouts — ${data.eventLog.gpuTdrEvents} TDR Crashes in Last 7 Days`,
    summary: `Your GPU driver crashed ${data.eventLog.gpuTdrEvents} times this week. In VR this causes black screens and session drops. Primary causes: GPU overclock instability, overheating, or driver bugs.`,
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Eliminates mid-session GPU crashes and black-screen drops from TDR events.',
    steps: [
      step(`${data.eventLog.gpuTdrEvents} TDR events in last 7 days${data.eventLog.lastGpuTdrTime ? ` — most recent: ${data.eventLog.lastGpuTdrTime}` : ''}`, 'info'),
      step('Step 1: Remove any GPU overclock — open MSI Afterburner or Radeon Software and reset to defaults', 'setting'),
      step('Step 2: Check GPU temperature under load — if above 90°C, improve airflow or clean dust from the card'),
      step('Step 3: Update or clean-install the GPU driver via DDU (Display Driver Uninstaller) in Safe Mode', 'open'),
      step('Step 4: If TDRs continue after removing OC and updating drivers, check PCIe slot seating and power connectors', 'info'),
      step('If TDRs persist: run FurMark for 5 minutes — if it TDRs immediately, the GPU hardware is failing', 'info')
    ],
    relatedRuleIds: ['gpu-tdr-events-recent']
  }
}

function buildLaptopBatteryPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig?.isLaptop) return null
  if (!data.osConfig.isOnBattery) return null
  return {
    id: 'action-laptop-battery',
    priority: 1,
    category: 'OS Config',
    title: 'Plug In Laptop — Battery Mode Throttles CPU and GPU for VR',
    summary: 'Your laptop is on battery. CPU and GPU are throttled 30-70% to conserve power — VR is unplayable in this state.',
    impact: 'critical',
    effort: 'instant',
    expectedGain: 'Restores full CPU and GPU performance for VR.',
    steps: [
      step('Plug in the laptop power adapter before launching VR — this is required for playable VR performance'),
      step('Set Windows power plan to High Performance while plugged in: Win + R → powercfg.cpl', 'open'),
      step('In laptop GPU control panel (Nvidia Control Panel or AMD Software), set power mode to "Maximum Performance"', 'setting'),
      step('Note: even plugged in, laptops may apply GPU power limits — check if your laptop has a "Gaming Mode" or performance profile in its companion app', 'info')
    ],
    relatedRuleIds: ['laptop-on-battery']
  }
}

function buildBiosUpdatePlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig?.biosDate) return null
  try {
    const biosYear = parseInt(data.osConfig.biosDate.substring(0, 4))
    if (isNaN(biosYear) || (new Date().getFullYear() - biosYear) < 3) return null
  } catch { return null }
  return {
    id: 'action-bios-update',
    priority: 10,
    category: 'OS Config',
    title: 'Check for BIOS Update — Fixes PCIe/USB Stability Issues',
    summary: `Your BIOS is ${new Date().getFullYear() - parseInt(data.osConfig.biosDate.substring(0, 4))} years old. Motherboard vendors release BIOS updates that fix USB tracking jitter, PCIe link errors, and VR compatibility.`,
    impact: 'low',
    effort: 'hours',
    expectedGain: 'May resolve intermittent USB tracking drops, PCIe communication errors, or VR headset detection issues.',
    steps: [
      step(`Current BIOS: ${data.osConfig.biosVersion ?? 'unknown version'} dated ${data.osConfig.biosDate}`, 'info'),
      step('Go to your motherboard manufacturer\'s website → Support → Drivers & Downloads → enter your board model', 'open'),
      step('Download the latest BIOS and follow the vendor\'s flash instructions — usually done via USB stick or EZ Flash', 'setting'),
      step('IMPORTANT: do not interrupt a BIOS update — connect to UPS or ensure stable power', 'info'),
      step('After updating, re-enable XMP/EXPO in BIOS if it was enabled', 'info')
    ],
    relatedRuleIds: ['bios-outdated']
  }
}

function buildTimerResolutionPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig) return null
  if (data.osConfig.globalTimerResolutionEnabled) return null
  if (data.osConfig.windowsBuild < 22621) return null // Win 11 22H2
  return {
    id: 'action-timer-resolution',
    priority: 9,
    category: 'OS Config',
    title: 'Enable Global Timer Resolution for VR Frame Scheduling (Win 11)',
    summary: 'Windows 11 changed timer behavior so VR runtime timer requests don\'t apply system-wide. This registry flag restores the precise 0.5ms tick rate that VR compositors need.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Restores 0.5ms timer precision for VR compositors, reducing micro-judder from frame scheduling imprecision.',
    fixId: 'fix-windows-timer-resolution',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or manually: open regedit → HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'open'),
      step('Create or set DWORD value "GlobalTimerResolutionRequests" = 1', 'setting'),
      step('Reboot for the change to take effect', 'reboot')
    ],
    relatedRuleIds: ['timer-resolution-not-optimized']
  }
}

function buildSteamVrAsyncPlan(data: ScanData): ActionPlan | null {
  if (data.osConfig?.steamVrAsyncReprojectionEnabled !== false) return null
  return {
    id: 'action-steamvr-async',
    priority: 6,
    category: 'VR Runtime',
    title: 'Enable SteamVR Async Reprojection',
    summary: 'Async Reprojection synthesizes missing frames in the background — keeping motion smooth when your GPU misses a frame deadline instead of dropping to half rate.',
    impact: 'high',
    effort: 'instant',
    expectedGain: 'Prevents full-rate to half-rate drops when GPU misses frame deadlines; synthesized frames maintain perceived smoothness.',
    fixId: 'fix-steamvr-async-reprojection',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or manually: open SteamVR → Settings → Video → enable "Allow Asynchronous Reprojection"', 'setting'),
      step('If the option isn\'t visible: navigate to %LOCALAPPDATA%\\openvr\\steamvr.vrsettings', 'open'),
      step('In the "steamvr" section, add: "allowAsyncReprojection": true', 'setting'),
      step('Restart SteamVR for the change to take effect')
    ],
    relatedRuleIds: ['steamvr-async-reprojection-disabled']
  }
}

function buildVRChatCullingPlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime?.vrchatConfig) return null
  if (data.vrRuntime.vrchatConfig.avatar_culling_enabled === true) return null
  return {
    id: 'action-vrchat-culling',
    priority: 8,
    category: 'VR App',
    title: 'Enable VRChat Avatar Culling to Reduce GPU Load',
    summary: 'VRChat is rendering every avatar in the world regardless of distance. In busy public worlds, enabling avatar culling (25m) eliminates the GPU overhead of invisible far avatars.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Can save 15-30% GPU time in busy public VRChat worlds by stopping far avatar rendering.',
    fixId: 'fix-vrchat-avatar-culling',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or manually: open %USERPROFILE%\\AppData\\LocalLow\\VRChat\\VRChat\\config.json', 'open'),
      step('Add or update these values: "avatar_culling_enabled": true, "avatar_culling_distance": 25', 'setting'),
      step('Save the file and restart VRChat — avatars beyond 25m will no longer be rendered'),
      step('You can increase the distance (e.g. 50m) if 25m feels too close in large worlds', 'info')
    ],
    relatedRuleIds: ['vrchat-avatar-culling-disabled']
  }
}

function buildFullscreenOptsPlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime) return null
  if (!data.vrRuntime.steamvrInstalled && !data.vrRuntime.oculusInstalled) return null
  // Skip if the fix has already been applied (flag detected on at least one VR exe)
  if (data.osConfig?.fullscreenOptimizationsApplied) return null
  return {
    id: 'action-fullscreen-opts',
    priority: 8,
    category: 'OS Config',
    title: 'Disable Fullscreen Optimizations for VR Executables',
    summary: 'Windows Fullscreen Optimizations intercept exclusive fullscreen mode and can add frame pacing inconsistencies. Disabling them for VR apps ensures direct GPU access.',
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Ensures VR executables get exclusive GPU access without Windows DXGI interception overhead.',
    fixId: 'fix-disable-fullscreen-optimizations',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or manually: right-click vrserver.exe (and VRChat.exe) → Properties → Compatibility tab', 'open'),
      step('Check "Disable fullscreen optimizations" → click Apply', 'setting'),
      step('Common paths: C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrserver.exe'),
      step('Also apply to: vrcompositor.exe, VRChat.exe, OVRServer_x64.exe', 'info')
    ],
    relatedRuleIds: []
  }
}

function buildGpuThermalCascadePlan(data: ScanData): ActionPlan | null {
  if (!data.gpu || !data.vrRuntime) return null
  const gpu = data.gpu.devices[0]
  if (!gpu) return null
  const ss = data.vrRuntime.supersampling
  if (gpu.temperature <= 85 || gpu.utilization <= 85 || !ss || ss <= 1.3) return null
  return {
    id: 'action-combo-gpu-thermal-cascade',
    priority: 2,
    category: 'GPU',
    title: 'Break GPU Thermal Throttle Cascade — Reduce SS and Address Heat',
    summary: `GPU is at ${gpu.temperature}°C, ${gpu.utilization.toFixed(0)}% load, and ${(ss * 100).toFixed(0)}% supersampling simultaneously — a vicious reprojection cycle.`,
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Breaks the heat→throttle→reprojection→more heat cycle; restores stable frame delivery.',
    steps: [
      step('Immediately reduce SteamVR render resolution to 80-100%: SteamVR → Settings → Video → Render Resolution', 'setting'),
      step('This alone breaks the cascade — GPU load drops, heat drops, throttle ends'),
      step(`Current GPU temp: ${gpu.temperature}°C — open Afterburner and set a more aggressive fan curve (100% at 80°C)`, 'open'),
      step('Once temps are stable, raise SS slowly (5% at a time) until GPU stays below 85°C under load', 'info'),
      step('For a permanent fix: undervolt the GPU (see the GPU Undervolt action) to reduce heat at same performance', 'info')
    ],
    relatedRuleIds: ['combo-gpu-thermal-throttle-cascade', 'gpu-temperature-high']
  }
}

function buildCoreParkingSpikePlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig || !data.cpu) return null
  if (data.osConfig.coresMinParkedPercent >= 100) return null
  if (data.cpu.avgUsage <= 60) return null
  return {
    id: 'action-combo-core-parking-spikes',
    priority: 5,
    category: 'CPU',
    title: 'Disable Core Parking to Fix Stutter Under Heavy CPU Load',
    summary: `Core parking is active while CPU is at ${data.cpu.avgUsage.toFixed(0)}% — parked cores take 1-10ms to wake, causing micro-stutters during scene transitions.`,
    impact: 'high',
    effort: 'instant',
    expectedGain: 'Eliminates core wake-up latency stutters that occur during burst VR workloads.',
    fixId: 'fix-core-parking-disable',
    steps: [
      step(`Current CPU usage: ${data.cpu.avgUsage.toFixed(0)}% with core parking active (${data.osConfig.coresMinParkedPercent}% min active cores)`, 'info'),
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Or run in admin PowerShell: powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100', 'setting'),
      step('Then: powercfg /setactive SCHEME_CURRENT', 'setting'),
      step('No reboot required — takes effect immediately')
    ],
    relatedRuleIds: ['combo-core-parking-cpu-spikes', 'cpu-core-parking-active']
  }
}

function buildUsbSuspendWiredPlan(data: ScanData): ActionPlan | null {
  if (!data.osConfig || !data.headsetConnection) return null
  if (!data.osConfig.usbSelectiveSuspendEnabled) return null
  const method = data.headsetConnection.method
  if (method !== 'usb-link' && method !== 'steamvr-usb' && method !== 'wmr') return null
  return {
    id: 'action-combo-usb-suspend-wired',
    priority: 5,
    category: 'OS Config',
    title: 'Disable USB Selective Suspend — Prevents Wired Headset Dropouts',
    summary: `USB selective suspend is cycling your ${method} headset's connection between tracking packets — causing tracking glitches and blackouts.`,
    impact: 'high',
    effort: 'instant',
    expectedGain: 'Eliminates USB-suspend-induced tracking freezes and momentary headset blackouts.',
    fixId: 'fix-usb-selective-suspend',
    steps: [
      step('Open Control Panel → Power Options → Change plan settings → Change advanced power settings', 'open'),
      step('Expand "USB settings" → "USB selective suspend setting"'),
      step('Set to "Disabled" for both "On battery" and "Plugged in"'),
      step('Click Apply — takes effect immediately, no reboot needed', 'setting'),
      step('This can be applied automatically via the "Apply Fix" button below', 'info')
    ],
    relatedRuleIds: ['combo-usb-suspend-wired-headset', 'usb-selective-suspend-active']
  }
}

function buildLowVramSsPlan(data: ScanData): ActionPlan | null {
  if (!data.gpu || !data.vrRuntime) return null
  const gpu = data.gpu.devices[0]
  if (!gpu || gpu.vramTotal === 0 || gpu.vramUsed === 0) return null
  if ((gpu.vramUsed / gpu.vramTotal) <= 0.85) return null
  const ss = data.vrRuntime.supersampling
  if (!ss || ss <= 1.3) return null
  return {
    id: 'action-combo-low-vram-ss',
    priority: 4,
    category: 'GPU',
    title: 'Reduce Supersampling to Relieve VRAM Pressure',
    summary: `VRAM at ${gpu.vramUsed}/${gpu.vramTotal} MB (${((gpu.vramUsed / gpu.vramTotal) * 100).toFixed(0)}%) with ${(ss * 100).toFixed(0)}% SS — textures are spilling to system RAM causing random stutters.`,
    impact: 'high',
    effort: 'minutes',
    expectedGain: 'Stops VRAM overflow; eliminates random multi-millisecond texture-fetch stalls in complex scenes.',
    steps: [
      step(`VRAM: ${gpu.vramUsed}/${gpu.vramTotal} MB at ${(ss * 100).toFixed(0)}% supersampling — over threshold`, 'info'),
      step('Reduce SteamVR render resolution to 80-100%: SteamVR → Settings → Video → Render Resolution', 'setting'),
      step('This frees the supersampled render target from VRAM, leaving room for game textures'),
      step('Close browser tabs and Discord before VR to free additional system RAM for VRAM overflow buffer', 'info'),
      step('Long term: a GPU with more VRAM (e.g. 12GB+) allows higher SS without overflow', 'info')
    ],
    relatedRuleIds: ['combo-low-vram-high-ss', 'combo-vram-and-ram-both-high']
  }
}

function buildWifi2GhzEncoderPlan(data: ScanData): ActionPlan | null {
  if (!data.network?.wifi || !data.gpu || !data.headsetConnection) return null
  if (data.network.wifi.band !== '2.4GHz') return null
  if (data.headsetConnection.encoderInUse === null) return null
  const gpu = data.gpu.devices[0]
  if (!gpu || gpu.encoderUtilization <= 50) return null
  return {
    id: 'action-combo-wifi-2ghz-encoder',
    priority: 2,
    category: 'Network',
    title: 'Switch to 5GHz Wi-Fi — 2.4GHz Can\'t Handle Current Encoder Bitrate',
    summary: `GPU encoder at ${gpu.encoderUtilization.toFixed(0)}% on 2.4GHz Wi-Fi — the band's real-world bandwidth can't drain the encode buffer fast enough, causing dropped frames.`,
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Eliminates wireless buffer overflow; restores full-bitrate video quality and frame delivery.',
    steps: [
      step('Connect to a 5GHz or 6GHz Wi-Fi network — this is the primary fix', 'setting'),
      step('Best setup: PC on wired Ethernet + headset on dedicated 5GHz access point'),
      step('If PC must use Wi-Fi: use a different band than the headset to avoid co-channel interference', 'info'),
      step('Alternatively, reduce streaming bitrate to ≤80Mbps in your VR streaming app to fit within 2.4GHz limits — but this reduces quality', 'info'),
      step('If router doesn\'t have 5GHz: a Wi-Fi 5 or Wi-Fi 6 router with a dedicated 5GHz SSID is required for wireless PCVR', 'info')
    ],
    relatedRuleIds: ['combo-wifi-2ghz-high-bitrate-encoding', 'combo-airlink-no-5ghz']
  }
}

function buildStartupBloatVrPlan(data: ScanData): ActionPlan | null {
  if (!data.processes) return null
  const deduped = dedupeProcesses(data.processes.bloat)
  if (deduped.length < 5) return null
  if (data.processes.vrCritical.length === 0) return null
  const top = deduped.slice(0, 5)
  return {
    id: 'action-combo-startup-bloat-vr',
    priority: 6,
    category: 'Processes',
    title: `Close ${deduped.length} Background Apps Competing With Active VR Session`,
    summary: `${top.map((d) => d.count > 1 ? `${d.name} ×${d.count}` : d.name).join(', ')} are running while VR is active — competing for CPU scheduler time against vrserver/vrcompositor.`,
    impact: 'medium',
    effort: 'minutes',
    expectedGain: 'Reduces background CPU contention; helps VR frame delivery stay within budget during burst workloads.',
    // No fixId — auto-disable startup was removed as a fix; this is guidance-only.
    steps: [
      step(`${deduped.length} unique bloat apps detected (${data.processes.bloat.length} instances) alongside ${data.processes.vrCritical.length} VR processes`, 'info'),
      ...top.map((d) => step(`• ${d.name}${d.count > 1 ? ` ×${d.count}` : ''} — ${d.totalCpuPercent.toFixed(1)}% CPU, ${d.totalRamMB.toFixed(0)} MB RAM`, 'info')),
      step('Close these apps before launching VR — right-click system tray icons and choose Exit/Quit'),
      step('Task Manager → Startup Apps — disable apps you don\'t need so they never auto-start', 'open')
    ],
    relatedRuleIds: ['combo-startup-bloat-vr-overhead', 'combo-bloat-plus-cpu']
  }
}

function buildAudioSpatialPlan(data: ScanData): ActionPlan | null {
  if (!data.audio?.spatialAudioEnabled) return null
  return {
    id: 'action-audio-spatial',
    priority: 10,
    category: 'Audio',
    title: 'Disable Windows Spatial Audio to Reduce DSP Overhead',
    summary: 'Windows Sonic / spatial audio is running a real-time DSP pipeline that adds 5-10ms audio latency and CPU overhead — unnecessary in VR where games provide their own 3D audio.',
    impact: 'low',
    effort: 'instant',
    expectedGain: 'Eliminates 5-10ms audio latency tail and removes spatial DSP from CPU load.',
    steps: [
      step('Right-click the speaker icon in the system tray → Sound settings', 'open'),
      step('Click your headset/speakers → Properties → Spatial sound tab'),
      step('Set "Spatial sound format" to "Off"'),
      step('Takes effect immediately — no reboot needed', 'info')
    ],
    relatedRuleIds: ['audio-spatial-overhead']
  }
}

function buildUsbControllerPlan(data: ScanData): ActionPlan | null {
  if (!data.usb) return null
  const hasUsbIssue = data.usb.genericControllerCount > 0 || data.usb.headsetUsbGeneration === '2.0'
  if (!hasUsbIssue) return null

  if (data.usb.headsetUsbGeneration === '2.0') {
    return {
      id: 'action-usb-20-headset',
      priority: 2,
      category: 'USB',
      title: 'Move VR Headset to USB 3.0+ Port — USB 2.0 Insufficient for Link',
      summary: 'Your VR headset is on a USB 2.0 port. Oculus Link and Pico Connect need USB 3.0 (5 Gbps) — USB 2.0 causes severe compression, dropped frames, and degraded tracking.',
      impact: 'critical',
      effort: 'minutes',
      expectedGain: 'Enables full-quality USB Link video streaming; eliminates compression artifacts and tracking drops.',
      steps: [
        step('Unplug the headset USB cable'),
        step('Look for a blue USB-A port (blue inside = USB 3.0) or a USB-C port — plug the headset there', 'setting'),
        step('If no blue ports exist on your PC: add a PCIe USB 3.0/3.1 card (~$15-25) — this guarantees dedicated bandwidth', 'info'),
        step('After reconnecting, check that Meta Quest Link or Pico Connect shows a USB 3.x connection indicator', 'info')
      ],
      relatedRuleIds: ['usb-20-vr-headset']
    }
  }

  return {
    id: 'action-usb-generic-controller',
    priority: 8,
    category: 'USB',
    title: 'Replace Generic USB Controller to Fix VR Tracking Jitter',
    summary: `${data.usb.genericControllerCount} generic USB host controller(s) detected. Poor interrupt timing on generic controllers causes irregular tracking data delivery and micro-stutters in VR.`,
    impact: 'medium',
    effort: 'hours',
    expectedGain: 'Eliminates tracking micro-stutters caused by irregular USB interrupt delivery timing.',
    steps: [
      step('Device Manager → Universal Serial Bus controllers — check for controllers without a vendor brand name', 'open'),
      step('Try connecting the VR headset directly to a motherboard USB port (not an add-in card) — chipset USB controllers (Intel/AMD) are more reliable for VR', 'setting'),
      step('If using a USB hub, remove it — VR headsets should connect directly to the PC'),
      step('Consider a quality PCIe USB 3.1 card using ASMedia or Renesas chipsets for dedicated VR bandwidth', 'info')
    ],
    relatedRuleIds: ['usb-generic-controller']
  }
}

function buildGpuThermalThrottlePlan(data: ScanData): ActionPlan | null {
  if (!data.gpu) return null
  const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
  if (!gpu || !gpu.isThermalThrottled) return null
  return {
    id: 'action-gpu-thermal-throttle',
    priority: 3,
    category: 'GPU',
    title: `Stop GPU Thermal Throttle — Running at ${gpu.clockMhz} MHz Instead of ${gpu.boostClock}+ MHz`,
    summary: `Your GPU is throttling due to heat (${gpu.temperature}°C) — this is a direct cause of VR frame drops. The GPU has reduced its clock from normal boost to ${gpu.clockMhz} MHz to protect itself.`,
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Restores full GPU boost clock, eliminating throttle-induced frame drops and reprojection events.',
    steps: [
      step(`Current: ${gpu.clockMhz} MHz at ${gpu.temperature}°C — should be ${gpu.boostClock}+ MHz boost`, 'info'),
      step('Open MSI Afterburner → Fan tab → enable "Auto" or set a manual curve: 80% fan at 70°C, 100% at 80°C', 'setting'),
      step('This alone often drops temps 10-15°C and restores full clock speed immediately'),
      step('Long term: clean dust from GPU heatsink and fans (can recover 5-10°C after a year of use)', 'info'),
      step('Advanced: GPU undervolting (Afterburner voltage/frequency curve) reduces heat while maintaining performance', 'info'),
      step(`${gpu.vendor === 'nvidia' ? 'NVIDIA' : gpu.vendor === 'amd' ? 'AMD' : 'Intel'} Thermal limit: typically 83-88°C for modern GPUs`, 'info')
    ],
    relatedRuleIds: ['gpu-thermal-throttling', 'combo-gpu-thermal-throttle-cascade']
  }
}

function buildVRChatDynamicBonePlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime) return null
  const affected = data.vrRuntime.dynamicBoneMaxAffected
  const colliders = data.vrRuntime.dynamicBoneMaxCollider
  const configPresent = data.vrRuntime.vrchatConfigPresent

  // Fire if: unlimited bones, high bone count, no config, or unlimited colliders
  const hasIssue = affected === 0 || affected === null || (affected !== null && affected > 64) ||
                   colliders === 0 || !configPresent
  if (!hasIssue) return null

  const summaryParts: string[] = []
  if (affected === 0 || affected === null) summaryParts.push('uncapped avatar physics')
  else if (affected > 64) summaryParts.push(`${affected} bone-transform cap (high)`)
  if (colliders === 0) summaryParts.push('uncapped collider checks')
  if (!configPresent) summaryParts.push('no config.json (running on defaults)')

  return {
    id: 'action-vrchat-dynamic-bones',
    priority: 3,
    category: 'VR App',
    title: 'Cap VRChat avatar physics — biggest single CPU win in busy worlds',
    summary: `Your config.json shows ${summaryParts.join(', ')}. In a public world with 20+ players this is usually the difference between locked 90 fps and constant reprojection.`,
    impact: 'critical',
    effort: 'instant',
    expectedGain: 'Cuts CPU usage 60-80% in populated worlds. Most impactful VRChat-side change you can make.',
    fixId: 'fix-vrchat-dynamic-bone-limits',
    steps: [
      step('Applied automatically via the "Apply Fix" button below', 'info'),
      step('dynamic_bone_max_affected_transform_count = 32 (per-avatar PhysBones cap; key name is legacy)', 'setting'),
      step('dynamic_bone_max_collider_check_count = 8 (per-bone collider check cap)', 'setting'),
      step('Also enables avatar culling at 25m (avatars outside that range stop rendering)', 'setting'),
      step('File: %USERPROFILE%\\AppData\\LocalLow\\VRChat\\VRChat\\config.json', 'info'),
      step('Equivalent in-game: Settings → Performance Options → Avatar Performance Limiter (overrides config.json when set)', 'info'),
      step('No restart needed — takes effect on your next world join.')
    ],
    relatedRuleIds: ['vrchat-dynamic-bone-unlimited', 'vrchat-dynamic-bone-high', 'vrchat-collider-unlimited', 'vrchat-no-config-file']
  }
}

function buildVRChatMsaaPlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime) return null
  const msaa = data.vrRuntime.vrchatMsaa
  if (msaa === null || msaa <= 2) return null
  return {
    id: 'action-vrchat-msaa',
    priority: 5,
    category: 'VR App',
    title: `Reduce VRChat MSAA from ${msaa}x to 2x — Saves 30-60% GPU in Complex Scenes`,
    summary: `VRChat is rendering at ${msaa}x MSAA — ${msaa}× the fill-rate cost. In VR at native resolution, 2x MSAA is virtually indistinguishable but uses a fraction of the GPU time.`,
    impact: 'high',
    effort: 'instant',
    expectedGain: `Reduces GPU fill-rate requirement by ~${Math.round((1 - 2/msaa) * 100)}%, recovering headroom for maintaining 90fps in complex worlds.`,
    fixId: 'fix-vrchat-msaa',
    steps: [
      step('This can be applied automatically via the "Apply Fix" button below', 'info'),
      step('Sets MSAA to 2x via Unity PlayerPrefs registry key', 'setting'),
      step('Or in-game: VRChat → Settings → Graphics → Anti-Aliasing → select 2x MSAA', 'open'),
      step('For even better results: disable MSAA entirely (1x) and enable temporal anti-aliasing via SteamVR Super Sampling', 'info'),
      step('Restart VRChat after applying for the change to take effect')
    ],
    relatedRuleIds: ['vrchat-msaa-too-high']
  }
}

function buildVRChatNoConfigPlan(data: ScanData): ActionPlan | null {
  if (!data.vrRuntime) return null
  if (data.vrRuntime.vrchatConfigPresent) return null
  // Only show if VRChat is installed (vrRuntime exists and either vrchatConfig is set or VRChat appears installed)
  return {
    id: 'action-vrchat-create-config',
    priority: 4,
    category: 'VR App',
    title: 'Create a VRChat config.json — you\'re on stock defaults',
    summary: 'No config.json found. That means uncapped avatar physics, a small cache, and no avatar culling — fine in an empty world, the worst possible setup in a busy one.',
    impact: 'critical',
    effort: 'instant',
    expectedGain: 'Applying the recommended config provides immediate CPU relief in any world with more than 5 players. Essential for VRChat VR performance.',
    fixId: 'fix-vrchat-dynamic-bone-limits',
    steps: [
      step('Apply Fix below creates the config.json with recommended settings automatically', 'info'),
      step('Or manually create: %USERPROFILE%\\AppData\\LocalLow\\VRChat\\VRChat\\config.json', 'open'),
      step('Paste this content:', 'setting'),
      step('{ "dynamic_bone_max_affected_transform_count": 32, "dynamic_bone_max_collider_check_count": 8, "avatar_culling_enabled": true, "avatar_culling_distance": 25, "cache_size": 20480, "cache_expiry_delay": 30 }', 'setting'),
      step('VRChat reads this file on startup — no restart needed if you apply before launching', 'info')
    ],
    relatedRuleIds: ['vrchat-no-config-file', 'vrchat-dynamic-bone-unlimited']
  }
}

function buildCpuThermalThrottlePlan(data: ScanData): ActionPlan | null {
  if (!data.cpu?.thermalThrottled) return null
  return {
    id: 'action-cpu-thermal-throttle',
    priority: 2,
    category: 'CPU',
    title: 'Fix CPU Thermal Throttle — Running Below Base Clock in VR',
    summary: 'Your CPU is throttling itself to avoid overheating. In a busy VRChat instance that means avatar physics and game logic fall behind frame budget — which is what you feel as constant reprojection.',
    impact: 'critical',
    effort: 'minutes',
    expectedGain: 'Restores full CPU boost clock, improving VRChat physics FPS and frame delivery consistency.',
    steps: [
      step(data.cpu.boostClockMhz ? `Current measured frequency: ${data.cpu.boostClockMhz} MHz (should be higher under load)` : 'CPU running below base clock specification', 'info'),
      step('Open HWiNFO64 or HWMonitor and check CPU temperature under VR load — should be below 90°C', 'open'),
      step('If above 90°C: replace thermal paste (even 2-year-old paste can dry out), ensure heatsink is seated correctly'),
      step('Clean dust from CPU cooler and case fans — dust buildup is the #1 cause of thermal throttle'),
      step('In BIOS: check if PL1/PL2 power limits are set too aggressively — use recommended spec values for your CPU', 'setting'),
      step('Disable CPU overclocks if present — even "stable" OCs can throttle under sustained VR load', 'info'),
      step('After cooling improvement: verify in HWiNFO64 that CPU stays at boost speeds during a VRChat session', 'info')
    ],
    relatedRuleIds: ['cpu-thermal-throttling']
  }
}

function buildRamSingleChannelPlan(data: ScanData): ActionPlan | null {
  if (!data.ram) return null
  if (data.ram.dualChannelConfirmed) return null
  return {
    id: 'action-ram-single-channel',
    priority: 7,
    category: 'Memory',
    title: 'Move RAM to Dual-Channel Slots — Double Memory Bandwidth',
    summary: 'RAM may be in single-channel mode, halving the memory bandwidth available for VRChat\'s physics simulation, asset streaming, and GPU transfers.',
    impact: 'medium',
    effort: 'hours',
    expectedGain: 'Doubles memory bandwidth, which directly speeds up VRChat\'s avatar physics work on the main thread and cuts asset-stream stalls.',
    steps: [
      step('Power off and unplug your PC before touching RAM', 'info'),
      step('Check your motherboard manual for dual-channel slot configuration — typically A2+B2 (2nd and 4th slots)', 'open'),
      step('Move your RAM sticks to the correct paired slots — the manual will show which slots must be populated for dual-channel'),
      step('Boot and check: CPU-Z → Memory tab → Channels: should show "Dual" or Task Manager → Performance → Memory → "Speed (MHz)" should appear doubled', 'setting'),
      step('If you have 1 RAM stick: you cannot run dual-channel with only one module — add a matching second stick', 'info')
    ],
    relatedRuleIds: ['ram-single-channel']
  }
}

function buildNvmePowerStatePlan(data: ScanData): ActionPlan | null {
  if (!data.storage) return null
  const affectedDrives = data.storage.drives.filter(
    (d) => d.type === 'NVMe' && d.nvmePowerStateOptimal === false
  )
  if (affectedDrives.length === 0) return null
  return {
    id: 'action-nvme-power-state',
    priority: 9,
    category: 'Storage',
    title: 'Disable NVMe Power Saving to Prevent Asset Loading Stutters',
    summary: `NVMe power saving on ${affectedDrives.map((d) => d.letter + ':').join(', ')} can add 10-100ms wake latency when VRChat loads an avatar or world asset after a brief pause.`,
    impact: 'medium',
    effort: 'instant',
    expectedGain: 'Eliminates random 10-100ms load spikes from NVMe wake latency during VRChat asset streaming.',
    steps: [
      step('Open Device Manager → Disk drives → right-click your NVMe SSD → Properties', 'open'),
      step('Go to the "Policies" tab → uncheck "Enable write caching on the device" if using battery backup, OR...'),
      step('Set power plan to High Performance — this automatically disables StorPort NVMe idle power management', 'setting'),
      step('Or manually: open an admin PowerShell and run:', 'open'),
      step('Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\StorPort" -Name "EnableIdlePowerManagement" -Value 0 -Type DWord -Force', 'setting'),
      step('No reboot required — takes effect immediately for new I/O operations', 'info')
    ],
    relatedRuleIds: ['nvme-power-saving-active']
  }
}

// ═══════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════

export function buildActionPlan(
  findings: Finding[],
  scanData: ScanData
): ActionPlan[] {
  console.log(`[summary:buildActionPlan] Building action plan — ${findings.length} finding(s) input`)
  const t0 = Date.now()
  const plans: ActionPlan[] = []
  const addedIds = new Set<string>()

  function add(plan: ActionPlan | null): void {
    if (plan && !addedIds.has(plan.id)) {
      addedIds.add(plan.id)
      plans.push(plan)
    }
  }

  // ── Critical / blocking issues first ─────────────────────────
  add(buildHeadsetConnectivityPlan(scanData))
  add(buildDisplayRefreshRatePlan(scanData))
  add(buildDisplayHdrPlan(scanData))
  add(buildWifi24GhzPlan(scanData))
  add(buildThermalPlan(scanData))
  add(buildCpuThermalThrottlePlan(scanData))
  add(buildRamSingleChannelPlan(scanData))
  add(buildNvmePowerStatePlan(scanData))
  add(buildGpuThermalThrottlePlan(scanData))
  add(buildVRChatDynamicBonePlan(scanData))
  add(buildVRChatNoConfigPlan(scanData))

  // ── High-impact OS and config fixes ──────────────────────────
  add(buildLaptopBatteryPlan(scanData))
  add(buildGpuTdrPlan(scanData))
  add(buildCloseBackgroundAppsPlan(scanData))
  add(buildPeripheralSoftwarePlan(scanData))
  add(buildSteamVrSettingsPlan(scanData))
  add(buildSteamVrAsyncPlan(scanData))
  add(buildGpuUndervoltPlan(scanData))

  // ── Medium-impact tuning ──────────────────────────────────────
  add(buildWifiSignalPlan(scanData))
  add(buildWifiPowerSavingPlan(scanData))
  add(buildWifi6ePlan(scanData))
  add(buildXmpPlan(scanData))
  add(buildXboxDvrPlan(scanData))
  add(buildStartupBloatPlan(scanData))
  add(buildUsbSuspendPlan(scanData))
  // buildCoreParkingPlan removed — fix-core-parking-disable produced no visible
  // improvement in testing (powercfg setting persisted but VR frame-pacing
  // data showed no change). Modern Windows no longer parks cores under VR
  // workloads in practice.
  add(buildNaglePlan(scanData))
  add(buildTimerResolutionPlan(scanData))
  add(buildGpuTdrPlan(scanData))
  add(buildLaptopBatteryPlan(scanData))
  add(buildBiosUpdatePlan(scanData))
  add(buildVRChatCullingPlan(scanData))
  add(buildVRChatDynamicBonePlan(scanData))
  add(buildVRChatMsaaPlan(scanData))
  add(buildVRChatNoConfigPlan(scanData))
  // buildFullscreenOptsPlan removed — fix-disable-fullscreen-optimizations was
  // a no-op in practice. AppCompatFlags DISABLEDXMAXIMIZEDWINDOWEDMODE only
  // affects legacy fullscreen mode (pre-DXGI flip model); modern VR runtimes
  // use flip model regardless, so the flag made no observable difference.

  // ── Low-impact optimizations ──────────────────────────────────
  add(buildReBarPlan(scanData))
  add(buildAmdSamPlan(scanData))
  add(buildIntegratedGpuPlan(scanData))
  add(buildGpuDriverUpdatePlan(scanData))
  add(buildGpuThermalThrottlePlan(scanData))
  add(buildArcAv1Plan(scanData))
  add(buildInternetSpeedPlan(scanData))

  // ── Combination rule plans ────────────────────────────────────
  add(buildGpuThermalCascadePlan(scanData))
  // buildCoreParkingSpikePlan removed — same reason as buildCoreParkingPlan
  add(buildUsbSuspendWiredPlan(scanData))
  add(buildLowVramSsPlan(scanData))
  add(buildWifi2GhzEncoderPlan(scanData))
  add(buildStartupBloatVrPlan(scanData))
  add(buildAudioSpatialPlan(scanData))
  add(buildUsbControllerPlan(scanData))

  // ── Inject any additional plans from unhandled critical findings ──
  const handledRuleIds = new Set(plans.flatMap((p) => p.relatedRuleIds))
  const unhandledCritical = findings.filter(
    (f) => f.result.severity === 'critical' && !handledRuleIds.has(f.result.ruleId)
  )
  for (const finding of unhandledCritical.slice(0, 3)) {
    const id = `action-finding-${finding.result.ruleId}`
    if (!addedIds.has(id)) {
      addedIds.add(id)
      plans.push({
        id,
        priority: 3,
        category: finding.result.category.toUpperCase(),
        title: `Fix: ${finding.result.ruleId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
        summary: finding.result.explanation.simple.slice(0, 120) + '…',
        impact: 'critical',
        effort: 'minutes',
        expectedGain: 'Addresses a critical VR performance issue.',
        steps: [
          step(finding.result.explanation.simple),
          ...(finding.result.explanation.advanced !== finding.result.explanation.simple
            ? [step(finding.result.explanation.advanced, 'info')]
            : [])
        ],
        relatedRuleIds: [finding.result.ruleId],
        fixId: finding.result.fixId
      })
    }
  }

  // ── Filter by user's connection archetype ─────────────────────
  // Plans that declare `appliesToArchetypes` are only relevant for certain
  // connection types (e.g. Wi-Fi 6E upgrades → wifi-wireless only). Before
  // this filter existed, every tethered user was seeing Wi-Fi-only plans
  // and vice versa. Null archetype (no setup yet / generic profile) keeps
  // everything so a new user still sees all possibilities.
  const archetype = scanData.connectionArchetype
  const filtered = archetype
    ? plans.filter((p) => {
        if (!p.appliesToArchetypes || p.appliesToArchetypes.length === 0) return true
        return p.appliesToArchetypes.includes(archetype)
      })
    : plans
  const hiddenCount = plans.length - filtered.length
  if (hiddenCount > 0) {
    console.log(`[summary:buildActionPlan] Filtered ${hiddenCount} plan${hiddenCount !== 1 ? 's' : ''} not applicable to ${archetype} connection`)
  }

  // ── Complaint-aware prioritization ────────────────────────────
  // Boost plans whose category or keywords match the user's declared main
  // complaint. This is a soft bias — plans still sort by impact × effort —
  // but within each impact band, complaint-matching plans surface first.
  const complaintBoost = getComplaintBoostMap(scanData.userSetup?.mainComplaint ?? null)
  if (complaintBoost) {
    console.log(`[summary:buildActionPlan] Boosting plans matching complaint "${scanData.userSetup?.mainComplaint}"`)
  }

  // ── Sort by impact × effort × complaint-match ────────────────
  filtered.sort((a, b) => {
    const baseA = planScore(a)
    const baseB = planScore(b)
    if (complaintBoost) {
      // Boost is a small negative offset — shifts matching plans earlier in sort
      const boostA = complaintBoost(a) ? -2 : 0
      const boostB = complaintBoost(b) ? -2 : 0
      return (baseA + boostA) - (baseB + boostB)
    }
    return baseA - baseB
  })

  // Re-assign sequential priority numbers
  filtered.forEach((p, i) => { p.priority = i + 1 })

  const elapsed = Date.now() - t0
  const critCount = filtered.filter((p) => p.impact === 'critical').length
  const highCount = filtered.filter((p) => p.impact === 'high').length
  console.log(
    `[summary:buildActionPlan] Done in ${elapsed}ms — ${filtered.length} action(s) ` +
    `(${critCount} critical, ${highCount} high, ${filtered.length - critCount - highCount} other)` +
    (hiddenCount > 0 ? ` — ${hiddenCount} filtered by archetype` : '')
  )

  return filtered
}
