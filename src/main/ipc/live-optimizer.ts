// VR Optimization Suite — Live Optimizer IPC Handlers

import { ipcMain, app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { LiveOptimizerConfig } from '../live-optimizer/types'
import { DEFAULT_CONFIG } from '../live-optimizer/types'
import {
  startMonitoring, stopMonitoring, getStatus, updateConfig, forceOptimize, restore
} from '../live-optimizer/optimizer'
import {
  startAutoEnableWatcher, stopAutoEnableWatcher, clearAutoEnableOwnership,
} from '../live-optimizer/auto-enable'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'liveopt-config.json')
}

function loadConfig(): LiveOptimizerConfig {
  try {
    const raw = readFileSync(getConfigPath(), 'utf8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as LiveOptimizerConfig
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function saveConfig(config: LiveOptimizerConfig): void {
  try {
    writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8')
  } catch { /* ignore */ }
}

export function registerLiveOptimizerHandlers(mainWindow: BrowserWindow): void {
  // Status push to renderer
  const pushStatus = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('liveopt:statusUpdate', getStatus())
    }
  }

  // Load saved config and auto-start if enabled
  const savedConfig = loadConfig()
  console.log(`[liveopt:init] Config loaded — enabled=${savedConfig.enabled} autoEnable=${savedConfig.autoEnableOnVrDetected}`)
  if (savedConfig.enabled) {
    console.log('[liveopt:init] Auto-starting monitoring (was enabled at last shutdown)')
    startMonitoring(savedConfig, pushStatus)
  }

  // Background watcher: flip the optimizer on/off automatically as VR
  // sessions begin and end. Hooks read live config every poll so changes
  // to autoEnableOnVrDetected take effect without restarting the watcher.
  startAutoEnableWatcher({
    shouldRun: () => loadConfig().autoEnableOnVrDetected !== false,
    isOptimizerOn: () => getStatus().phase !== 'disabled',
    enable: () => {
      const cfg = loadConfig()
      const updated = { ...cfg, enabled: true }
      saveConfig(updated)
      startMonitoring(updated, pushStatus)
      pushStatus()
    },
    disable: async () => {
      const cfg = loadConfig()
      const updated = { ...cfg, enabled: false }
      saveConfig(updated)
      try { await restore() } catch { /* ignore */ }
      stopMonitoring()
      pushStatus()
    },
  })

  ipcMain.handle('liveopt:getStatus', () => getStatus())

  ipcMain.handle('liveopt:getConfig', () => loadConfig())

  ipcMain.handle('liveopt:setConfig', (_event, config: LiveOptimizerConfig) => {
    console.log(`[liveopt:setConfig] Updating config — enabled=${config.enabled}`)
    saveConfig(config)
    updateConfig(config)
  })

  ipcMain.handle('liveopt:enable', () => {
    console.log('[liveopt:enable] Enabling live optimizer')
    const config = loadConfig()
    const updated = { ...config, enabled: true }
    saveConfig(updated)
    startMonitoring(updated, pushStatus)
  })

  ipcMain.handle('liveopt:disable', async () => {
    console.log('[liveopt:disable] Disabling live optimizer — restoring settings')
    const config = loadConfig()
    const updated = { ...config, enabled: false }
    saveConfig(updated)
    await restore()
    stopMonitoring()
    // User explicitly disabled — clear watcher's "we own this" flag so the
    // next VR detection doesn't immediately flip it back on against their
    // intent. Watcher resumes auto-enable on the NEXT VR session.
    clearAutoEnableOwnership()
    console.log('[liveopt:disable] Live optimizer stopped')
  })

  ipcMain.handle('liveopt:forceOptimize', async () => {
    console.log('[liveopt:forceOptimize] Forcing manual optimization pass')
    const config = loadConfig()
    await forceOptimize(config)
    pushStatus()
    console.log('[liveopt:forceOptimize] Done')
  })

  ipcMain.handle('liveopt:restore', async () => {
    console.log('[liveopt:restore] Restoring pre-optimization settings')
    await restore()
    pushStatus()
    console.log('[liveopt:restore] Restore complete')
  })
}
