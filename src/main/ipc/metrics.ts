// VR Optimization Suite — Hardware Metrics IPC Handler
// Exposes metrics:poll to the renderer for live GPU temp/power, CPU%, and RAM usage.

import os from 'node:os'
import { ipcMain } from 'electron'
import { readSingleCounter } from '../utils/typeperf'
import { getNvidiaGpuMetrics, getAmdGpuMetrics, getIntelGpuTemperature } from '../utils/gpu-metrics'

export interface MetricsSnapshot {
  cpu: { usagePercent: number }
  ram: { usedGB: number; totalGB: number; usagePercent: number }
  gpu: { temperatureC: number; powerW: number; utilizationPercent: number } | null
  timestamp: number
}

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

  try {
    const nvidia = await getNvidiaGpuMetrics()
    if (nvidia) {
      result = {
        temperatureC: nvidia.temperature,
        powerW: nvidia.powerDraw,
        utilizationPercent: 0,
      }
    }
  } catch {
    // not NVIDIA
  }

  if (!result) {
    try {
      const amd = await getAmdGpuMetrics()
      if (amd) {
        result = {
          temperatureC: amd.temperature,
          powerW: amd.powerDraw,
          utilizationPercent: 0,
        }
      }
    } catch {
      // not AMD
    }
  }

  if (!result) {
    try {
      const tempC = await getIntelGpuTemperature()
      if (tempC > 0) {
        result = {
          temperatureC: tempC,
          powerW: 0,
          utilizationPercent: 0,
        }
      }
    } catch {
      // not Intel
    }
  }

  cachedGpu = result
  lastGpuFetchAt = Date.now()
  return result
}

async function fetchCpuRam(): Promise<{ cpu: MetricsSnapshot['cpu']; ram: MetricsSnapshot['ram'] }> {
  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const totalGB = Math.round((totalBytes / 1024 ** 3) * 10) / 10
  const usedGB = Math.round((usedBytes / 1024 ** 3) * 10) / 10
  const usagePercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0

  // CPU load via typeperf instead of os.loadavg(). loadavg() is the
  // 1/5/15-minute Unix average, not a useful proxy for "right now" on Windows.
  const cpuRaw = await readSingleCounter('\\Processor(_Total)\\% Processor Time', 3000)
  const cpu = cpuRaw === null ? 0 : Math.round(cpuRaw)

  return {
    cpu: { usagePercent: cpu },
    ram: { usedGB, totalGB, usagePercent },
  }
}

export function registerMetricsHandlers(): void {
  console.log('[metrics] Registering metrics:poll handler (GPU TTL=' + GPU_TTL_MS / 1000 + 's)')

  ipcMain.handle('metrics:poll', async (): Promise<MetricsSnapshot> => {
    const gpuPromise = fetchGpu()

    let cpuRam: Awaited<ReturnType<typeof fetchCpuRam>>
    try {
      cpuRam = await fetchCpuRam()
    } catch (err) {
      console.error(`[metrics:poll] CPU/RAM fetch failed: ${(err as Error).message}`)
      cpuRam = {
        cpu: { usagePercent: 0 },
        ram: { usedGB: 0, totalGB: 0, usagePercent: 0 },
      }
    }

    const gpu = await gpuPromise

    return {
      cpu: cpuRam.cpu,
      ram: cpuRam.ram,
      gpu,
      timestamp: Date.now(),
    }
  })
}
