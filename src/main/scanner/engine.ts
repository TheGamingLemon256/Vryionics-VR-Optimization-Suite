// VR Optimization Suite — Scan Engine
// Orchestrates all scan modules, merges results, reports progress.

import {
  scanCpu, scanGpu, scanRam, scanStorage, scanNetwork, scanProcesses,
  scanOsConfig, scanPowerPlan, scanSteamVr, scanVrRuntime,
  scanSpeedTest, scanHeadsetConnection, scanDisplay, scanAudio, scanUsb,
  scanEventLog, scanCompat
} from './modules/index'
import type { ScanData, ScanProgress, ScanModuleResult, ScanCondition, UserScanSetup } from './types'
import { getProfile } from '../headsets/loader'
import Store from 'electron-store'

// Same store name + key as system.ts uses when persisting wizard answers.
// Keeping these two in sync is the whole reason for the separate helper.
const setupStore = new Store({ name: 'vros-setup' })

/**
 * Read the user-reported setup from disk and return only the fields the rules
 * engine cares about. Returns null when no setup has been completed yet.
 */
function loadUserSetup(): UserScanSetup | null {
  try {
    const raw = setupStore.get('userSetup') as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return null
    return {
      pcType:         (raw.pcType         as UserScanSetup['pcType'])         ?? null,
      primaryUseCase: (raw.primaryUseCase as UserScanSetup['primaryUseCase']) ?? null,
      mainComplaint:  (raw.mainComplaint  as UserScanSetup['mainComplaint'])  ?? null,
      skillLevel:     (raw.skillLevel     as UserScanSetup['skillLevel'])     ?? null,
    }
  } catch {
    return null
  }
}

// VR process names that indicate an active session when found running
const VR_SESSION_PROCESSES = new Set([
  'vrserver.exe',
  'vrcompositor.exe',
  'vrchat.exe',
  'ovrserver_x64.exe',       // Meta/Oculus PC runtime
  'ovrservice.exe',          // Older Oculus service
  'virtualdesktop.streamer.exe',
  'virtual desktop.exe',
  'alvr_server.exe',
  'alvr_server_launcher.exe',
  'steam_link.exe',
  'vrstartup.exe',
  'vrchatcompatibility.exe',
  'resoite.exe',             // Resonite
  'neosvr.exe',              // NeosVR
  'beatsaber.exe',
  'population: one.exe',
  'pavlov.exe',
  'boneworks.exe',
  'bonelab.exe',
])

export type ProgressCallback = (progress: ScanProgress) => void

interface ScanOptions {
  onProgress?: ProgressCallback
  headsetProfileId?: string
  connectionArchetype?: ScanData['connectionArchetype']
  timeoutMs?: number
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ])
}

const MODULE_LABELS: Record<string, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'Memory',
  storage: 'Storage',
  network: 'Network',
  processes: 'Processes',
  'vr-runtime': 'VR Runtime',
  'os-config': 'OS Configuration',
  'power-plan': 'Power Plan',
  steamvr: 'SteamVR Settings',
  'headset-connection': 'Headset Detection',
  display: 'Display',
  speedtest: 'Speed Test',
  audio: 'Audio Subsystem',
  usb: 'USB Controllers',
  'event-log': 'Event Log',
  compat: 'System Compatibility'
}

/** Run the full system scan. Returns a complete ScanData object. */
export async function runScan(options: ScanOptions = {}): Promise<ScanData> {
  const { onProgress, headsetProfileId = null, connectionArchetype = null, timeoutMs = 30000 } = options

  const startTime = Date.now()
  const errors: Record<string, string> = {}

  // Typed as unknown so withTimeout resolves a single generic type.
  // Each switch case casts via unknown to the appropriate ScanData field type.
  const modules: Array<{ id: string; run: () => Promise<ScanModuleResult<unknown>> }> = [
    { id: 'cpu', run: scanCpu as () => Promise<ScanModuleResult<unknown>> },
    { id: 'gpu', run: scanGpu as () => Promise<ScanModuleResult<unknown>> },
    { id: 'ram', run: scanRam as () => Promise<ScanModuleResult<unknown>> },
    { id: 'storage', run: scanStorage as () => Promise<ScanModuleResult<unknown>> },
    { id: 'network', run: scanNetwork as () => Promise<ScanModuleResult<unknown>> },
    { id: 'processes', run: scanProcesses as () => Promise<ScanModuleResult<unknown>> },
    { id: 'vr-runtime', run: scanVrRuntime as () => Promise<ScanModuleResult<unknown>> },
    { id: 'os-config', run: scanOsConfig as () => Promise<ScanModuleResult<unknown>> },
    { id: 'power-plan', run: scanPowerPlan as () => Promise<ScanModuleResult<unknown>> },
    { id: 'steamvr', run: scanSteamVr as () => Promise<ScanModuleResult<unknown>> },
    { id: 'headset-connection', run: scanHeadsetConnection as () => Promise<ScanModuleResult<unknown>> },
    { id: 'display', run: scanDisplay as () => Promise<ScanModuleResult<unknown>> },
    { id: 'speedtest', run: scanSpeedTest as () => Promise<ScanModuleResult<unknown>> },
    { id: 'audio', run: scanAudio as () => Promise<ScanModuleResult<unknown>> },
    { id: 'usb', run: scanUsb as () => Promise<ScanModuleResult<unknown>> },
    { id: 'event-log', run: scanEventLog as () => Promise<ScanModuleResult<unknown>> },
    { id: 'compat', run: scanCompat as () => Promise<ScanModuleResult<unknown>> }
  ]

  const totalModules = modules.length

  // Resolve the full headset profile now so every rule can read it directly
  // from ScanData.headsetProfile. Null when no setup has been completed yet
  // or when the requested profile ID doesn't match a bundled profile (e.g.
  // profile was renamed in a later release).
  const headsetProfile = headsetProfileId ? getProfile(headsetProfileId) : null
  if (headsetProfileId && !headsetProfile) {
    console.warn(`[scan:engine] Requested headset profile '${headsetProfileId}' not found — continuing without headset context`)
  } else if (headsetProfile) {
    console.log(`[scan:engine] Loaded headset profile: ${headsetProfile.brand} ${headsetProfile.model} (${headsetProfile.id})`)
  }

  // Initialize empty scan data
  const scanData: ScanData = {
    timestamp: Date.now(),
    scanDurationMs: 0,
    headsetProfileId,
    connectionArchetype,
    headsetProfile,
    userSetup: loadUserSetup(),
    compat: null,
    scanCondition: 'idle',   // will be updated after process scan completes
    cpu: null,
    gpu: null,
    ram: null,
    storage: null,
    network: null,
    vrRuntime: null,
    processes: null,
    osConfig: null,
    speedTest: null,
    headsetConnection: null,
    display: null,
    audio: null,
    usb: null,
    eventLog: null,
    errors
  }

  for (let i = 0; i < modules.length; i++) {
    const { id, run } = modules[i]
    const label = MODULE_LABELS[id] ?? id

    onProgress?.({
      module: id,
      moduleLabel: label,
      percent: Math.round((i / totalModules) * 100),
      totalModules,
      completedModules: i
    })

    try {
      const result = await withTimeout(run(), timeoutMs, id)

      if (!result.success) {
        errors[id] = result.error ?? 'Unknown error'
        console.warn(`[scan:engine] Module '${id}' failed: ${result.error}`)
      }

      // Assign module results to ScanData keys (cast via unknown — types are verified by each module's return)
      switch (id) {
        case 'cpu':
          if (result.success && result.data) scanData.cpu = result.data as unknown as ScanData['cpu']
          break
        case 'gpu':
          if (result.success && result.data) scanData.gpu = result.data as unknown as ScanData['gpu']
          break
        case 'ram':
          if (result.success && result.data) scanData.ram = result.data as unknown as ScanData['ram']
          break
        case 'storage':
          if (result.success && result.data) scanData.storage = result.data as unknown as ScanData['storage']
          break
        case 'network':
          if (result.data) scanData.network = result.data as unknown as ScanData['network']
          break
        case 'processes':
          if (result.success && result.data) scanData.processes = result.data as unknown as ScanData['processes']
          break
        case 'vr-runtime':
          if (result.success && result.data) scanData.vrRuntime = result.data as unknown as ScanData['vrRuntime']
          break
        case 'os-config':
          if (result.success && result.data) scanData.osConfig = result.data as unknown as ScanData['osConfig']
          break

        // Merge modules — update subsections of existing data
        case 'power-plan': {
          if (result.success && result.data && scanData.osConfig) {
            const pd = result.data as unknown as { name: string; guid: string }
            scanData.osConfig.powerPlan = pd.name
          }
          break
        }
        case 'steamvr': {
          if (result.success && result.data && scanData.vrRuntime) {
            const sd = result.data as unknown as {
              settings: Record<string, unknown> | null
              supersampling: number | null
              reprojectionEnabled: boolean | null
              motionSmoothingEnabled: boolean | null
              steamvrVersion: string | null
            }
            scanData.vrRuntime.steamvrSettings = sd.settings
            scanData.vrRuntime.supersampling = sd.supersampling
            scanData.vrRuntime.reprojectionMode = sd.reprojectionEnabled ? 'async' : null
            scanData.vrRuntime.motionSmoothingEnabled = sd.motionSmoothingEnabled
            if (sd.steamvrVersion) scanData.vrRuntime.steamvrVersion = sd.steamvrVersion
          }
          break
        }
        case 'headset-connection':
          if (result.data) {
            scanData.headsetConnection = result.data as unknown as ScanData['headsetConnection']
          }
          break
        case 'display':
          if (result.data) scanData.display = result.data as unknown as ScanData['display']
          break
        case 'speedtest':
          if (result.data) {
            scanData.speedTest = result.data as unknown as ScanData['speedTest']
          }
          break
        case 'audio':
          if (result.data) scanData.audio = result.data as unknown as ScanData['audio']
          break
        case 'usb':
          if (result.data) scanData.usb = result.data as unknown as ScanData['usb']
          break
        case 'event-log':
          if (result.data) scanData.eventLog = result.data as unknown as ScanData['eventLog']
          break
        case 'compat':
          if (result.data) scanData.compat = result.data as unknown as ScanData['compat']
          break
      }
    } catch (error) {
      const msg = (error as Error).message
      errors[id] = msg
      console.error(`[scan:engine] Module '${id}' threw: ${msg}`)
    }
  }

  // ── Determine scan condition from running processes ──────────
  // If any VR session processes were found running, treat this as an under-load scan.
  // This means the captured CPU/GPU/RAM numbers reflect actual in-VR behaviour,
  // which changes how findings and recommendations are interpreted.
  if (scanData.processes) {
    const allRunning = [
      ...scanData.processes.vrCritical,
      ...scanData.processes.vrOverlay,
      ...scanData.processes.vrTracking,
      ...scanData.processes.all
    ]
    const sessionActive = allRunning.some((p) =>
      VR_SESSION_PROCESSES.has(p.name.toLowerCase())
    )
    const condition: ScanCondition = sessionActive ? 'under-load' : 'idle'
    scanData.scanCondition = condition
    console.log(`[scan:engine] Scan condition: ${condition}${sessionActive ? ` (VR processes detected)` : ''}`)
  }

  scanData.scanDurationMs = Date.now() - startTime

  // Final progress
  onProgress?.({
    module: 'complete',
    moduleLabel: 'Complete',
    percent: 100,
    totalModules,
    completedModules: totalModules
  })

  console.log(
    `[scan:engine] Scan complete in ${scanData.scanDurationMs}ms. ` +
    `Errors: ${Object.keys(errors).length > 0 ? Object.keys(errors).join(', ') : 'none'}`
  )

  return scanData
}
