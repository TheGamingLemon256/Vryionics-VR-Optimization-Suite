// VR Optimization Suite — Event Log Scanner Module
// Reads Windows Event Log for GPU TDR events, WHEA hardware errors,
// and SteamVR crash events from the last 7 days.

import { tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, EventLogData } from '../types'

export async function scanEventLog(): Promise<ScanModuleResult<EventLogData>> {
  console.log('[scan:event-log] Starting event log scan (last 7 days)...')
  let gpuTdrEvents = 0
  let wheaErrors = 0
  let steamvrCrashes = 0
  let lastGpuTdrTime: string | null = null
  const criticalErrors: string[] = []

  try {
    // GPU TDR events (Event ID 4101 in System log — "Display driver stopped responding and has recovered")
    const tdrOut = await tryRunPowerShell(`
$since = (Get-Date).AddDays(-7)
$events = Get-WinEvent -FilterHashtable @{
  LogName = 'System'
  Id = 4101
  StartTime = $since
} -EA SilentlyContinue -MaxEvents 50
if ($events) {
  Write-Output "count:$($events.Count)"
  $latest = ($events | Sort-Object TimeCreated -Descending | Select-Object -First 1).TimeCreated
  Write-Output "latest:$latest"
  # Output first few messages
  $events | Select-Object -First 3 | ForEach-Object { Write-Output "msg:$($_.Message.Split([char]10)[0])" }
}
`, 15000)
    if (tdrOut) {
      const countMatch = tdrOut.match(/^count:(\d+)/m)
      if (countMatch) gpuTdrEvents = parseInt(countMatch[1])
      const latestMatch = tdrOut.match(/^latest:(.+)/m)
      if (latestMatch) lastGpuTdrTime = latestMatch[1].trim()
      const msgs = tdrOut.match(/^msg:(.+)/gm)
      if (msgs) {
        for (const m of msgs.slice(0, 2)) {
          criticalErrors.push(m.replace('msg:', '').trim())
        }
      }
    }

    // Also check Display log for TDR (ID 4101 may be in System or Application)
    const tdrOut2 = await tryRunPowerShell(`
$since = (Get-Date).AddDays(-7)
$events = Get-WinEvent -FilterHashtable @{
  LogName = 'Application'
  Id = 1001
  StartTime = $since
} -EA SilentlyContinue -MaxEvents 20 |
  Where-Object { $_.Message -like '*Display*' -or $_.Message -like '*GPU*' -or $_.Message -like '*video*' }
if ($events) { Write-Output "count:$($events.Count)" }
`, 12000)
    if (tdrOut2) {
      const m = tdrOut2.match(/^count:(\d+)/m)
      if (m) gpuTdrEvents = Math.max(gpuTdrEvents, parseInt(m[1]))
    }

    // WHEA hardware errors (Event ID 1, 18, 19 in Microsoft-Windows-WHEA-Logger/Operational)
    const wheaOut = await tryRunPowerShell(`
$since = (Get-Date).AddDays(-7)
$events = Get-WinEvent -FilterHashtable @{
  LogName = 'Microsoft-Windows-WHEA-Logger/Operational'
  StartTime = $since
} -EA SilentlyContinue -MaxEvents 50
if ($events) {
  Write-Output "count:$($events.Count)"
  $events | Select-Object -First 2 | ForEach-Object { Write-Output "msg:$($_.Message.Split([char]10)[0])" }
}
`, 15000)
    if (wheaOut) {
      const m = wheaOut.match(/^count:(\d+)/m)
      if (m) wheaErrors = parseInt(m[1])
      const msgs = wheaOut.match(/^msg:(.+)/gm)
      if (msgs) {
        for (const msg of msgs.slice(0, 2)) {
          criticalErrors.push('WHEA: ' + msg.replace('msg:', '').trim())
        }
      }
    }

    // SteamVR crashes — look in Application log for vrserver crashes
    const steamvrOut = await tryRunPowerShell(`
$since = (Get-Date).AddDays(-7)
$events = Get-WinEvent -FilterHashtable @{
  LogName = 'Application'
  StartTime = $since
} -EA SilentlyContinue -MaxEvents 100 |
  Where-Object { $_.Message -like '*vrserver*' -or $_.Message -like '*SteamVR*' -or $_.Message -like '*VRChat*' } |
  Where-Object { $_.LevelDisplayName -eq 'Error' -or $_.LevelDisplayName -eq 'Critical' }
if ($events) { Write-Output "count:$($events.Count)" }
`, 15000)
    if (steamvrOut) {
      const m = steamvrOut.match(/^count:(\d+)/m)
      if (m) steamvrCrashes = parseInt(m[1])
    }

    console.log(
      `[scan:event-log] Complete — gpuTDR=${gpuTdrEvents} lastTDR=${lastGpuTdrTime ?? 'none'} ` +
      `wheaErrors=${wheaErrors} steamvrCrashes=${steamvrCrashes} ` +
      `criticalErrors=${criticalErrors.length}`
    )
    if (criticalErrors.length > 0) {
      console.warn(`[scan:event-log] Critical errors found:\n  ${criticalErrors.join('\n  ')}`)
    }
    return {
      success: true,
      data: { gpuTdrEvents, wheaErrors, steamvrCrashes, lastGpuTdrTime, criticalErrors }
    }
  } catch (error) {
    console.error(`[scan:event-log] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { gpuTdrEvents, wheaErrors, steamvrCrashes, lastGpuTdrTime, criticalErrors }
    }
  }
}
