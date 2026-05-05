import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerScanHandlers } from './ipc/scan'
import { registerSystemHandlers } from './ipc/system'
import { registerFixHandlers } from './ipc/fix'
import { registerStorageDebloatHandlers } from './ipc/storage-debloat'
import { registerSteamGamesHandlers } from './ipc/steam-games'
import { registerUpgradeHandlers } from './ipc/upgrades'
import { registerLiveOptimizerHandlers } from './ipc/live-optimizer'
import { registerReportsHandlers } from './ipc/reports'
import { registerMetricsHandlers } from './ipc/metrics'
import { registerSupportHandlers } from './ipc/support'
import { stop as stopOptimizer } from './live-optimizer/optimizer'
import { AutoUpdater } from './updater'
import { log, installGlobalErrorHandlers, logFromRenderer, getCurrentLogFile, getLogDir } from './logger'
import { driverUpdater } from './drivers/updater'
import { registerDriverHandlers } from './ipc/drivers'
import { registerSessionHandlers } from './ipc/sessions'
import * as sessionRecorder from './session-recorder'
import { initTray, destroyTray } from './tray'
import { startScheduler, getSchedulerConfig, setSchedulerConfig } from './scheduler'
import { isHttpsUrl } from './utils/url-guard'
import { exportProfile, importProfileFromDisk } from './profile-export'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
// Tear down the tray icon when the app is shutting down so it doesn't
// linger in the notification area for a frame after exit.
app.on('before-quit', () => { destroyTray() })

/**
 * Create a small always-on-top floating overlay window that shows the live
 * metrics widget. Intended to remain visible during VR sessions so users
 * can monitor CPU/GPU/RAM + VR health without taking off the headset.
 * Full in-VR (OpenVR dashboard) integration requires a native addon and
 * is scoped for a future release — this desktop overlay is the stepping stone.
 */
function createOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    overlayWindow.focus()
    return
  }
  overlayWindow = new BrowserWindow({
    width: 320,
    height: 120,
    minWidth: 260,
    minHeight: 90,
    x: 20,
    y: 20,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // Top-most across all workspaces, even above fullscreen windows (VR mirror etc.)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.on('ready-to-show', () => overlayWindow?.show())
  overlayWindow.on('closed', () => { overlayWindow = null })

  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}#/overlay`
    : `file://${join(__dirname, '../renderer/index.html')}#/overlay`
  overlayWindow.loadURL(url)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Close = real quit. Earlier behaviour minimized to tray on close, but
  // testers reported clicking X expecting the app to actually shut down
  // (the system tray icon misled them into thinking the optimizer was
  // still running after they'd "closed" it). The minimize button (─) on
  // the titlebar still hides the window to the taskbar without quitting.
  // We deliberately let close fire normally now — the will-quit handler
  // below still awaits service restoration before the process exits.

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isHttpsUrl(details.url)) {
      shell.openExternal(details.url)
    } else {
      console.warn(`[mainWindow] blocked window-open to non-https URL: ${details.url}`)
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}


function registerBaseHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:isDevBuild', () => is.dev)

  // Lets the renderer forward console output + uncaught errors into the
  // unified log file, so bug reports contain both process sides together.
  ipcMain.handle('log:write', (_e, level: string, namespace: string, message: string) => {
    const lvl = (['debug', 'info', 'warn', 'error'] as const).includes(level as any)
      ? (level as 'debug' | 'info' | 'warn' | 'error')
      : 'info'
    logFromRenderer(lvl, String(namespace || 'renderer'), String(message))
  })
  ipcMain.handle('log:currentFile', () => getCurrentLogFile())
  ipcMain.handle('log:directory', () => getLogDir())
  ipcMain.handle('app:minimize', () => mainWindow?.minimize())
  ipcMain.handle('app:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('app:close', () => mainWindow?.close())

  // Always-on-top overlay window — shows live metrics during VR sessions
  ipcMain.handle('overlay:open', () => { createOverlayWindow() })
  ipcMain.handle('overlay:close', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
  })
  ipcMain.handle('overlay:isOpen', () => {
    return !!(overlayWindow && !overlayWindow.isDestroyed())
  })
}


const updater = new AutoUpdater()

function registerUpdaterHandlers(): void {
  updater.setMainWindow(() => mainWindow)
  ipcMain.handle('updater:check', () => updater.checkForUpdates())
  ipcMain.handle('updater:download', () => updater.downloadUpdate())
  ipcMain.handle('updater:install', async () => {
    const error = await updater.installAndRestart()
    if (error) throw new Error(error)
  })
  ipcMain.handle('updater:status', () => updater.getStatus())
}


app.whenReady().then(() => {
  // Install global error handlers + open the log file FIRST so everything
  // after this gets captured, including any init errors.
  installGlobalErrorHandlers()
  log.info('app', `Vryionics VR Optimization Suite v${app.getVersion()} starting`)
  log.info('app', `Platform: ${process.platform} ${process.arch} | Electron: ${process.versions.electron} | Node: ${process.versions.node}`)

  // The new optimizer never stops Windows services, so the v0.2.8
  // service-recovery shim is no longer needed. Crash recovery now lives in
  // optimizer.start() and only restores priorities, which is bounded and
  // self-contained.

  electronApp.setAppUserModelId('com.vryionics.vr-optimization-suite')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Lock down navigation across every webContents the app creates. Without
  // this, a renderer could navigate to about:blank or a remote origin and
  // we'd lose the contextIsolation + preload-only-API guarantee. Same hook
  // also catches new-window attempts on the overlay window which doesn't
  // wire its own setWindowOpenHandler.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (e, navUrl) => {
      // Allow only the local file load and the dev server URL.
      const allowedDevUrl = process.env['ELECTRON_RENDERER_URL']
      const isLocalFile = navUrl.startsWith('file://')
      const isDevUrl = !!allowedDevUrl && navUrl.startsWith(allowedDevUrl)
      if (!isLocalFile && !isDevUrl) {
        console.warn(`[web-contents] blocked navigation to ${navUrl}`)
        e.preventDefault()
      }
    })
    contents.setWindowOpenHandler((details) => {
      if (isHttpsUrl(details.url)) {
        shell.openExternal(details.url)
      } else {
        console.warn(`[web-contents] blocked window-open to ${details.url}`)
      }
      return { action: 'deny' }
    })
  })

  registerBaseHandlers()
  registerSystemHandlers()
  registerFixHandlers()
  registerStorageDebloatHandlers()
  registerSteamGamesHandlers()
  registerUpgradeHandlers()
  registerMetricsHandlers()
  registerSupportHandlers()
  registerUpdaterHandlers()
  registerDriverHandlers()
  registerSessionHandlers()
  sessionRecorder.setMainWindow(() => mainWindow)
  sessionRecorder.reconcileCrashedRecords()
  driverUpdater.setMainWindow(() => mainWindow)
  initTray(() => mainWindow)
  startScheduler(() => mainWindow)
  ipcMain.handle('scheduler:getConfig', () => getSchedulerConfig())
  ipcMain.handle('scheduler:setConfig', (_e, cfg: { enabled?: boolean; intervalDays?: number }) => {
    setSchedulerConfig(cfg)
    return getSchedulerConfig()
  })
  ipcMain.handle(
    'profile:export',
    (_e, setup: { headsetId?: string; connectionArchetype?: string; pcType?: string; primaryUseCase?: string } | null, description: string) =>
      exportProfile(setup ?? null, description ?? ''),
  )
  ipcMain.handle('profile:import', () => importProfileFromDisk())
  ipcMain.handle('profile:applyImported', async (_e, fixIds: string[]) => {
    // Apply imported fix IDs in series, returning per-fix results
    const { applyFix } = await import('./fixes/engine')
    const results: Array<{ fixId: string; success: boolean; error?: string }> = []
    for (const id of fixIds) {
      try {
        const r = await applyFix(id)
        results.push({ fixId: id, success: r.success, error: r.error })
      } catch (err) {
        results.push({ fixId: id, success: false, error: (err as Error).message })
      }
    }
    return results
  })
  // Laptop detection is done in the scan engine's compat module. Until the
  // first scan completes, we conservatively default to desktop. First scan
  // will update this via driverUpdater.setIsLaptop(scanData.compat.isLaptop).
  driverUpdater.startScheduled()

  createWindow()

  // Register scan handlers after window is created (needs mainWindow reference)
  if (mainWindow) {
    registerScanHandlers(mainWindow)
    registerLiveOptimizerHandlers(mainWindow)
    registerReportsHandlers()
  }

  // Initial check shortly after launch, then poll every 2 minutes
  setTimeout(() => {
    updater.checkForUpdates().catch((err) => {
      console.warn('[Updater] Initial check failed:', err.message)
    })
    updater.startBackgroundPolling()
  }, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Closing the main window quits the app (X = real shutdown). macOS apps
// traditionally stay open with no windows; we do quit there too because
// background services keep running by default and that surprises testers.
app.on('window-all-closed', () => { app.quit() })

// Final cleanup on actual quit. We block the quit event for up to 10 s while
// the optimizer restores services — this prevents Quantum's reported lockup
// where the desktop became unresponsive because Audio / Spooler / Search
// services were left stopped. If restore takes longer than the timeout we
// proceed to quit anyway; recoverStoppedServices() picks up the slack on
// the next launch via the persisted pending list.
let restoreInProgress = false
app.on('will-quit', (e) => {
  if (restoreInProgress) return
  restoreInProgress = true
  e.preventDefault()
  log.info('app', 'Will-quit: restoring optimizer state before exit...')
  const cleanup = (async (): Promise<void> => {
    try { await Promise.race([stopOptimizer(), new Promise((res) => setTimeout(res, 10_000))]) } catch { /* ignore */ }
    log.info('app', 'Cleanup complete - quitting')
    app.exit(0)
  })()
  void cleanup
})
