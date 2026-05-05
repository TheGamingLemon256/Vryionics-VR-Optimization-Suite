// VR Optimization Suite — Headset Connection Rules
// Fires based on what's detected in scanData.headsetConnection.
// Covers: not detected, wrong USB gen, VD config issues, etc.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const headsetConnectionRules: Rule[] = [

  {
    id: 'headset-not-detected',
    category: 'vr-runtime',
    name: 'No VR Headset Detected',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.detected) return null
      if (data.headsetConnection.method !== 'none') return null
      return {
        ruleId: 'headset-not-detected',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple: 'No VR headset was detected during this scan — no VR runtime is running and no headset USB device was found. If you haven\'t set up your headset yet, that\'s expected. If you intended to scan with your headset active, ensure the VR software is running before scanning.',
          advanced: 'HeadsetConnectionData.detected = false, method = none. No VR processes (OVRServer, vrserver, MixedRealityPortal, PicoConnect) running. No USB VR devices matched known signatures. This scan reflects a cold system state — without VR running, GPU encoder utilization, VR process CPU/RAM usage, and streaming-specific metrics will all read zero.'
        }
      }
    }
  },

  {
    id: 'headset-virtual-desktop-active',
    category: 'vr-runtime',
    name: 'Virtual Desktop Streaming Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'virtual-desktop') return null
      return {
        ruleId: 'headset-virtual-desktop-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: 'Virtual Desktop is running and streaming to your headset. For best quality: use HEVC/H.265 codec, set bitrate to 150-300 Mbps (match your Wi-Fi capacity), and make sure your PC is on wired Ethernet while the headset is on 5GHz or 6GHz Wi-Fi.',
          advanced: `Virtual Desktop Streamer detected. Streaming bitrate: ${data.headsetConnection.streamingBitrateMbps ?? 'not detected'} Mbps. Encoder: ${data.headsetConnection.encoderInUse ?? 'unknown'}. VD best practices: (1) HEVC codec at 80% quality, (2) 150-300 Mbps depending on Wi-Fi capacity, (3) PC wired to router, (4) Dedicated 5GHz/6GHz router near play space, (5) Disable Wi-Fi power saving on PC adapter. For latency: enable Sliced Encoding in VD settings if using NVENC.`
        }
      }
    }
  },

  {
    id: 'headset-airlink-active',
    category: 'vr-runtime',
    name: 'Meta Air Link Streaming Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'airlink') return null
      return {
        ruleId: 'headset-airlink-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: 'Meta Air Link is streaming to your Quest headset. Air Link works best when your PC is wired to the router via Ethernet, and the Quest is on a dedicated 5GHz or 6GHz Wi-Fi access point. Avoid sharing the Wi-Fi band with other devices in your home.',
          advanced: `Meta Air Link streaming active. Encoder: ${data.headsetConnection.encoderInUse ?? 'unknown'}. Air Link uses the Oculus runtime's own encoder — unlike Virtual Desktop, you cannot independently set the codec. To maximize quality: (1) Set render resolution in the Meta Quest PC app (not SteamVR), (2) Enable dynamic bitrate in Air Link settings, (3) Use a dedicated Wi-Fi 6 or Wi-Fi 6E router — Air Link performs much better on Wi-Fi 6 due to reduced latency. Bitrate cap in Air Link is ~200 Mbps vs VD's 300+ Mbps.`
        }
      }
    }
  },

  {
    id: 'headset-usb-link-active',
    category: 'vr-runtime',
    name: 'Wired USB Link Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'usb-link') return null
      return {
        ruleId: 'headset-usb-link-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: 'Your headset is connected via USB cable (Oculus Link or Pico Connect). Wired skips the Wi-Fi variables entirely. For best performance, use a USB 3.2 Gen 2 (10 Gbps) port directly on your motherboard, not through a hub.',
          advanced: `USB Link active. USB controller: ${data.headsetConnection.usbControllerType ?? 'unknown'} (Gen ${data.headsetConnection.usbGeneration ?? 'unknown'}). USB Link quality depends heavily on: (1) USB controller quality — ASMedia/Intel USB 3.2 Gen 2 preferred over generic, (2) Cable quality — use the Oculus official Link cable or a high-quality USB 3.2 cable, (3) Direct motherboard port — hubs add latency and bandwidth contention. Encoder: ${data.headsetConnection.encoderInUse ?? 'unknown'}.`
        }
      }
    }
  },

  {
    id: 'headset-alvr-active',
    category: 'vr-runtime',
    name: 'ALVR Wireless Streaming Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'alvr') return null
      return {
        ruleId: 'headset-alvr-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: `ALVR is streaming to your headset. ALVR is a free, open-source alternative to Virtual Desktop. For best results, use the HEVC codec at 130-200 Mbps. Set your Wi-Fi adapter to 5GHz or 6GHz and make sure ALVR's firewall rules are correctly set.`,
          advanced: `ALVR server running. Bitrate: ${data.headsetConnection.streamingBitrateMbps ?? 'not read'} Mbps. ALVR tips: (1) Use nightlies for latest codec improvements, (2) H.265/HEVC preferred for quality-per-bit, (3) Set encoder to NVENC if available, (4) If experiencing packet loss, reduce bitrate by 20% before adjusting anything else, (5) ALVR uses SteamVR as the runtime — ensure vrserver.exe is active.`
        }
      }
    }
  },

  {
    id: 'headset-wmr-active',
    category: 'vr-runtime',
    name: 'Windows Mixed Reality Headset Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'wmr') return null
      return {
        ruleId: 'headset-wmr-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: `Windows Mixed Reality (WMR) is active. WMR headsets (HP Reverb G2, Samsung Odyssey, Lenovo Explorer) are detected. For SteamVR games, make sure the "OpenXR Tools for Windows Mixed Reality" is installed and WMR is set as the OpenXR runtime.`,
          advanced: `WMR portal running. WMR headsets connect via USB 3.0 + DisplayPort. Performance tips: (1) Install OpenXR Tools for WMR for lowest-latency SteamVR access, (2) In WMR Portal → Settings → Headset display → 90Hz mode, (3) For HP Reverb G2: connect to CPU-direct USB (usually the Intel USB controller, not an expansion card), (4) Reprojection: WMR uses its own "motion reprojection" system separate from SteamVR's — disable SteamVR motion smoothing to avoid double-processing.`
        }
      }
    }
  },

  {
    id: 'headset-steamvr-wired-active',
    category: 'vr-runtime',
    name: 'SteamVR Wired Headset Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'steamvr-usb') return null
      return {
        ruleId: 'headset-steamvr-wired-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: `SteamVR is running with a wired headset${data.headsetConnection.detectedDeviceName ? ` (${data.headsetConnection.detectedDeviceName})` : ''}. Wired headsets offer the most reliable, lowest-latency connection. Make sure your DisplayPort/HDMI and USB cables are securely connected, and the headset is in the primary PCIe slot's USB controller.`,
          advanced: `SteamVR active | Device: ${data.headsetConnection.detectedDeviceName ?? 'not identified'}. SteamVR wired setup checklist: (1) Valve Index: DisplayPort + USB 3.0 to PC, verify lighthouse base stations have clear LOS, (2) HTC Vive/Pro: link box connected to DP + USB, (3) OpenXR: ensure SteamVR is set as default OpenXR runtime (SteamVR → Settings → OpenXR → Set SteamVR as OpenXR runtime), (4) Reprojection: configure per headset in SteamVR → Per-Application Video Settings.`
        }
      }
    }
  },

  {
    id: 'headset-psvr2-active',
    category: 'vr-runtime',
    name: 'PlayStation VR2 on PC Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.headsetConnection) return null
      if (data.headsetConnection.method !== 'psvr2-pc') return null
      return {
        ruleId: 'headset-psvr2-active',
        severity: 'ok',
        category: 'vr-runtime',
        explanation: {
          simple: 'PlayStation VR2 on PC is active. PSVR2 via the PC adapter requires USB 3.0 + DisplayPort 1.4, and the PlayStation VR2 PC app must be running. Eye tracking and adaptive triggers may require additional SteamVR plugins.',
          advanced: `PSVR2 PC adapter running. Requirements: USB 3.0 (≥5 Gbps) + DisplayPort 1.4 (≥25.92 Gbps). The PSVR2 PC adapter does not support eye-tracked foveated rendering on PC (PS5-exclusive feature). Headset tracking is inside-out. Compatible with SteamVR via OpenXR. Known limitations: no eye tracking in VR games (sensor inactive), haptic feedback via DualSense PC driver workaround only.`
        }
      }
    }
  },

  // The conflict data is populated by headset-connection.ts by enumerating
  // known troublemakers (RTSS, MSI Afterburner OSD, Special K, etc). One
  // rule surfaces them all with per-tool guidance instead of a rule-per-tool.
  {
    id: 'vr-overlay-conflict-active',
    category: 'vr-runtime',
    name: 'Conflicting Overlay / Injector Detected',
    evaluate: (data: ScanData): RuleResult | null => {
      const conflicts = data.headsetConnection?.activeConflicts ?? []
      if (conflicts.length === 0) return null

      // Highest per-tool severity wins for the overall finding
      const severity: 'warning' | 'info' =
        conflicts.some((c) => c.severity === 'warning') ? 'warning' : 'info'

      const names = conflicts.map((c) => c.label).join(', ')
      const simple =
        `These apps are running and are known to conflict with SteamVR: ${names}. ` +
        `They hook into the same DirectX presentation path SteamVR uses, which is the ` +
        `#1 documented cause of the SteamVR "Error 306/307" and "0xc0000409 stack buffer overrun" crashes. ` +
        `Either quit these apps before starting VR, or exclude SteamVR processes in their settings.`

      const advancedLines = [
        `Detected ${conflicts.length} conflict-prone process${conflicts.length !== 1 ? 'es' : ''} during scan:`,
        '',
      ]
      for (const c of conflicts) {
        advancedLines.push(`• ${c.label} (${c.process}) — ${c.severity}`)
        advancedLines.push(`    Why: ${c.reason}`)
        advancedLines.push(`    Fix: ${c.solution}`)
        advancedLines.push('')
      }
      advancedLines.push(
        `Cross-reference with any SteamVR crash events in the vr-runtime category — ` +
        `if you see "0xc0000005", "0xc0000409", or "Error 306/307" with the same timestamps, ` +
        `these tools are almost certainly the trigger.`
      )

      return {
        ruleId: 'vr-overlay-conflict-active',
        severity,
        category: 'vr-runtime',
        explanation: {
          simple,
          advanced: advancedLines.join('\n'),
        },
      }
    },
  },

  // Not a "problem" — surfacing detected tools so the user knows the app sees
  // them. Silence-on-absence: if none are running, this rule never fires.
  {
    id: 'vr-companion-apps-detected',
    category: 'vr-runtime',
    name: 'VR Companion Apps Running',
    evaluate: (data: ScanData): RuleResult | null => {
      const apps = data.headsetConnection?.companionApps ?? []
      if (apps.length === 0) return null

      const byCategory: Record<string, string[]> = {}
      for (const a of apps) {
        byCategory[a.category] = byCategory[a.category] ?? []
        byCategory[a.category].push(a.label)
      }

      const formatted = Object.entries(byCategory)
        .map(([cat, list]) => `${cat}: ${list.join(', ')}`)
        .join(' | ')

      return {
        ruleId: 'vr-companion-apps-detected',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple:
            `Detected ${apps.length} VR companion app${apps.length !== 1 ? 's' : ''} running: ` +
            apps.map((a) => a.label).join(', ') +
            `. This is informational only — these tools work alongside VR and don't cause conflicts.`,
          advanced:
            `Running VR companion processes grouped by category:\n  ${formatted}\n\n` +
            `Companion apps are tracked separately from runtime/streaming processes and from ` +
            `known-conflict apps. If a CAP appears to cause issues (high CPU, stutters tied to ` +
            `its usage), surface it from the Live Optimizer's Protected Apps list to ensure it ` +
            `isn't accidentally throttled.`,
        },
      }
    },
  },
]
