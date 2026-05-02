import { ipcMain } from 'electron'
import type { ScanData } from '../scanner/types'

export function registerUpgradeHandlers(): void {
  ipcMain.handle('upgrades:generate', async (_event, scanData: ScanData) => {
    try {
      // Dynamic import to keep startup bundle lean
      const { buildUpgradeRecommendations } = await import('../rules/upgrade-engine')
      return buildUpgradeRecommendations(scanData)
    } catch (e) {
      console.error('[ipc:upgrades] Failed to generate recommendations:', (e as Error).message)
      return []
    }
  })
}
