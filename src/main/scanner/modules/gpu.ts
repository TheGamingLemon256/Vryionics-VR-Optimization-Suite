// VR Optimization Suite — GPU Scan Module
// Collects GPU info for NVIDIA (nvidia-smi) and AMD/Intel (WMI + perf counters).

import { queryGpuInfo } from '../../utils/wmi'
import { readRegistryDword } from '../../utils/registry'
import { isNvidiaAvailable, nvidiaSmiQuery, nvidiaSmiRaw, resetNvidiaSmiCache } from '../../utils/nvidia-smi'
import { tryRunPowerShell } from '../../utils/powershell'
import { getAmdClockMhz, getAmdGpuMetrics, getIntelClockMhz, getIntelGpuTemperature, getNvidiaGpuMetrics } from '../../utils/gpu-metrics'
import type { ScanModuleResult, GpuData, GpuDevice } from '../types'

function detectVendor(name: string, pnpId: string): 'nvidia' | 'amd' | 'intel' | 'unknown' {
  const n = name.toLowerCase()
  const p = pnpId.toLowerCase()
  if (n.includes('nvidia') || n.includes('geforce') || n.includes('quadro') || p.includes('ven_10de')) return 'nvidia'
  if (n.includes('amd') || n.includes('radeon') || n.includes('rx ') || p.includes('ven_1002')) return 'amd'
  if (n.includes('intel') || n.includes('iris') || n.includes('uhd') || p.includes('ven_8086')) return 'intel'
  return 'unknown'
}

/** Detect integrated GPU from name patterns */
function detectIsIntegrated(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes('uhd') ||
    n.includes('iris xe') ||
    n.includes('iris plus') ||
    n.includes('hd graphics') ||
    n.includes('intel graphics') ||
    /radeon.*\b\d{3}[mg]\b/i.test(name) ||   // AMD APU: Radeon 680M, 780M
    /\bvega\s+\d+$/i.test(name) ||            // Ryzen APU Vega 8, Vega 11
    /\bwraith\b/i.test(name)
  )
}

/** Detect GPU generation from name + vendor */
function detectGpuGeneration(name: string, vendor: string): string | null {
  if (vendor === 'nvidia') {
    if (/RTX\s*50\d{2}/i.test(name)) return 'Blackwell'
    if (/RTX\s*40\d{2}/i.test(name)) return 'Ada Lovelace'
    if (/RTX\s*30\d{2}/i.test(name)) return 'Ampere'
    if (/RTX\s*20\d{2}/i.test(name)) return 'Turing'
    if (/GTX\s*16\d{2}/i.test(name)) return 'Turing (GTX)'
    if (/GTX\s*10\d{2}/i.test(name)) return 'Pascal'
    if (/GTX\s*9\d{2}/i.test(name)) return 'Maxwell'
    if (/GTX\s*[67]\d{2}/i.test(name)) return 'Kepler'
    return null
  }
  if (vendor === 'amd') {
    if (/RX\s*7[0-9]{3}/i.test(name)) return 'RDNA3'
    if (/RX\s*6[0-9]{3}/i.test(name)) return 'RDNA2'
    if (/RX\s*5[0-9]{3}/i.test(name)) return 'RDNA1'
    if (/RX\s*[45][0-9]{2}\b/i.test(name) || /Radeon VII/i.test(name) || /Vega\s+\d{2}/i.test(name)) return 'GCN5'
    if (/RX\s*3[0-9]{2}\b|R9\s*\d{3}/i.test(name)) return 'GCN4'
    if (/\bVega\s+\d{1,2}$|\b[67]\d{2}M?\b.*Vega|Radeon.*\d{3}[MG]\b/i.test(name)) return 'GCN5 (APU)'
    return null
  }
  if (vendor === 'intel') {
    if (/Arc\s+B\d{3}/i.test(name)) return 'Arc Battlemage'
    if (/Arc\s+A\d{3}/i.test(name)) return 'Arc Alchemist'
    if (/Iris\s*Xe/i.test(name)) return 'Xe (integrated)'
    if (/Iris\s*Plus/i.test(name)) return 'Gen 11 (integrated)'
    if (/UHD\s*[6-9]\d{2}/i.test(name)) return 'Gen 9-12 (integrated)'
    if (/UHD\s*[1-5]\d{2}/i.test(name)) return 'Gen 6-8 (integrated)'
    if (/HD\s*[5-9]\d{3}/i.test(name)) return 'Gen 7-9 (integrated)'
    return null
  }
  return null
}

/**
 * Parse WMI DriverDate string (format: "20240115000000.000000+000") to 'YYYY-MM-DD'.
 */
function parseWmiDriverDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

// ── NVIDIA via nvidia-smi ─────────────────────────────────────

async function getNvidiaDevices(): Promise<Partial<GpuDevice>[]> {
  try {
    // Field indices (0-based):
    // 0  name
    // 1  driver_version
    // 2  memory.total (MB)
    // 3  memory.used (MB)
    // 4  utilization.gpu (%)
    // 5  temperature.gpu (°C)
    // 6  power.draw (W)
    // 7  power.limit (W)
    // 8  pcie.link.gen.current
    // 9  pcie.link.width.current
    // 10 utilization.encoder (%)
    // 11 utilization.decoder (%)
    const fields = [
      'name', 'driver_version', 'memory.total', 'memory.used',
      'utilization.gpu', 'temperature.gpu', 'power.draw', 'power.limit',
      'pcie.link.gen.current', 'pcie.link.width.current',
      'utilization.encoder', 'utilization.decoder'
    ]
    const rows = await nvidiaSmiQuery(fields.join(','), 10000)

    return rows.map((row, idx) => {
      const get = (i: number) => row[i]?.trim() ?? ''
      return {
        index: idx,
        name: get(0),
        vendor: 'nvidia' as const,
        driverVersion: get(1),
        vramTotal: parseInt(get(2)) || 0,
        vramUsed: parseInt(get(3)) || 0,
        utilization: parseFloat(get(4)) || 0,
        temperature: parseFloat(get(5)) || 0,
        powerDraw: parseFloat(get(6)) || 0,
        powerLimit: parseFloat(get(7)) || 0,
        pcieGen: parseInt(get(8)) || 0,
        pcieLinkWidth: parseInt(get(9)) || 0,
        encoderUtilization: parseFloat(get(10)) || 0,
        decoderUtilization: parseFloat(get(11)) || 0
      }
    })
  } catch {
    return []
  }
}

async function checkReBar(gpuIndex: number): Promise<boolean> {
  try {
    const output = await nvidiaSmiRaw(['-q', '-i', String(gpuIndex)], 10000)
    return output.toLowerCase().includes('resizable bar') && output.toLowerCase().includes('yes')
  } catch {
    return false
  }
}

// ── AMD/Intel via Windows Performance Counters ────────────────

/**
 * Get GPU utilization for all GPUs using Windows GPU Engine performance counters.
 * Works for AMD, Intel, and NVIDIA (as a fallback).
 * Returns total 3D utilization as a percentage, clamped to 0-100.
 */
async function getGpuUtilizationViaCounters(): Promise<number> {
  try {
    const out = await tryRunPowerShell(`
$samples = Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue
if ($samples -and $samples.CounterSamples) {
  $total = ($samples.CounterSamples | Where-Object { $_.CookedValue -gt 0 } | Measure-Object CookedValue -Sum).Sum
  [math]::Round([math]::Min([double]$total, 100.0), 1)
} else { '0' }
`, 10000)
    if (out) {
      const val = parseFloat(out.trim())
      if (!isNaN(val)) return val
    }
  } catch { /* fall through */ }
  return 0
}

/**
 * Get VRAM usage for AMD/Intel via DirectX DXGI counters.
 * Returns { used: MB, total: MB } or null.
 */
async function getAmdIntelVram(): Promise<{ used: number; total: number } | null> {
  try {
    const out = await tryRunPowerShell(`
$samples = Get-Counter '\\GPU Adapter Memory(*local)\\Local Usage' -ErrorAction SilentlyContinue
if ($samples -and $samples.CounterSamples) {
  $usedBytes = ($samples.CounterSamples | Measure-Object CookedValue -Sum).Sum
  [math]::Round($usedBytes / 1MB, 0)
} else { '' }
`, 8000)
    if (out && out.trim()) {
      const usedMB = parseInt(out.trim())
      if (!isNaN(usedMB) && usedMB > 0) return { used: usedMB, total: 0 }
    }
  } catch { /* fall through */ }
  return null
}

/**
 * Get real VRAM total (MB) from display adapter driver registry key.
 * WMI AdapterRAM is capped at 4096 MB (UINT32 overflow). This registry key
 * stores the actual 64-bit value written by the driver during init.
 * Works for NVIDIA, AMD, and Intel Arc.
 */
async function getVramTotalFromRegistry(): Promise<number> {
  try {
    const out = await tryRunPowerShell(`
$basePath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
$subkeys = Get-ChildItem $basePath -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d{4}$' }
foreach ($key in $subkeys) {
  $memBin = (Get-ItemProperty $key.PSPath -Name 'HardwareInformation.MemorySize' -EA SilentlyContinue).'HardwareInformation.MemorySize'
  if ($memBin -and $memBin.Length -ge 4) {
    $padded = [byte[]]($memBin + [byte[]](0,0,0,0,0,0,0,0)) | Select-Object -First 8
    $bytes = [BitConverter]::ToInt64($padded, 0)
    if ($bytes -gt 0) { [math]::Round($bytes / 1MB, 0); return }
  }
}
Write-Output '0'
`, 6000)
    const mb = parseInt(out?.trim() ?? '0')
    return isNaN(mb) ? 0 : mb
  } catch {
    return 0
  }
}

/**
 * Get GPU hardware encoder utilization via PDH counter (works for NVIDIA/AMD/Intel).
 * phys_0 = primary GPU.
 */
async function getEncoderUtilizationViaCounters(): Promise<number> {
  try {
    const out = await tryRunPowerShell(`
$samples = Get-Counter '\\GPU Engine(*phys_0*engtype_VideoEncode)\\Utilization Percentage' -EA SilentlyContinue
if ($samples -and $samples.CounterSamples) {
  $total = ($samples.CounterSamples | Where-Object { $_.CookedValue -gt 0 } | Measure-Object CookedValue -Sum).Sum
  [math]::Round([math]::Min([double]($total ?? 0), 100.0), 1)
} else { '0' }
`, 8000)
    const val = parseFloat(out?.trim() ?? '0')
    return isNaN(val) ? 0 : val
  } catch {
    return 0
  }
}

/**
 * Get PCIe link speed and width for the primary non-NVIDIA GPU via PnpDeviceProperty.
 * DEVPKEY speed values: 1=PCIe1 (2.5GT/s), 2=PCIe2 (5GT/s), 3=PCIe3 (8GT/s),
 *                       4=PCIe4 (16GT/s), 5=PCIe5 (32GT/s)
 */
async function getGpuPcieInfo(vendorHexId: string): Promise<{ gen: number; width: number }> {
  try {
    const out = await tryRunPowerShell(`
$dev = Get-PnpDevice -Class Display -EA SilentlyContinue | Where-Object { $_.InstanceId -match '${vendorHexId}' -and $_.Status -eq 'OK' } | Select-Object -First 1
if (-not $dev) { Write-Output '0,0'; return }
$speedProp = Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName '{FD4E41A6-E80A-4564-81DC-B533ACFBE4AE} 51' -EA SilentlyContinue
$widthProp = Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName '{FD4E41A6-E80A-4564-81DC-B533ACFBE4AE} 52' -EA SilentlyContinue
$speed = if ($speedProp -and $speedProp.Data) { [int]$speedProp.Data } else { 0 }
$width = if ($widthProp -and $widthProp.Data) { [int]$widthProp.Data } else { 0 }
Write-Output "$speed,$width"
`, 8000)
    const parts = (out?.trim() ?? '0,0').split(',')
    const speedCode = parseInt(parts[0]) || 0
    const width = parseInt(parts[1]) || 0
    // Map speed code to PCIe generation number
    const genMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }
    return { gen: genMap[speedCode] ?? 0, width }
  } catch {
    return { gen: 0, width: 0 }
  }
}

/**
 * Try to detect AMD Smart Access Memory state.
 * Checks AMD driver registry for large BAR optimization flag.
 * Returns false if not detectable (we'll recommend it via rule).
 */
async function checkAmdSam(): Promise<boolean> {
  try {
    const out = await tryRunPowerShell(`
$basePath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
$subkeys = Get-ChildItem $basePath -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d{4}$' }
foreach ($key in $subkeys) {
  $provider = (Get-ItemProperty $key.PSPath -Name 'ProviderName' -EA SilentlyContinue).ProviderName
  if ($provider -match 'AMD|Advanced Micro') {
    $val = (Get-ItemProperty $key.PSPath -Name 'KMD_EnableInternalLargeBAROptimization' -EA SilentlyContinue).KMD_EnableInternalLargeBAROptimization
    if ($null -ne $val) { Write-Output $val; return }
    # Alternative key used in some AMD driver versions
    $val2 = (Get-ItemProperty $key.PSPath -Name 'EnableResizableBar' -EA SilentlyContinue).EnableResizableBar
    if ($null -ne $val2) { Write-Output $val2; return }
  }
}
Write-Output 'unknown'
`, 5000)
    const result = out?.trim()
    if (result === '1') return true
    if (result === '0') return false
    return false // unknown — default to false, rule will recommend enabling
  } catch {
    return false
  }
}

// ── Registry / system checks ──────────────────────────────────

function checkHagsEnabled(): boolean {
  const val = readRegistryDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode')
  return val === 2
}

// ── Main export ───────────────────────────────────────────────

export async function scanGpu(): Promise<ScanModuleResult<GpuData>> {
  try {
    // Reset nvidia-smi cache on each scan so driver installs/uninstalls are picked up
    resetNvidiaSmiCache()

    console.log('[scan:gpu] Detecting GPU vendor...')

    const wmiGpus = await queryGpuInfo()
    if (wmiGpus.length === 0) {
      return { success: false, error: 'No GPU detected via WMI', partial: true }
    }

    const hagsEnabled = checkHagsEnabled()
    const devices: GpuDevice[] = []

    if (isNvidiaAvailable()) {
      console.log('[scan:gpu] NVIDIA GPU detected, querying nvidia-smi...')
      const nvidiaDevices = await getNvidiaDevices()

      // Fallback metrics via PowerShell nvidia-smi — used when the primary
      // nvidiaSmiQuery returns 0 (e.g. driver bug, GPU sleep, N/A output).
      // Fetched once and shared across all NVIDIA GPUs on the system.
      let nvFallbackMetrics: { temperature: number; powerDraw: number; powerLimit: number; clockMhz: number; memoryClock: number } | null = null
      const needsFallback = nvidiaDevices.some(
        nd => (nd.temperature ?? 0) === 0 && (nd.powerDraw ?? 0) === 0
      )
      if (needsFallback) {
        nvFallbackMetrics = await getNvidiaGpuMetrics()
      }

      for (const nd of nvidiaDevices) {
        const rebarEnabled = await checkReBar(nd.index ?? 0)

        // Resolve temperature/power: prefer nvidia-smi query values; fall back
        // to the PowerShell-based nvidia-smi call when both come back as 0.
        const smiTemp = nd.temperature ?? 0
        const smiPowerDraw = nd.powerDraw ?? 0
        const smiPowerLimit = nd.powerLimit ?? 0
        const useFallback = smiTemp === 0 && smiPowerDraw === 0 && nvFallbackMetrics !== null
        const temperature = useFallback ? nvFallbackMetrics!.temperature : smiTemp
        const powerDraw = useFallback ? nvFallbackMetrics!.powerDraw : smiPowerDraw
        const powerLimit = useFallback ? nvFallbackMetrics!.powerLimit : smiPowerLimit

        // Clock data: from fallback metrics (which queries clocks.gr,clocks.mem).
        // The primary nvidiaSmiQuery does not include clocks, so we always use
        // the fallback path for clock values. If fallback was not needed for
        // temp/power, fetch clock data separately via getNvidiaGpuMetrics.
        let clockMhz = 0
        let memoryClock = 0
        if (useFallback && nvFallbackMetrics) {
          clockMhz = nvFallbackMetrics.clockMhz
          memoryClock = nvFallbackMetrics.memoryClock
        } else {
          // Fetch clocks separately (metrics were not fetched above)
          const clockMetrics = await getNvidiaGpuMetrics()
          if (clockMetrics) {
            clockMhz = clockMetrics.clockMhz
            memoryClock = clockMetrics.memoryClock
          }
        }

        // Thermal throttle detection: clock is significantly below boost clock
        // when GPU is hot. boostClock is not available from nvidia-smi directly,
        // but we flag throttle when temp > 83 and clock is below 90% of what
        // a typical boost would be. We use powerLimit as a proxy: if the GPU
        // is within power budget but still running cool-boosted, clockMhz will
        // be near max. Drop >10% below a reasonable boost estimate = throttled.
        // Use temperature + clockMhz heuristic: hot + low clock = throttled.
        const boostClockEstimate = nd.name ? 0 : 0 // boostClock not available from smi
        const isThermalThrottled =
          temperature > 83 &&
          clockMhz > 0 &&
          boostClockEstimate > 0
            ? clockMhz < boostClockEstimate * 0.9
            : temperature > 83 && clockMhz > 0 && clockMhz < 500 // extremely low = definitely throttled

        // Driver date: WMI Win32_VideoController.DriverDate is available from
        // queryGpuInfo(). Match by name substring since nvidia-smi and WMI may
        // differ slightly in capitalization.
        const wmiMatch = wmiGpus.find(g =>
          g.Name?.toLowerCase().includes((nd.name ?? '').toLowerCase().split(' ').slice(0, 2).join(' ')) ||
          detectVendor(g.Name ?? '', g.PNPDeviceID ?? '') === 'nvidia'
        )
        const driverDate = parseWmiDriverDate(wmiMatch?.DriverDate ?? null)

        devices.push({
          index: nd.index ?? 0,
          name: nd.name ?? 'Unknown NVIDIA GPU',
          vendor: 'nvidia',
          vramTotal: nd.vramTotal ?? 0,
          vramUsed: nd.vramUsed ?? 0,
          utilization: nd.utilization ?? 0,
          temperature,
          powerDraw,
          powerLimit,
          encoderUtilization: nd.encoderUtilization ?? 0,
          decoderUtilization: nd.decoderUtilization ?? 0,
          pcieGen: nd.pcieGen ?? 0,
          pcieLinkWidth: nd.pcieLinkWidth ?? 0,
          driverVersion: nd.driverVersion ?? '',
          rebarEnabled,
          hagsEnabled,
          isIntegrated: false,  // NVIDIA GPUs are always discrete
          samEnabled: false,    // AMD-only field
          driverDate,
          gpuGeneration: detectGpuGeneration(nd.name ?? '', 'nvidia'),
          clockMhz: clockMhz ?? 0,
          memoryClock: memoryClock ?? 0,
          isThermalThrottled: isThermalThrottled ?? false,
        })
      }
    } else {
      // AMD/Intel — WMI + PDH counters + registry for enhanced data
      console.log('[scan:gpu] Non-NVIDIA GPU, using WMI + perf counters + registry...')

      const util = await getGpuUtilizationViaCounters()
      const encoderUtil = await getEncoderUtilizationViaCounters()
      const vramInfo = await getAmdIntelVram()
      const registryVramMB = await getVramTotalFromRegistry()

      // Check AMD SAM once for all AMD devices
      const hasAmd = wmiGpus.some(g => detectVendor(g.Name, g.PNPDeviceID) === 'amd')
      const amdSam = hasAmd ? await checkAmdSam() : false

      // Get real AMD temperature and power draw via ADL2
      const amdMetrics = hasAmd ? await getAmdGpuMetrics() : null

      // Get AMD current clock speeds via ADL2
      const amdClocks = hasAmd ? await getAmdClockMhz() : null

      // Get Intel GPU temperature via ACPI thermal zones
      const hasIntel = wmiGpus.some(g => detectVendor(g.Name, g.PNPDeviceID) === 'intel')
      const intelTemp = hasIntel ? await getIntelGpuTemperature() : 0

      // Get Intel GPU current clock via registry
      const intelClockMhz = hasIntel ? await getIntelClockMhz() : 0

      for (let idx = 0; idx < wmiGpus.length; idx++) {
        const g = wmiGpus[idx]
        const vendor = detectVendor(g.Name, g.PNPDeviceID)
        const isIntegrated = detectIsIntegrated(g.Name)
        const gpuGeneration = detectGpuGeneration(g.Name, vendor)
        const driverDate = parseWmiDriverDate(g.DriverDate)

        // VRAM total: registry > counter > WMI (in accuracy order)
        const wmiVramMB = Math.round((g.AdapterRAM || 0) / 1024 / 1024)
        let vramTotal = wmiVramMB
        if (registryVramMB > 0 && idx === 0) {
          vramTotal = registryVramMB
        } else if ((wmiVramMB === 0 || wmiVramMB === 4096) && vramInfo) {
          vramTotal = vramInfo.total || wmiVramMB
        }
        // For integrated GPUs, VRAM is shared — WMI reports the reserved portion
        // which may be small (128-512MB). That's expected.

        // PCIe info: only relevant for discrete (non-integrated) GPUs
        let pcieGen = 0
        let pcieLinkWidth = 0
        if (!isIntegrated && idx === 0) {
          const vendorHex = vendor === 'amd' ? 'VEN_1002' : vendor === 'intel' ? 'VEN_8086' : ''
          if (vendorHex) {
            const pcie = await getGpuPcieInfo(vendorHex)
            pcieGen = pcie.gen
            pcieLinkWidth = pcie.width
          }
        }

        // Resolve per-vendor clock speeds
        const gpuTemperature =
          vendor === 'amd' && amdMetrics ? amdMetrics.temperature :
          vendor === 'intel' ? intelTemp : 0

        let clockMhz = 0
        let memoryClock = 0
        if (vendor === 'amd' && amdClocks) {
          clockMhz = amdClocks.clockMhz
          memoryClock = amdClocks.memoryClock
        } else if (vendor === 'intel') {
          clockMhz = intelClockMhz
          memoryClock = 0 // Intel integrated shares system RAM — no dedicated memory clock
        }

        // Thermal throttle: temperature > 83°C and clock is significantly depressed.
        // For AMD we have actual clock data; for Intel the registry value may reflect
        // max rather than current. Use conservative heuristic: very hot + very low clock.
        const boostClock = 0 // Not queried for AMD/Intel via this path
        const isThermalThrottled =
          gpuTemperature > 83 &&
          clockMhz > 0 &&
          boostClock > 0
            ? clockMhz < boostClock * 0.9
            : gpuTemperature > 83 && clockMhz > 0 && clockMhz < 500

        devices.push({
          index: idx,
          name: g.Name.trim(),
          vendor,
          vramTotal,
          vramUsed: vramInfo?.used ?? 0,
          utilization: idx === 0 ? util : 0,
          temperature: gpuTemperature,
          powerDraw: vendor === 'amd' && amdMetrics ? amdMetrics.powerDraw : 0,
          powerLimit: vendor === 'amd' && amdMetrics ? amdMetrics.powerLimit : 0,
          encoderUtilization: idx === 0 ? encoderUtil : 0,
          decoderUtilization: 0,
          pcieGen,
          pcieLinkWidth,
          driverVersion: g.DriverVersion?.trim() ?? '',
          rebarEnabled: false,  // NVIDIA-only field
          hagsEnabled,
          // New fields:
          isIntegrated,
          samEnabled: vendor === 'amd' ? amdSam : false,
          driverDate,
          gpuGeneration,
          clockMhz: clockMhz ?? 0,
          memoryClock: memoryClock ?? 0,
          isThermalThrottled: isThermalThrottled ?? false,
        })
      }
    }

    const primaryGpuIndex = 0
    console.log(`[scan:gpu] Done. ${devices.length} GPU(s): ${devices.map((d) => d.name).join(', ')}`)

    return {
      success: true,
      data: {
        devices,
        primaryGpuIndex,
        dpcPerCore: {} // Collected in dpc-latency module (Phase 1b)
      }
    }
  } catch (error) {
    console.error('[scan:gpu] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
