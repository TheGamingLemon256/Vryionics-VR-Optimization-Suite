// VR Optimization Suite — Steam Games IPC Handlers
import { ipcMain } from 'electron'
import { scanSteamGames } from '../scanner/modules/steam-games'

export function registerSteamGamesHandlers(): void {
  ipcMain.handle('steamgames:scan', async () => {
    console.log('[ipc:steamgames] Starting Steam VR games scan...')
    const result = await scanSteamGames()
    console.log(`[ipc:steamgames] Found ${result.vrGames.length} VR games in ${result.libraryPaths.length} libraries`)
    return result
  })
}
