// VR Optimization Suite — System Compatibility Rules
//
// Rules keyed off scanData.compat (populated by scanner/modules/compat.ts).
// Covers cross-cutting flags: hybrid GPU routing, HVCI / Core Isolation,
// SteamVR Beta branch, installed-but-not-running VR tools.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

//
// Laptops with an iGPU + dGPU route VR apps through the iGPU by default on
// many OEM power configurations. This silently kills VR performance —
// users see inexplicably low frame rates with a perfectly capable dGPU.
const hybridGpuRule: Rule = {
  id: 'compat-hybrid-gpu-vr-routing',
  category: 'gpu',
  name: 'Hybrid Laptop GPU — Verify VR Apps Use Discrete GPU',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.compat?.hasHybridGpu) return null
    if (!data.compat.isLaptop) return null

    // If the detected primary GPU is integrated, this is almost certainly
    // a mis-routed VR session — bump to warning.
    const primaryIsIntegrated =
      data.gpu?.devices[data.gpu.primaryGpuIndex]?.isIntegrated ?? false
    const severity: RuleResult['severity'] = primaryIsIntegrated ? 'warning' : 'info'

    const simple = primaryIsIntegrated
      ? `Your laptop has both an integrated and a dedicated GPU — and right now VR apps are ` +
        `being routed through the integrated GPU, which is vastly slower. You need to force ` +
        `VR runtimes and games onto the dedicated GPU.`
      : `Your laptop has both an integrated and a dedicated GPU. Make sure SteamVR, the Oculus ` +
        `runtime, and your VR games are all pinned to the dedicated GPU — otherwise Windows can ` +
        `silently migrate VR back to the integrated GPU when battery or power plans change.`

    const advanced =
      `Hybrid GPU detected (iGPU + dGPU on laptop chassis).\n\n` +
      `Windows' "Graphics Settings" page (Settings → System → Display → Graphics) is the\n` +
      `authoritative place to pin apps to the dGPU. For each VR-related .exe, click "Browse",\n` +
      `add the executable, then Options → "High performance".\n\n` +
      `Critical executables to pin:\n` +
      `  • vrserver.exe        (SteamVR)\n` +
      `  • vrcompositor.exe    (SteamVR)\n` +
      `  • OVRServer_x64.exe   (Oculus PC runtime)\n` +
      `  • OculusClient.exe    (Oculus PC client)\n` +
      `  • VirtualDesktop.Streamer.exe  (if using VD)\n` +
      `  • Your VR game .exes\n\n` +
      `For NVIDIA Optimus laptops:\n` +
      `  NVIDIA Control Panel → 3D Settings → Global → PhysX Processor → dedicated GPU\n` +
      `  NVIDIA Control Panel → Manage 3D Settings → Program Settings → add each VR exe,\n` +
      `  set "High-performance NVIDIA processor".\n\n` +
      `For AMD hybrid laptops:\n` +
      `  Radeon Settings → Graphics → Advanced → Switchable Graphics → set each exe to\n` +
      `  "High performance".\n\n` +
      `Verify: launch SteamVR, open its status window → top-right should show your dGPU name.\n` +
      `If it says Intel UHD / AMD Radeon Graphics, routing is wrong — VR is running on iGPU.`

    return {
      ruleId: 'compat-hybrid-gpu-vr-routing',
      severity,
      category: 'gpu',
      explanation: { simple, advanced },
    }
  },
}

//
// Windows "Memory Integrity" (HVCI) refuses to load drivers it can't verify.
// Older VR drivers (Vive Pro ≤ 2020, WMR generic USB, Lighthouse 1.0) are
// sometimes flagged. When active, users see mysterious driver-load failures.
const coreIsolationRule: Rule = {
  id: 'compat-core-isolation-for-legacy-vr',
  category: 'os-config',
  name: 'Core Isolation (HVCI) May Block Older VR Drivers',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.compat) return null
    if (data.compat.hvciEnabled !== true) return null

    // This is only actionable concern for users on headsets with older drivers.
    // We use the profile info if we have it — if they're on a Quest 3 or Index
    // we don't need to bother them with this. Vive Pro / Vive (original) /
    // WMR / Reverb series are most at risk.
    const profile = data.headsetProfile as { id?: string; brand?: string } | null | undefined
    const legacyProfilePatterns = [
      /vive-pro\b/, /vive-original\b/, /vive-pro-eye/, /reverb-g1/, /reverb-g2/,
      /samsung-odyssey/, /lenovo-explorer/, /rift-cv1/, /rift-s/, /vive-cosmos/
    ]
    const isLegacyHeadset = profile?.id
      ? legacyProfilePatterns.some((re) => re.test(profile.id!))
      : false

    // If we know their headset is modern (Quest 2/3/Pro, Index, Crystal etc.)
    // skip this — HVCI is fine for them.
    const isModernHeadset = profile?.id
      ? /quest-[23p]|quest-pro|valve-index|crystal|beyond|aero|xr-[34]|meganex|somnium|apple-vision/.test(profile.id)
      : false
    if (isModernHeadset) return null

    const severity: RuleResult['severity'] = isLegacyHeadset ? 'warning' : 'info'

    return {
      ruleId: 'compat-core-isolation-for-legacy-vr',
      severity,
      category: 'os-config',
      explanation: {
        simple: isLegacyHeadset
          ? `Windows Memory Integrity (part of Core Isolation) is ON. This is known to block ` +
            `older drivers for your ${profile?.brand ?? 'headset'} — you may see unexplained ` +
            `driver load failures or missing USB-class VR devices. If VR works, you're fine; ` +
            `if SteamVR fails to find the headset, temporarily disable Memory Integrity as a ` +
            `diagnostic.`
          : `Windows Memory Integrity (HVCI) is ON. Most modern VR headsets are unaffected, but ` +
            `some older or third-party drivers (Vive Pro, WMR generic, legacy Lighthouse utilities) ` +
            `can fail to load. If you see "driver failed to start" errors anywhere, this is a ` +
            `common culprit.`,
        advanced:
          `Core Isolation / HVCI state: enabled\n` +
          `Detected headset profile: ${profile?.id ?? '(none)'}\n` +
          `Classification: ${isLegacyHeadset ? 'legacy-driver headset — higher risk' : 'generic VR — low-to-medium risk'}\n\n` +
          `HVCI refuses to load kernel drivers that don't pass Microsoft's memory-integrity\n` +
          `validation. The following VR driver packages are documented to be affected in various\n` +
          `combinations: HTC Vive Pro audio driver ≤ 2021, WMR VR USB generic driver, Lighthouse\n` +
          `1.0 redistributables, various SlimeVR kernel hooks, and several older face-tracking\n` +
          `kernel components.\n\n` +
          `To test if HVCI is the issue:\n` +
          `  1. Settings → Privacy & Security → Windows Security → Device security →\n` +
          `     Core Isolation details → Memory Integrity → Off\n` +
          `  2. Reboot. Launch VR. If it now works, HVCI was blocking a driver.\n` +
          `  3. If HVCI isn't the problem, turn it back ON — it's a meaningful security feature.\n\n` +
          `A permanent solution is usually a driver update. Vendor forums list which driver\n` +
          `version restored HVCI compatibility (most Meta / Valve / HTC drivers from 2022+ work).`,
      },
    }
  },
}

//
// SteamVR Beta often introduces regressions — users complaining about new
// crashes / frame-pacing issues should be reminded that Beta is a thing.
const steamvrBetaRule: Rule = {
  id: 'compat-steamvr-beta-branch',
  category: 'vr-runtime',
  name: 'Running SteamVR Beta Branch',
  evaluate: (data: ScanData): RuleResult | null => {
    if (data.compat?.steamvrBranch !== 'beta') return null
    return {
      ruleId: 'compat-steamvr-beta-branch',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple:
          `You're on the SteamVR Beta branch. Valve uses Beta to test driver and compositor ` +
          `changes before they go stable, so regressions are expected — if you're experiencing ` +
          `new crashes, stutters, or tracking weirdness that started recently, try rolling back ` +
          `to the Stable branch first to isolate the cause.`,
        advanced:
          `Detected via Steam appmanifest_250820.acf BetaKey field.\n\n` +
          `To switch to Stable:\n` +
          `  Steam → Library → SteamVR → right-click → Properties → Betas → "None — opt out of all betas"\n` +
          `  Steam will then re-download the stable build.\n\n` +
          `Useful for A/B testing: note the current Beta version, switch to Stable, see if the\n` +
          `issue goes away. If yes, the problem is in the current Beta — report it on the\n` +
          `SteamVR Steam Community Hub or the Beta-branch forum so Valve can fix before promotion.`,
      },
    }
  },
}

//
// Gentle hint for users troubleshooting wireless VR: they may already have
// Virtual Desktop / ALVR installed and forgot about it. Doesn't fire when
// any relevant tool is already running.
const installedVrToolsRule: Rule = {
  id: 'compat-installed-vr-tools-not-running',
  category: 'vr-runtime',
  name: 'VR Tools Installed But Not Running',
  evaluate: (data: ScanData): RuleResult | null => {
    const tools = data.compat?.installedVrTools ?? []
    if (tools.length === 0) return null

    const notRunning = tools.filter((t) => !t.running)
    if (notRunning.length === 0) return null

    // Only elevate to info (not warning) — this is informational awareness,
    // not a problem. The user may have deliberate reasons not to run them.
    const archetype = data.connectionArchetype

    // Relevant filter — for wireless users, highlight wireless streaming tools
    const relevant = notRunning.filter((t) => {
      if (!archetype) return true
      if (archetype === 'wifi-wireless') {
        return ['virtual-desktop-streamer', 'alvr', 'sunshine', 'moonlight'].includes(t.id)
      }
      if (archetype === 'usb-encoded') {
        return ['oculus-pc', 'vive-streaming', 'pico-connect'].includes(t.id)
      }
      return true
    })
    if (relevant.length === 0) return null

    return {
      ruleId: 'compat-installed-vr-tools-not-running',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple:
          `You have these VR streaming tools installed but not running right now: ` +
          relevant.map((t) => t.label).join(', ') + `. ` +
          `If you're troubleshooting wireless VR or connection issues, one of these may be a ` +
          `better option than what you're currently using — sometimes users already own Virtual ` +
          `Desktop but fall back to AirLink out of habit.`,
        advanced:
          `Installed-but-inactive VR tooling:\n\n` +
          relevant.map((t) => `  • ${t.label}\n      ${t.installPath}`).join('\n\n') + '\n\n' +
          `Active connection archetype: ${archetype ?? '(unspecified)'}\n\n` +
          `This is informational. Typical reasons these matter:\n` +
          `  • Virtual Desktop (paid, $20) generally outperforms free Air Link for Quest users —\n` +
          `    if you bought it and forgot, now you know.\n` +
          `  • ALVR works when vendor apps fail — useful diagnostic fallback.\n` +
          `  • Sunshine + Moonlight is a VR-capable self-hosted stream (not VR-specific, but\n` +
          `    works with some OpenXR titles in 2D mode on the headset).\n` +
          `  • VIVE Streaming is Vive-headset-specific — ignore if you don't own one.`,
      },
    }
  },
}


export const compatRules: Rule[] = [
  hybridGpuRule,
  coreIsolationRule,
  steamvrBetaRule,
  installedVrToolsRule,
]
