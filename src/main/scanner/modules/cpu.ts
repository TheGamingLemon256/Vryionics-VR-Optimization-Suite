// VR Optimization Suite — CPU Scan Module
// Collects CPU model info, per-core usage, temperature, and V-Cache status.

import os from 'node:os'
import { readKey, readValue } from '../../utils/registry-read'
import { readRegistryDword, enumerateRegistrySubkeys, registryKeyExists } from '../../utils/registry'
import { readCounters, readSingleCounter } from '../../utils/typeperf'
import { findCpuEntry } from '../../data/cpu-database'
import type { ScanModuleResult, CpuData } from '../types'

interface CpuIdentity {
  model: string
  identifier: string
  vendor: string
  baseClockMhz: number
}

async function readCpuIdentity(): Promise<CpuIdentity | null> {
  const key = await readKey('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').catch(() => null)
  if (!key) return null

  const name = key.values['ProcessorNameString']
  const ident = key.values['Identifier']
  const vendor = key.values['VendorIdentifier']
  const mhz = key.values['~MHz']

  if (!name || name.type !== 'REG_SZ') return null

  return {
    model: name.data.trim(),
    identifier: ident && ident.type === 'REG_SZ' ? ident.data : '',
    vendor: vendor && vendor.type === 'REG_SZ' ? vendor.data : '',
    baseClockMhz: mhz && mhz.type === 'REG_DWORD' ? mhz.data : 0,
  }
}

async function getCoreUsage(): Promise<number[]> {
  const samples = await readCounters(['\\Processor(*)\\% Processor Time'], 1, 15000)
  if (!samples) return []

  const perCore: Array<{ idx: number; value: number }> = []
  for (const s of samples) {
    const m = s.counter.match(/Processor\(([^)]+)\)/i)
    if (!m) continue
    const inst = m[1]
    if (inst.toLowerCase() === '_total') continue
    const idx = parseInt(inst.replace(/[^0-9]/g, ''), 10)
    if (Number.isFinite(idx)) {
      perCore.push({ idx, value: s.value })
    }
  }
  perCore.sort((a, b) => a.idx - b.idx)
  return perCore.map((c) => Math.round(c.value * 10) / 10)
}

async function getContextSwitches(): Promise<number> {
  const v = await readSingleCounter('\\System\\Context Switches/sec', 8000)
  return v === null ? 0 : Math.round(v)
}

function detectVCache(model: string): boolean {
  // V-Cache parts ship under the X3D brand. Without WMI's L3 size we drop the
  // "high-L3 Ryzen" fallback; the X3D string match catches every shipped SKU.
  return model.toLowerCase().includes('x3d')
}

async function getVCacheEntries(): Promise<Record<string, { endsWith: string; type: number }>> {
  const basePath = 'SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App'
  if (!registryKeyExists('HKLM', basePath)) return {}

  const appNames = enumerateRegistrySubkeys('HKLM', basePath)
  const entries: Record<string, { endsWith: string; type: number }> = {}

  for (const appName of appNames) {
    const appPath = `${basePath}\\${appName}`
    const endsWithVal = await readValue(`HKLM\\${appPath}`, 'EndsWith')
    const typeDword = readRegistryDword('HKLM', appPath, 'Type')
    if (endsWithVal && (endsWithVal.type === 'REG_SZ' || endsWithVal.type === 'REG_EXPAND_SZ') && typeDword !== null) {
      entries[appName] = { endsWith: endsWithVal.data, type: typeDword }
    }
  }

  return entries
}

async function getBoostAndThrottleInfo(baseClockMhz: number): Promise<{ boostClockMhz: number | null; thermalThrottled: boolean }> {
  // Live boost / throttle is read from PDH counters via typeperf. The
  // registry has no runtime equivalent for current perf state.
  const samples = await readCounters(
    [
      '\\Processor Information(_Total)\\% Processor Performance',
      '\\Processor Information(_Total)\\Processor Frequency',
    ],
    1,
    8000
  )
  if (!samples || samples.length < 2) return { boostClockMhz: null, thermalThrottled: false }

  const perfPct = Math.round(samples[0].value)
  const currentClock = Math.round(samples[1].value)

  let boostClockMhz: number | null = null
  if (baseClockMhz > 0 && perfPct > 0) {
    boostClockMhz = Math.round(baseClockMhz * perfPct / 100)
  } else if (currentClock > 0) {
    boostClockMhz = currentClock
  } else if (baseClockMhz > 0) {
    boostClockMhz = baseClockMhz
  }

  let thermalThrottled = false
  if (currentClock > 0 && baseClockMhz > 0 && currentClock < baseClockMhz * 0.75) {
    thermalThrottled = true
  }
  if (perfPct > 0 && perfPct < 70) {
    thermalThrottled = true
  }

  return { boostClockMhz, thermalThrottled }
}

export async function scanCpu(): Promise<ScanModuleResult<CpuData>> {
  try {
    console.log('[scan:cpu] Querying CPU info...')

    const identity = await readCpuIdentity()
    if (!identity) {
      return { success: false, error: 'Could not read CPU identity from registry', partial: true }
    }

    const [perCoreUsage, contextSwitches, boostThrottle] = await Promise.all([
      getCoreUsage(),
      getContextSwitches(),
      getBoostAndThrottleInfo(identity.baseClockMhz),
    ])

    // os.cpus() reflects logical processors, matching what HARDWARE\...\CentralProcessor\N
    // would enumerate. Physical core count comes from the model lookup; the registry
    // does not expose it.
    const logicalCount = os.cpus().length
    const dbEntry = findCpuEntry(identity.model)
    const physicalCores = dbEntry?.cores ?? logicalCount

    const hasVCache = detectVCache(identity.model)

    console.log(`[scan:cpu] Model: ${identity.model}, Cores: ${physicalCores}, V-Cache: ${hasVCache}`)

    const vcacheDriverPresent = registryKeyExists(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc'
    )

    const vcacheAppEntries = vcacheDriverPresent ? await getVCacheEntries() : {}

    const avgUsage =
      perCoreUsage.length > 0
        ? Math.round((perCoreUsage.reduce((a, b) => a + b, 0) / perCoreUsage.length) * 10) / 10
        : 0

    const { boostClockMhz, thermalThrottled } = boostThrottle

    const data: CpuData = {
      model: identity.model,
      cores: physicalCores,
      threads: logicalCount,
      baseClock: identity.baseClockMhz,
      boostClock: identity.baseClockMhz,
      architecture: identity.identifier || identity.model,
      hasVCache,
      perCoreUsage,
      avgUsage,
      temperature: null,
      contextSwitchesPerSec: contextSwitches,
      vcacheDriverPresent,
      vcacheAppEntries,
      boostClockMhz,
      thermalThrottled
    }

    console.log(`[scan:cpu] Done. Avg usage: ${avgUsage}%, Context switches: ${contextSwitches}/s`)
    return { success: true, data }
  } catch (error) {
    console.error('[scan:cpu] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
