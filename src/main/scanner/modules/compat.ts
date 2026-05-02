// VR Optimization Suite — System Compatibility Scanner
//
// Collects cross-cutting flags that affect VR but don't fit any single
// existing scanner module: hybrid GPU / laptop form factor, HVCI / Core
// Isolation / VBS, SteamVR branch, installed-but-not-running streaming
// tools, and motherboard / BIOS info.

import { existsSync, readFileSync } from 'fs'
import { readKey, readValue } from '../../utils/registry-read'
import { enumerateRegistrySubkeys } from '../../utils/registry'
import { enumerateProcesses } from '../../utils/process'
import type { ScanModuleResult, VrCompatibilityData } from '../types'
import { findMotherboardChipset } from '../../data/motherboard-chipset-database'

// Display class GUID. Each subkey under
// HKLM\SYSTEM\CurrentControlSet\Control\Class\<DISPLAY_CLASS_GUID> is a
// driver instance; DriverDesc holds the user-facing GPU name.
const DISPLAY_CLASS_GUID = '{4d36e968-e325-11ce-bfc1-08002be10318}'

async function enumerateGpuNames(): Promise<string[]> {
  const subkeys = enumerateRegistrySubkeys(
    'HKLM',
    `SYSTEM\\CurrentControlSet\\Control\\Class\\${DISPLAY_CLASS_GUID}`
  )
  const names: string[] = []
  for (const sk of subkeys) {
    if (!/^\d{4}$/.test(sk)) continue
    const v = await readValue(
      `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${DISPLAY_CLASS_GUID}\\${sk}`,
      'DriverDesc'
    )
    if (v && (v.type === 'REG_SZ' || v.type === 'REG_EXPAND_SZ') && v.data) {
      names.push(v.data.trim())
    }
  }
  return names
}

async function detectHybridGpu(): Promise<{ hasHybridGpu: boolean; isLaptop: boolean }> {
  const gpuNames = await enumerateGpuNames()

  // Battery presence is a cheap laptop heuristic. The battery class GUID
  // {72631e54-78a4-11d0-bcf7-00aa00b7b32a} has subkeys only when an OS
  // power-managed battery exists.
  const BATTERY_GUID = '{72631e54-78a4-11d0-bcf7-00aa00b7b32a}'
  const batterySubkeys = enumerateRegistrySubkeys(
    'HKLM',
    `SYSTEM\\CurrentControlSet\\Control\\Class\\${BATTERY_GUID}`
  )
  const hasBattery = batterySubkeys.some((sk) => /^\d{4}$/.test(sk))

  const hasIGpu = gpuNames.some(
    (n) =>
      /intel|amd radeon graphics|intel.*uhd|intel.*iris/i.test(n) && !/arc/i.test(n)
  )
  const hasDGpu = gpuNames.some(
    (n) =>
      /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc/i.test(n) &&
      !/radeon graphics(?!\sprocessor)/i.test(n)
  )

  return {
    hasHybridGpu: hasIGpu && hasDGpu,
    isLaptop: hasBattery,
  }
}

async function detectCoreIsolation(): Promise<{
  coreIsolationEnabled: boolean | null
  hvciEnabled: boolean | null
  vbsRunning: boolean | null
}> {
  // Both values live under HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard.
  // The Win32_DeviceGuard CIM class would surface the same data but is one
  // of the WMI classes sandbox-detection malware uses, so AV heuristics
  // weight it more aggressively. Plain registry reads are equivalent.
  const hvciVal = await readValue(
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
    'Enabled'
  )
  const vbsVal = await readValue(
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard',
    'EnableVirtualizationBasedSecurity'
  )

  const hvci =
    hvciVal && hvciVal.type === 'REG_DWORD' ? hvciVal.data === 1 : null
  const vbs =
    vbsVal && vbsVal.type === 'REG_DWORD' ? vbsVal.data === 1 : null

  return {
    coreIsolationEnabled: hvci,
    hvciEnabled: hvci,
    vbsRunning: vbs,
  }
}

function detectSteamVrBranch(): 'stable' | 'beta' | 'unknown' {
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_250820.acf',
    'C:\\Program Files\\Steam\\steamapps\\appmanifest_250820.acf',
    `${process.env.PROGRAMFILES ?? ''}\\Steam\\steamapps\\appmanifest_250820.acf`,
    `${process.env['PROGRAMFILES(X86)'] ?? ''}\\Steam\\steamapps\\appmanifest_250820.acf`,
  ].filter((p) => p && !p.startsWith('\\'))

  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const content = readFileSync(path, 'utf8')
      const match = content.match(/"BetaKey"\s+"([^"]*)"/i)
      if (!match) return 'stable'
      const key = match[1].trim()
      if (!key) return 'stable'
      return 'beta'
    } catch {
      // try next candidate
    }
  }
  return 'unknown'
}

interface InstalledToolSpec {
  id: string
  label: string
  paths: string[]
  runningProcessNames: string[]
}

const INSTALLED_TOOL_SPECS: InstalledToolSpec[] = [
  {
    id: 'virtual-desktop-streamer',
    label: 'Virtual Desktop Streamer',
    paths: [
      'C:\\Program Files\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe',
      'C:\\Program Files (x86)\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe',
      `${process.env.LOCALAPPDATA ?? ''}\\Virtual Desktop Streamer\\VirtualDesktop.Streamer.exe`,
    ],
    runningProcessNames: ['VirtualDesktop.Streamer', 'VirtualDesktop.Server'],
  },
  {
    id: 'alvr',
    label: 'ALVR',
    paths: [
      'C:\\Program Files\\ALVR\\alvr_dashboard.exe',
      'C:\\Program Files (x86)\\ALVR\\alvr_dashboard.exe',
      `${process.env.APPDATA ?? ''}\\ALVR\\alvr_dashboard.exe`,
    ],
    runningProcessNames: ['ALVR', 'alvr_server', 'alvr_dashboard', 'ALVRDashboard'],
  },
  {
    id: 'sunshine',
    label: 'Sunshine (GameStream host)',
    paths: [
      'C:\\Program Files\\Sunshine\\sunshine.exe',
      'C:\\Program Files (x86)\\Sunshine\\sunshine.exe',
    ],
    runningProcessNames: ['sunshine'],
  },
  {
    id: 'moonlight',
    label: 'Moonlight',
    paths: [
      `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Moonlight Game Streaming\\Moonlight.exe`,
      'C:\\Program Files\\Moonlight Game Streaming\\Moonlight.exe',
    ],
    runningProcessNames: ['Moonlight'],
  },
  {
    id: 'oculus-pc',
    label: 'Meta Quest Link',
    paths: [
      'C:\\Program Files\\Oculus\\Support\\oculus-client\\OculusClient.exe',
    ],
    runningProcessNames: ['OculusClient', 'OVRServer_x64'],
  },
  {
    id: 'vive-streaming',
    label: 'VIVE Streaming',
    paths: [
      'C:\\Program Files\\VIVE\\VIVEStreamingHub\\VIVEStreamingHub.exe',
      'C:\\Program Files (x86)\\HTC\\VIVE Streaming\\VIVEStreamingLauncher.exe',
    ],
    runningProcessNames: ['VIVEStreamingLauncher', 'VIVEStreamingClient', 'VIVEStreamingHub'],
  },
  {
    id: 'pico-connect',
    label: 'Pico Connect',
    paths: [
      `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Pico Connect\\Pico Connect.exe`,
      'C:\\Program Files\\Pico Connect\\Pico Connect.exe',
    ],
    runningProcessNames: ['PicoConnect', 'PicoLink'],
  },
  {
    id: 'openxr-toolkit',
    label: 'OpenXR Toolkit',
    paths: [
      'C:\\Program Files\\OpenXR-Toolkit\\companion.exe',
    ],
    runningProcessNames: ['OpenXR-Toolkit-Companion'],
  },
  {
    id: 'varjo-base',
    label: 'Varjo Base',
    paths: [
      'C:\\Program Files\\Varjo\\varjo-base\\Varjo.Base.exe',
    ],
    runningProcessNames: ['Varjo.Base', 'VarjoService'],
  },
]

async function getRunningProcessSet(): Promise<Set<string>> {
  const procs = await enumerateProcesses()
  return new Set(procs.map((p) => p.name.toLowerCase()))
}

async function detectInstalledVrTools(): Promise<VrCompatibilityData['installedVrTools']> {
  const runningSet = await getRunningProcessSet()
  const installed: VrCompatibilityData['installedVrTools'] = []
  for (const spec of INSTALLED_TOOL_SPECS) {
    const hitPath = spec.paths.find((p) => p && !p.startsWith('\\') && existsSync(p))
    if (!hitPath) continue
    const running = spec.runningProcessNames.some((p) => runningSet.has(p.toLowerCase()))
    installed.push({
      id: spec.id,
      label: spec.label,
      installPath: hitPath,
      running,
    })
  }
  return installed
}

async function detectMotherboard(): Promise<VrCompatibilityData['motherboard']> {
  // SMBIOS data is mirrored into HKLM\HARDWARE\DESCRIPTION\System\BIOS
  // by the Windows ACPI/SMBIOS subsystem on every boot. Same fields as
  // Win32_BaseBoard / Win32_BIOS but without going through CIM.
  const biosKey = await readKey('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS').catch(() => null)
  if (!biosKey) return null

  const mfgVal = biosKey.values['BaseBoardManufacturer']
  const prodVal = biosKey.values['BaseBoardProduct']
  const biosVerVal = biosKey.values['BIOSVersion']
  const biosDateVal = biosKey.values['BIOSReleaseDate']

  const manufacturer =
    mfgVal && (mfgVal.type === 'REG_SZ' || mfgVal.type === 'REG_EXPAND_SZ') ? mfgVal.data.trim() : ''
  const model =
    prodVal && (prodVal.type === 'REG_SZ' || prodVal.type === 'REG_EXPAND_SZ') ? prodVal.data.trim() : ''
  if (!manufacturer && !model) return null

  let biosVersion: string | null = null
  if (biosVerVal) {
    if (biosVerVal.type === 'REG_SZ' || biosVerVal.type === 'REG_EXPAND_SZ') {
      biosVersion = biosVerVal.data.trim() || null
    } else if (biosVerVal.type === 'REG_MULTI_SZ' && biosVerVal.data.length) {
      biosVersion = biosVerVal.data[0].trim() || null
    }
  }

  // BIOSReleaseDate is a string like "12/15/2024". Normalise to ISO.
  let biosDate: string | null = null
  if (
    biosDateVal &&
    (biosDateVal.type === 'REG_SZ' || biosDateVal.type === 'REG_EXPAND_SZ')
  ) {
    const m = biosDateVal.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) {
      const mm = m[1].padStart(2, '0')
      const dd = m[2].padStart(2, '0')
      biosDate = `${m[3]}-${mm}-${dd}`
    }
  }

  const chipsetEntry = findMotherboardChipset(model)
  const chipset = chipsetEntry?.name ?? null

  return {
    manufacturer,
    model,
    chipset,
    biosVersion,
    biosDate,
  }
}

export async function scanCompat(): Promise<ScanModuleResult<VrCompatibilityData>> {
  console.log('[scan:compat] Running VR compatibility checks...')
  try {
    const [gpuState, coreIsolation, installedVrTools, motherboard] = await Promise.all([
      detectHybridGpu(),
      detectCoreIsolation(),
      detectInstalledVrTools(),
      detectMotherboard(),
    ])
    const steamvrBranch = detectSteamVrBranch()

    console.log(
      `[scan:compat] hybrid=${gpuState.hasHybridGpu} laptop=${gpuState.isLaptop} ` +
      `HVCI=${coreIsolation.hvciEnabled} VBS=${coreIsolation.vbsRunning} ` +
      `steamvrBranch=${steamvrBranch} installedTools=${installedVrTools.length} ` +
      `chipset=${motherboard?.chipset ?? 'unknown'}`
    )

    return {
      success: true,
      data: {
        hasHybridGpu: gpuState.hasHybridGpu,
        isLaptop: gpuState.isLaptop,
        hvciEnabled: coreIsolation.hvciEnabled,
        coreIsolationEnabled: coreIsolation.coreIsolationEnabled,
        vbsRunning: coreIsolation.vbsRunning,
        steamvrBranch,
        installedVrTools,
        motherboard,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
      data: {
        hasHybridGpu: false,
        isLaptop: false,
        hvciEnabled: null,
        coreIsolationEnabled: null,
        vbsRunning: null,
        steamvrBranch: 'unknown',
        installedVrTools: [],
        motherboard: null,
      },
    }
  }
}
