// VR Optimization Suite — RAM Scan Module
// Collects RAM capacity, speed, type, channels, and performance counters.

import { queryRamInfo, queryMemoryCounters } from '../../utils/wmi'
import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, RamData } from '../types'

interface OsMemory {
  TotalVisibleMemorySize: number   // KB
  FreePhysicalMemory: number       // KB
  TotalVirtualMemorySize: number   // KB
  FreeVirtualMemory: number        // KB
  SizeStoredInPagingFiles: number  // KB
  FreeSpaceInPagingFiles: number   // KB
}

async function getOsMemory(): Promise<OsMemory | null> {
  const script = `Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory, TotalVirtualMemorySize, FreeVirtualMemory, SizeStoredInPagingFiles, FreeSpaceInPagingFiles | ConvertTo-Json -Compress`
  try {
    return await runPowerShellJson<OsMemory>(script)
  } catch {
    return null
  }
}

/**
 * Resolve RAM type from SMBIOS and legacy MemoryType fields.
 *
 * SMBIOSMemoryType is the correct JEDEC-aligned field and should always be
 * preferred. MemoryType (Win32_PhysicalMemory.MemoryType) is a deprecated
 * field that modern DDR5 board firmware often leaves at 0 ("Unknown") or
 * reports incorrectly, causing the DDR4/DDR5 inversion bug.
 *
 * JEDEC values (identical for both fields):
 *   24 = DDR3, 26 = DDR4, 34 = DDR5
 */
function mapMemoryType(smbiosType: number, legacyType: number): 'DDR4' | 'DDR5' | 'Unknown' {
  // Prefer SMBIOSMemoryType — it's reliable on DDR4 and DDR5 platforms.
  if (smbiosType === 26) return 'DDR4'
  if (smbiosType === 34) return 'DDR5'

  // Fall back to legacy MemoryType only when SMBIOS returns 0 or an unrecognised value.
  if (legacyType === 26) return 'DDR4'
  if (legacyType === 34) return 'DDR5'

  return 'Unknown'
}

export interface DimmDescriptor {
  slot: number
  sizeGB: number
}

export type ChannelMode = 'single' | 'dual'

/**
 * Decide single vs dual channel from the populated DIMM set.
 *
 * Reasoning: the WMI MemoryChannel report and BankLabel strings are
 * unreliable across BIOS vendors. What we can trust is which slots are
 * populated and the size of each stick. Dual channel requires at least
 * two equal-size sticks; mixed sizes force flex / single-channel mode
 * for the asymmetric portion. Slot numbering is BIOS-dependent so we
 * only use it for tie-breaking, not for channel identification.
 */
export function detectChannelMode(dimms: DimmDescriptor[]): ChannelMode {
  const populated = dimms.filter(d => d.sizeGB > 0)
  if (populated.length < 2) return 'single'

  const first = populated[0].sizeGB
  const allEqual = populated.every(d => d.sizeGB === first)
  if (!allEqual) return 'single'

  return 'dual'
}

function parseDeviceLocatorSlot(loc: string | undefined): number | null {
  if (!loc) return null
  const m = loc.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function isXmpEnabled(configuredSpeed: number, jedecSpeed: number): boolean {
  // XMP/EXPO is enabled if configured speed is significantly above JEDEC baseline
  // JEDEC baseline: DDR4 = 2133, DDR5 = 4800
  return configuredSpeed > jedecSpeed + 200
}

async function getDualChannelConfirmed(): Promise<boolean> {
  try {
    const out = await tryRunPowerShell(`
# Method 1: Check number of populated memory channels via WMI
$memModules = Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue
if ($memModules) {
  # Get unique memory slots used
  $slots = $memModules | Select-Object -ExpandProperty DeviceLocator
  Write-Output "slots:$($slots -join ',')"
  Write-Output "count:$($memModules.Count)"
  # Check DataWidth vs TotalWidth: if TotalWidth > DataWidth, ECC is present (not dual-channel indicator)
  $dw = ($memModules | Select-Object -First 1).DataWidth
  $tw = ($memModules | Select-Object -First 1).TotalWidth
  Write-Output "datawidth:$dw"
}
# Method 2: Check via CPU-Z style DMI — BankLabel often reveals A and B channels
$banks = $memModules | Select-Object -ExpandProperty BankLabel | Sort-Object -Unique
Write-Output "banks:$($banks -join ',')"
`, 10000)

    if (!out) return false

    const countMatch = out.match(/^count:(\d+)/m)
    const banksMatch = out.match(/^banks:(.+)/m)

    const moduleCount = countMatch ? parseInt(countMatch[1]) : 0

    // Check bank labels for dual-channel indicators
    if (banksMatch) {
      const banks = banksMatch[1].toLowerCase()
      // Dual-channel: banks contain "BANK 0" and "BANK 2" (or similar alternating pattern)
      // Single-channel: only "BANK 0" and "BANK 1"
      if (banks.includes('bank 2') || banks.includes('bank 4')) return true
      if (banks.includes('channela') && banks.includes('channelb')) return true
      if (banks.includes('a1') && banks.includes('b1')) return true
    }

    // Fallback: 2+ modules MAY be dual-channel (not guaranteed, depends on slots used)
    // Better: check if modules count is even AND > 1
    if (moduleCount >= 2 && moduleCount % 2 === 0) {
      // Likely dual-channel if modules are paired
      return true
    }

    return false
  } catch {
    return false
  }
}

export async function scanRam(): Promise<ScanModuleResult<RamData>> {
  try {
    console.log('[scan:ram] Querying RAM info...')

    const [sticks, osMemory, memCounters, dualChannelConfirmed] = await Promise.all([
      queryRamInfo(),
      getOsMemory(),
      queryMemoryCounters(),
      getDualChannelConfirmed()
    ])

    if (!osMemory) {
      return { success: false, error: 'Could not query system memory info', partial: true }
    }

    const totalGB = Math.round(osMemory.TotalVisibleMemorySize / 1024 / 1024 * 10) / 10
    const freeGB = Math.round(osMemory.FreePhysicalMemory / 1024 / 1024 * 10) / 10
    const usedGB = Math.round((totalGB - freeGB) * 10) / 10
    const usagePercent = Math.round((usedGB / totalGB) * 1000) / 10

    // Pagefile usage
    const pagefileTotal = osMemory.SizeStoredInPagingFiles / 1024 / 1024 // GB
    const pagefileFree = osMemory.FreeSpaceInPagingFiles / 1024 / 1024
    const pagefileUsagePercent = pagefileTotal > 0
      ? Math.round(((pagefileTotal - pagefileFree) / pagefileTotal) * 1000) / 10
      : 0

    // Commit charge
    const virtualTotal = osMemory.TotalVirtualMemorySize / 1024 / 1024
    const virtualFree = osMemory.FreeVirtualMemory / 1024 / 1024
    const commitChargePercent = virtualTotal > 0
      ? Math.round(((virtualTotal - virtualFree) / virtualTotal) * 1000) / 10
      : 0

    // Memory type and speed from physical sticks
    let detectedType: 'DDR4' | 'DDR5' | 'Unknown' = 'Unknown'
    let actualSpeed = 0
    let jedecBaseline = 2133

    if (sticks.length > 0) {
      detectedType = mapMemoryType(sticks[0].SMBIOSMemoryType, sticks[0].MemoryType)
      jedecBaseline = detectedType === 'DDR5' ? 4800 : 2133

      // ConfiguredClockSpeed is actual running speed; Speed is rated speed
      actualSpeed = sticks[0].ConfiguredClockSpeed || sticks[0].Speed || 0
    }

    // XMP speed (rated speed on the stick)
    const ratedSpeed = sticks.length > 0 ? (sticks[0].Speed || 0) : 0
    const xmpSpeed = isXmpEnabled(actualSpeed, jedecBaseline) ? ratedSpeed : null

    const dimms: DimmDescriptor[] = sticks.map((s, i) => ({
      slot: parseDeviceLocatorSlot(s.DeviceLocator) ?? i,
      sizeGB: Math.round(Number(s.Capacity ?? 0) / (1024 ** 3)),
    }))
    const channels = detectChannelMode(dimms) === 'dual' ? 2 : 1

    const nonpagedPoolMB = memCounters
      ? Math.round(memCounters.nonpagedPoolBytes / 1024 / 1024)
      : 0
    const modifiedPagesMB = memCounters
      ? Math.round(memCounters.modifiedPageListBytes / 1024 / 1024)
      : 0

    console.log(`[scan:ram] Done. ${totalGB}GB ${detectedType} @ ${actualSpeed}MHz, usage: ${usagePercent}%`)

    return {
      success: true,
      data: {
        totalGB,
        usedGB,
        availableGB: freeGB,
        usagePercent,
        speed: actualSpeed,
        xmpSpeed,
        type: detectedType,
        channels,
        commitChargePercent,
        pagefileUsagePercent,
        nonpagedPoolMB,
        modifiedPagesMB,
        dualChannelConfirmed
      }
    }
  } catch (error) {
    console.error('[scan:ram] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
