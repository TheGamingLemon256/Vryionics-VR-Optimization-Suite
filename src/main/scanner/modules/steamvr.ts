// VR Optimization Suite — SteamVR Settings Scan Module
// Finds and parses steamvr.vrsettings to extract render resolution, reprojection, etc.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tryRunCmd } from '../../utils/powershell'
import type { ScanModuleResult } from '../types'

export interface SteamVrSettingsData {
  settingsPath: string | null
  settings: Record<string, unknown> | null
  supersampling: number | null
  renderResolutionWidth: number | null
  motionSmoothingEnabled: boolean | null
  reprojectionEnabled: boolean | null
  steamvrVersion: string | null
}

/** Common SteamVR config file locations */
const STEAMVR_CONFIG_PATHS = [
  'C:\\Program Files (x86)\\Steam\\config\\steamvr.vrsettings',
  join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Steam', 'config', 'steamvr.vrsettings'),
  join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Steam', 'config', 'steamvr.vrsettings')
]

function findSteamVrSettings(): string | null {
  for (const p of STEAMVR_CONFIG_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

/** SteamVR vrsettings allows comments and trailing commas — strip them before parsing. */
function parseLaxJson(raw: string): Record<string, unknown> {
  try {
    // Remove single-line comments (// ...)
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      // Remove trailing commas before closing braces/brackets
      .replace(/,\s*([\]}])/g, '$1')
    return JSON.parse(stripped)
  } catch {
    return {}
  }
}

async function getSteamVrVersion(): Promise<string | null> {
  try {
    const output = await tryRunCmd(
      'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v "Version" 2>nul',
      5000
    )
    const match = output?.match(/REG_SZ\s+(.+)/i)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export async function scanSteamVr(): Promise<ScanModuleResult<SteamVrSettingsData>> {
  try {
    console.log('[scan:steamvr] Looking for steamvr.vrsettings...')

    const settingsPath = findSteamVrSettings()
    const steamvrVersion = await getSteamVrVersion()

    if (!settingsPath) {
      console.log('[scan:steamvr] steamvr.vrsettings not found — SteamVR may not be installed')
      return {
        success: true,
        data: {
          settingsPath: null,
          settings: null,
          supersampling: null,
          renderResolutionWidth: null,
          motionSmoothingEnabled: null,
          reprojectionEnabled: null,
          steamvrVersion
        }
      }
    }

    const raw = readFileSync(settingsPath, 'utf8')
    const settings = parseLaxJson(raw)

    // Extract key VR performance settings
    // SteamVR settings are nested: { "steamvr": { "supersampleScale": 1.0 }, ... }
    const steamvrSection = (settings['steamvr'] as Record<string, unknown>) ?? {}
    const performanceSection = (settings['GpuSpeed'] as Record<string, unknown>) ?? {}

    const supersampling = (steamvrSection['supersampleScale'] as number) ?? null
    const renderResolutionWidth = (steamvrSection['renderTargetMultiplier'] as number) ?? null
    const motionSmoothingEnabled = (steamvrSection['motionSmoothing'] as boolean) ?? null
    const reprojectionEnabled = (steamvrSection['allowAsyncReprojection'] as boolean) ?? null

    console.log(
      `[scan:steamvr] SS: ${supersampling ?? 'auto'}, MotionSmoothing: ${motionSmoothingEnabled ?? 'default'}`
    )

    return {
      success: true,
      data: {
        settingsPath,
        settings,
        supersampling,
        renderResolutionWidth,
        motionSmoothingEnabled,
        reprojectionEnabled,
        steamvrVersion
      }
    }
  } catch (error) {
    console.error('[scan:steamvr] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
