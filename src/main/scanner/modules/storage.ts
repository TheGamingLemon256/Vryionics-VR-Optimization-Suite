// VR Optimization Suite — Storage Scan Module
// Detects drive types, VR install drive, shader cache sizes, temp folder.

import { existsSync, readFileSync, readdirSync, statSync, statfsSync } from 'fs'
import { join } from 'path'
import { readKey } from '../../utils/registry-read'
import { readCounters } from '../../utils/typeperf'
import type { ScanModuleResult, StorageData, StorageDrive } from '../types'

interface DriveQueueLength {
  letter: string
  queueLength: number
}

async function getDriveQueueLengths(): Promise<DriveQueueLength[]> {
  const samples = await readCounters(['\\PhysicalDisk(*)\\Current Disk Queue Length'], 1, 10000)
  if (!samples) return []
  const out: DriveQueueLength[] = []
  for (const s of samples) {
    const m = s.counter.match(/PhysicalDisk\(([^)]+)\)/i)
    if (!m) continue
    const inst = m[1]
    if (inst.toLowerCase() === '_total') continue
    out.push({
      letter: inst,
      queueLength: Math.round(s.value * 10) / 10,
    })
  }
  return out
}

interface PhysicalDiskHint {
  friendlyName: string
  isNvme: boolean
}

/**
 * Walk Services\disk\Enum to find the PNP keys for every disk attached, then
 * read each device's FriendlyName. The bus class (SCSI, NVMe, IDE) tells us
 * whether a drive is NVMe; the FriendlyName carries vendor strings used to
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
  if (hints.some((h) => h.isNvme)) return 'NVMe'
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
      if (totalBytes <= 0) continue
      drives.push({
        letter: `${letter}:`,
        totalGB: Math.round((totalBytes / 1024 ** 3) * 10) / 10,
        freeGB: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
      })
    } catch {
      // not mounted
    }
  }
  return drives
}

function steamLibraryRoots(): string[] {
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps',
    `${process.env.PROGRAMFILES ?? ''}\\Steam\\steamapps`,
    `${process.env['PROGRAMFILES(X86)'] ?? ''}\\Steam\\steamapps`,
  ].filter((p) => p && !p.startsWith('\\'))

  const roots = new Set<string>()
  for (const r of candidates) {
    if (existsSync(r)) roots.add(r)
  }

  // libraryfolders.vdf names additional library paths the user added.
  for (const r of [...roots]) {
    const vdf = join(r, 'libraryfolders.vdf')
    if (!existsSync(vdf)) continue
    try {
      const content = readFileSync(vdf, 'utf8')
      const re = /"path"\s+"([^"]+)"/g
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        const path = match[1].replace(/\\\\/g, '\\')
        const sub = join(path, 'steamapps')
        if (existsSync(sub)) roots.add(sub)
      }
    } catch {
      // unreadable, skip
    }
  }

  return [...roots]
}

function findVrInstallDrive(): string | null {
  const vrFolders = ['VRChat', 'SteamVR', 'vrchat']
  for (const base of steamLibraryRoots()) {
    const common = join(base, 'common')
    for (const name of vrFolders) {
      if (existsSync(join(common, name))) {
        return base.charAt(0).toUpperCase()
      }
    }
  }
  return null
}

function folderSizeBytes(path: string, depthLimit = 12): number {
  if (!existsSync(path)) return 0
  let total = 0
  const stack: Array<{ p: string; depth: number }> = [{ p: path, depth: 0 }]
  while (stack.length) {
    const { p, depth } = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(p)
    } catch {
      continue
    }
    for (const entry of entries) {
      const child = join(p, entry)
      let s
      try {
        s = statSync(child)
      } catch {
        continue
      }
      if (s.isDirectory()) {
        if (depth < depthLimit) stack.push({ p: child, depth: depth + 1 })
      } else if (s.isFile()) {
        total += s.size
      }
    }
  }
  return total
}

function folderSizeMB(path: string): number {
  return Math.round(folderSizeBytes(path) / 1024 / 1024)
}

function getShaderCacheSizeMB(): number {
  const paths = [
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'DXCache'),
    join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'GLCache'),
    join(process.env.LOCALAPPDATA || '', 'AMD', 'DxCache'),
    join(process.env.LOCALAPPDATA || '', 'D3DSCache'),
    join(process.env.APPDATA || '', '..', 'LocalLow', 'VRChat', 'VRChat', 'ShaderCache'),
  ]
  let total = 0
  for (const p of paths) total += folderSizeMB(p)
  return total
}

async function getNvmeIdlePowerOptimal(): Promise<boolean | null> {
  const value = await readKey('HKLM\\SYSTEM\\CurrentControlSet\\Control\\StorPort').catch(() => null)
  if (!value) return null
  const idle = value.values['EnableIdlePowerManagement']
  if (!idle || idle.type !== 'REG_DWORD') return null
  return idle.data === 0
}

export async function scanStorage(): Promise<ScanModuleResult<StorageData>> {
  try {
    console.log('[scan:storage] Querying disk info...')

    const [physicalDiskHints, queueLengths, nvmeIdleOptimal] = await Promise.all([
      readPhysicalDiskHints(),
      getDriveQueueLengths(),
      getNvmeIdlePowerOptimal(),
    ])
    const vrDrive = findVrInstallDrive()

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

    const vrchatCachePath = join(process.env.APPDATA || '', '..', 'LocalLow', 'VRChat', 'VRChat')
    const vrchatCacheSizeMB = folderSizeMB(vrchatCachePath)
    const vrchatCacheSizeGB = Math.round((vrchatCacheSizeMB / 1024) * 10) / 10

    const tempFolderSizeMB = folderSizeMB(process.env.TEMP || 'C:\\Windows\\Temp')

    const shaderCacheSizeMB = getShaderCacheSizeMB()

    console.log(`[scan:storage] ${drives.length} drives, VR drive: ${vrDrive ?? 'undetected'}, shader cache: ${shaderCacheSizeMB}MB`)

    return {
      success: true,
      data: {
        drives,
        vrInstallDrive: vrDrive,
        shaderCacheSizeMB,
        tempFolderSizeMB,
        vrchatCacheSizeGB,
      },
    }
  } catch (error) {
    console.error('[scan:storage] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
