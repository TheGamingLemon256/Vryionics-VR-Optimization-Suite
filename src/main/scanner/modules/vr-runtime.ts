// VR Optimization Suite — VR Runtime Scan Module
// Detects installed VR runtimes (SteamVR, Oculus, WMR) and the active OpenXR runtime.

import { readRegistry, registryKeyExists } from '../../utils/registry'
import { readKey } from '../../utils/registry-read'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ScanModuleResult, VrRuntimeData } from '../types'
import { scanVrCrashEvents } from './vr-crash-log'

const RUNTIME_REGISTRY_PATHS = {
  openxr: 'SOFTWARE\\Khronos\\OpenXR\\1',
  steamvr: 'SOFTWARE\\Valve\\Steam',
  oculus: 'SOFTWARE\\Oculus VR, LLC\\Oculus',
  wmr: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Holographic'
}

const STEAMVR_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR',
  'C:\\Program Files\\Steam\\steamapps\\common\\SteamVR'
]

const OCULUS_PATHS = [
  'C:\\Program Files\\Oculus',
  'C:\\Program Files (x86)\\Oculus'
]

function isSteamVrInstalled(): boolean {
  if (registryKeyExists('HKLM', RUNTIME_REGISTRY_PATHS.steamvr)) return true
  return STEAMVR_PATHS.some((p) => existsSync(p))
}

function isOculusInstalled(): boolean {
  if (registryKeyExists('HKLM', RUNTIME_REGISTRY_PATHS.oculus)) return true
  if (registryKeyExists('HKCU', 'Software\\Oculus VR, LLC')) return true
  return OCULUS_PATHS.some((p) => existsSync(p))
}

function isWmrInstalled(): boolean {
  return registryKeyExists('HKLM', RUNTIME_REGISTRY_PATHS.wmr)
}

function getOpenXrRuntime(): { runtime: string | null; active: 'steamvr' | 'oculus' | 'wmr' | 'openxr' | null } {
  // ActiveRuntime value points to the JSON manifest of the active OpenXR runtime
  const runtimePath = readRegistry('HKLM', RUNTIME_REGISTRY_PATHS.openxr, 'ActiveRuntime')

  if (!runtimePath) return { runtime: null, active: null }

  const pathLower = runtimePath.toLowerCase()
  let active: 'steamvr' | 'oculus' | 'wmr' | 'openxr' | null = null

  if (pathLower.includes('steamvr') || pathLower.includes('valve')) {
    active = 'steamvr'
  } else if (pathLower.includes('oculus') || pathLower.includes('meta')) {
    active = 'oculus'
  } else if (pathLower.includes('mixedreality') || pathLower.includes('wmr')) {
    active = 'wmr'
  } else {
    active = 'openxr' // Unknown/custom runtime
  }

  return { runtime: runtimePath, active }
}

function getSteamVrVersion(): string | null {
  try {
    // Check SteamVR manifest for version
    const manifestPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrclient.dll'
    ]
    // Without shell execution, we can't easily get DLL version
    // Use registry if available
    return readRegistry('HKLM', 'SOFTWARE\\Valve\\Steam', 'Version') ?? null
  } catch {
    return null
  }
}

function getOculusVersion(): string | null {
  try {
    return readRegistry('HKLM', 'SOFTWARE\\Oculus VR, LLC\\Oculus', 'Version') ?? null
  } catch {
    return null
  }
}

function getVRChatConfig(): Record<string, unknown> | null {
  const configPath = join(homedir(), 'AppData', 'LocalLow', 'VRChat', 'VRChat', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function scanVrRuntime(): Promise<ScanModuleResult<VrRuntimeData>> {
  try {
    console.log('[scan:vr-runtime] Detecting VR runtimes...')

    const steamvrInstalled = isSteamVrInstalled()
    const oculusInstalled = isOculusInstalled()
    const wmrInstalled = isWmrInstalled()
    const { runtime: openxrRuntime, active: activeRuntime } = getOpenXrRuntime()

    const steamvrVersion = steamvrInstalled ? getSteamVrVersion() : null
    const oculusVersion = oculusInstalled ? getOculusVersion() : null

    console.log(
      `[scan:vr-runtime] SteamVR: ${steamvrInstalled}, Oculus: ${oculusInstalled}, WMR: ${wmrInstalled}, ` +
      `Active OpenXR: ${activeRuntime ?? 'none'}`
    )

    const vrchatConfig = getVRChatConfig()

    // Extract VRChat deep config fields
    let dynamicBoneMaxAffected: number | null = null
    let dynamicBoneMaxCollider: number | null = null
    let cacheExpiryDelay: number | null = null
    let vrchatAvatarMaxPolygons: number | null = null
    let vrchatMirrorResolution: number | null = null
    let vrchatParticleLimitSelf: number | null = null
    const vrchatConfigPresent = !!vrchatConfig

    if (vrchatConfig) {
      const cfg = vrchatConfig
      if (typeof cfg.dynamic_bone_max_affected_transform_count === 'number') {
        dynamicBoneMaxAffected = cfg.dynamic_bone_max_affected_transform_count as number
      }
      if (typeof cfg.dynamic_bone_max_collider_check_count === 'number') {
        dynamicBoneMaxCollider = cfg.dynamic_bone_max_collider_check_count as number
      }
      if (typeof cfg.cache_expiry_delay === 'number') {
        cacheExpiryDelay = cfg.cache_expiry_delay as number
      }
      if (typeof cfg.avatarMaxPolyCount === 'number') {
        vrchatAvatarMaxPolygons = cfg.avatarMaxPolyCount as number
      }
      if (typeof cfg.mirrorResolution === 'number') {
        vrchatMirrorResolution = cfg.mirrorResolution as number
      }
      if (typeof cfg.particleLimitOther === 'number') {
        vrchatParticleLimitSelf = cfg.particleLimitOther as number
      }
    }

    // VRChat Unity PlayerPrefs from registry. Unity stores prefs under
    // HKCU\SOFTWARE\<company>\<product> with hashed value names like
    // "QualitySettings_antiAliasing_h2389470". We pattern-match against the
    // value names rather than knowing the hash up front.
    let vrchatMsaa: number | null = null
    let vrchatPhysicsFps: number | null = null
    const prefsKey = await readKey('HKCU\\SOFTWARE\\VRChat\\VRChat').catch(() => null)
    if (prefsKey) {
      const directMsaa = prefsKey.values['QualitySettings_antiAliasing']
      if (directMsaa && directMsaa.type === 'REG_DWORD') {
        vrchatMsaa = directMsaa.data
      } else {
        for (const [name, value] of Object.entries(prefsKey.values)) {
          if (vrchatMsaa !== null) break
          if (/antialias|msaa|_AA/i.test(name) && value.type === 'REG_DWORD') {
            vrchatMsaa = value.data
          }
        }
      }
      for (const [name, value] of Object.entries(prefsKey.values)) {
        if (vrchatPhysicsFps !== null) break
        if (!/physics|fixeddelta|physicstime/i.test(name)) continue
        // Unity stores floats as REG_BINARY (the IEEE-754 bytes). Treat
        // DWORD-stored values as raw frequencies; binary-stored values as
        // fixedDeltaTime seconds.
        if (value.type === 'REG_DWORD') {
          vrchatPhysicsFps = Math.round(value.data)
        } else if (value.type === 'REG_BINARY' && value.data.length >= 4) {
          const seconds = value.data.readFloatLE(0)
          if (Number.isFinite(seconds) && seconds > 0) {
            vrchatPhysicsFps = seconds < 1 ? Math.round(1 / seconds) : Math.round(seconds)
          }
        }
      }
    }

    // Parse SteamVR log files for recent crashes / fatal errors
    let crashEvents: VrRuntimeData['crashEvents'] = []
    try {
      crashEvents = scanVrCrashEvents()
      if (crashEvents.length > 0) {
        console.log(`[scan:vr-runtime] Found ${crashEvents.length} recent SteamVR crash/error events`)
      }
    } catch (e) {
      console.warn('[scan:vr-runtime] Crash log scan failed:', (e as Error).message)
    }

    return {
      success: true,
      data: {
        steamvrInstalled,
        steamvrVersion,
        steamvrSettings: null, // Populated by steamvr module merge
        oculusInstalled,
        oculusVersion,
        wmrInstalled,
        activeRuntime,
        openxrRuntime,
        supersampling: null,    // Populated by steamvr module merge
        reprojectionMode: null, // Populated by steamvr module merge
        motionSmoothingEnabled: null, // Populated by steamvr module merge
        vrchatConfig,
        dynamicBoneMaxAffected,
        dynamicBoneMaxCollider,
        cacheExpiryDelay,
        vrchatMsaa,
        vrchatAvatarMaxPolygons,
        vrchatPhysicsFps,
        vrchatMirrorResolution,
        vrchatParticleLimitSelf,
        vrchatConfigPresent,
        crashEvents
      }
    }
  } catch (error) {
    console.error('[scan:vr-runtime] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
