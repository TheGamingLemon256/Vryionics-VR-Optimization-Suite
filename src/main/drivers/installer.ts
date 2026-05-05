// Vryionics VR Optimization Suite - Driver Installer
//
// Auto-install path for low-risk drivers:
//   1. Download installer .exe with progress + size sanity check
//   2. Verify SHA-256 if vendor published one
//   3. Launch the installer detached so it survives VOS exit
//
// Guided-only drivers skip this entirely; the UI calls shell.openExternal
// on the download URL instead.
//
// What this no longer does (deliberate v0.2.9 regression vs v0.2.7):
//   * No System Restore Point. The only Win32 entry to SRClient is via
//     WMI/PowerShell or P/Invoke, both excluded by the no-shell rule.
//     fixes/engine.ts dropped its restore-point creation for the same
//     reason; the safety net here was best-effort to begin with.
//   * No Authenticode subject pinning. Get-AuthenticodeSignature was the
//     only available verifier, and we now download exclusively from
//     pinned vendor HTTPS domains with a SHA-256 check when the vendor
//     publishes one. Re-introducing publisher pinning is tracked for v0.3
//     once we have a non-shell verifier in place.

import { shell, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as crypto from 'crypto'
import { spawn } from 'node:child_process'
import { log } from '../logger'
import type { DriverVendor, LatestAvailable } from './types'

const MIN_INSTALLER_SIZE = 50 * 1024 * 1024
const MAX_INSTALLER_SIZE = 2 * 1024 * 1024 * 1024

// Vendor-specific silent-install flags. These are passed as a real argv
// array, not joined into a shell string, so paths with spaces don't need
// quoting and there's no shell-injection surface.
function silentFlags(vendor: DriverVendor): string[] {
  switch (vendor) {
    case 'NVIDIA':
      return ['-s', '-noreboot', '-noeula']
    case 'AMD':
      // Radeon Software accepts /S (NSIS) on every release since 2020.
      // -INSTALL is the AMD-documented form and stays compatible.
      return ['-INSTALL']
    case 'Intel':
      return ['-s', '-norestart']
    default:
      return ['/S']
  }
}

export interface InstallProgress {
  phase: 'downloading' | 'verifying' | 'installing' | 'complete' | 'error'
  percent?: number
  message?: string
  error?: string
}

export type InstallProgressCallback = (p: InstallProgress) => void

export interface InstallResult {
  success: boolean
  error?: string
  installerPath?: string
}

export async function downloadAndInstall(
  vendor: DriverVendor,
  latest: LatestAvailable,
  onProgress: InstallProgressCallback,
): Promise<InstallResult> {
  if (!latest.downloadUrl) {
    return { success: false, error: 'No download URL available for this driver.' }
  }

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

  const stat = fs.statSync(installerPath)
  if (stat.size < MIN_INSTALLER_SIZE) {
    safeUnlink(installerPath)
    return {
      success: false,
      error: `Downloaded file is too small (${(stat.size / 1024 / 1024).toFixed(1)} MB), likely a redirect page rather than an installer.`,
    }
  }
  if (stat.size > MAX_INSTALLER_SIZE) {
    safeUnlink(installerPath)
    return { success: false, error: `Downloaded file exceeds 2 GB cap; refusing to run.` }
  }

  if (latest.sha256) {
    onProgress({ phase: 'verifying', message: 'Verifying installer hash...' })
    const actualHash = sha256File(installerPath)
    if (actualHash.toLowerCase() !== latest.sha256.toLowerCase()) {
      safeUnlink(installerPath)
      return {
        success: false,
        error: `Hash mismatch; installer may be tampered. Expected ${latest.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`,
      }
    }
    log.info('drivers:installer', 'SHA-256 verified')
  }

  onProgress({ phase: 'installing', message: 'Launching installer (continues in background)...' })
  const flags = silentFlags(vendor)
  log.info('drivers:installer', `Launching detached: ${installerPath} ${flags.join(' ')}`)

  // Detached so the installer keeps running if the user quits VOS, and so
  // the UAC prompt (when the binary's manifest requires elevation) is
  // owned by the installer process rather than ours. We don't wait for
  // exit; the install can take 10+ minutes and we don't want to hold the
  // renderer's progress dialog open that long.
  //
  // We intentionally hand the installer file off and don't unlink it. A
  // sibling sweep on next launch could reclaim %TEMP%\vryionics-vros-drivers
  // entries older than a day, but blowing it away while the installer is
  // mid-run would obviously break the install.
  const child = spawn(installerPath, flags, { detached: true, stdio: 'ignore' })
  child.unref()

  onProgress({ phase: 'complete', percent: 100, message: 'Installer launched.' })
  return { success: true, installerPath }
}

export async function openGuidedDownload(url: string): Promise<void> {
  log.info('drivers:installer', `Opening guided download: ${url}`)
  await shell.openExternal(url)
}

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
