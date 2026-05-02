// VR Optimization Suite — Process Enumeration Utilities
// See CODING-RULES-DICTIONARY.md Section 13: Process Management

import psList from 'ps-list'
import type { ProcessInfo } from '../scanner/types'

// ── VR Process Classification ────────────────────────────────

/** Processes critical to VR runtime operation */
export const VR_CRITICAL_PROCESSES = new Set([
  'vrserver', 'vrcompositor', 'vrmonitor', 'vrdashboard', 'vrstartup',
  'oculusclient', 'oculusdash', 'oculusserver', 'ovrserver_x64', 'ovrservicehost',
  'virtualdesktop.streamer', 'virtualdesktop.service',
  'steamvr_vrcompositor', 'steamvr_vrserver',
  'vrserver_watchdog',
  'picoconnect', 'picolink',
  'alvr_dashboard', 'alvr_vrcompositor_wrapper',
  'steam_link_vr'
])

/** VR overlay processes */
export const VR_OVERLAY_PROCESSES = new Set([
  'xsoverlay', 'fpsvr', 'ovr_advanced_settings', 'ovradvancedsettings',
  'desktop+', 'desktopplus', 'ovrtoolkit', 'openvrnotificationpipe',
  'sidequest'
])

/** VR tracking add-on processes */
export const VR_TRACKING_PROCESSES = new Set([
  'vrcfacetracking', 'slimevr', 'slimevr-server', 'babyfacetracker',
  'opentrack', 'driver_lighthouse', 'steamtours'
])

/** Streaming / recording processes */
export const STREAMING_PROCESSES = new Set([
  'obs64', 'obs32', 'obs-browser-page',
  'medal', 'medalruntimehost',
  'nvcontainer', 'nvspcaps64', 'shadowplay',
  'streamlabs', 'streamlabs-obs',
  'twitch-studio'
])

/** Audio processing that can impact VR performance */
export const AUDIO_PROCESSES = new Set([
  'voicemeeter', 'voicemeeter8', 'voicemeeter8x64', 'voicemeeterpro',
  'voicemod', 'voicemoddesktop',
  'audiodg', 'audiodevicecmdlets'
])

/** Anti-cheat kernel drivers and services that add interrupt overhead during VR */
export const ANTI_CHEAT_PROCESSES = new Set([
  'easyanticheat', 'easyanticheat_eos', 'eaclauncher',
  'beservice', 'battleye',
  'vgc', 'vgtray',
  'faceit',
  'esea_client', 'esea',
  'equ8', 'nprotect', 'npggnt'
])

/** RGB / peripheral management software that polls USB devices and syncs lighting */
export const PERIPHERAL_SOFTWARE_PROCESSES = new Set([
  'icue',
  'lghub', 'lcore', 'logioptions',
  'armorycrate.usersessionhelper', 'armourycrate.usersessionhelper',
  'armourycratservice',
  'rzsdkservice', 'razer synapse', 'razersynapse', 'rzagent',
  'steelseriesggclient', 'steelseriesengine',
  'msicenter', 'msicenterlauncher', 'dragoncenter',
  'nahimicservice', 'nahimicsvc',
  'signalrgb',
  'openrgb',
  'jlink'
])

/** Known bloatware that wastes resources during VR sessions */
export const BLOAT_PROCESSES = new Set([
  'searchhost', 'searchindexer', 'cortana',
  'gamebar', 'gamebarftserver', 'gamebarpresencewriter', 'gameinputsvc',
  'widgets', 'widgetservice',
  'onedrive', 'onedrivesetup',
  'yourphone', 'phoneexperiencehost',
  'msedge', 'msedgewebview2',
  'teams', 'msteams',
  'spotify', 'spotifyweb',
  'discord',
  'skype', 'skypeapp',
  'dropbox',
  'icloud', 'iclouddrive',
  'googledrivesync', 'googledrivefs',
  'steelseriesgg', 'steelseriesengine',
  'razercentral', 'razersynapse', 'razersynapse3',
  'icue', 'corsairservice',
  'logitechg_hub', 'lghub', 'lghub_agent',
  'nahimic', 'nahimicservice'
])

/** VR software ecosystem processes (for detection, not classification as bloat) */
export const VR_SOFTWARE_ECOSYSTEM = {
  coreRuntimes: new Set([
    'steamvr', 'vrserver', 'vrcompositor',
    'oculusclient', 'ovrserver_x64',
    'mixedrealityportal', 'wmr'
  ]),
  headsetHubs: new Set([
    'viveconsole', 'htcviveport', 'viveportdesktopservice',
    'pitool', 'pimax_play', 'pimaxclient',
    'picoconnect', 'pico4pcstreamer',
    'ps_remote_play'
  ]),
  wirelessStreaming: new Set([
    'virtualdesktop.streamer', 'virtualdesktop.service',
    'alvr_dashboard',
    'steam_link_vr',
    'picoconnect'
  ]),
  overlays: new Set([
    'fpsvr', 'xsoverlay', 'ovrtoolkit', 'desktop+'
  ]),
  streaming: new Set([
    'obs64', 'medal', 'shadowplay', 'streamlabs'
  ]),
  trackingAudio: new Set([
    'slimevr', 'vrcfacetracking', 'voicemeeter', 'voicemod'
  ]),
  virtualization: new Set([
    'vmms', 'vmwp', 'vmcompute', // Hyper-V
    'virtualboxvm', 'vboxsvc', // VirtualBox
    'wslservice', 'wsl' // WSL2
  ])
}

// ── Process Enumeration ──────────────────────────────────────

/**
 * Get all running processes with basic info.
 *
 * ps-list on Windows is intentionally minimal: pid, name, ppid only. Memory
 * usage, handle counts, CPU% and priority are not exposed. Rules that depend
 * on ramMB / handles will see zero — preferable to keeping a Get-Process
 * fallback that doubles process-enumeration latency on every scan.
 */
export async function enumerateProcesses(): Promise<ProcessInfo[]> {
  try {
    const procs = await psList()
    return procs.map((p) => {
      return {
        name: (p.name ?? '').toLowerCase(),
        pid: p.pid ?? 0,
        cpuPercent: 0,
        ramMB: 0,
        gpuIndex: null,
        affinity: 0,
        priority: 'Normal',
        handles: 0,
        gdiObjects: null,
      }
    })
  } catch (error) {
    console.error('[utils:process] Failed to enumerate processes:', (error as Error).message)
    return []
  }
}

/**
 * Classify a list of processes into VR-relevant categories.
 */
export function classifyProcesses(all: ProcessInfo[]): {
  vrCritical: ProcessInfo[]
  vrOverlay: ProcessInfo[]
  vrTracking: ProcessInfo[]
  streaming: ProcessInfo[]
  bloat: ProcessInfo[]
  antiCheat: ProcessInfo[]
  peripheralSoftware: ProcessInfo[]
  audio: ProcessInfo[]
} {
  const vrCritical: ProcessInfo[] = []
  const vrOverlay: ProcessInfo[] = []
  const vrTracking: ProcessInfo[] = []
  const streaming: ProcessInfo[] = []
  const bloat: ProcessInfo[] = []
  const antiCheat: ProcessInfo[] = []
  const peripheralSoftware: ProcessInfo[] = []
  const audio: ProcessInfo[] = []

  for (const proc of all) {
    const name = proc.name.toLowerCase().replace('.exe', '')

    if (VR_CRITICAL_PROCESSES.has(name)) {
      vrCritical.push(proc)
    } else if (VR_OVERLAY_PROCESSES.has(name)) {
      vrOverlay.push(proc)
    } else if (VR_TRACKING_PROCESSES.has(name)) {
      vrTracking.push(proc)
    } else if (STREAMING_PROCESSES.has(name)) {
      streaming.push(proc)
    } else if (AUDIO_PROCESSES.has(name)) {
      audio.push(proc)
    } else if (ANTI_CHEAT_PROCESSES.has(name)) {
      antiCheat.push(proc)
    } else if (PERIPHERAL_SOFTWARE_PROCESSES.has(name)) {
      peripheralSoftware.push(proc)
    } else if (BLOAT_PROCESSES.has(name)) {
      bloat.push(proc)
    }
  }

  return { vrCritical, vrOverlay, vrTracking, streaming, bloat, antiCheat, peripheralSoftware, audio }
}
