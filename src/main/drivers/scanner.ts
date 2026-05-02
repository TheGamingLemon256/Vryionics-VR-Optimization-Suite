// Vryionics VR Optimization Suite — Installed Driver Scanner
//
// Queries Windows PnP for every hardware device in the categories we cover,
// producing a list of `InstalledDriver` rows the updater then checks against
// vendor endpoints.
//
// Runs via async `spawn` so the Node event loop keeps pumping while
// PowerShell enumerates devices — otherwise `spawnSync` would block the
// main thread for the entire ~5–15 s query and freeze the renderer.
//
// The PS script is tuned for speed:
//   • -PresentOnly filters out ghost devices (halves the enumeration set)
//   • Get-CimInstance Win32_PnPSignedDriver returns driver metadata (version,
//     date, manufacturer) in one CIM call — avoiding 3×N Get-PnpDeviceProperty
//     round-trips that dominate the old implementation's cost.

import { spawn } from 'child_process'
import { log } from '../logger'
import type { DriverCategory, DriverVendor, InstalledDriver } from './types'

/**
 * Single-shot CIM query. Pulls every signed driver that Windows tracks in
 * the driver store along with its device metadata. Filters happen in JS
 * afterwards because client-side filtering on a modest (~200 rows) result
 * is faster than per-device PowerShell pipeline round-trips.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# One CIM call returns every driver record the Windows Driver Store tracks.
# Each record has DeviceName, DriverVersion, DriverDate, Manufacturer,
# DeviceClass, HardwareID, DeviceID — everything we need, no N-per-device
# round-trips.
$drivers = Get-CimInstance -ClassName Win32_PnPSignedDriver -Property DeviceName,DriverVersion,DriverDate,Manufacturer,DeviceClass,DeviceID

$rows = foreach ($d in $drivers) {
  if (-not $d.DriverVersion) { continue }
  if (-not $d.DeviceClass)   { continue }
  $cls = $d.DeviceClass.ToUpperInvariant()
  if ($cls -notin @('DISPLAY','USB','MEDIA','NET','HDC','BLUETOOTH','SYSTEM')) { continue }
  $dateStr = $null
  if ($d.DriverDate) {
    try { $dateStr = ([Management.ManagementDateTimeConverter]::ToDateTime($d.DriverDate)).ToString('yyyy-MM-dd') }
    catch { $dateStr = $null }
  }
  [pscustomobject]@{
    Class = $cls
    Name  = $d.DeviceName
    InstanceId = $d.DeviceID
    Version    = $d.DriverVersion
    Date       = $dateStr
    Manufacturer = $d.Manufacturer
  }
}

$rows | ConvertTo-Json -Compress -Depth 3
`

interface RawRow {
  Class: string
  Name: string
  InstanceId: string
  Version: string
  Date: string | null
  Manufacturer: string | null
}

/** Best-effort classification of a driver row into our category taxonomy. */
function categorize(row: RawRow): DriverCategory | null {
  const name = (row.Name ?? '').toLowerCase()
  const cls = (row.Class ?? '').toLowerCase()

  if (cls === 'display') {
    if (/microsoft basic|remote desktop|virtual/.test(name)) return null
    return 'gpu'
  }
  if (cls === 'usb' && /controller|xhci|ehci|usb 3/i.test(row.Name)) return 'usb'
  if (cls === 'media' && /audio|realtek|intel.*smart.*sound|high definition/i.test(row.Name)) return 'audio'
  if (cls === 'net') {
    if (/wi-?fi|wireless|wlan|ax\d{3}|be\d{3}|8265|9260|ac\s*\d/i.test(row.Name)) return 'wifi'
    if (/bluetooth/i.test(row.Name)) return 'bluetooth'
    if (/ethernet|gigabit|realtek\s*pcie\s*gbe|i2\d{2}|i3\d{2}/i.test(row.Name)) return 'ethernet'
    return 'ethernet'
  }
  if (cls === 'system' && /chipset|sm\s*bus|lpc|pci\s*express\s*root|platform/i.test(row.Name)) return 'chipset'
  if (cls === 'bluetooth') return 'bluetooth'
  return null
}

function vendorFromManufacturer(manufacturer: string | null, hardwareName: string): DriverVendor {
  const m = (manufacturer ?? '').toLowerCase()
  const n = (hardwareName ?? '').toLowerCase()
  if (/nvidia/.test(m) || /nvidia|geforce|rtx|gtx/.test(n)) return 'NVIDIA'
  if (/advanced micro devices|\bamd\b/.test(m) || /\bamd\b|radeon|\brx\s/.test(n)) return 'AMD'
  if (/\bintel\b/.test(m) || /intel|arc\b|iris|uhd graphics/.test(n)) return 'Intel'
  if (/realtek/.test(m) || /realtek/.test(n)) return 'Realtek'
  if (/qualcomm|atheros/.test(m) || /qualcomm|atheros|qca/.test(n)) return 'Qualcomm'
  if (/mediatek/.test(m) || /mediatek|mtk/.test(n)) return 'MediaTek'
  if (/microsoft/.test(m)) return 'Microsoft'
  return 'Unknown'
}

function makeId(cat: DriverCategory, vendor: DriverVendor, name: string, instanceId: string): string {
  const suffix = instanceId.split('\\').pop()?.substring(0, 12) ?? ''
  const slug = `${cat}-${vendor}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug}-${suffix}`.substring(0, 96)
}

/**
 * Run PowerShell asynchronously with an overall timeout. Returns stdout on
 * success or throws on error/timeout. Crucially uses `spawn` (not
 * `spawnSync`) so the Node event loop keeps processing IPC while the
 * child runs — the renderer UI stays responsive.
 */
function runPsAsync(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (c: string) => { stdout += c })
    child.stderr.on('data', (c: string) => { stderr += c })

    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      reject(new Error(`PowerShell exceeded ${timeoutMs / 1000}s timeout`))
    }, timeoutMs)

    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        return reject(new Error(`PowerShell exited ${code}: ${stderr.substring(0, 300)}`))
      }
      resolve(stdout)
    })
  })
}

/**
 * Scan Windows for installed drivers in our category set.
 * Async — does not block the Node event loop. The renderer stays responsive
 * while PowerShell enumerates devices in the background.
 */
export async function scanInstalledDrivers(): Promise<InstalledDriver[]> {
  const startedAt = Date.now()
  log.info('drivers:scanner', 'Scanning installed drivers (async PnP)...')

  let stdout: string
  try {
    stdout = await runPsAsync(PS_SCRIPT, 30_000)
  } catch (err) {
    log.warn('drivers:scanner', 'PnP scan failed:', err as Error)
    return []
  }

  let raw: RawRow[] = []
  try {
    const text = stdout.trim() || '[]'
    const parsed = JSON.parse(text)
    raw = Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    log.warn('drivers:scanner', `PnP JSON parse failed: ${(err as Error).message}`)
    return []
  }

  const drivers: InstalledDriver[] = []
  const seenIds = new Set<string>()
  for (const row of raw) {
    const category = categorize(row)
    if (!category) continue
    const vendor = vendorFromManufacturer(row.Manufacturer, row.Name)
    const id = makeId(category, vendor, row.Name, row.InstanceId)
    if (seenIds.has(id)) continue
    seenIds.add(id)
    drivers.push({
      id,
      vendor,
      category,
      hardwareName: row.Name,
      installedVersion: String(row.Version),
      installedDate: row.Date ?? undefined,
    })
  }

  log.info(
    'drivers:scanner',
    `Detected ${drivers.length} driver rows across ${new Set(drivers.map((d) => d.category)).size} categories in ${Date.now() - startedAt}ms`,
  )
  return drivers
}
