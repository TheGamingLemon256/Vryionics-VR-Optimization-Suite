// VR Optimization Suite — Display Scanner Module
// Detects monitor refresh rate, HDR status, and adaptive sync (G-Sync/FreeSync).

import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, DisplayData, DisplayMonitor } from '../types'

interface RawScreen {
  name: string
  isPrimary: boolean
  width: number
  height: number
}

interface RawVideoController {
  CurrentRefreshRate: number | null
  CurrentHorizontalResolution: number | null
  CurrentVerticalResolution: number | null
}

async function getScreens(): Promise<RawScreen[]> {
  const { dotSourcePsHelpers } = await import('../../utils/ps-helpers')
  const script = `
${dotSourcePsHelpers()}
$screens = [System.Windows.Forms.Screen]::AllScreens
$result = $screens | ForEach-Object {
  @{
    name = $_.DeviceName
    isPrimary = $_.Primary
    width = $_.Bounds.Width
    height = $_.Bounds.Height
  }
}
$result | ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShellJson<RawScreen | RawScreen[]>(script, 10000)
    if (!raw) return []
    return Array.isArray(raw) ? raw : [raw]
  } catch {
    return []
  }
}

async function getVideoControllers(): Promise<RawVideoController[]> {
  const script = `
Get-CimInstance Win32_VideoController |
  Select-Object CurrentRefreshRate, CurrentHorizontalResolution, CurrentVerticalResolution |
  ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShellJson<RawVideoController | RawVideoController[]>(script, 10000)
    if (!raw) return []
    return Array.isArray(raw) ? raw : [raw]
  } catch {
    return []
  }
}

async function getHdrEnabled(): Promise<boolean> {
  const script = `
$hdr = Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableHDROutput -EA SilentlyContinue
Write-Output ($hdr.EnableHDROutput -eq 1)
`
  try {
    const raw = await tryRunPowerShell(script, 5000)
    return raw?.trim().toLowerCase() === 'true'
  } catch {
    return false
  }
}

/**
 * Returns true if G-Sync or FreeSync is enabled, false if a key exists but is
 * disabled, or null if neither vendor key is present (Intel / unknown GPU).
 */
async function getAdaptiveSyncEnabled(): Promise<boolean | null> {
  // NVIDIA G-Sync
  const gsyncScript = `
$gsync = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\nvlddmkm\\Global\\NVTweak' -Name NVSyncAllowed -EA SilentlyContinue
if ($gsync -eq $null) { Write-Output 'absent' } else { Write-Output $gsync.NVSyncAllowed }
`
  // AMD FreeSync
  const freesyncScript = `
$freesync = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000' -Name KMD_FreeSync -EA SilentlyContinue
if ($freesync -eq $null) { Write-Output 'absent' } else { Write-Output $freesync.KMD_FreeSync }
`

  let gsyncRaw: string | null = null
  let freesyncRaw: string | null = null

  try {
    ;[gsyncRaw, freesyncRaw] = await Promise.all([
      tryRunPowerShell(gsyncScript, 5000),
      tryRunPowerShell(freesyncScript, 5000)
    ])
  } catch {
    return null
  }

  const gsyncVal = gsyncRaw?.trim() ?? 'absent'
  const freesyncVal = freesyncRaw?.trim() ?? 'absent'

  const gsyncAbsent = gsyncVal === 'absent'
  const freesyncAbsent = freesyncVal === 'absent'

  // Neither vendor key exists — can't determine (Intel or unknown GPU)
  if (gsyncAbsent && freesyncAbsent) return null

  // G-Sync: value 1 = allowed/enabled
  if (!gsyncAbsent && (gsyncVal === '1')) return true

  // FreeSync: value 1 or 3 = enabled
  if (!freesyncAbsent && (freesyncVal === '1' || freesyncVal === '3')) return true

  // Keys exist but values indicate disabled
  return false
}

export async function scanDisplay(): Promise<ScanModuleResult<DisplayData>> {
  try {
    console.log('[scan:display] Detecting monitors, HDR, and adaptive sync...')

    const [screens, controllers, hdrEnabled, adaptiveSync] = await Promise.all([
      getScreens(),
      getVideoControllers(),
      getHdrEnabled(),
      getAdaptiveSyncEnabled()
    ])

    // Build a resolution→Hz lookup from Win32_VideoController entries
    // Each controller reports its current mode; match by width+height to screen
    const resolutionToHz = new Map<string, number>()
    for (const vc of controllers) {
      if (
        vc.CurrentHorizontalResolution != null &&
        vc.CurrentVerticalResolution != null &&
        vc.CurrentRefreshRate != null &&
        vc.CurrentRefreshRate > 0
      ) {
        const key = `${vc.CurrentHorizontalResolution}x${vc.CurrentVerticalResolution}`
        // Keep the highest Hz if multiple controllers share a resolution
        const existing = resolutionToHz.get(key) ?? 0
        if (vc.CurrentRefreshRate > existing) {
          resolutionToHz.set(key, vc.CurrentRefreshRate)
        }
      }
    }

    const monitors: DisplayMonitor[] = screens.map((s) => {
      const key = `${s.width}x${s.height}`
      const hz = resolutionToHz.get(key) ?? 0
      return {
        name: s.name,
        isPrimary: s.isPrimary,
        widthPx: s.width,
        heightPx: s.height,
        refreshRateHz: hz,
        hdrEnabled,          // Windows global HDR toggle; per-monitor is not reliably queryable without DXGI
        adaptiveSyncEnabled: adaptiveSync
      }
    })

    // Fallback: if we got no screens from WinForms, synthesise one from the first controller
    if (monitors.length === 0 && controllers.length > 0) {
      const vc = controllers[0]
      monitors.push({
        name: '\\\\.\\DISPLAY1',
        isPrimary: true,
        widthPx: vc.CurrentHorizontalResolution ?? 0,
        heightPx: vc.CurrentVerticalResolution ?? 0,
        refreshRateHz: vc.CurrentRefreshRate ?? 0,
        hdrEnabled,
        adaptiveSyncEnabled: adaptiveSync
      })
    }

    const primary = monitors.find((m) => m.isPrimary) ?? monitors[0] ?? null
    const primaryRefreshRateHz = primary?.refreshRateHz ?? 0
    const anyHdrEnabled = monitors.some((m) => m.hdrEnabled)
    const anyAdaptiveSyncEnabled = monitors.some((m) => m.adaptiveSyncEnabled === true)

    const data: DisplayData = {
      monitors,
      primaryRefreshRateHz,
      anyHdrEnabled,
      anyAdaptiveSyncEnabled
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
