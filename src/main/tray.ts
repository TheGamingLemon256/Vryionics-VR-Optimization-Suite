// Vryionics VR Optimization Suite — System Tray
//
// Adds a tray icon with a context menu so the app can run quietly in the
// background — auto-enable, scheduled scans, driver checks, and toast
// notifications all keep working when the main window is minimised to tray.

import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import * as path from 'path'
import { log } from './logger'

let tray: Tray | null = null
let mainWindowRef: (() => BrowserWindow | null) | null = null

/** Resolve the tray icon — works both in dev (out/main → ../../build/icon.png)
 *  and packaged (resources/build/icon.png). Falls back to an empty image
 *  if the file is missing rather than throwing. */
function loadTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), '..', '..', 'build', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'build', 'icon.png'),
  ]
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
    } catch { /* try next */ }
  }
  return nativeImage.createEmpty()
}

function showWindow(): void {
  const win = mainWindowRef?.()
  if (!win) return
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function buildMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: 'Vryionics VR Optimization Suite', enabled: false },
    { type: 'separator' },
    { label: 'Open',                  click: showWindow },
    { label: 'Run Scan Now',          click: () => sendToRenderer('tray:run-scan') },
    { label: 'Check for Driver Updates', click: () => sendToRenderer('tray:check-drivers') },
    { type: 'separator' },
    { label: 'Quit Vryionics',        click: () => { app.quit() } },
  ])
}

function sendToRenderer(channel: string): void {
  const win = mainWindowRef?.()
  if (!win || win.isDestroyed()) {
    showWindow()
    // Renderer might not be ready yet — give it a moment then send
    setTimeout(() => mainWindowRef?.()?.webContents.send(channel), 500)
    return
  }
  showWindow()
  win.webContents.send(channel)
}

export function initTray(getMainWindow: () => BrowserWindow | null): void {
  mainWindowRef = getMainWindow

  if (tray) return

  try {
    tray = new Tray(loadTrayIcon())
    tray.setToolTip('Vryionics VR Optimization Suite')
    tray.setContextMenu(buildMenu())
    tray.on('click', showWindow)
    tray.on('double-click', showWindow)
    log.info('tray', 'Tray icon initialised')
  } catch (err) {
    log.warn('tray', 'Failed to create tray icon:', err as Error)
    tray = null
  }
}

export function destroyTray(): void {
  if (tray) { tray.destroy(); tray = null }
}
