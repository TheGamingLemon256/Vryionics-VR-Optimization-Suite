// VR Optimization Suite — VR Runtime Diagnostic Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData, VrCrashSignature, VrCrashEvent } from '../../scanner/types'

// ── Crash-signature guidance table ────────────────────────────
// For each known signature, we provide:
//   - a short human-readable label (used in summary text)
//   - severity (error codes that usually indicate a real software bug are 'warning',
//     merely suspicious lines are 'info')
//   - actionable guidance explaining what to check
const CRASH_SIGNATURE_INFO: Record<
  VrCrashSignature,
  { label: string; severity: 'warning' | 'info'; guidance: string }
> = {
  'access-violation': {
    label: 'access violation (0xc0000005)',
    severity: 'warning',
    guidance:
      'This exception is almost always caused by a third-party SteamVR driver or overlay hooking into the wrong memory. ' +
      'Known offenders: Natural Locomotion, older XSOverlay builds, unofficial face-tracking drivers, abandoned motion-smoothing mods. ' +
      'Fix: open %ProgramFiles(x86)%\\Steam\\steamapps\\common\\SteamVR\\drivers and temporarily remove any non-default driver folders ' +
      '(keep only the vendor driver for your headset). Relaunch SteamVR and see if the crashes stop.',
  },
  'stack-overflow': {
    label: 'stack buffer overrun (0xc0000409)',
    severity: 'warning',
    guidance:
      'This is usually an overlay or injector conflict — two programs both trying to hook the SteamVR compositor\'s presentation path. ' +
      'Most common triggers: RivaTuner Statistics Server, MSI Afterburner overlay, Discord overlay, Steam in-game overlay, antivirus hooks. ' +
      'Fix: disable all overlays one at a time and retest; Special K and RTSS in particular are known to fight SteamVR.',
  },
  'overlay-conflict': {
    label: 'overlay hooking error (306/307)',
    severity: 'warning',
    guidance:
      'SteamVR reported that a DirectX presentation hook conflicted with its compositor. This usually means MSI Afterburner / RTSS, ' +
      'Special K, NVIDIA Overlay, Discord Overlay, or a streaming overlay (OBS browser capture) is intercepting frames. ' +
      'Fix: temporarily disable all overlays, then re-enable them one at a time.',
  },
  'init-failure': {
    label: 'SteamVR runtime init failed (108/109/300/301)',
    severity: 'warning',
    guidance:
      'SteamVR failed to start cleanly. Most frequent causes: stale vrserver.exe/vrcompositor.exe from a previous session still running ' +
      '(kill via Task Manager, then fully exit Steam), missing or corrupted headset drivers, or USB/DisplayPort cable not fully seated. ' +
      'If this persists, run "Remove all SteamVR USB devices" from SteamVR → Settings → Developer.',
  },
  'shared-ipc': {
    label: 'shared IPC compositor failure (Error 309)',
    severity: 'warning',
    guidance:
      'Error 309 means the SteamVR compositor\'s shared memory channel couldn\'t be established. Typical causes: previous session didn\'t ' +
      'close cleanly, Windows has locked the shared memory segment, or a 3rd-party overlay is holding a handle. ' +
      'Fix: kill vrserver.exe, vrcompositor.exe, vrmonitor.exe in Task Manager, fully exit Steam, and relaunch.',
  },
  'driver-mismatch': {
    label: 'SteamVR driver load failure',
    severity: 'warning',
    guidance:
      'A SteamVR driver plugin failed to load — usually because it was built against an older SteamVR API. ' +
      'Check for outdated third-party drivers in %ProgramFiles(x86)%\\Steam\\steamapps\\common\\SteamVR\\drivers and update or remove them.',
  },
  'gpu-crash': {
    label: 'GPU device-removed (TDR)',
    severity: 'warning',
    guidance:
      'Your GPU hung and Windows had to reset it (DXGI_ERROR_DEVICE_REMOVED / nvlddmkm). ' +
      'For VR specifically this usually means: driver too new/buggy for your GPU generation, insufficient PSU headroom under transient spikes, ' +
      'or VRAM exhaustion from an extreme supersampling value. Try rolling back to the previous WHQL driver and lowering SS to 100%.',
  },
  'unknown': {
    label: 'unhandled exception / fatal error',
    severity: 'info',
    guidance:
      'SteamVR logged a generic fatal-error line. Check the SteamVR log folder (%ProgramFiles(x86)%\\Steam\\logs) for the full stack ' +
      'and search the exception address or module name — most crashes point directly to the guilty DLL.',
  },
}

function topCrashSignatures(events: VrCrashEvent[]): Array<{ sig: VrCrashSignature; count: number }> {
  const counts = new Map<VrCrashSignature, number>()
  for (const e of events) counts.set(e.signature, (counts.get(e.signature) ?? 0) + 1)
  return [...counts.entries()]
    .map(([sig, count]) => ({ sig, count }))
    .sort((a, b) => b.count - a.count)
}

function formatRelative(ms: number): string {
  const delta = Date.now() - ms
  const hours = Math.round(delta / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

export const vrRuntimeRules: Rule[] = [
  {
    id: 'vr-no-runtime-detected',
    category: 'vr-runtime',
    name: 'No VR Runtime Installed',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime) return null
      const { steamvrInstalled, oculusInstalled, wmrInstalled } = data.vrRuntime
      if (steamvrInstalled || oculusInstalled || wmrInstalled) return null
      return {
        ruleId: 'vr-no-runtime-detected',
        severity: 'critical',
        category: 'vr-runtime',
        explanation: {
          simple: 'No VR software (SteamVR, Meta Quest software, or Windows Mixed Reality) was detected on your PC. You need at least one VR runtime installed to use a PC VR headset.',
          advanced: 'Neither SteamVR, Oculus PC software, nor Windows Mixed Reality Portal detected. No VR runtime means no OpenXR provider is available. Install the appropriate runtime for your headset: SteamVR (Steam → Library → Tools) for Index/Vive/Pimax/Beyond, Meta Quest Link app (meta.com/quest/setup) for Quest series, WMR Portal from Microsoft Store for HP Reverb/WMR headsets.'
        }
      }
    }
  },
  {
    id: 'steamvr-supersampling-excessive',
    category: 'vr-runtime',
    name: 'SteamVR Supersampling Too High',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime) return null
      const ss = data.vrRuntime.supersampling
      if (ss === null || ss <= 1.5) return null
      // Only flag if GPU is actually struggling
      const gpuUtil = data.gpu?.devices[0]?.utilization ?? 0
      if (gpuUtil < 80) return null
      return {
        ruleId: 'steamvr-supersampling-excessive',
        severity: 'warning',
        category: 'vr-runtime',
        explanation: {
          simple: `SteamVR is rendering at ${(ss * 100).toFixed(0)}% resolution — significantly higher than native. While this makes things sharper, your GPU is struggling to keep up, causing frame drops. Lower it to 100-120% for smooth gameplay.`,
          advanced: `SteamVR render resolution multiplier: ${ss.toFixed(2)}× (${(ss * 100).toFixed(0)}% SS). GPU utilization: ${gpuUtil.toFixed(1)}% — GPU is the bottleneck. At ${ss.toFixed(2)}× SS, you're rendering ${(ss * ss * 100).toFixed(0)}% of the pixels vs native. Reduce to 1.0× (100%) for GPU-bound situations. The sweet spot is the highest SS where GPU stays below ~85% utilization. Configure in SteamVR → Settings → Video → Render Resolution.`
        }
      }
    }
  },
  {
    id: 'steamvr-motion-smoothing-off',
    category: 'vr-runtime',
    name: 'SteamVR Motion Smoothing Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime) return null
      if (data.vrRuntime.motionSmoothingEnabled !== false) return null
      return {
        ruleId: 'steamvr-motion-smoothing-off',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple: 'SteamVR Motion Smoothing is turned off. Motion Smoothing fills in frames when your PC can\'t keep up, preventing hard drops to half framerate. For most users, having it on is safer and more comfortable.',
          advanced: `SteamVR Motion Smoothing: disabled. When enabled, Motion Smoothing synthesizes intermediate frames using reprojection when the GPU misses its frame deadline, maintaining apparent refresh rate at 50% GPU cost. Disable only if you have a consistently capable GPU (>98% of frames under budget) and want to avoid any reprojection artifacts. Enable in SteamVR → Settings → Video → Motion Smoothing.`
        }
      }
    }
  },
  {
    id: 'openxr-suboptimal-runtime',
    category: 'vr-runtime',
    name: 'OpenXR Runtime May Not Be Optimal',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime) return null
      if (!data.vrRuntime.activeRuntime) return null
      // Quest/Oculus users using SteamVR OpenXR when they should use Oculus OpenXR
      const isOculusUser = data.vrRuntime.oculusInstalled
      const usingSteamVrOpenXr = data.vrRuntime.activeRuntime === 'steamvr'
      if (!isOculusUser || !usingSteamVrOpenXr) return null
      return {
        ruleId: 'openxr-suboptimal-runtime',
        severity: 'info',
        category: 'vr-runtime',
        explanation: {
          simple: 'You have a Meta Quest headset but VR games are using SteamVR\'s OpenXR runtime instead of Meta\'s. Using the Meta OpenXR runtime is typically faster and has lower latency for Quest games over Link/Air Link.',
          advanced: `Active OpenXR runtime: ${data.vrRuntime.openxrRuntime ?? 'SteamVR'}. Meta Quest users with Oculus PC software installed should use the Oculus OpenXR runtime for native Quest Link/Air Link apps. Set via Oculus PC app → Settings → General → Set Oculus as active OpenXR runtime. Meta's runtime has lower overhead than SteamVR for OpenXR titles when using Oculus connection methods (5-15% frame time improvement typical).`
        }
      }
    }
  },

  // ── Recent SteamVR crash / fatal-error analysis ──────────────
  {
    id: 'vr-recent-crashes',
    category: 'vr-runtime',
    name: 'Recent SteamVR Crashes or Fatal Errors Detected',
    evaluate: (data: ScanData): RuleResult | null => {
      const events = data.vrRuntime?.crashEvents
      if (!events || events.length === 0) return null

      const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp)
      const mostRecent = sorted[0]
      const topSignatures = topCrashSignatures(sorted)
      const primarySig = topSignatures[0].sig
      const primaryInfo = CRASH_SIGNATURE_INFO[primarySig]

      // Severity escalation: 3+ recent events of the same signature = warning,
      // otherwise fall back to the per-signature default
      const severity: 'warning' | 'info' =
        topSignatures[0].count >= 3 ? 'warning' : primaryInfo.severity

      const signatureBreakdown = topSignatures
        .map(({ sig, count }) => `${CRASH_SIGNATURE_INFO[sig].label} ×${count}`)
        .join(', ')

      const sourceBreakdown = [...new Set(sorted.map((e) => e.source))].join(', ')

      // Simple explanation: concise, action-focused
      const simple =
        `SteamVR's log files show ${sorted.length} crash/fatal-error event${sorted.length !== 1 ? 's' : ''} ` +
        `in the last 7 days — most recent: ${formatRelative(mostRecent.timestamp)}. ` +
        `The dominant pattern is "${primaryInfo.label}". ` +
        primaryInfo.guidance

      // Advanced: include the raw signature counts and the most recent excerpt
      const advanced =
        `Recent crash / fatal-error events parsed from SteamVR log files:\n\n` +
        `  Total: ${sorted.length} event${sorted.length !== 1 ? 's' : ''} across logs: ${sourceBreakdown}\n` +
        `  Signatures (most-common first): ${signatureBreakdown}\n\n` +
        `Most recent event:\n` +
        `  When:      ${new Date(mostRecent.timestamp).toLocaleString()}\n` +
        `  Source:    ${mostRecent.source}.txt\n` +
        `  Signature: ${CRASH_SIGNATURE_INFO[mostRecent.signature].label}\n` +
        `  Excerpt:   ${mostRecent.excerpt}\n\n` +
        `Guidance for "${primaryInfo.label}":\n${primaryInfo.guidance}\n\n` +
        `Full logs: %ProgramFiles(x86)%\\Steam\\logs\\ — open ${mostRecent.source}.txt and search for the excerpt above to see the full stack.`

      return {
        ruleId: 'vr-recent-crashes',
        severity,
        category: 'vr-runtime',
        explanation: { simple, advanced },
      }
    },
  },
]
