// Vryionics VR Optimization Suite — Driver Updater Orchestrator
//
// Ties together the installed-driver scanner, per-vendor source lookups,
// and the installer. Runs on launch (5 s after ready) + every 24 h.
//
// State is cached in memory for the UI; the renderer polls via IPC rather
// than receiving pushes, keeping the coupling narrow.

import { BrowserWindow } from 'electron'
import { log } from '../logger'
import type {
  DriverCategory,
  DriverRow,
  FreshnessState,
  InstalledDriver,
  LatestAvailable,
} from './types'
import { defaultInstallModeFor } from './types'
import { scanInstalledDrivers } from './scanner'
import { fetchLatestNvidia } from './sources/nvidia'
import { fetchLatestAmd } from './sources/amd'
import { fetchLatestIntel } from './sources/intel'
import { downloadAndInstall, openGuidedDownload, type InstallProgress } from './installer'
import { lookupGuidedLink } from './guided-link-table'
import { notify } from '../notifier'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 h
const LAUNCH_DELAY_MS = 5_000                    // 5 s after app ready

export interface DriverUpdaterState {
  rows: DriverRow[]
  lastCheckedAt: number | null
  isChecking: boolean
  isLaptop: boolean
  activeInstall: {
    rowId: string
    progress: InstallProgress
  } | null
}

class DriverUpdater {
  private state: DriverUpdaterState = {
    rows: [],
    lastCheckedAt: null,
    isChecking: false,
    isLaptop: false,
    activeInstall: null,
  }
  private mainWindow: (() => BrowserWindow | null) | null = null
  private pollTimer: NodeJS.Timeout | null = null

  setMainWindow(getter: () => BrowserWindow | null): void {
    this.mainWindow = getter
  }

  setIsLaptop(isLaptop: boolean): void {
    this.state.isLaptop = isLaptop
  }

  getState(): DriverUpdaterState {
    return { ...this.state, rows: [...this.state.rows] }
  }

  startScheduled(): void {
    this.stopScheduled()
    setTimeout(() => {
      this.refreshAll().catch((err) => log.warn('drivers:updater', 'Initial scan failed:', err as Error))
    }, LAUNCH_DELAY_MS)
    this.pollTimer = setInterval(() => {
      this.refreshAll().catch((err) => log.warn('drivers:updater', 'Scheduled scan failed:', err as Error))
    }, REFRESH_INTERVAL_MS)
  }

  stopScheduled(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }

  /** Full refresh: re-scan hardware + re-check each source for latest version. */
  async refreshAll(): Promise<void> {
    if (this.state.isChecking) {
      log.info('drivers:updater', 'Refresh already in progress — skipping')
      return
    }
    this.state.isChecking = true
    this.notify()

    try {
      const installed = await scanInstalledDrivers()

      // Emit the first pass immediately — installed rows with `freshness:
      // unknown` and no vendor lookups yet. The UI shows the list right away
      // instead of waiting up to ~30 s for every vendor endpoint to reply.
      this.state.rows = installed.map((hw) => ({
        hardware: hw,
        latest: null,
        freshness: 'unknown' as FreshnessState,
        installMode: defaultInstallModeFor(hw.category, this.state.isLaptop),
        checkedAt: Date.now(),
      }))
      this.notify()

      // Now fetch vendor endpoints in parallel. Each fetch has its own
      // timeout inside the source module, and we Promise.all so one slow
      // vendor can't block the others.
      const rows = await Promise.all(installed.map((hw) => this.buildRow(hw)))
      // Detect freshly-outdated GPU drivers (current → outdated transition)
      // and toast the user. We only nag when a row was previously healthy
      // and just turned outdated this refresh — not every check cycle.
      const prevById = new Map(this.state.rows.map((r) => [r.hardware.id, r.freshness]))
      for (const row of rows) {
        const prev = prevById.get(row.hardware.id)
        if (
          row.hardware.category === 'gpu' &&
          (row.freshness === 'outdated' || row.freshness === 'warning') &&
          prev === 'current'
        ) {
          notify(
            'driver-outdated',
            'Vryionics: GPU driver out of date',
            `${row.hardware.hardwareName} → installed ${row.hardware.installedVersion}, latest ${row.latest?.version ?? '?'}. Open the Drivers page to update.`,
          )
        }
      }

      this.state.rows = rows
      this.state.lastCheckedAt = Date.now()
      log.info('drivers:updater', `Refresh complete: ${rows.length} rows`)
    } catch (err) {
      log.warn('drivers:updater', 'Refresh threw:', err as Error)
    } finally {
      this.state.isChecking = false
      this.notify()
    }
  }

  /** Re-check one row. Used for the per-row refresh button in the UI. */
  async refreshOne(rowId: string): Promise<void> {
    const idx = this.state.rows.findIndex((r) => r.hardware.id === rowId)
    if (idx < 0) return
    const hw = this.state.rows[idx].hardware
    const fresh = await this.buildRow(hw)
    this.state.rows[idx] = fresh
    this.notify()
  }

  /**
   * Build one DriverRow from an installed driver — includes the latest-version
   * lookup + freshness derivation + install mode decision.
   */
  private async buildRow(hw: InstalledDriver): Promise<DriverRow> {
    let latest: LatestAvailable | null = null
    let checkError: string | undefined

    try {
      latest = await this.fetchLatestFor(hw)
    } catch (err) {
      const msg = (err as Error).message
      log.warn('drivers:updater', `Live lookup failed for ${hw.hardwareName}: ${msg}`)
      checkError = msg
    }

    // Fallback: if no live source produced a `latest`, use the curated
    // link table to at least give this row a real vendor page to open.
    // We don't know the version, but the user can check manually by
    // clicking "Open vendor page".
    if (!latest) {
      const guided = lookupGuidedLink(hw.category, hw.vendor, hw.hardwareName)
      if (guided) {
        latest = {
          version: '—',             // unknown; UI renders this as "See vendor page"
          downloadUrl: guided.url,
          source: 'static-fallback',
        }
        // Suppress the error for non-GPU categories where we never had a
        // live source to begin with — the fallback link IS the feature,
        // not a failure.
        if (hw.category !== 'gpu') checkError = undefined
      }
    }

    const freshness: FreshnessState = computeFreshness(hw, latest)
    const installMode = defaultInstallModeFor(hw.category, this.state.isLaptop)

    return {
      hardware: hw,
      latest,
      freshness,
      installMode,
      checkError,
      checkedAt: Date.now(),
    }
  }

  /**
   * Dispatch to the right vendor source based on category + vendor.
   * Throws a descriptive error (caught upstream into `checkError`) when no
   * source exists for a given category + vendor combination — this is
   * preferable to silently returning null because the UI can then show
   * the user why the row is "Unknown".
   */
  private async fetchLatestFor(hw: InstalledDriver): Promise<LatestAvailable | null> {
    if (hw.category === 'gpu') {
      if (hw.vendor === 'NVIDIA') return fetchLatestNvidia(hw.hardwareName)
      if (hw.vendor === 'AMD')    return fetchLatestAmd(hw.hardwareName)
      if (hw.vendor === 'Intel')  return fetchLatestIntel(hw.hardwareName)
    }
    // Non-GPU categories have no live version-check source yet — they'll
    // fall through to the guided-link table in buildRow() which wraps them
    // with a curated vendor-page URL instead.
    return null
  }

  /**
   * Kick off the install flow for a row.
   *   • Guided rows: open vendor page in browser, return immediately
   *   • Auto rows: download + verify + silent-install with progress IPC
   */
  async installRow(rowId: string): Promise<{ success: boolean; error?: string }> {
    const row = this.state.rows.find((r) => r.hardware.id === rowId)
    if (!row) return { success: false, error: 'Driver not found' }
    if (!row.latest) return { success: false, error: 'No update available' }

    // Guided path also covers static-fallback rows even if the category
    // would normally be auto-safe — static links are vendor-page HTML, not
    // a real installer we can silent-execute. Same applies to any live
    // result that explicitly says installable=false (AMD + Intel GPU
    // sources today, which only resolve to the support page, not a .exe).
    const installable = row.latest.installable !== false
    if (row.installMode === 'guided' || row.latest.source === 'static-fallback' || !installable) {
      if (!row.latest.downloadUrl) return { success: false, error: 'No download URL' }
      await openGuidedDownload(row.latest.downloadUrl)
      return { success: true }
    }

    // Auto install
    if (this.state.activeInstall) {
      return { success: false, error: 'Another install is already in progress' }
    }
    this.state.activeInstall = { rowId, progress: { phase: 'downloading' } }
    this.notify()

    try {
      const result = await downloadAndInstall(row.hardware.vendor, row.latest, (progress) => {
        if (this.state.activeInstall && this.state.activeInstall.rowId === rowId) {
          this.state.activeInstall.progress = progress
          this.notify()
        }
      })

      if (result.success) {
        // Bump the row's installed version to the just-installed one so the
        // UI immediately reflects the update without waiting for a rescan.
        // Real version will be confirmed on next refresh cycle.
        row.hardware.installedVersion = row.latest.version
        row.freshness = 'current'
      }
      this.state.activeInstall = { rowId, progress: { phase: result.success ? 'complete' : 'error', error: result.error } }
      this.notify()

      // Clear active-install banner after 5 s so the UI doesn't pin it
      setTimeout(() => {
        if (this.state.activeInstall?.rowId === rowId) {
          this.state.activeInstall = null
          this.notify()
        }
      }, 5_000)

      return { success: result.success, error: result.error }
    } catch (err) {
      this.state.activeInstall = {
        rowId,
        progress: { phase: 'error', error: (err as Error).message },
      }
      this.notify()
      return { success: false, error: (err as Error).message }
    }
  }

  private notify(): void {
    const win = this.mainWindow?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('drivers:state', this.getState())
    }
  }
}

/** Compute freshness by comparing installed version/date against vendor latest. */
function computeFreshness(hw: InstalledDriver, latest: LatestAvailable | null): FreshnessState {
  if (!latest) return 'unknown'
  // Static-fallback entries have no version data — treat as unknown so we
  // don't misclassify them as "warning" just because versions differ.
  if (latest.source === 'static-fallback' || latest.version === '—') return 'unknown'
  // Easy case: exact version match = current
  if (normalize(hw.installedVersion) === normalize(latest.version)) return 'current'

  // Fall back to age of installed driver date
  if (hw.installedDate) {
    const ageDays = (Date.now() - new Date(hw.installedDate).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays <= 30) return 'current'
    if (ageDays <= 90) return 'warning'
    return 'outdated'
  }

  // No date → treat as warning since we know there's a mismatch but can't
  // quantify how old. Better than pretending it's current.
  return 'warning'
}

function normalize(v: string): string {
  // Strip leading zeros, whitespace, so "31.0.101.5445" == "31.0.101.5445"
  return v.trim().replace(/\s+/g, '')
}

// ── Singleton export ──────────────────────────────────────────

export const driverUpdater = new DriverUpdater()

/** Helper for other IPC handlers to look up driver state. */
export function getDriverUpdater(): DriverUpdater {
  return driverUpdater
}
