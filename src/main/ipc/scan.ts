// VR Optimization Suite — Scan IPC Handlers
// Connects renderer scan requests to the scan engine and rules engine.

import { ipcMain, BrowserWindow } from 'electron'
import { runScan } from '../scanner/engine'
import { evaluateRules, getAllRuleSummaries } from '../rules/engine'
import { buildActionPlan } from '../rules/summary-engine'
import { diagnoseNetworkPackets } from '../scanner/modules/network-packet'
import { driverUpdater } from '../drivers/updater'
import type { ScanData, ScanProgress } from '../scanner/types'
import type { Finding } from '../rules/types'

let currentScanAborted = false
let lastScanResult: ScanData | null = null

export function registerScanHandlers(mainWindow: BrowserWindow): void {
  // Run a full scan
  ipcMain.handle('scan:runFull', async (_event, options: { headsetProfileId?: string; connectionArchetype?: string } = {}) => {
    currentScanAborted = false
    const startedAt = Date.now()
    console.log(`[ipc:scan] ▶ Scan started — headset=${options.headsetProfileId ?? 'none'} archetype=${options.connectionArchetype ?? 'none'}`)

    try {
      const result = await runScan({
        headsetProfileId: options.headsetProfileId,
        connectionArchetype: (options.connectionArchetype as ScanData['connectionArchetype']) ?? undefined,
        onProgress: (progress: ScanProgress) => {
          if (currentScanAborted) return
          mainWindow.webContents.send('scan:progress', progress)
        }
      })

      lastScanResult = result
      // Propagate laptop status to the driver updater so it can force all
      // driver installs to guided-only tier on laptops (OEM-rewrapped drivers
      // brick laptops if vendor-direct is silent-installed).
      if (typeof result.compat?.isLaptop === 'boolean') {
        driverUpdater.setIsLaptop(result.compat.isLaptop)
      }
      const durationMs = Date.now() - startedAt
      console.log(`[ipc:scan] ✓ Scan complete — ${durationMs}ms, condition=${result.scanCondition ?? 'idle'}, CPU=${result.cpu?.model ?? 'unknown'}, GPU=${result.gpu?.devices[0]?.name ?? 'unknown'}`)
      return result
    } catch (error) {
      console.error(`[ipc:scan] ✗ Scan failed after ${Date.now() - startedAt}ms:`, error as Error)
      throw new Error(`Scan failed: ${(error as Error).message}`)
    }
  })

  // Get last scan result (for dashboard refresh without re-scanning)
  ipcMain.handle('scan:getLastResult', () => {
    return lastScanResult
  })

  // Cancel in-progress scan
  ipcMain.on('scan:cancel', () => {
    currentScanAborted = true
    console.log('[ipc:scan] Scan cancelled by user')
  })

  // Evaluate rules against scan data
  ipcMain.handle('rules:evaluate', (_event, scanData: ScanData, headsetBrand?: string) => {
    return evaluateRules(scanData, headsetBrand)
  })

  // Get all rule summaries
  ipcMain.handle('rules:getAll', () => {
    return getAllRuleSummaries()
  })

  // Generate executive action plan from findings + scan data
  ipcMain.handle('summary:generate', (_event, findings: Finding[], scanData: ScanData) => {
    return buildActionPlan(findings, scanData)
  })

  // Network packet-level diagnosis (user-triggered, blocks for ~duration + overhead)
  ipcMain.handle('scan:networkPacketDiagnosis', async (_event, durationMs: number = 10_000) => {
    return diagnoseNetworkPackets(durationMs)
  })
}
