// VR Optimization Suite — Storage Scan Module
// Detects drive types, VR install drive, shader cache sizes, temp folder.

import { queryDiskDrives, queryLogicalDisks } from '../../utils/wmi'
import { runPowerShellJson, tryRunCmd, tryRunPowerShell } from '../../utils/powershell'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ScanModuleResult, StorageData, StorageDrive } from '../types'

interface DriveQueueLength {
  letter: string
  queueLength: number
}

async function getDriveQueueLengths(): Promise<DriveQueueLength[]> {
  const script = `
$counters = Get-Counter '\\PhysicalDisk(*)\\Current Disk Queue Length' -SampleInterval 1 -MaxSamples 2 -ErrorAction SilentlyContinue
$counters.CounterSamples | Where-Object { $_.InstanceName -ne '_total' } |
  Select-Object InstanceName, CookedValue |
  ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShellJson<Array<{ InstanceName: string; CookedValue: number }>>(script)
    const items = Array.isArray(raw) ? raw : [raw]
    return items.map((i) => ({
      letter: i.InstanceName,
      queueLength: Math.round(i.CookedValue * 10) / 10
    }))
  } catch {
    return []
  }
}

function detectDriveType(model: string, mediaType: string): 'SSD' | 'NVMe' | 'HDD' {
  const m = model.toLowerCase()
  const t = mediaType.toLowerCase()
  if (t.includes('nvme') || m.includes('nvme') || m.includes('m.2')) return 'NVMe'
  if (t.includes('ssd') || m.includes('ssd') || m.includes('solid')) return 'SSD'
  if (t.includes('fixed hard disk')) {
    // Could be HDD or SSD — check for known SSD keywords
    if (m.includes('samsung') && (m.includes('870') || m.includes('860') || m.includes('ssd'))) return 'SSD'
    return 'HDD'
  }
  return 'HDD'
}

async function findVrInstallDrive(): Promise<string | null> {
  // Check Steam library paths from registry/config
  const script = `
$paths = @(
  "$env:ProgramFiles\\Steam\\steamapps",
  "${process.env.PROGRAMFILES}\\Steam\\steamapps",
  "C:\\Program Files (x86)\\Steam\\steamapps"
)
# Also check Steam library config
$libraryConfig = "$env:ProgramFiles (x86)\\Steam\\steamapps\\libraryfolders.vdf"
if (Test-Path $libraryConfig) {
  $content = Get-Content $libraryConfig -Raw
  $matches = [regex]::Matches($content, '"path"\\s+"([^"]+)"')
  foreach ($match in $matches) {
    $paths += $match.Groups[1].Value + "\\steamapps"
  }
}
$vrPaths = @("VRChat", "SteamVR", "vrchat")
foreach ($base in $paths) {
  if (Test-Path $base) {
    foreach ($vr in $vrPaths) {
      if (Test-Path (Join-Path $base "common\\$vr")) {
        $base.Substring(0, 1)
        exit
      }
    }
  }
}
`
  try {
    const result = await tryRunCmd(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`, 10000)
    return result ? result.trim().charAt(0).toUpperCase() : null
  } catch {
    return null
  }
}

async function getFolderSizeMB(path: string): Promise<number> {
  if (!existsSync(path)) return 0
  const script = `(Get-ChildItem -Path "${path}" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum`
  try {
    const result = await tryRunCmd(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`, 15000)
    return result ? Math.round(parseFloat(result) / 1024 / 1024) : 0
  } catch {
    return 0
  }
}

async function getShaderCacheSizeMB(): Promise<number> {
  const paths = [
    // NVIDIA shader cache
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'DXCache'),
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'GLCache'),
    // AMD shader cache
    join(process.env.LOCALAPPDATA || '', 'AMD', 'DxCache'),
    // D3D shader cache (GPU-vendor-agnostic)
    join(process.env.LOCALAPPDATA || '', 'D3DSCache'),
    // VRChat shader cache
    join(process.env.APPDATA || '', '..', 'LocalLow', 'VRChat', 'VRChat', 'ShaderCache')
  ]
  let total = 0
  for (const p of paths) {
    total += await getFolderSizeMB(p)
  }
  return total
}

async function getNvmePowerStateOptimal(driveLetter: string): Promise<boolean | null> {
  try {
    const out = await tryRunPowerShell(`
# Find the physical disk corresponding to this drive letter
$vol = Get-Volume -DriveLetter '${driveLetter}' -EA SilentlyContinue
if (!$vol) { return }
$part = Get-Partition -DriveLetter '${driveLetter}' -EA SilentlyContinue | Select-Object -First 1
if (!$part) { return }
$disk = Get-PhysicalDisk -EA SilentlyContinue | Where-Object {
  (Get-Disk -Number $part.DiskNumber -EA SilentlyContinue).UniqueId -eq $_.UniqueId
} | Select-Object -First 1
if (!$disk) { return }
# Check if NVMe
if ($disk.BusType -ne 'NVMe') { Write-Output 'not-nvme'; return }
Write-Output 'is-nvme'
# Check NVMe APST (Autonomous Power State Transition) — power saving feature
# APST can cause intermittent latency spikes under VR load
$driverKey = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\SCSI' -EA SilentlyContinue |
  Get-ChildItem -EA SilentlyContinue |
  Where-Object { (Get-ItemProperty -Path $_.PSPath -EA SilentlyContinue).FriendlyName -like '*NVMe*' -or (Get-ItemProperty -Path $_.PSPath -EA SilentlyContinue).FriendlyName -like '*SSD*' } |
  Select-Object -First 1
if ($driverKey) {
  $apst = (Get-ItemProperty -Path "$($driverKey.PSPath)\\Device Parameters\\QUERY PROTOCOL" -Name 'APSTPowerState' -EA SilentlyContinue).APSTPowerState
  if ($apst -ne $null) { Write-Output "apst:$apst" }
}
# Check Windows NVMe power management policy
$nvmePolicy = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\StorPort' -Name 'EnableIdlePowerManagement' -EA SilentlyContinue).EnableIdlePowerManagement
if ($nvmePolicy -ne $null) { Write-Output "idlepm:$nvmePolicy" }
`, 12000)

    if (!out) return null
    if (out.includes('not-nvme')) return null
    if (!out.includes('is-nvme')) return null

    // Check idle power management
    const idlePmMatch = out.match(/^idlepm:(\d+)/m)
    if (idlePmMatch) {
      // 0 = power saving disabled (optimal for VR), 1 = power saving enabled (bad for VR)
      return idlePmMatch[1] === '0'
    }

    // If we know it's NVMe but can't determine power state, assume optimal
    return true
  } catch {
    return null
  }
}

export async function scanStorage(): Promise<ScanModuleResult<StorageData>> {
  try {
    console.log('[scan:storage] Querying disk info...')

    const [physicalDisks, logicalDisks, queueLengths, vrDrive] = await Promise.all([
      queryDiskDrives(),
      queryLogicalDisks(),
      getDriveQueueLengths(),
      findVrInstallDrive()
    ])

    // Build drive list from logical disks (DriveType 3 = local disk)
    const localDisks = logicalDisks.filter((d) => d.DriveType === 3)
    const drives: StorageDrive[] = []
    for (const d of localDisks) {
      const totalGB = Math.round(Number(d.Size) / 1024 / 1024 / 1024 * 10) / 10
      const freeGB = Math.round(Number(d.FreeSpace) / 1024 / 1024 / 1024 * 10) / 10
      const letter = d.DeviceID.replace(':', '').trim()
      const queue = queueLengths.find((q) => q.letter.includes(letter))

      // Try to match to physical disk for type detection
      // Without a direct mapping, default to SSD (most modern systems)
      const physicalDisk = physicalDisks[0] // Simplified: use first disk as type reference
      const driveType: 'SSD' | 'NVMe' | 'HDD' = physicalDisk
        ? detectDriveType(physicalDisk.Model, physicalDisk.MediaType)
        : 'SSD'

      const nvmePowerStateOptimal = driveType === 'NVMe'
        ? await getNvmePowerStateOptimal(letter)
        : null

      drives.push({
        letter: d.DeviceID,
        type: driveType,
        totalGB,
        freeGB,
        queueLength: queue?.queueLength ?? 0,
        temperature: null, // Requires vendor-specific SMART data
        wearPercent: null, // Requires NVMe vendor commands
        nvmePowerStateOptimal
      })
    }

    // VRChat cache size
    const vrchatCachePath = join(
      process.env.APPDATA || '',
      '..', 'LocalLow', 'VRChat', 'VRChat'
    )
    const vrchatCacheSizeMB = await getFolderSizeMB(vrchatCachePath)
    const vrchatCacheSizeGB = Math.round(vrchatCacheSizeMB / 1024 * 10) / 10

    // Temp folder
    const tempFolderSizeMB = await getFolderSizeMB(process.env.TEMP || 'C:\\Windows\\Temp')

    // Shader cache
    const shaderCacheSizeMB = await getShaderCacheSizeMB()

    console.log(`[scan:storage] ${drives.length} drives, VR drive: ${vrDrive ?? 'undetected'}, shader cache: ${shaderCacheSizeMB}MB`)

    return {
      success: true,
      data: {
        drives,
        vrInstallDrive: vrDrive,
        shaderCacheSizeMB,
        tempFolderSizeMB,
        vrchatCacheSizeGB
      }
    }
  } catch (error) {
    console.error('[scan:storage] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
