// VR Optimization Suite — GPU Vendor Metrics Utilities
//
// NVIDIA temperature/power/clocks are read directly from nvidia-smi.exe.
// AMD ADL2 and Intel ACPI thermal zones used to ride on PowerShell P/Invoke
// (atiadlxx.dll) and WMI (MSAcpi_ThermalZoneTemperature). Both paths are
// gone now: native addons and FFI are off the table for this app, and CIM/WMI
// access is the AV trigger we're trying to eliminate. AMD/Intel metrics
// return null/0 until a non-PowerShell, non-FFI path appears.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { readValue } from './registry-read'

const execFileAsync = promisify(execFile)

const NVSMI_PATHS = [
  'C:\\Windows\\System32\\nvidia-smi.exe',
  'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
]

function locateNvidiaSmi(): string | null {
  for (const p of NVSMI_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

export async function getAmdGpuMetrics(): Promise<{ temperature: number; powerDraw: number; powerLimit: number } | null> {
  // The previous implementation P/Invoked atiadlxx.dll via PowerShell Add-Type.
  // Both PowerShell and FFI are now off the table.
  return null
}

export async function getNvidiaGpuMetrics(): Promise<{ temperature: number; powerDraw: number; powerLimit: number; clockMhz: number; memoryClock: number } | null> {
  const exe = locateNvidiaSmi() ?? 'nvidia-smi'
  try {
    const { stdout } = await execFileAsync(
      exe,
      [
        '--query-gpu=temperature.gpu,power.draw,power.limit,clocks.gr,clocks.mem',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 6000 }
    )

    const firstLine = stdout.trim().split('\n')[0]?.trim() ?? ''
    const parts = firstLine.split(',').map((p) => p.trim())
    if (parts.length < 3) return null

    const temperature = parseFloat(parts[0])
    if (isNaN(temperature) || parts[0] === 'N/A') return null

    const parseOrZero = (raw: string | undefined, asInt = false): number => {
      if (!raw || raw === 'N/A') return 0
      const v = asInt ? parseInt(raw, 10) : parseFloat(raw)
      return Number.isFinite(v) ? v : 0
    }

    return {
      temperature,
      powerDraw: parseOrZero(parts[1]),
      powerLimit: parseOrZero(parts[2]),
      clockMhz: parseOrZero(parts[3], true),
      memoryClock: parseOrZero(parts[4], true),
    }
  } catch {
    return null
  }
}

export async function getAmdClockMhz(): Promise<{ clockMhz: number; memoryClock: number } | null> {
  // Was ADL2 P/Invoke. No replacement available within the architecture
  // constraints, so we report null and let the rule engine treat it as
  // "clocks unavailable".
  return null
}

export async function getIntelClockMhz(): Promise<number> {
  // The display class subkey for the Intel iGPU exposes a MaximumMHz value
  // on most platforms. It's a static cap rather than a live frequency, but
  // it's the best we can read without WMI/PDH access.
  const v = await readValue(
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000',
    'MaximumMHz'
  ).catch(() => null)
  if (v && v.type === 'REG_DWORD') return v.data
  if (v && (v.type === 'REG_SZ' || v.type === 'REG_EXPAND_SZ')) {
    const n = parseInt(v.data, 10)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export async function getIntelGpuTemperature(): Promise<number> {
  // Was MSAcpi_ThermalZoneTemperature via WMI. Same FFI-or-WMI problem as
  // AMD; we drop the value rather than fake it.
  return 0
}
