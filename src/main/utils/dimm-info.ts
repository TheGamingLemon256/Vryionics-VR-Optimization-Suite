// One-shot DIMM info read via Win32_PhysicalMemory.
//
// We removed PowerShell wholesale during the WMI migration, but the only
// reliable way to read DIMM speed/type/slot population on Windows without
// a native helper is via Win32_PhysicalMemory. The registry doesn't
// surface SMBIOS Type 17 records, wmic.exe is gone in 24H2+, and the
// alternative (skip the data) made the RAM card show Unknown @ 0 MHz on
// every machine and tripped the single-channel warning on every machine.
//
// So this module exists as a deliberate, scoped exception: spawn
// powershell.exe once per scan with -NoProfile -NonInteractive, run a
// single read-only CIM query, parse the JSON, exit. No Add-Type, no
// runtime-compiled C#, no DllImport, no persistent process. The whole
// call returns in ~250-400 ms on a cold-start.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface DimmInfo {
  /** Capacity in GB (rounded to 1 decimal). */
  capacityGB: number
  /** Rated speed from SPD (MHz). 0 if unreadable. */
  speedMHz: number
  /** Configured / running speed (MHz). Often equal to rated; differs when XMP is off. */
  configuredSpeedMHz: number
  manufacturer: string
  partNumber: string
  type: 'DDR3' | 'DDR4' | 'DDR5' | 'Unknown'
  bankLabel: string
  deviceLocator: string
}

// SMBIOS spec memory-type codes for the values we care about.
const SMBIOS_TYPE_MAP: Record<number, DimmInfo['type']> = {
  0x18: 'DDR3',
  0x1A: 'DDR4',
  0x22: 'DDR5',
}

const PS_QUERY = (
  'Get-CimInstance -ClassName Win32_PhysicalMemory | ' +
  'Select-Object Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber, SMBIOSMemoryType, BankLabel, DeviceLocator | ' +
  'ConvertTo-Json -Compress -Depth 2'
)

interface RawRow {
  Capacity?: number | string
  Speed?: number | string
  ConfiguredClockSpeed?: number | string
  Manufacturer?: string
  PartNumber?: string
  SMBIOSMemoryType?: number | string
  BankLabel?: string
  DeviceLocator?: string
}

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function readDimmInfo(): Promise<DimmInfo[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_QUERY],
      { encoding: 'utf-8', timeout: 8000, windowsHide: true },
    )
    const trimmed = stdout.trim()
    if (!trimmed) return null
    const parsed: unknown = JSON.parse(trimmed)
    const rows: RawRow[] = Array.isArray(parsed) ? (parsed as RawRow[]) : [parsed as RawRow]
    if (rows.length === 0) return null

    return rows.map((r) => ({
      capacityGB: Math.round((num(r.Capacity) / (1024 ** 3)) * 10) / 10,
      speedMHz: num(r.Speed),
      configuredSpeedMHz: num(r.ConfiguredClockSpeed) || num(r.Speed),
      manufacturer: str(r.Manufacturer),
      partNumber: str(r.PartNumber),
      type: SMBIOS_TYPE_MAP[num(r.SMBIOSMemoryType)] ?? 'Unknown',
      bankLabel: str(r.BankLabel),
      deviceLocator: str(r.DeviceLocator),
    }))
  } catch {
    return null
  }
}
