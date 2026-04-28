// VR Optimization Suite — Hardware Metrics IPC Handler
// Exposes metrics:poll to the renderer for live GPU temp/power, CPU%, and RAM usage.

import { ipcMain } from 'electron'
import { runPowerShellJson } from '../utils/powershell'
import { getNvidiaGpuMetrics, getAmdGpuMetrics, getIntelGpuTemperature } from '../utils/gpu-metrics'

export interface MetricsSnapshot {
  cpu: { usagePercent: number }
  ram: { usedGB: number; totalGB: number; usagePercent: number }
  gpu: { temperatureC: number; powerW: number; utilizationPercent: number } | null
  timestamp: number
}

// ── GPU result cache ──────────────────────────────────────────
// GPU queries are slow (5-12 s) so we only refresh if the last result is >15 s old.
let cachedGpu: MetricsSnapshot['gpu'] = null
let lastGpuFetchAt = 0
const GPU_TTL_MS = 15_000

async function fetchGpu(): Promise<MetricsSnapshot['gpu']> {
  const now = Date.now()
  if (now - lastGpuFetchAt < GPU_TTL_MS) {
    return cachedGpu
  }

  let result: MetricsSnapshot['gpu'] = null

  // 1 — NVIDIA (fastest: nvidia-smi, ~1-2 s)
  try {
    const nvidia = await getNvidiaGpuMetrics()
    if (nvidia) {
      result = {
        temperatureC: nvidia.temperature,
        powerW: nvidia.powerDraw,
        utilizationPercent: 0 // nvidia-smi util requires a separate query; omit for now
      }
    }
  } catch { /* not NVIDIA */ }

  // 2 — AMD ADL2 (only if NVIDIA not found)
  if (!result) {
    try {
      const amd = await getAmdGpuMetrics()
      if (amd) {
        result = {
          temperatureC: amd.temperature,
          powerW: amd.powerDraw,
          utilizationPercent: 0
        }
      }
    } catch { /* not AMD */ }
  }

  // 3 — Intel (temp only; power not available via ACPI zones)
  if (!result) {
    try {
      const tempC = await getIntelGpuTemperature()
      if (tempC > 0) {
        result = {
          temperatureC: tempC,
          powerW: 0,
          utilizationPercent: 0
        }
      }
    } catch { /* not Intel */ }
  }

  cachedGpu = result
  lastGpuFetchAt = Date.now()
  return result
}

// ── CPU + RAM via a single fast PowerShell query ──────────────
// Win32_OperatingSystem memory properties are in kilobytes (KB), not MB.
interface CpuRamRaw {
  cpu: number
  usedKB: number
  totalKB: number
}

async function fetchCpuRam(): Promise<{ cpu: MetricsSnapshot['cpu']; ram: MetricsSnapshot['ram'] }> {
  const raw = await runPowerShellJson<CpuRamRaw>(`
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$usedKB = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory
@{ cpu=$cpu; usedKB=$usedKB; totalKB=$os.TotalVisibleMemorySize } | ConvertTo-Json -Compress
`, 3000)

  // Divide KB → MB → GB (two steps of /1024)
  const totalGB = Math.round((raw.totalKB / 1024 / 1024) * 10) / 10
  const usedGB = Math.round((raw.usedKB / 1024 / 1024) * 10) / 10
  const usagePercent = raw.totalKB > 0 ? Math.round((raw.usedKB / raw.totalKB) * 100) : 0

  return {
    cpu: { usagePercent: Math.round(raw.cpu ?? 0) },
    ram: { usedGB, totalGB, usagePercent }
  }
}

// ── Handler registration ──────────────────────────────────────

export function registerMetricsHandlers(): void {
  console.log('[metrics] Registering metrics:poll handler (GPU TTL=' + GPU_TTL_MS / 1000 + 's)')

  ipcMain.handle('metrics:poll', async (): Promise<MetricsSnapshot> => {
    // Fire GPU fetch in background (non-blocking — uses cached value if fresh)
    const gpuPromise = fetchGpu()

    let cpuRam: Awaited<ReturnType<typeof fetchCpuRam>>
    try {
      cpuRam = await fetchCpuRam()
    } catch (err) {
      console.error(`[metrics:poll] CPU/RAM fetch failed: ${(err as Error).message}`)
      cpuRam = {
        cpu: { usagePercent: 0 },
        ram: { usedGB: 0, totalGB: 0, usagePercent: 0 }
      }
    }

    const gpu = await gpuPromise

    return {
      cpu: cpuRam.cpu,
      ram: cpuRam.ram,
      gpu,
      timestamp: Date.now()
    }
  })
}
