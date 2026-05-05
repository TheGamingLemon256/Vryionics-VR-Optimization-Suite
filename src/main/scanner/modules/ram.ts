// VR Optimization Suite — RAM Scan Module
// Collects RAM capacity and performance counters.

import os from 'node:os'
import { readCounters } from '../../utils/typeperf'
import { readDimmInfo } from '../../utils/dimm-info'
import type { ScanModuleResult, RamData } from '../types'

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

interface PoolCounters {
  nonpagedPoolBytes: number
  modifiedPageListBytes: number
}

async function getPoolCounters(): Promise<PoolCounters | null> {
  // Both counters need admin to be reliable; on user sessions they may
  // return zero rather than fail outright.
  const samples = await readCounters(
    ['\\Memory\\Pool Nonpaged Bytes', '\\Memory\\Modified Page List Bytes'],
    1,
    8000
  )
  if (!samples || samples.length < 2) return null

  return {
    nonpagedPoolBytes: Math.round(samples[0].value),
    modifiedPageListBytes: Math.round(samples[1].value),
  }
}

export async function scanRam(): Promise<ScanModuleResult<RamData>> {
  try {
    console.log('[scan:ram] Querying RAM info...')

    const totalBytes = os.totalmem()
    const freeBytes = os.freemem()
    const totalGB = Math.round((totalBytes / 1024 ** 3) * 10) / 10
    const freeGB = Math.round((freeBytes / 1024 ** 3) * 10) / 10
    const usedGB = Math.round((totalGB - freeGB) * 10) / 10
    const usagePercent = totalGB > 0 ? Math.round((usedGB / totalGB) * 1000) / 10 : 0

    const [counters, dimms] = await Promise.all([
      getPoolCounters(),
      readDimmInfo(),
    ])

    // DIMM info is read via a single short-lived powershell.exe call against
    // Win32_PhysicalMemory. When that fails (PS missing, query times out,
    // unparseable JSON), we fall back to "unknown" rather than guessing.
    const populatedDimms = (dimms ?? []).filter((d) => d.capacityGB > 0)
    const dimmCount = populatedDimms.length

    let speed = 0
    let xmpSpeed: number | null = null
    let type: RamData['type'] = 'Unknown'
    let channels = 0
    let dualChannelConfirmed = false

    if (dimmCount > 0) {
      // Configured speed is what the system is actually running at; rated
      // SPD speed is what the kit is capable of. When XMP/EXPO is on they
      // match, when it's off they differ.
      speed = Math.max(...populatedDimms.map((d) => d.configuredSpeedMHz))
      const ratedMax = Math.max(...populatedDimms.map((d) => d.speedMHz))
      xmpSpeed = ratedMax > 0 && ratedMax > speed ? ratedMax : null

      const types = populatedDimms.map((d) => d.type).filter((t) => t !== 'Unknown')
      if (types.length > 0) type = types[0]

      const allEqualSize = populatedDimms.every(
        (d) => d.capacityGB === populatedDimms[0].capacityGB,
      )
      if (dimmCount >= 2 && allEqualSize) {
        channels = 2
        dualChannelConfirmed = true
      } else if (dimmCount === 1) {
        channels = 1
      } else {
        channels = 1 // mixed sizes: flex mode, single-channel for the asymmetric part
      }
    }

    const nonpagedPoolMB = counters
      ? Math.round(counters.nonpagedPoolBytes / 1024 / 1024)
      : 0
    const modifiedPagesMB = counters
      ? Math.round(counters.modifiedPageListBytes / 1024 / 1024)
      : 0

    console.log(
      `[scan:ram] Done. ${totalGB}GB total, usage: ${usagePercent}%, ` +
      `dimms=${dimmCount} type=${type} speed=${speed}MHz channels=${channels || '?'}`
    )

    return {
      success: true,
      data: {
        totalGB,
        usedGB,
        availableGB: freeGB,
        usagePercent,
        speed,
        xmpSpeed,
        type,
        channels,
        commitChargePercent: 0,
        pagefileUsagePercent: 0,
        nonpagedPoolMB,
        modifiedPagesMB,
        dualChannelConfirmed,
      }
    }
  } catch (error) {
    console.error('[scan:ram] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
