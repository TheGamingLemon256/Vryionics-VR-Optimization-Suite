// VR Optimization Suite — Storage Scan Module
// Detects drive types, VR install drive, shader cache sizes, temp folder.

import { existsSync, statfsSync } from 'fs'
import { join } from 'path'
import { readKey } from '../../utils/registry-read'
import { runPowerShellJson, tryRunCmd } from '../../utils/powershell'
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
      queueLength: Math.round(i.CookedValue * 10) / 10,
    }))
  } catch {
    return []
  }
}

interface PhysicalDiskHint {
  friendlyName: string
  isNvme: boolean
}

/**
 * Walk Services\disk\Enum to find the PNP keys for every disk attached, then
 * read each device's FriendlyName. The bus class (SCSI, NVMe, IDE) tells us
 * whether a drive is NVMe; the FriendlyName carries vendor strings we use to
 * distinguish SSDs from spinning rust.
 */
async function readPhysicalDiskHints(): Promise<PhysicalDiskHint[]> {
  const enumKey = await readKey('HKLM\\SYSTEM\\CurrentControlSet\\Services\\disk\\Enum').catch(() => null)
  if (!enumKey) return []

  const hints: PhysicalDiskHint[] = []
  for (const [name, value] of Object.entries(enumKey.values)) {
    if (!/^\d+$/.test(name)) continue
    if (value.type !== 'REG_SZ') continue

    const pnpPath = value.data
    const isNvme = /\\nvme[_\\&]/i.test(pnpPath) || /\bNVMe\b/i.test(pnpPath)
    const deviceKey = await readKey(`HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${pnpPath}`).catch(() => null)
    const friendly = deviceKey?.values['FriendlyName']
    const friendlyName = friendly && friendly.type === 'REG_SZ' ? friendly.data : pnpPath
    hints.push({ friendlyName, isNvme })
  }
  return hints
}

function classifyDriveType(hints: PhysicalDiskHint[]): 'SSD' | 'NVMe' | 'HDD' {
  // Aggregate hint: any NVMe wins, else any SSD-like model wins, else HDD.
  if (hints.some(h => h.isNvme)) return 'NVMe'
  for (const h of hints) {
    const m = h.friendlyName.toLowerCase()
    if (m.includes('nvme') || m.includes('m.2')) return 'NVMe'
    if (m.includes('ssd') || m.includes('solid')) return 'SSD'
    if (/samsung\s*8[67]0/.test(m)) return 'SSD'
  }
  return hints.length > 0 ? 'HDD' : 'SSD'
}

interface LocalDrive {
  letter: string
  totalGB: number
  freeGB: number
}

function enumerateLocalDrives(): LocalDrive[] {
  const drives: LocalDrive[] = []
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const letter = String.fromCharCode(code)
    const root = `${letter}:\\`
    try {
      const stats = statfsSync(root)
      const totalBytes = stats.bsize * stats.blocks
      const freeBytes = stats.bsize * stats.bavail
      // statfs on a non-existent drive throws; guard against zero-byte mounts
      // anyway so removable optical drives don't show up as 0 GB entries.
      if (totalBytes <= 0) continue
      drives.push({
        letter: `${letter}:`,
        totalGB: Math.round((totalBytes / 1024 ** 3) * 10) / 10,
        freeGB: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
      })
    } catch {
      // Drive letter not mounted; skip silently.
    }
  }
  return drives
}

async function findVrInstallDrive(): Promise<string | null> {
  const script = `
$paths = @(
  "$env:ProgramFiles\\Steam\\steamapps",
  "${process.env.PROGRAMFILES}\\Steam\\steamapps",
  "C:\\Program Files (x86)\\Steam\\steamapps"
)
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
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'DXCache'),
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'GLCache'),
    join(process.env.LOCALAPPDATA || '', 'AMD', 'DxCache'),
    join(process.env.LOCALAPPDATA || '', 'D3DSCache'),
    join(process.env.APPDATA || '', '..', 'LocalLow', 'VRChat', 'VRChat', 'ShaderCache'),
  ]
  let total = 0
  for (const p of paths) {
    total += await getFolderSizeMB(p)
  }
  return total
}

async function getNvmeIdlePowerOptimal(): Promise<boolean | null> {
  // The Windows-wide knob StorPort\EnableIdlePowerManagement gates aggressive
  // NVMe APST. 0 = power saving disabled (good for VR), 1 = enabled (bad).
  const value = await readKey('HKLM\\SYSTEM\\CurrentControlSet\\Control\\StorPort').catch(() => null)
  if (!value) return null
  const idle = value.values['EnableIdlePowerManagement']
  if (!idle || idle.type !== 'REG_DWORD') return null
  return idle.data === 0
}

export async function scanStorage(): Promise<ScanModuleResult<StorageData>> {
  try {
    console.log('[scan:storage] Querying disk info...')

    const [physicalDiskHints, queueLengths, vrDrive, nvmeIdleOptimal] = await Promise.all([
      readPhysicalDiskHints(),
      getDriveQueueLengths(),
      findVrInstallDrive(),
      getNvmeIdlePowerOptimal(),
    ])

    const localDrives = enumerateLocalDrives()
    const aggregateType = classifyDriveType(physicalDiskHints)
    const drives: StorageDrive[] = []

    for (const d of localDrives) {
      const queue = queueLengths.find((q) => q.letter.includes(d.letter.replace(':', '')))

      drives.push({
        letter: d.letter,
        type: aggregateType,
        totalGB: d.totalGB,
        freeGB: d.freeGB,
        queueLength: queue?.queueLength ?? 0,
        temperature: null,
        wearPercent: null,
        nvmePowerStateOptimal: aggregateType === 'NVMe' ? nvmeIdleOptimal : null,
      })
    }

    const vrchatCachePath = join(
      process.env.APPDATA || '',
      '..', 'LocalLow', 'VRChat', 'VRChat'
    )
    const vrchatCacheSizeMB = await getFolderSizeMB(vrchatCachePath)
    const vrchatCacheSizeGB = Math.round(vrchatCacheSizeMB / 1024 * 10) / 10

    const tempFolderSizeMB = await getFolderSizeMB(process.env.TEMP || 'C:\\Windows\\Temp')

    const shaderCacheSizeMB = await getShaderCacheSizeMB()

    console.log(`[scan:storage] ${drives.length} drives, VR drive: ${vrDrive ?? 'undetected'}, shader cache: ${shaderCacheSizeMB}MB`)

    return {
      success: true,
      data: {
        drives,
        vrInstallDrive: vrDrive,
        shaderCacheSizeMB,
        tempFolderSizeMB,
        vrchatCacheSizeGB,
      }
    }
  } catch (error) {
    console.error('[scan:storage] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
