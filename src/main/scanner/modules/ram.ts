// VR Optimization Suite — RAM Scan Module
// Collects RAM capacity and performance counters.

import os from 'node:os'
import { readCounters } from '../../utils/typeperf'
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

    const counters = await getPoolCounters()

    // Without WMI's Win32_PhysicalMemory we cannot enumerate DIMMs from a
    // pure-registry path. Report 0 (unknown) rather than guessing single
    // and tripping the single-channel rule on every machine.
    const channels = 0

    const nonpagedPoolMB = counters
      ? Math.round(counters.nonpagedPoolBytes / 1024 / 1024)
      : 0
    const modifiedPagesMB = counters
      ? Math.round(counters.modifiedPageListBytes / 1024 / 1024)
      : 0

    console.log(`[scan:ram] Done. ${totalGB}GB total, usage: ${usagePercent}%`)

    return {
      success: true,
      data: {
        totalGB,
        usedGB,
        availableGB: freeGB,
        usagePercent,
        speed: 0,
        xmpSpeed: null,
        type: 'Unknown',
        channels,
        commitChargePercent: 0,
        pagefileUsagePercent: 0,
        nonpagedPoolMB,
        modifiedPagesMB,
        dualChannelConfirmed: false,
      }
    }
  } catch (error) {
    console.error('[scan:ram] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
