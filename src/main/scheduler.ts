// Vryionics VR Optimization Suite — Background Scan Scheduler
//
// Daily timer that asks the renderer to run a full system scan if the
// most recent saved report is more than the configured interval old.
// Uses electron-store to read reports (same store the reports-store
// renderer side writes to), so the scheduler always has truth.

import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import { log } from './logger'

const TICK_INTERVAL_MS = 60 * 60 * 1000          // re-evaluate every hour
const DEFAULT_SCAN_INTERVAL_DAYS = 7
const STORE_NAME = 'vros-reports'                // matches reports IPC handler

interface SchedulerConfig {
  enabled: boolean
  intervalDays: number
}

const settingsStore = new Store({ name: 'vros-config' })
const reportsStore = new Store({ name: STORE_NAME })

let timer: NodeJS.Timeout | null = null
let mainWindowRef: (() => BrowserWindow | null) | null = null

function getConfig(): SchedulerConfig {
  return {
    enabled: (settingsStore.get('scheduler.enabled') as boolean) ?? true,
    intervalDays: (settingsStore.get('scheduler.intervalDays') as number) ?? DEFAULT_SCAN_INTERVAL_DAYS,
  }
}

export function setSchedulerConfig(cfg: Partial<SchedulerConfig>): void {
  if (typeof cfg.enabled === 'boolean') settingsStore.set('scheduler.enabled', cfg.enabled)
  if (typeof cfg.intervalDays === 'number') settingsStore.set('scheduler.intervalDays', cfg.intervalDays)
  log.info('scheduler', `Config updated: ${JSON.stringify(getConfig())}`)
}

export function getSchedulerConfig(): SchedulerConfig {
  return getConfig()
}

/** Most recent saved report's timestamp, or 0 if none. */
function getLatestReportTimestamp(): number {
  try {
    const reports = (reportsStore.get('reports') as Array<{ timestamp?: number }>) ?? []
    if (reports.length === 0) return 0
    return Math.max(...reports.map((r) => r.timestamp ?? 0))
  } catch { return 0 }
}

function shouldRunNow(): boolean {
  const cfg = getConfig()
  if (!cfg.enabled) return false
  const latest = getLatestReportTimestamp()
  if (latest === 0) return false  // first run — don't surprise the user; wait for them to do their first manual scan
  const ageMs = Date.now() - latest
  const intervalMs = cfg.intervalDays * 24 * 60 * 60 * 1000
  return ageMs >= intervalMs
}

function tick(): void {
  if (!shouldRunNow()) return
  const win = mainWindowRef?.()
  if (!win || win.isDestroyed()) {
    log.warn('scheduler', 'Tick fired but no main window — deferring')
    return
  }
  log.info('scheduler', 'Triggering scheduled background scan')
  // Reuse the tray's run-scan channel — renderer's App.tsx subscribes once
  // and routes both signals to the same dashboard scan flow.
  win.webContents.send('tray:run-scan')
}

export function startScheduler(getMainWindow: () => BrowserWindow | null): void {
  mainWindowRef = getMainWindow
  stopScheduler()
  log.info('scheduler', `Started — config=${JSON.stringify(getConfig())}`)
  // First check 5 min after launch so we don't fire during boot
  setTimeout(tick, 5 * 60 * 1000)
  timer = setInterval(tick, TICK_INTERVAL_MS)
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}
