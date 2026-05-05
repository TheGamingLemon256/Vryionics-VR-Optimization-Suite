// Refresh rate, HDR, G-Sync/FreeSync.

import { screen } from 'electron'
import { readValue } from '../../utils/registry-read'
import type { ScanModuleResult, DisplayData, DisplayMonitor } from '../types'

async function getHdrEnabled(): Promise<boolean> {
  const v = await readValue(
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings',
    'EnableHDROutput'
  )
  if (!v) return false
  if (v.type === 'REG_DWORD') return v.data === 1
  return false
}

/**
 * Returns true if G-Sync or FreeSync is enabled, false if a vendor key exists
 * but is disabled, or null if neither vendor key is present (Intel / unknown).
 */
async function getAdaptiveSyncEnabled(): Promise<boolean | null> {
  const gsync = await readValue(
    'HKLM\\SYSTEM\\CurrentControlSet\\Services\\nvlddmkm\\Global\\NVTweak',
    'NVSyncAllowed'
  )
  const freesync = await readValue(
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000',
    'KMD_FreeSync'
  )

  if (!gsync && !freesync) return null

  if (gsync && gsync.type === 'REG_DWORD' && gsync.data === 1) return true
  if (freesync && freesync.type === 'REG_DWORD' && (freesync.data === 1 || freesync.data === 3)) return true

  return false
}

export async function scanDisplay(): Promise<ScanModuleResult<DisplayData>> {
  try {
    console.log('[scan:display] Detecting monitors, HDR, and adaptive sync...')

    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const [hdrEnabled, adaptiveSync] = await Promise.all([
      getHdrEnabled(),
      getAdaptiveSyncEnabled(),
    ])

    const monitors: DisplayMonitor[] = displays.map((d) => ({
      name: d.label || `Display ${d.id}`,
      isPrimary: d.id === primaryDisplay.id,
      widthPx: d.size.width,
      heightPx: d.size.height,
      refreshRateHz: Math.round(d.displayFrequency ?? 0),
      // Windows global HDR toggle; per-monitor is not reliably queryable without DXGI
      hdrEnabled,
      adaptiveSyncEnabled: adaptiveSync,
    }))

    const primary = monitors.find((m) => m.isPrimary) ?? monitors[0] ?? null
    const primaryRefreshRateHz = primary?.refreshRateHz ?? 0
    const anyHdrEnabled = monitors.some((m) => m.hdrEnabled)
    const anyAdaptiveSyncEnabled = monitors.some((m) => m.adaptiveSyncEnabled === true)

    const data: DisplayData = {
      monitors,
      primaryRefreshRateHz,
      anyHdrEnabled,
      anyAdaptiveSyncEnabled,
    }

    console.log(
      `[scan:display] Done. ${monitors.length} monitor(s), primary: ${primaryRefreshRateHz}Hz, ` +
      `HDR: ${anyHdrEnabled}, AdaptiveSync: ${adaptiveSync}`
    )

    return { success: true, data }
  } catch (error) {
    console.error('[scan:display] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
