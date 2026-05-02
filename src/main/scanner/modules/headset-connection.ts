// VR Optimization Suite — Headset Connection Detection Module
//
// Determines whether a VR headset is currently connected to the PC and HOW it
// is connected (wired USB, AirLink, Virtual Desktop, ALVR, SteamVR wired, WMR, etc.)
//
// Detection signals used (no SDK dependencies):
//  1. Running processes   — OVRServer, vrserver, PicoConnect, ALVR, VD Streamer, etc.
//  2. USB device list     — Quest appears as Android composite, Valve Index as HID device
//  3. Registry presence   — Oculus device registry, SteamVR device list
//  4. App config files    — Virtual Desktop streamer config, ALVR session config

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { enumerateProcesses } from '../../utils/process'
import { readKey } from '../../utils/registry-read'
import { enumerateRegistrySubkeys } from '../../utils/registry'
import type {
  ScanModuleResult,
  HeadsetConnectionData,
  HeadsetConnectionMethod,
  VrCompanionEntry,
  VrConflictEntry,
} from '../types'


// Maps process name → what it means (in priority order)
const VR_PROCESS_MAP: Record<string, { method: HeadsetConnectionMethod; label: string }> = {
  // Meta / Oculus
  'OVRServer_x64':      { method: 'airlink', label: 'Meta VR Runtime (PCVR)' },
  'OculusClient':       { method: 'airlink', label: 'Meta Quest Link / Air Link' },
  'OVRServiceLauncher': { method: 'airlink', label: 'Meta VR Service' },
  'OculusDash':         { method: 'airlink', label: 'Oculus Dashboard' },

  // Meta Link via USB specifically (OVRServer + specific USB device = Link, else AirLink)
  // → resolved in combination logic below

  // Virtual Desktop
  'VirtualDesktop.Streamer': { method: 'virtual-desktop', label: 'Virtual Desktop Streamer' },
  'VirtualDesktop.Server':   { method: 'virtual-desktop', label: 'Virtual Desktop Server' },

  // ALVR (Air Light VR - open source)
  'ALVR':        { method: 'alvr', label: 'ALVR Wireless Streamer' },
  'alvr_server': { method: 'alvr', label: 'ALVR Server' },
  'ALVRServer':  { method: 'alvr', label: 'ALVR Server' },
  'ALVRDashboard': { method: 'alvr', label: 'ALVR Dashboard' },

  // SteamVR (wired headsets: Index, Vive, Vive Pro, etc.)
  'vrserver':     { method: 'steamvr-usb', label: 'SteamVR Runtime' },
  'vrcompositor': { method: 'steamvr-usb', label: 'SteamVR Compositor' },
  'vrdashboard':  { method: 'steamvr-usb', label: 'SteamVR Dashboard' },
  'vrmonitor':    { method: 'steamvr-usb', label: 'SteamVR Monitor' },
  'vrwebhelper':  { method: 'steamvr-usb', label: 'SteamVR Web Helper' },

  // Pico
  'PicoConnect':                        { method: 'usb-link', label: 'Pico Connect' },
  'PicoLink':                           { method: 'usb-link', label: 'Pico Link' },
  'com.picovr.vrstreamingassistant':    { method: 'usb-link', label: 'Pico VR Streaming Assistant' },
  'Pico Streaming Assistant':           { method: 'usb-link', label: 'Pico Streaming Assistant' },

  // HTC VIVE Streaming (added Phase 4 — was completely missing)
  'VIVEStreamingLauncher':    { method: 'airlink', label: 'VIVE Streaming Launcher' },
  'VIVEStreamingClient':      { method: 'airlink', label: 'VIVE Streaming Client' },
  'VIVEConsole':              { method: 'steamvr-usb', label: 'VIVE Console (SteamVR)' },
  'VIVEBusinessStreamingClient': { method: 'airlink', label: 'VIVE Business Streaming' },

  // Varjo (added Phase 4)
  'VarjoService':    { method: 'steamvr-usb', label: 'Varjo Service' },
  'Varjo.Base':      { method: 'steamvr-usb', label: 'Varjo Base' },
  'VarjoRuntime':    { method: 'steamvr-usb', label: 'Varjo Runtime' },

  // Pimax
  'PimaxClient':     { method: 'steamvr-usb', label: 'Pimax Client' },
  'PimaxXR':         { method: 'steamvr-usb', label: 'PimaxXR (Pimax OpenXR runtime)' },

  // Windows Mixed Reality
  'MixedRealityPortal':  { method: 'wmr', label: 'Windows Mixed Reality Portal' },
  'holographicshell':    { method: 'wmr', label: 'Holographic Shell' },
  'SettingsHandlerForXR': { method: 'wmr', label: 'WMR Settings' },

  // PlayStation VR2 on PC
  'PSVR2App': { method: 'psvr2-pc', label: 'PlayStation VR2 App' },
  'PSVR2':    { method: 'psvr2-pc', label: 'PlayStation VR2' },

  // Steam Link (standalone + Steam Link VR)
  'SteamLink':    { method: 'steam-link-vr', label: 'Steam Link' },
  'steamlinkvr':  { method: 'steam-link-vr', label: 'Steam Link VR' },

  // Moonlight / Sunshine — used for low-latency game streaming incl. VR-ready setups
  'Moonlight':    { method: 'alvr', label: 'Moonlight (GameStream client)' },
  'sunshine':     { method: 'alvr', label: 'Sunshine (self-hosted GameStream host)' },

  // iVRy (iPhone as VR headset via streaming)
  'iVRyServer':   { method: 'alvr', label: 'iVRy Server (iPhone as VR HMD)' },
}

// These are NOT connection methods, but ARE relevant context — they reveal
// what the user has running alongside VR. Detected separately so rules can
// reason about them independently.
const VR_COMPANION_SIGNATURES: Array<{ process: string; label: string; category: 'overlay' | 'dashboard' | 'tracking' | 'haptic' | 'utility' }> = [
  // Overlays
  { process: 'OVRToolkit',         label: 'OVR Toolkit',                  category: 'overlay' },
  { process: 'XSOverlay',          label: 'XSOverlay',                    category: 'overlay' },
  { process: 'OpenVR-SpaceCalibrator', label: 'OpenVR Space Calibrator',  category: 'utility' },
  { process: 'OpenKneeboardApp',   label: 'OpenKneeboard',                category: 'overlay' },
  { process: 'fpsVR',              label: 'fpsVR',                        category: 'utility' },
  { process: 'OVRDrop',            label: 'OVR Drop',                     category: 'overlay' },
  { process: 'OVRLocomotion',      label: 'OVR Locomotion',               category: 'utility' },

  // Dashboards / tweak tools
  { process: 'AdvancedSettings',   label: 'OVR Advanced Settings',        category: 'dashboard' },
  { process: 'OpenVR-AdvancedSettings', label: 'OpenVR Advanced Settings', category: 'dashboard' },

  // Tracking / avatar tools
  { process: 'SlimeVR',            label: 'SlimeVR Server (body tracking)', category: 'tracking' },
  { process: 'VRChat',             label: 'VRChat',                       category: 'utility' },
  { process: 'VRCFaceTracking',    label: 'VRCFaceTracking',              category: 'tracking' },
  { process: 'VRCOSC',             label: 'VRCOSC',                       category: 'utility' },
  { process: 'VRCX',               label: 'VRCX',                         category: 'utility' },
  { process: 'VSeeFace',           label: 'VSeeFace (face tracking)',     category: 'tracking' },
  { process: 'vmc4ue',             label: 'VMC4UE (VMC receiver)',        category: 'utility' },
  { process: 'opentrack',          label: 'OpenTrack (head tracking)',    category: 'tracking' },
  { process: 'driver4vr',          label: 'Driver4VR',                    category: 'tracking' },
  { process: 'psmoveservice',      label: 'PSMove Service',               category: 'tracking' },

  // Haptic suits
  { process: 'bhaptics_player',    label: 'bHaptics Player',              category: 'haptic' },
  { process: 'bHapticsPlayer',     label: 'bHaptics Player',              category: 'haptic' },

  // OpenXR runtimes / layers
  { process: 'OpenXR-Toolkit-Companion', label: 'OpenXR Toolkit Companion', category: 'utility' },

  // Oyasumi (sleep-mode utility for VRChat)
  { process: 'OyasumiVR',          label: 'Oyasumi VR',                   category: 'utility' },
]

// These hook into the DirectX presentation path — SteamVR also controls that
// path and reacts badly. Proactively warning the user beats triaging an
// Error 306 / 0xc0000409 crash after the fact.
const CONFLICT_SIGNATURES: Array<{ process: string; label: string; severity: 'warning' | 'info'; reason: string; solution: string }> = [
  {
    process: 'RTSS',
    label: 'RivaTuner Statistics Server',
    severity: 'warning',
    reason: 'RTSS hooks DirectX presentation to render overlays. SteamVR frequently crashes with Error 306/307 or 0xc0000409 when RTSS is active during VR.',
    solution: 'Add SteamVR\'s vrserver.exe, vrcompositor.exe, and your VR game .exe to RTSS\'s exclusion list (Settings → Application Detection Level → use profile overrides for these .exes to disable overlay). Or quit RTSS before launching VR.',
  },
  {
    process: 'MSIAfterburner',
    label: 'MSI Afterburner',
    severity: 'warning',
    reason: 'MSI Afterburner bundles RTSS for its on-screen display. When the OSD is enabled, it carries the same SteamVR overlay conflict.',
    solution: 'MSI Afterburner → Settings → Monitoring → disable the On-Screen Display for VR sessions. The underlying monitoring still works for HWINFO/fpsVR.',
  },
  {
    process: 'SKIF',
    label: 'Special K (Injection Frontend)',
    severity: 'warning',
    reason: 'Special K\'s injector hooks most game processes by default. SteamVR\'s compositor reacts unpredictably; known cause of exception 0xc0000005.',
    solution: 'Special K → Global Injection → set to Whitelist mode and exclude vrserver.exe, vrcompositor.exe, and VR game executables.',
  },
  {
    process: 'NVIDIA Overlay',
    label: 'NVIDIA GeForce Overlay',
    severity: 'info',
    reason: 'NVIDIA\'s in-game overlay (ShadowPlay / Instant Replay) hooks the presentation path and can cause intermittent VR frame pacing issues.',
    solution: 'GeForce Experience → Settings → toggle "In-Game Overlay" OFF for VR sessions. ShadowPlay still works via hotkey without the overlay enabled.',
  },
  {
    process: 'Discord',
    label: 'Discord Overlay',
    severity: 'info',
    reason: 'Discord\'s in-game overlay occasionally triggers SteamVR compositor errors on launch, though it rarely causes mid-session crashes.',
    solution: 'Discord → User Settings → Game Overlay → disable "Enable in-game overlay" if you see SteamVR initialization failures.',
  },
  {
    process: 'obs64',
    label: 'OBS Studio (with Game Capture)',
    severity: 'info',
    reason: 'OBS\'s Game Capture source hooks rendering — if pointed at a VR app, it can cause compositor stalls. Window Capture and Display Capture are safe.',
    solution: 'For VR streaming, use OBS Window Capture or Display Capture pointed at SteamVR\'s mirror window. Avoid Game Capture for the VR process itself.',
  },
  {
    process: 'GamePass',
    label: 'Xbox Game Bar',
    severity: 'info',
    reason: 'Xbox Game Bar\'s DVR recording path can conflict with SteamVR\'s encoder scheduling.',
    solution: 'Windows Settings → Gaming → Xbox Game Bar → toggle off. For recording, use OBS or NVIDIA ShadowPlay instead.',
  },
]


const VR_USB_SIGNATURES = [
  // Meta Quest (appears as Android composite device)
  { pattern: /Oculus|Meta Quest|Quest 2|Quest 3|Quest Pro/i, device: 'Meta Quest' },
  // Valve Index (appears as custom HID + display)
  { pattern: /Valve Index/i, device: 'Valve Index' },
  // HTC Vive / Vive Pro
  { pattern: /HTC Vive|VIVE/i, device: 'HTC Vive' },
  // HP Reverb / WMR generic
  { pattern: /HP Reverb|Mixed Reality|Holographic/i, device: 'HP Reverb / WMR' },
  // Pico
  { pattern: /Pico 4|PICO|Picovr/i, device: 'Pico' },
  // Pimax
  { pattern: /Pimax|PVR/i, device: 'Pimax' },
  // Sony PSVR2
  { pattern: /PlayStation VR|PSVR/i, device: 'Sony PSVR2' },
  // Bigscreen Beyond
  { pattern: /Bigscreen Beyond/i, device: 'Bigscreen Beyond' },
]


const USB_CONTROLLER_QUALITY: Record<string, { gen: string; good: boolean }> = {
  'ASMedia': { gen: '3.1/3.2', good: true },
  'Intel USB 3': { gen: '3.x', good: true },
  'AMD USB 3': { gen: '3.x', good: true },
  'Renesas': { gen: '3.0', good: true },
  'VIA USB': { gen: '2.0', good: false },
  'Fresco Logic': { gen: '3.0', good: true },
}


/**
 * Match a running-process name list against a set of canonical signatures.
 * enumerateProcesses normalises to lowercase and strips no extension, so we
 * compare against lowercased signatures.
 */
function matchProcesses(running: Set<string>, candidates: string[]): string[] {
  const hits: string[] = []
  for (const c of candidates) {
    const lowered = c.toLowerCase()
    if (running.has(lowered) || running.has(`${lowered}.exe`)) hits.push(c)
  }
  return hits
}

function getRunningVrProcesses(running: Set<string>): string[] {
  return matchProcesses(running, Object.keys(VR_PROCESS_MAP))
}

function getRunningCompanionApps(running: Set<string>): VrCompanionEntry[] {
  return VR_COMPANION_SIGNATURES
    .filter(s => running.has(s.process.toLowerCase()) || running.has(`${s.process.toLowerCase()}.exe`))
    .map(s => ({ process: s.process, label: s.label, category: s.category }))
}

/**
 * Detect known SteamVR-conflicting processes currently running. We prefix-match
 * because tools like RTSS spawn helper processes (RTSSHooksLoader64) and we
 * want to catch the whole family without enumerating every variant.
 */
function getActiveConflicts(running: Set<string>): VrConflictEntry[] {
  const hits: VrConflictEntry[] = []
  for (const sig of CONFLICT_SIGNATURES) {
    const prefix = sig.process.toLowerCase()
    let matched = false
    for (const r of running) {
      if (r.startsWith(prefix)) { matched = true; break }
    }
    if (matched) {
      hits.push({
        process: sig.process,
        label: sig.label,
        severity: sig.severity,
        reason: sig.reason,
        solution: sig.solution,
      })
    }
  }
  return hits
}

interface UsbDeviceHit {
  name: string
  instanceId: string
}

async function getUsbVrDevices(): Promise<UsbDeviceHit[]> {
  const hits: UsbDeviceHit[] = []
  const familyPattern = /Oculus|Meta Quest|Vive|Index|Pico|Pimax|Mixed Reality|PSVR|Bigscreen|Holographic/i

  const families = enumerateRegistrySubkeys('HKLM', 'SYSTEM\\CurrentControlSet\\Enum\\USB')
  for (const family of families) {
    const instances = enumerateRegistrySubkeys('HKLM', `SYSTEM\\CurrentControlSet\\Enum\\USB\\${family}`)
    for (const instance of instances) {
      const path = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USB\\${family}\\${instance}`
      const key = await readKey(path).catch(() => null)
      if (!key) continue

      const friendly = key.values['FriendlyName']
      const devDesc = key.values['DeviceDesc']
      let name = ''
      if (friendly && friendly.type === 'REG_SZ') name = friendly.data
      else if (devDesc && devDesc.type === 'REG_SZ') {
        const semi = devDesc.data.lastIndexOf(';')
        name = semi >= 0 ? devDesc.data.slice(semi + 1) : devDesc.data
      }
      if (!name || !familyPattern.test(name)) continue

      hits.push({ name, instanceId: `USB\\${family}\\${instance}` })
    }
  }
  return hits
}

async function getUsbControllerInfo(): Promise<{ type: string; gen: string } | null> {
  // Walk PCI for USB host controllers — Service is usbxhci on USB3, usbehci on USB2.
  const pciFamilies = enumerateRegistrySubkeys('HKLM', 'SYSTEM\\CurrentControlSet\\Enum\\PCI')
  for (const family of pciFamilies) {
    const instances = enumerateRegistrySubkeys('HKLM', `SYSTEM\\CurrentControlSet\\Enum\\PCI\\${family}`)
    for (const instance of instances) {
      const key = await readKey(`HKLM\\SYSTEM\\CurrentControlSet\\Enum\\PCI\\${family}\\${instance}`).catch(() => null)
      if (!key) continue

      const service = key.values['Service']
      const svc = service && service.type === 'REG_SZ' ? service.data.toLowerCase() : ''
      if (svc !== 'usbxhci' && svc !== 'usbehci') continue

      const friendly = key.values['FriendlyName']
      const devDesc = key.values['DeviceDesc']
      let name = ''
      if (friendly && friendly.type === 'REG_SZ') name = friendly.data
      else if (devDesc && devDesc.type === 'REG_SZ') {
        const semi = devDesc.data.lastIndexOf(';')
        name = semi >= 0 ? devDesc.data.slice(semi + 1) : devDesc.data
      }
      if (!name) continue

      for (const [keyword, info] of Object.entries(USB_CONTROLLER_QUALITY)) {
        if (name.includes(keyword)) return { type: name, gen: info.gen }
      }
      return { type: name, gen: svc === 'usbxhci' ? '3.x' : '2.0' }
    }
  }
  return null
}

/** Read Virtual Desktop streamer config to get bitrate */
function getVirtualDesktopBitrate(): number | null {
  const vdPaths = [
    join(process.env.LOCALAPPDATA ?? '', 'VirtualDesktop.Streamer', 'settings.json'),
    join(process.env.APPDATA ?? '', 'VirtualDesktop', 'settings.json')
  ]
  for (const p of vdPaths) {
    if (existsSync(p)) {
      try {
        const cfg = JSON.parse(readFileSync(p, 'utf8'))
        // VD stores bitrate in various fields depending on version
        const br = cfg.Bitrate ?? cfg.VideoSettings?.Bitrate ?? cfg.bitrate ?? null
        if (typeof br === 'number') return br
      } catch { /* ignore */ }
    }
  }
  return null
}

/** Read ALVR session config to get bitrate */
function getAlvrBitrate(): number | null {
  const alvrPaths = [
    join(process.env.APPDATA ?? '', 'ALVR', 'session.json'),
    'C:\\Program Files\\ALVR\\session.json'
  ]
  for (const p of alvrPaths) {
    if (existsSync(p)) {
      try {
        const cfg = JSON.parse(readFileSync(p, 'utf8'))
        const br = cfg.session_settings?.video?.encode_bitrate_mbs ??
                   cfg.settings?.video?.encode_bitrate_mbs ??
                   null
        if (typeof br === 'number') return br
      } catch { /* ignore */ }
    }
  }
  return null
}

function inferMetaConnectionMode(usbDevices: UsbDeviceHit[]): 'airlink' | 'usb-link' {
  // If OVRServer is running and Quest is listed as a connected USB device, the
  // session is using Link rather than Air Link.
  const questUsb = usbDevices.find(d => /Oculus|Meta Quest|Quest/i.test(d.name))
  return questUsb ? 'usb-link' : 'airlink'
}


export async function scanHeadsetConnection(): Promise<ScanModuleResult<HeadsetConnectionData>> {
  console.log('[scan:headset] Detecting VR headset connection...')

  try {
    const allProcs = await enumerateProcesses()
    const runningSet = new Set(allProcs.map(p => p.name))

    const [usbDevices, usbController] = await Promise.all([
      getUsbVrDevices(),
      getUsbControllerInfo(),
    ])

    const vrProcesses = getRunningVrProcesses(runningSet)
    const companionApps = getRunningCompanionApps(runningSet)
    const activeConflicts = getActiveConflicts(runningSet)

    console.log(`[scan:headset] VR processes: ${vrProcesses.join(', ') || 'none'}`)
    console.log(`[scan:headset] USB VR devices: ${usbDevices.map((d) => d.name).join(', ') || 'none'}`)

    let method: HeadsetConnectionMethod = 'none'
    let runtimeActive: string | null = null
    let detectedDeviceName: string | null = null

    // Priority order: specific streaming apps > generic runtimes
    if (vrProcesses.includes('VirtualDesktop.Streamer') || vrProcesses.includes('VirtualDesktop.Server')) {
      method = 'virtual-desktop'
      runtimeActive = 'oculus' // VD runs on top of Oculus runtime
    } else if (vrProcesses.includes('ALVR') || vrProcesses.includes('alvr_server') || vrProcesses.includes('ALVRServer')) {
      method = 'alvr'
      runtimeActive = 'steamvr'
    } else if (vrProcesses.includes('PicoConnect') || vrProcesses.includes('PicoLink')) {
      method = 'usb-link'
      runtimeActive = 'pico'
    } else if (vrProcesses.includes('MixedRealityPortal') || vrProcesses.includes('holographicshell')) {
      method = 'wmr'
      runtimeActive = 'wmr'
    } else if (vrProcesses.includes('PSVR2App') || vrProcesses.includes('PSVR2')) {
      method = 'psvr2-pc'
      runtimeActive = 'psvr2'
    } else if (vrProcesses.includes('OVRServer_x64') || vrProcesses.includes('OculusClient')) {
      method = inferMetaConnectionMode(usbDevices)
      runtimeActive = 'oculus'
    } else if (vrProcesses.includes('vrserver') || vrProcesses.includes('vrcompositor')) {
      // SteamVR running — could be wired OR wireless via ALVR/VD (already caught above)
      method = 'steamvr-usb'
      runtimeActive = 'steamvr'
      // Check if a USB VR device is present
      const wiredDevice = usbDevices.find((d) =>
        d.name.match(/Valve Index|HTC Vive|Bigscreen|Pimax|HP Reverb/i)
      )
      if (wiredDevice) detectedDeviceName = wiredDevice.name
    } else if (usbDevices.length > 0) {
      // USB VR device present but no runtime process — headset plugged in but software not running
      method = 'unknown-wired'
    }

    if (!detectedDeviceName && usbDevices.length > 0) {
      for (const sig of VR_USB_SIGNATURES) {
        const match = usbDevices.find((d) => sig.pattern.test(d.name))
        if (match) {
          detectedDeviceName = match.name
          break
        }
      }
    }

    let streamingBitrateMbps: number | null = null
    let encoderInUse: string | null = null

    if (method === 'virtual-desktop') {
      streamingBitrateMbps = getVirtualDesktopBitrate()
    } else if (method === 'alvr') {
      streamingBitrateMbps = getAlvrBitrate()
    }

    if (method !== 'steamvr-usb' && method !== 'wmr' && method !== 'psvr2-pc') {
      const adapterKey = await readKey(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000'
      ).catch(() => null)
      const provider = adapterKey?.values['ProviderName']
      if (provider && provider.type === 'REG_SZ') {
        const gn = provider.data.toLowerCase()
        if (gn.includes('nvidia')) encoderInUse = 'NVENC'
        else if (gn.includes('amd') || gn.includes('advanced micro')) encoderInUse = 'AMF'
        else encoderInUse = 'x264'
      }
    }

    const detected = method !== 'none'
    const usbGen = usbController?.gen ?? null

    console.log(`[scan:headset] Method: ${method} | Device: ${detectedDeviceName ?? 'N/A'} | Runtime: ${runtimeActive ?? 'none'}`)

    if (companionApps.length > 0) {
      console.log(`[scan:headset] Companion apps: ${companionApps.map((c) => c.label).join(', ')}`)
    }
    if (activeConflicts.length > 0) {
      console.log(`[scan:headset] ⚠ Conflict-prone apps running: ${activeConflicts.map((c) => c.label).join(', ')}`)
    }

    return {
      success: true,
      data: {
        detected,
        method,
        runtimeActive,
        detectedDeviceName,
        usbControllerType: usbController?.type ?? null,
        usbGeneration: usbGen,
        vrProcesses,
        streamingBitrateMbps,
        encoderInUse,
        headsetOsVersion: null, // Would require ADB — skipping for now
        companionApps,
        activeConflicts,
      }
    }
  } catch (error) {
    console.error('[scan:headset] Detection failed:', (error as Error).message)
    return {
      success: false,
      error: (error as Error).message,
      data: {
        detected: false,
        method: 'none',
        runtimeActive: null,
        detectedDeviceName: null,
        usbControllerType: null,
        usbGeneration: null,
        vrProcesses: [],
        streamingBitrateMbps: null,
        encoderInUse: null,
        headsetOsVersion: null,
        companionApps: [],
        activeConflicts: [],
      }
    }
  }
}
