/**
 * GitHub Release Auto-Updater — Vryionics VR Optimization Suite
 *
 * Polls GitHub Releases for a newer version, downloads the NSIS installer,
 * verifies its SHA-512 against latest.yml, then spawns a detached PowerShell
 * script (via WMI, to escape Chromium's job object) that waits for this
 * process to exit, runs the installer silently, and relaunches the app.
 *
 * Identical architecture to VMSC Universal's updater. No electron-updater
 * dependency — pure GitHub API + NSIS + PowerShell.
 */

import { app, BrowserWindow } from 'electron'
import * as crypto from 'crypto'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

const REPO_OWNER = 'TheGamingLemon256'
const REPO_NAME = 'Vryionics-VR-Optimization-Suite'
const PRODUCT_NAME = 'Vryionics VR Optimization Suite'
const INSTALLER_PREFIX = 'Vryionics-VR-Optimization-Suite-Setup'

/**
 * Read-only GitHub PAT for private-repo release checks. Stored in
 * update-server/.gh-token during development; embedded alongside the app
 * in packaged builds via resources/.gh-token. Only needs contents:read.
 */
function getGithubToken(): string {
  const locations = [
    // Dev: project root (from out/main -> ../../update-server)
    path.join(app.getAppPath(), '..', '..', 'update-server', '.gh-token'),
    // Dev: cwd fallback
    path.join(process.cwd(), 'update-server', '.gh-token'),
    // Dev: alternate layout
    path.join(app.getAppPath(), '..', 'update-server', '.gh-token'),
    // Packaged: resources/.gh-token (bundled via extraResources)
    path.join(process.resourcesPath || '', '.gh-token'),
  ]
  for (const loc of locations) {
    try {
      const token = fs.readFileSync(loc, 'utf-8').trim()
      if (token) return token
    } catch { /* not found, try next */ }
  }
  return ''
}

export interface UpdateInfo {
  version: string
  releaseNotes?: string
  publishedAt?: string
  downloadUrl?: string
  downloadSize?: number
}

export interface UpdateStatus {
  available: boolean
  checking: boolean
  downloading: boolean
  downloadProgress: number
  error?: string
  updateInfo?: UpdateInfo
  readyToInstall: boolean
}

export class AutoUpdater {
  private status: UpdateStatus = {
    available: false,
    checking: false,
    downloading: false,
    downloadProgress: 0,
    readyToInstall: false
  }
  private mainWindow: (() => BrowserWindow | null) | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private downloadedInstallerPath: string | null = null
  private latestReleaseSha512: string | null = null
  private downloadTimeoutTimer: NodeJS.Timeout | null = null

  setMainWindow(getter: () => BrowserWindow | null): void {
    this.mainWindow = getter
  }

  private resetStatus(): void {
    if (this.downloadTimeoutTimer) {
      clearTimeout(this.downloadTimeoutTimer)
      this.downloadTimeoutTimer = null
    }
    this.status = {
      ...this.status,
      checking: false,
      downloading: false,
      downloadProgress: 0,
      error: undefined
    }
  }

  /** Start background polling (default every 2 minutes) */
  startBackgroundPolling(intervalMs = 120_000): void {
    this.stopBackgroundPolling()
    console.log(`[Updater] Background polling every ${intervalMs / 1000}s`)
    this.pollTimer = setInterval(() => {
      this.checkForUpdates().catch((err) => {
        console.warn('[Updater] Background check failed:', err.message)
      })
    }, intervalMs)
  }

  stopBackgroundPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.status.checking) return this.status

    if (this.status.downloading) {
      console.warn('[Updater] Resetting stale downloading state before check')
      this.resetStatus()
    }

    this.status = { ...this.status, checking: true, error: undefined }
    this.notifyRenderer()

    try {
      const release = await this.fetchLatestRelease()
      if (!release) {
        this.status = { ...this.status, checking: false, available: false }
        this.notifyRenderer()
        return this.status
      }

      const remoteVersion = release.tag_name.replace(/^v/, '')
      const localVersion = app.getVersion()
      console.log(`[Updater] Local: v${localVersion}, Remote: v${remoteVersion}`)

      if (this.isNewer(remoteVersion, localVersion)) {
        const exeAsset = release.assets?.find(
          (a: any) => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')
        )

        const ymlAsset = release.assets?.find((a: any) => a.name === 'latest.yml')
        if (ymlAsset) {
          try {
            const ymlContent = await this.fetchAssetText(ymlAsset.url || ymlAsset.browser_download_url)
            const sha512Match = ymlContent.match(/sha512:\s*(.+)/)
            if (sha512Match) {
              this.latestReleaseSha512 = sha512Match[1].trim()
              console.log(`[Updater] Got SHA-512 from latest.yml: ${this.latestReleaseSha512.substring(0, 16)}...`)
            }
          } catch (ymlErr: any) {
            console.warn('[Updater] Could not fetch latest.yml for hash verification:', ymlErr.message)
          }
        }

        console.log(`[Updater] Update available: v${remoteVersion}`)
        this.status = {
          ...this.status,
          checking: false,
          available: true,
          updateInfo: {
            version: remoteVersion,
            releaseNotes: release.body || undefined,
            publishedAt: release.published_at,
            downloadUrl: exeAsset?.url || exeAsset?.browser_download_url,
            downloadSize: exeAsset?.size
          }
        }
      } else {
        console.log(`[Updater] Up to date: v${localVersion}`)
        this.status = { ...this.status, checking: false, available: false }
      }
    } catch (err: any) {
      console.error('[Updater] Check failed:', err.message)
      this.status = { ...this.status, checking: false, error: err.message }
    }

    this.notifyRenderer()
    return this.status
  }

  async downloadUpdate(): Promise<void> {
    const url = this.status.updateInfo?.downloadUrl
    if (!url) throw new Error('No download URL available')

    if (this.status.downloading) {
      console.warn('[Updater] Download already in progress')
      return
    }

    this.status = { ...this.status, downloading: true, downloadProgress: 0, error: undefined }
    this.notifyRenderer()

    this.downloadTimeoutTimer = setTimeout(() => {
      if (this.status.downloading) {
        console.warn('[Updater] Download timed out after 60s')
        this.status = {
          ...this.status,
          downloading: false,
          downloadProgress: 0,
          error: 'Download timed out — click to retry'
        }
        this.notifyRenderer()
      }
    }, 60_000)

    try {
      const tempDir = path.join(app.getPath('temp'), 'vryionics-vros-update')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

      const installerName = `${INSTALLER_PREFIX}-${this.status.updateInfo!.version}.exe`
      const dest = path.join(tempDir, installerName)
      if (fs.existsSync(dest)) fs.unlinkSync(dest)

      await this.downloadFile(url, dest)

      const stat = fs.statSync(dest)
      if (stat.size < 1024 * 1024) {
        fs.unlinkSync(dest)
        throw new Error(`Downloaded file is too small (${stat.size} bytes) — likely a redirect or error page`)
      }

      if (this.latestReleaseSha512) {
        const fileBuffer = fs.readFileSync(dest)
        const fileHash = crypto.createHash('sha512').update(fileBuffer).digest('base64')
        if (fileHash !== this.latestReleaseSha512) {
          console.error('[Updater] SECURITY: Installer hash mismatch!')
          fs.unlinkSync(dest)
          throw new Error('Installer hash verification failed — possible tampering')
        }
        console.log('[Updater] SHA-512 hash verified OK')
      } else {
        console.warn('[Updater] No SHA-512 available — skipping verification')
      }

      this.downloadedInstallerPath = dest
      console.log(`[Updater] Downloaded: ${dest} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)

      if (this.downloadTimeoutTimer) {
        clearTimeout(this.downloadTimeoutTimer)
        this.downloadTimeoutTimer = null
      }

      this.status = {
        ...this.status,
        downloading: false,
        downloadProgress: 100,
        readyToInstall: true
      }
    } catch (err: any) {
      console.error('[Updater] Download failed:', err.message)
      if (this.downloadTimeoutTimer) {
        clearTimeout(this.downloadTimeoutTimer)
        this.downloadTimeoutTimer = null
      }
      this.status = {
        ...this.status,
        downloading: false,
        downloadProgress: 0,
        error: `Download failed: ${err.message}`
      }
    }

    this.notifyRenderer()
  }

  /**
   * Write a PowerShell update script, launch it via WMI (Win32_Process.Create
   * — outside Chromium's job object), verify it started via a marker file,
   * then quit so the installer can overwrite files.
   */
  async installAndRestart(): Promise<string | null> {
    if (!this.downloadedInstallerPath || !fs.existsSync(this.downloadedInstallerPath)) {
      return 'No installer downloaded'
    }

    const installerPath = this.downloadedInstallerPath
    const appExePath = app.getPath('exe')
    const appPid = process.pid

    const canonicalDir = path.resolve(
      path.join(app.getPath('appData'), '..', 'Local', 'Programs', PRODUCT_NAME)
    )
    const exeDir = path.dirname(appExePath).replace(/[\\/]+$/, '')
    const exeDirVryCount = (exeDir.match(/Vryionics/gi) || []).length
    const installDir = exeDirVryCount <= 1 ? exeDir : canonicalDir

    console.log(`[Updater] App exe: ${appExePath}`)
    console.log(`[Updater] Install directory: ${installDir}`)
    console.log(`[Updater] Installer: ${installerPath}`)

    const scriptPath = path.join(path.dirname(installerPath), 'update.ps1')
    const logPath = path.join(path.dirname(installerPath), 'update.log')
    const markerPath = path.join(path.dirname(installerPath), 'update.started')

    try { fs.unlinkSync(logPath) } catch { /* ok */ }
    try { fs.unlinkSync(markerPath) } catch { /* ok */ }

    const ps1Content = `
# Vryionics VR Optimization Suite — Auto-Update Script
$ErrorActionPreference = 'Stop'
$logFile = '${logPath.replace(/'/g, "''")}'
$markerFile = '${markerPath.replace(/'/g, "''")}'

function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    "$ts $msg" | Out-File -FilePath $logFile -Append -Encoding UTF8
}

'started' | Out-File -FilePath $markerFile -Encoding UTF8

try {

$appPid = ${appPid}
$appExe = '${appExePath.replace(/'/g, "''")}'
$installer = '${installerPath.replace(/'/g, "''")}'
$installDir = '${installDir.replace(/'/g, "''")}'

Log "=== ${PRODUCT_NAME} Update ==="
Log "PID: $appPid | Installer: $installer"
Log "InstallDir: $installDir"

# Wait for app to exit
Log "Waiting for app to exit..."
$proc = Get-Process -Id $appPid -ErrorAction SilentlyContinue
if ($proc) {
    $proc.WaitForExit(30000)
    Start-Sleep -Seconds 2
}
Log "App exited"

Get-Process | Where-Object { $_.Path -eq $appExe } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Run installer silently
Log "Launching installer..."
$installerProc = Start-Process -FilePath $installer -ArgumentList '/S', "/D=$installDir" -PassThru -Wait -ErrorAction Stop
Log "Installer exit code: $($installerProc.ExitCode)"

Log "Waiting 10 seconds for install to settle..."
Start-Sleep -Seconds 10

# Relaunch with verification (up to 3 attempts)
$maxAttempts = 3
$launched = $false

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Log "Relaunch attempt $attempt of $maxAttempts..."
    Start-Process -FilePath $appExe
    $waitSecs = 0
    while ($waitSecs -lt 30) {
        Start-Sleep -Seconds 2
        $waitSecs += 2
        $running = Get-Process | Where-Object { $_.Path -eq $appExe } | Select-Object -First 1
        if ($running) {
            Log "App is running! PID: $($running.Id) (attempt $attempt, waited $waitSecs s)"
            $launched = $true
            break
        }
    }
    if ($launched) { break }
    Log "App did not start within 30s on attempt $attempt"
}

if (-not $launched) {
    Log "ERROR: App failed to relaunch after $maxAttempts attempts!"
    $errLines = @()
    $errLines += "Write-Host '' "
    $errLines += "Write-Host '  =============================================' -ForegroundColor Red"
    $errLines += "Write-Host '   ${PRODUCT_NAME} Update Error' -ForegroundColor Red"
    $errLines += "Write-Host '  =============================================' -ForegroundColor Red"
    $errLines += "Write-Host '' "
    $errLines += "Write-Host '  The app failed to restart after updating.' -ForegroundColor Yellow"
    $errLines += "Write-Host '' "
    $errLines += "Write-Host '  Try launching manually from:' -ForegroundColor Cyan"
    $errLines += "Write-Host '  $appExe' -ForegroundColor White"
    $errLines += "Write-Host '' "
    $errLines += "Write-Host '  Update log saved at:' -ForegroundColor Cyan"
    $errLines += "Write-Host '  $logFile' -ForegroundColor White"
    $errLines += "Write-Host '' "
    $errLines += "Write-Host '  Press any key to close...' -ForegroundColor DarkGray"
    $errLines += "Read-Host"
    $errorScriptPath = Join-Path (Split-Path $installer) 'update-error.ps1'
    $errLines | Out-File -FilePath $errorScriptPath -Encoding UTF8
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', $errorScriptPath
}

if ($launched) {
    Log "Update complete — app is running!"
} else {
    Log "Update complete — app failed to start (error window shown)"
}

} catch {
    Log "ERROR: $_"
    Write-Host "Update failed: $_" -ForegroundColor Red
}

# Cleanup
if ($launched) {
    Start-Sleep -Seconds 3
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    Remove-Item $markerFile -Force -ErrorAction SilentlyContinue
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
    Remove-Item $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
} else {
    Remove-Item $markerFile -Force -ErrorAction SilentlyContinue
    Log "Installer and log preserved for debugging"
}
`

    try {
      fs.writeFileSync(scriptPath, ps1Content, 'utf-8')
      const readBack = fs.readFileSync(scriptPath, 'utf-8')
      if (readBack !== ps1Content) {
        fs.unlinkSync(scriptPath)
        throw new Error('Update script was modified between write and read — aborting')
      }
      console.log(`[Updater] Update script written: ${scriptPath}`)
    } catch (writeErr: any) {
      const errMsg = `Failed to write update script: ${writeErr.message}`
      console.error(`[Updater] ${errMsg}`)
      this.status = { ...this.status, error: errMsg, readyToInstall: true }
      this.notifyRenderer()
      return errMsg
    }

    // Launch via WMI to escape Chromium's job object (KILL_ON_JOB_CLOSE)
    const cmdLine = `powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`
    console.log(`[Updater] Launching update script via WMI...`)

    let cimResult: ReturnType<typeof spawnSync>
    try {
      cimResult = spawnSync('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-Command',
        `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${cmdLine.replace(/'/g, "''")}'}; exit $r.ReturnValue`
      ], {
        windowsHide: true,
        timeout: 15000,
        encoding: 'utf-8'
      })
    } catch (spawnErr: any) {
      const errMsg = `Failed to launch WMI process: ${spawnErr.message}`
      console.error(`[Updater] ${errMsg}`)
      this.status = { ...this.status, error: errMsg, readyToInstall: true }
      this.notifyRenderer()
      return errMsg
    }

    console.log(`[Updater] CIM spawn exit: ${cimResult.status}`)
    if (cimResult.stderr) console.log(`[Updater] CIM stderr: ${String(cimResult.stderr).trim()}`)

    if (cimResult.status !== 0) {
      const errMsg = `WMI process creation failed (exit ${cimResult.status})`
      console.error(`[Updater] ${errMsg}`)
      this.status = { ...this.status, error: errMsg, readyToInstall: true }
      this.notifyRenderer()
      return errMsg
    }

    // Wait up to 8s for the marker file
    console.log('[Updater] Waiting for update script to confirm start...')
    const maxWait = 8000
    const pollInterval = 250
    let waited = 0
    while (waited < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval))
      waited += pollInterval
      if (fs.existsSync(markerPath)) break
    }

    if (!fs.existsSync(markerPath)) {
      const errMsg = `Update script did not start within ${maxWait / 1000}s`
      console.error(`[Updater] ${errMsg}`)
      this.status = { ...this.status, error: errMsg, readyToInstall: true }
      this.notifyRenderer()
      return errMsg
    }

    console.log(`[Updater] Update script confirmed running (${waited}ms)`)
    setTimeout(() => { app.quit() }, 500)
    return null
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Fetch the latest release. Tries authenticated first (if a PAT is
   * shipped) and falls back to unauthenticated on auth failure. The
   * fallback covers two real-world scenarios:
   *   1. The repo went public — PAT no longer needed; unauth works fine.
   *   2. The PAT was invalidated by a repo transfer / rotation. Without
   *      this fallback, existing installs would be stuck on whatever
   *      version they currently have.
   */
  private async fetchLatestRelease(): Promise<any> {
    const token = getGithubToken()
    if (token) {
      try {
        const result = await this.fetchLatestReleaseWithAuth(token)
        if (result !== null) return result
        // null can mean either "no releases" or "auth failed but call
        // technically succeeded" — try unauth before giving up
      } catch (err) {
        console.log(`[Updater] Authenticated fetch failed (${(err as Error).message}) — falling back to unauthenticated`)
      }
    }
    return this.fetchLatestReleaseWithAuth(null)
  }

  /**
   * Single-attempt GitHub release fetch with auth + 301-redirect following.
   * Repo transfers, renames, and visibility changes all 301 the API request
   * to the canonical URL — without this, an auto-updater whose REPO_OWNER
   * constant became stale would just hard-fail forever. Up to 5 redirects.
   */
  private fetchLatestReleaseWithAuth(token: string | null): Promise<any> {
    return new Promise((resolve, reject) => {
      const initialPath = `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`

      const doRequest = (host: string, path: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          reject(new Error('GitHub API: too many redirects'))
          return
        }
        const headers: Record<string, string> = {
          'User-Agent': `VROS/${app.getVersion()}`,
          'Accept': 'application/vnd.github+json'
        }
        // Strip Authorization on cross-host redirects to avoid leaking the
        // token to anywhere that isn't api.github.com.
        if (token && host === 'api.github.com') {
          headers['Authorization'] = `Bearer ${token}`
        }

        const req = https.request({ hostname: host, path, method: 'GET', headers }, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            const sc = res.statusCode ?? 0
            if (redirectCount === 0) {
              console.log(`[Updater] GitHub API: ${sc}${token ? ' (authed)' : ' (unauth)'}`)
            }
            // Follow 301/302/307/308 redirects (repo transfers, renames)
            if (sc >= 300 && sc < 400 && res.headers.location) {
              const next = new URL(res.headers.location, `https://${host}${path}`)
              console.log(`[Updater] Following ${sc} redirect → ${next.hostname}${next.pathname}`)
              return doRequest(next.hostname, next.pathname + next.search, redirectCount + 1)
            }
            if (sc === 200) {
              try {
                const parsed = JSON.parse(data)
                console.log(`[Updater] Latest release: ${parsed.tag_name}, assets: ${parsed.assets?.length || 0}`)
                resolve(parsed)
              } catch { resolve(null) }
            } else if (sc === 404) {
              console.log('[Updater] No releases found (404)')
              resolve(null)
            } else if ((sc === 401 || sc === 403) && token) {
              // Caller will retry without auth
              console.log(`[Updater] Auth rejected (${sc}) — caller should retry without auth`)
              resolve(null)
            } else {
              reject(new Error(`GitHub API returned ${sc}: ${data.substring(0, 200)}`))
            }
          })
        })

        req.on('error', reject)
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('GitHub API timeout')) })
        req.end()
      }

      if (token) console.log('[Updater] Using GitHub token for authenticated request')
      else console.log('[Updater] Unauthenticated request (works for public repos)')
      doRequest('api.github.com', initialPath)
    })
  }

  private fetchAssetText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const token = getGithubToken()
      const doRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects fetching asset'))
        const parsed = new URL(requestUrl)
        const isGitHubApi = parsed.hostname === 'api.github.com'
        const headers: Record<string, string> = {
          'User-Agent': `VROS/${app.getVersion()}`,
          'Accept': 'application/octet-stream'
        }
        if (token && isGitHubApi) headers['Authorization'] = `Bearer ${token}`

        const req = https.request({
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers
        }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return doRequest(res.headers.location, redirectCount + 1)
          }
          if (res.statusCode !== 200) return reject(new Error(`Asset fetch failed: HTTP ${res.statusCode}`))
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => resolve(data))
        })

        req.on('error', reject)
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Asset fetch timeout')) })
        req.end()
      }
      doRequest(url)
    })
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const totalSize = this.status.updateInfo?.downloadSize || 0
      const token = getGithubToken()

      const doRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'))
        const parsed = new URL(requestUrl)
        const isGitHubApi = parsed.hostname === 'api.github.com'
        const headers: Record<string, string> = {
          'User-Agent': `VROS/${app.getVersion()}`,
          'Accept': 'application/octet-stream'
        }
        if (token && isGitHubApi) headers['Authorization'] = `Bearer ${token}`

        const options = {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers
        }

        const req = https.request(options, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log(`[Updater] Redirect → ${res.headers.location.substring(0, 80)}...`)
            return doRequest(res.headers.location, redirectCount + 1)
          }
          if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`))

          const contentLength = parseInt(res.headers['content-length'] || '0', 10) || totalSize
          let downloaded = 0
          const file = fs.createWriteStream(dest)

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (contentLength > 0) {
              const pct = Math.round((downloaded / contentLength) * 100)
              if (pct !== this.status.downloadProgress) {
                this.status = { ...this.status, downloadProgress: pct }
                this.notifyRenderer()
              }
            }
          })

          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
        })

        req.on('error', reject)
        req.setTimeout(300000, () => { req.destroy(); reject(new Error('Download timeout')) })
        req.end()
      }
      doRequest(url)
    })
  }

  private isNewer(remote: string, local: string): boolean {
    const r = remote.split('.').map(Number)
    const l = local.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((r[i] || 0) > (l[i] || 0)) return true
      if ((r[i] || 0) < (l[i] || 0)) return false
    }
    return false
  }

  private notifyRenderer(): void {
    const win = this.mainWindow?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater-status', this.status)
    }
  }
}
