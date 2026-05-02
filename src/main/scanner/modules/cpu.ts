// VR Optimization Suite — CPU Scan Module
// Collects CPU model info, per-core usage, temperature, and V-Cache status.

import os from 'node:os'
import { readKey, readValue } from '../../utils/registry-read'
import { readRegistryDword, enumerateRegistrySubkeys, registryKeyExists } from '../../utils/registry'
import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
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
  const script = `
$counters = Get-Counter '\\Processor(*)\\% Processor Time' -SampleInterval 1 -MaxSamples 2 -ErrorAction SilentlyContinue
$samples = $counters.CounterSamples | Where-Object { $_.InstanceName -ne '_total' } |
  Sort-Object { [int]($_.InstanceName -replace '[^0-9]', '') } |
  Select-Object InstanceName, CookedValue
$samples | ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShellJson<Array<{ InstanceName: string; CookedValue: number }>>(script, 30000)
    const items = Array.isArray(raw) ? raw : [raw]
    return items.map((i) => Math.round(i.CookedValue * 10) / 10)
  } catch {
    return []
  }
}

async function getContextSwitches(): Promise<number> {
  try {
    const script = `(Get-Counter '\\System\\Context Switches/sec' -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue).CounterSamples[0].CookedValue`
    const raw = await tryRunPowerShell(script, 15000)
    return raw ? Math.round(parseFloat(raw)) : 0
  } catch {
    return 0
  }
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
    const script = `
$vals = Get-ItemProperty -Path "HKLM:\\${appPath}" -ErrorAction SilentlyContinue
if ($vals) { @{ endsWith = $vals.EndsWith; type = $vals.Type } | ConvertTo-Json -Compress }
`
    try {
      const result = await runPowerShellJson<{ endsWith: string; type: number }>(script)
      if (result) entries[appName] = result
    } catch {
      // skip
    }
  }

  return entries
}

async function getBoostAndThrottleInfo(baseClockMhz: number): Promise<{ boostClockMhz: number | null; thermalThrottled: boolean }> {
  // Live boost / throttle still rides on Get-Counter — there is no registry
  // equivalent for runtime perf state.
  try {
    const out = await tryRunPowerShell(`
$perfPct = (Get-Counter '\\Processor Information(_Total)\\% Processor Performance' -EA SilentlyContinue).CounterSamples.CookedValue
if ($perfPct) { Write-Output "perfpct:$([math]::Round($perfPct))" }
$freq = (Get-Counter '\\Processor Information(_Total)\\Processor Frequency' -EA SilentlyContinue).CounterSamples.CookedValue
if ($freq) { Write-Output "freq:$([math]::Round($freq))" }
`, 10000)

    if (!out) return { boostClockMhz: null, thermalThrottled: false }

    const perfPctMatch = out.match(/^perfpct:(\d+)/m)
    const freqMatch = out.match(/^freq:(\d+)/m)
    const perfPct = perfPctMatch ? parseInt(perfPctMatch[1]) : null
    const currentClock = freqMatch ? parseInt(freqMatch[1]) : null

    let boostClockMhz: number | null = null
    if (perfPct !== null && baseClockMhz > 0) {
      boostClockMhz = Math.round(baseClockMhz * perfPct / 100)
    } else if (currentClock !== null) {
      boostClockMhz = currentClock
    } else if (baseClockMhz > 0) {
      boostClockMhz = baseClockMhz
    }

    let thermalThrottled = false
    if (currentClock !== null && baseClockMhz > 0 && currentClock < baseClockMhz * 0.75) {
      thermalThrottled = true
    }
    if (perfPct !== null && perfPct < 70) {
      thermalThrottled = true
    }

    return { boostClockMhz, thermalThrottled }
  } catch {
    return { boostClockMhz: null, thermalThrottled: false }
  }
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
