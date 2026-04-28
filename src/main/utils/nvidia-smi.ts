// VR Optimization Suite — nvidia-smi Integration
// See CODING-RULES-DICTIONARY.md Section 11: nvidia-smi Integration
//
// IMPORTANT: nvidia-smi only works for NVIDIA GPUs.
// Detect GPU vendor FIRST — skip all nvidia-smi calls for AMD/Intel.

import { execFile } from 'child_process'
import { existsSync } from 'fs'

/** Standard nvidia-smi location (may not be on PATH) */
const NVIDIA_SMI_PATHS = [
  'nvidia-smi',
  'C:\\Windows\\System32\\nvidia-smi.exe',
  'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
]

let resolvedPath: string | null = null
let pathChecked = false

/**
 * Find the nvidia-smi executable path.
 * Returns null if nvidia-smi is not found (AMD/Intel GPU or drivers not installed).
 */
export function findNvidiaSmi(): string | null {
  if (pathChecked) return resolvedPath

  pathChecked = true

  for (const p of NVIDIA_SMI_PATHS) {
    if (p === 'nvidia-smi') {
      // Check if it's on PATH by trying to run it
      try {
        const { execSync } = require('child_process')
        execSync('nvidia-smi --version', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
        resolvedPath = 'nvidia-smi'
        return resolvedPath
      } catch {
        continue
      }
    } else if (existsSync(p)) {
      resolvedPath = p
      return resolvedPath
    }
  }

  resolvedPath = null
  return null
}

/**
 * Query nvidia-smi with CSV output format.
 * Returns an array of rows, each row is an array of string values.
 *
 * @param query - Comma-separated query fields (e.g. "name,driver_version,pci.bus_id")
 * @param timeout - Timeout in ms (default 10 seconds — nvidia-smi can hang under load)
 */
export function nvidiaSmiQuery(query: string, timeout = 10000): Promise<string[][]> {
  const smiPath = findNvidiaSmi()
  if (!smiPath) {
    return Promise.reject(new Error('nvidia-smi not found'))
  }

  return new Promise((resolve, reject) => {
    execFile(
      smiPath,
      [`--query-gpu=${query}`, '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout },
      (error, stdout) => {
        if (error) {
          reject(new Error(`nvidia-smi error: ${error.message}`))
          return
        }

        const rows = stdout
          .trim()
          .split('\n')
          .filter((line) => line.trim())
          .map((line) =>
            line.split(',').map((val) => val.trim())
          )

        resolve(rows)
      }
    )
  })
}

/**
 * Run an arbitrary nvidia-smi command and return raw stdout.
 */
export function nvidiaSmiRaw(args: string[], timeout = 10000): Promise<string> {
  const smiPath = findNvidiaSmi()
  if (!smiPath) {
    return Promise.reject(new Error('nvidia-smi not found'))
  }

  return new Promise((resolve, reject) => {
    execFile(
      smiPath,
      args,
      { encoding: 'utf8', timeout },
      (error, stdout) => {
        if (error) {
          reject(new Error(`nvidia-smi error: ${error.message}`))
          return
        }
        resolve(stdout.trim())
      }
    )
  })
}

/**
 * Check if nvidia-smi is available (i.e., NVIDIA GPU with drivers installed).
 */
export function isNvidiaAvailable(): boolean {
  return findNvidiaSmi() !== null
}

/**
 * Reset the nvidia-smi path cache.
 * Call this at the start of each scan to re-detect in case drivers were
 * installed/uninstalled since app launch.
 */
export function resetNvidiaSmiCache(): void {
  pathChecked = false
  resolvedPath = null
}

/**
 * Query single GPU (index 0) — convenience for single-GPU systems.
 * Returns a Record of field name -> value.
 */
export async function queryPrimaryGpu(fields: string[]): Promise<Record<string, string> | null> {
  try {
    const query = fields.join(',')
    const rows = await nvidiaSmiQuery(query)
    if (rows.length === 0) return null

    const result: Record<string, string> = {}
    fields.forEach((field, i) => {
      result[field] = rows[0][i] ?? ''
    })
    return result
  } catch {
    return null
  }
}
