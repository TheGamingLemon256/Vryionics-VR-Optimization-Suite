// VR Optimization Suite — WMI Query Utilities
// See CODING-RULES-DICTIONARY.md Section 12: WMI Queries
//
// Uses PowerShell Get-CimInstance (not deprecated Get-WmiObject).
// Always pipe through Select-Object to limit output, and ConvertTo-Json for parsing.

import { runPowerShellJson, tryRunPowerShell } from './powershell'

/**
 * Query a WMI class via PowerShell and return parsed JSON results.
 * @param className - WMI class name (e.g. "Win32_Processor")
 * @param properties - Properties to select (e.g. ["Name", "NumberOfCores"])
 */
export async function queryWmi<T = Record<string, unknown>>(
  className: string,
  properties: string[]
): Promise<T[]> {
  const select = properties.join(', ')
  const script = `Get-CimInstance ${className} | Select-Object ${select} | ConvertTo-Json -Compress`

  try {
    const result = await runPowerShellJson<T | T[]>(script)
    // PowerShell returns a single object (not array) if there's only one result
    return Array.isArray(result) ? result : [result]
  } catch {
    return []
  }
}

// ── Pre-built WMI Queries ────────────────────────────────────

export interface WmiCpuInfo {
  Name: string
  NumberOfCores: number
  NumberOfLogicalProcessors: number
  MaxClockSpeed: number
  L3CacheSize: number
  Description: string
}

export interface WmiGpuInfo {
  Name: string
  DriverVersion: string
  AdapterRAM: number
  PNPDeviceID: string
  VideoProcessor: string
  DriverDate: string | null // WMI CIM_DATETIME string e.g. '20240115000000.000000+000'
}

export interface WmiRamInfo {
  Capacity: string // string because it's a uint64
  Speed: number
  /** Deprecated field — unreliable on modern DDR5 boards. Prefer SMBIOSMemoryType. */
  MemoryType: number
  /** JEDEC-aligned SMBIOS type: 24=DDR3, 26=DDR4, 34=DDR5. More reliable than MemoryType. */
  SMBIOSMemoryType: number
  ConfiguredClockSpeed: number
  Manufacturer: string
  DeviceLocator: string
}

export interface WmiDiskInfo {
  Model: string
  MediaType: string
  Size: string // string because uint64
}

export interface WmiLogicalDisk {
  DeviceID: string
  FreeSpace: string
  Size: string
  DriveType: number
}

export interface WmiServiceInfo {
  Name: string
  DisplayName: string
  State: string
  StartMode: string
}

export async function queryCpuInfo(): Promise<WmiCpuInfo[]> {
  return queryWmi<WmiCpuInfo>('Win32_Processor', [
    'Name',
    'NumberOfCores',
    'NumberOfLogicalProcessors',
    'MaxClockSpeed',
    'L3CacheSize',
    'Description'
  ])
}

export async function queryGpuInfo(): Promise<WmiGpuInfo[]> {
  return queryWmi<WmiGpuInfo>('Win32_VideoController', [
    'Name',
    'DriverVersion',
    'AdapterRAM',
    'PNPDeviceID',
    'VideoProcessor',
    'DriverDate'
  ])
}

export async function queryRamInfo(): Promise<WmiRamInfo[]> {
  return queryWmi<WmiRamInfo>('Win32_PhysicalMemory', [
    'Capacity',
    'Speed',
    'MemoryType',
    'SMBIOSMemoryType',
    'ConfiguredClockSpeed',
    'Manufacturer',
    'DeviceLocator'
  ])
}

export async function queryDiskDrives(): Promise<WmiDiskInfo[]> {
  return queryWmi<WmiDiskInfo>('Win32_DiskDrive', ['Model', 'MediaType', 'Size'])
}

export async function queryLogicalDisks(): Promise<WmiLogicalDisk[]> {
  return queryWmi<WmiLogicalDisk>('Win32_LogicalDisk', [
    'DeviceID',
    'FreeSpace',
    'Size',
    'DriveType'
  ])
}

export async function queryServices(): Promise<WmiServiceInfo[]> {
  return queryWmi<WmiServiceInfo>('Win32_Service', [
    'Name',
    'DisplayName',
    'State',
    'StartMode'
  ])
}

/**
 * Get Windows version info.
 */
export async function queryWindowsVersion(): Promise<{ version: string; buildNumber: string } | null> {
  try {
    const script = `
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Version, BuildNumber
@{ version = $os.Version; buildNumber = $os.BuildNumber } | ConvertTo-Json -Compress
`
    return await runPowerShellJson<{ version: string; buildNumber: string }>(script)
  } catch {
    return null
  }
}

/**
 * Get memory performance counters.
 */
export async function queryMemoryCounters(): Promise<{
  commitChargePercent: number
  nonpagedPoolBytes: number
  modifiedPageListBytes: number
} | null> {
  try {
    const script = `
$os = Get-CimInstance Win32_OperatingSystem
$commitPercent = [math]::Round(($os.TotalVirtualMemorySize - $os.FreeVirtualMemory) / $os.TotalVirtualMemorySize * 100, 1)
$counters = Get-Counter '\\Memory\\Pool Nonpaged Bytes','\\Memory\\Modified Page List Bytes' -ErrorAction SilentlyContinue
$nonpaged = $counters.CounterSamples[0].CookedValue
$modified = $counters.CounterSamples[1].CookedValue
@{ commitChargePercent = $commitPercent; nonpagedPoolBytes = $nonpaged; modifiedPageListBytes = $modified } | ConvertTo-Json -Compress
`
    return await runPowerShellJson(script)
  } catch {
    return null
  }
}
