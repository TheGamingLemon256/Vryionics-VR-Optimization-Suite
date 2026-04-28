// Vryionics VR Optimization Suite — Driver Installer
//
// Handles the "auto" install path for low-risk drivers:
//   1. Create System Restore Point (reuses fix-engine helper)
//   2. Download installer .exe with progress + size sanity check
//   3. Verify Authenticode signature is present AND signed by a trusted
//      publisher for this vendor (hard refuse otherwise)
//   4. Verify SHA-256 if vendor published one
//   5. Launch with vendor-specific silent flag, capture exit code
//
// Guided-only drivers skip this entirely — the UI calls shell.openExternal
// on the download URL instead.

import { shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { app } from 'electron'
import { log } from '../logger'
import { TRUSTED_PUBLISHERS, type DriverVendor, type LatestAvailable } from './types'

const MIN_INSTALLER_SIZE = 50 * 1024 * 1024 // 50 MB — anything smaller is suspicious
const MAX_INSTALLER_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB — hard cap

/** Vendor-specific silent-install flag for the downloaded .exe. */
function silentFlag(vendor: DriverVendor): string[] {
  switch (vendor) {
    case 'NVIDIA':
      // NVIDIA installer: `/s` (silent) + `/noreboot` (we'll prompt separately)
      return ['-s', '-noreboot', '-noeula']
    case 'AMD':
      // Radeon Software installer supports `-INSTALL /S` but behaviour has
      // shifted across releases. We use `/S` (NSIS) which every installer
      // has honoured since 2020.
      return ['-INSTALL']
    case 'Intel':
      // Intel's DCH installer uses InstallShield with `/s /norestart`.
      return ['-s', '-norestart']
    default:
      // Fallback to the NSIS-standard `/S` silent flag.
      return ['/S']
  }
}

export interface InstallProgress {
  phase: 'restore-point' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error'
  percent?: number
  message?: string
  error?: string
}

export type InstallProgressCallback = (p: InstallProgress) => void

export interface InstallResult {
  success: boolean
  error?: string
  installerPath?: string
  exitCode?: number
}

/**
 * Download, verify, and silent-install a driver.
 * Errors short-circuit with detailed messages for the UI.
 */
export async function downloadAndInstall(
  vendor: DriverVendor,
  latest: LatestAvailable,
  onProgress: InstallProgressCallback,
): Promise<InstallResult> {
  if (!latest.downloadUrl) {
    return { success: false, error: 'No download URL available for this driver.' }
  }

  // Step 1: Restore point
  onProgress({ phase: 'restore-point', message: 'Creating System Restore Point...' })
  await createRestorePointBestEffort()

  // Step 2: Download
  const tempDir = path.join(app.getPath('temp'), 'vryionics-vros-drivers')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  const installerPath = path.join(tempDir, `${vendor.toLowerCase()}-driver-${Date.now()}.exe`)

  try {
    await downloadFile(latest.downloadUrl, installerPath, (percent) => {
      onProgress({ phase: 'downloading', percent, message: `Downloading driver... ${percent}%` })
    })
  } catch (err) {
    return { success: false, error: `Download failed: ${(err as Error).message}` }
  }

  // Size sanity check
  const stat = fs.statSync(installerPath)
  if (stat.size < MIN_INSTALLER_SIZE) {
    safeUnlink(installerPath)
    return {
      success: false,
      error: `Downloaded file is too small (${(stat.size / 1024 / 1024).toFixed(1)} MB) — likely a redirect page, not a real installer.`,
    }
  }
  if (stat.size > MAX_INSTALLER_SIZE) {
    safeUnlink(installerPath)
    return { success: false, error: `Downloaded file exceeds 2 GB cap — refusing to run.` }
  }

  // Step 3: Verify Authenticode signature
  onProgress({ phase: 'verifying', message: 'Verifying digital signature...' })
  const sigResult = await verifyAuthenticode(installerPath, vendor)
  if (!sigResult.ok) {
    safeUnlink(installerPath)
    return { success: false, error: `Signature verification failed: ${sigResult.reason}` }
  }
  log.info('drivers:installer', `Signature OK — subject="${sigResult.subject}"`)

  // Step 4: Verify SHA-256 if we have one
  if (latest.sha256) {
    onProgress({ phase: 'verifying', message: 'Verifying installer hash...' })
    const actualHash = sha256File(installerPath)
    if (actualHash.toLowerCase() !== latest.sha256.toLowerCase()) {
      safeUnlink(installerPath)
      return {
        success: false,
        error: `Hash mismatch — installer may be tampered. Expected ${latest.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`,
      }
    }
    log.info('drivers:installer', 'SHA-256 verified')
  }

  // Step 5: Silent install — async so the event loop keeps pumping IPC
  onProgress({ phase: 'installing', message: 'Running installer (this may take several minutes)...' })
  const flags = silentFlag(vendor)
  log.info('drivers:installer', `Running: ${installerPath} ${flags.join(' ')}`)
  const exitCode = await runDetached(installerPath, flags, 20 * 60 * 1000)

  // Clean up installer — we don't keep driver installers around
  safeUnlink(installerPath)

  if (exitCode === null) {
    return { success: false, error: 'Installer timed out after 20 minutes', installerPath }
  }
  // Driver installers sometimes use non-zero exit codes to signal "reboot
  // required" rather than failure. 0, 1, 3010 (ERROR_SUCCESS_REBOOT_REQUIRED)
  // are all accepted.
  const ok = exitCode === 0 || exitCode === 1 || exitCode === 3010
  if (!ok) {
    return { success: false, error: `Installer exited with code ${exitCode}`, exitCode }
  }

  onProgress({ phase: 'complete', percent: 100, message: 'Install complete.' })
  return { success: true, exitCode }
}

/** Spawn a child process, wait for its exit, return its exit code (null on timeout). */
function runDetached(cmd: string, args: string[], timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true })
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      resolve(null)
    }, timeoutMs)
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', (code) => { clearTimeout(timer); resolve(code) })
  })
}

/**
 * Open the vendor's download page in the user's default browser.
 * Used for guided-tier drivers (chipset, Wi-Fi, Ethernet, storage).
 */
export async function openGuidedDownload(url: string): Promise<void> {
  log.info('drivers:installer', `Opening guided download: ${url}`)
  await shell.openExternal(url)
}

// ── Helpers ───────────────────────────────────────────────────

function safeUnlink(p: string): void {
  try { fs.unlinkSync(p) } catch { /* ignore */ }
}

function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl: string, redirectCount = 0): void => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'))
      const parsed = new URL(requestUrl)
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Vryionics-VROS-DriverUpdater/1.0',
            Accept: 'application/octet-stream',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doRequest(res.headers.location, redirectCount + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0
          let lastPct = -1
          const file = fs.createWriteStream(dest)
          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (total > 0) {
              const pct = Math.round((downloaded / total) * 100)
              if (pct !== lastPct) {
                lastPct = pct
                onProgress(pct)
              }
            }
          })
          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
        },
      )
      req.on('error', reject)
      req.setTimeout(10 * 60 * 1000, () => { req.destroy(); reject(new Error('Download timeout')) })
      req.end()
    }
    doRequest(url)
  })
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

/**
 * Verify the .exe is Authenticode-signed AND the signing subject matches
 * one of the known-trusted publishers for this vendor.
 *
 * Uses PowerShell's Get-AuthenticodeSignature rather than a native addon —
 * keeps the dependency surface tiny and works on every Windows 10/11.
 */
async function verifyAuthenticode(
  filePath: string,
  vendor: DriverVendor,
): Promise<{ ok: boolean; subject?: string; reason?: string }> {
  const trusted = TRUSTED_PUBLISHERS[vendor]
  if (!trusted || trusted.length === 0) {
    return { ok: false, reason: `No trusted publisher list for vendor ${vendor}` }
  }

  const psScript = `
    $sig = Get-AuthenticodeSignature -FilePath '${filePath.replace(/'/g, "''")}'
    if ($sig.Status -ne 'Valid') {
      Write-Output "STATUS:$($sig.Status)"
      exit 1
    }
    Write-Output "SUBJECT:$($sig.SignerCertificate.Subject)"
  `

  const result = await runPsGetStdout(psScript, 30_000)
  if (result.code !== 0) {
    const status = result.stdout?.match(/STATUS:(.+)/)?.[1]?.trim() ?? 'unknown'
    return { ok: false, reason: `Signature status is "${status}" (expected Valid)` }
  }

  const subjectLine = result.stdout?.match(/SUBJECT:(.+)/)?.[1]?.trim()
  if (!subjectLine) return { ok: false, reason: 'Could not parse signer subject' }

  // Subject looks like: "CN=NVIDIA Corporation, OU=..., O=NVIDIA Corporation, L=..., S=..., C=US"
  const cn = subjectLine.match(/CN=([^,]+)/)?.[1]?.trim() ?? subjectLine
  const matched = trusted.some((t) => cn.toLowerCase().includes(t.toLowerCase()))
  if (!matched) {
    return { ok: false, subject: cn, reason: `Signer "${cn}" is not in the trusted list for ${vendor}` }
  }
  return { ok: true, subject: cn }
}

/** Async PowerShell runner that returns stdout + exit code. */
function runPsGetStdout(script: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (c: string) => { stdout += c })
    child.stderr.on('data', (c: string) => { stderr += c })
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      resolve({ code: -1, stdout, stderr: stderr + '\n[timed out]' })
    }, timeoutMs)
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout, stderr }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

/**
 * Create a System Restore Point before a driver install. Best-effort —
 * if it fails (service disabled, throttled), we log and proceed. The user
 * already consented to the install; a failed restore point shouldn't block it.
 */
async function createRestorePointBestEffort(): Promise<void> {
  try {
    const res = await runPsGetStdout(
      `Checkpoint-Computer -Description 'Vryionics VROS driver install' -RestorePointType MODIFY_SETTINGS`,
      60_000,
    )
    if (res.code !== 0) {
      log.warn('drivers:installer', 'Restore point creation returned non-zero, proceeding anyway')
    }
  } catch (err) {
    log.warn('drivers:installer', 'Restore point creation threw:', err as Error)
  }
}
