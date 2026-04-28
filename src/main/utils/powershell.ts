// VR Optimization Suite — PowerShell Execution Utilities
// See CODING-RULES-DICTIONARY.md Section 10: PowerShell Execution
//
// CRITICAL: ALWAYS write scripts to temp .ps1 files — NEVER pass inline via -Command.
// Bash/cmd.exe mangles $_, $env:, and other PS variables when passed inline.

import { execFile } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Execute a PowerShell script via temp .ps1 file.
 * Returns stdout as a trimmed string.
 */
export function runPowerShell(script: string, timeout = 30000): Promise<string> {
  const tmpFile = join(tmpdir(), `vros-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`)
  writeFileSync(tmpFile, script, 'utf8')

  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
      { timeout },
      (error, stdout, stderr) => {
        // Always clean up temp file
        try {
          unlinkSync(tmpFile)
        } catch {
          // Ignore cleanup errors
        }

        if (error) {
          const msg = stderr?.trim() || error.message
          reject(new Error(`PowerShell error: ${msg}`))
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

/**
 * Execute a PowerShell script and parse the output as JSON.
 * The script should end with `| ConvertTo-Json` or output valid JSON.
 */
export async function runPowerShellJson<T = unknown>(script: string, timeout = 30000): Promise<T> {
  const output = await runPowerShell(script, timeout)
  if (!output) {
    throw new Error('PowerShell returned empty output')
  }
  try {
    return JSON.parse(output) as T
  } catch {
    throw new Error(`Failed to parse PowerShell JSON output: ${output.slice(0, 200)}`)
  }
}

/**
 * Execute a simple command via cmd.exe (for quick non-PS operations like reg, netsh, ping).
 * Returns stdout as a trimmed string.
 */
export function runCmd(command: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'cmd',
      ['/c', command],
      { encoding: 'utf8', timeout },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message
          reject(new Error(`Command error: ${msg}`))
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

/**
 * Run a command and return stdout, swallowing errors (returns null on failure).
 * Useful for optional data collection that shouldn't abort the scan.
 */
export async function tryRunCmd(command: string, timeout = 15000): Promise<string | null> {
  try {
    return await runCmd(command, timeout)
  } catch {
    return null
  }
}

/**
 * Run PowerShell and return result, swallowing errors (returns null on failure).
 */
export async function tryRunPowerShell(script: string, timeout = 30000): Promise<string | null> {
  try {
    return await runPowerShell(script, timeout)
  } catch {
    return null
  }
}
