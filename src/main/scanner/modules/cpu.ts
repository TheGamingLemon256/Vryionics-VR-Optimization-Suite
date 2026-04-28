// VR Optimization Suite — CPU Scan Module
// Collects CPU model info, per-core usage, temperature, and V-Cache status.

import { queryCpuInfo } from '../../utils/wmi'
import { readRegistryDword, enumerateRegistrySubkeys, registryKeyExists } from '../../utils/registry'
import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, CpuData } from '../types'

interface PerfCoreCounter {
  core: number
  usage: number
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

function detectVCache(model: string, l3CacheSizeKB: number): boolean {
  const modelLower = model.toLowerCase()
  return (
    modelLower.includes('x3d') ||
    (modelLower.includes('ryzen') && l3CacheSizeKB >= 98304) // 96MB+ L3 = V-Cache
  )
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

async function getBoostAndThrottleInfo(): Promise<{ boostClockMhz: number | null; thermalThrottled: boolean }> {
  try {
    const out = await tryRunPowerShell(`
# Get processor performance info
$cpu = Get-CimInstance Win32_Processor -EA SilentlyContinue | Select-Object -First 1
if ($cpu) {
  Write-Output "maxclock:$($cpu.MaxClockSpeed)"
  Write-Output "currentclock:$($cpu.CurrentClockSpeed)"
  Write-Output "loadpct:$($cpu.LoadPercentage)"
}
# Get per-core max frequency from performance counters
$maxFreq = (Get-Counter '\\Processor Information(_Total)\\% Processor Performance' -EA SilentlyContinue).CounterSamples.CookedValue
if ($maxFreq) { Write-Output "perfpct:$([math]::Round($maxFreq))" }
`, 10000)

    if (!out) return { boostClockMhz: null, thermalThrottled: false }

    const maxClockMatch = out.match(/^maxclock:(\d+)/m)
    const currentClockMatch = out.match(/^currentclock:(\d+)/m)
    const perfPctMatch = out.match(/^perfpct:(\d+)/m)

    const maxClock = maxClockMatch ? parseInt(maxClockMatch[1]) : null
    const currentClock = currentClockMatch ? parseInt(currentClockMatch[1]) : null
    const perfPct = perfPctMatch ? parseInt(perfPctMatch[1]) : null

    // Estimate boost clock from performance percentage × base clock
    let boostClockMhz: number | null = null
    if (perfPct !== null && maxClock !== null && perfPct > 0) {
      // perfPct > 100 means boosting — the actual boost clock estimate
      boostClockMhz = Math.round(maxClock * perfPct / 100)
    } else if (maxClock !== null) {
      boostClockMhz = maxClock
    }

    // Thermal throttle: current clock significantly below base clock
    // (Win32_Processor.CurrentClockSpeed drops when throttled)
    let thermalThrottled = false
    if (currentClock !== null && maxClock !== null && currentClock < maxClock * 0.75) {
      thermalThrottled = true
    }
    // Also check perfPct: if < 80% and system is under load, likely throttled
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

    const [cpuInfoList, perCoreUsage, contextSwitches, boostThrottle] = await Promise.all([
      queryCpuInfo(),
      getCoreUsage(),
      getContextSwitches(),
      getBoostAndThrottleInfo()
    ])

    const cpuInfo = cpuInfoList[0]
    if (!cpuInfo) {
      return { success: false, error: 'No CPU info returned from WMI', partial: true }
    }

    const hasVCache = detectVCache(cpuInfo.Name, cpuInfo.L3CacheSize)

    console.log(`[scan:cpu] Model: ${cpuInfo.Name}, Cores: ${cpuInfo.NumberOfCores}, V-Cache: ${hasVCache}`)

    // Check V-Cache driver
    const vcacheDriverPresent = registryKeyExists(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc'
    )

    // Get V-Cache app entries
    const vcacheAppEntries = vcacheDriverPresent ? await getVCacheEntries() : {}

    const avgUsage =
      perCoreUsage.length > 0
        ? Math.round((perCoreUsage.reduce((a, b) => a + b, 0) / perCoreUsage.length) * 10) / 10
        : 0

    const { boostClockMhz, thermalThrottled } = boostThrottle

    const data: CpuData = {
      model: cpuInfo.Name.trim(),
      cores: cpuInfo.NumberOfCores,
      threads: cpuInfo.NumberOfLogicalProcessors,
      baseClock: cpuInfo.MaxClockSpeed,
      boostClock: cpuInfo.MaxClockSpeed, // Max boost not directly available via WMI
      architecture: cpuInfo.Description || cpuInfo.Name,
      hasVCache,
      perCoreUsage,
      avgUsage,
      temperature: null, // Requires vendor-specific tools (HWiNFO64 shared memory, not available)
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
