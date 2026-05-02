// fix:preview, fix:apply, fix:undo, fix:getHistory.

import { ipcMain } from 'electron'
import { previewFix, applyFix, undoFix, getFixHistory, getAllFixIds } from '../fixes/engine'


export function registerFixHandlers(): void {
  // Preview: show what a fix will change before applying
  ipcMain.handle('fix:preview', async (_event, fixId: string) => {
    return previewFix(fixId)
  })

  // Apply a fix
  ipcMain.handle('fix:apply', async (_event, fixId: string) => {
    console.log(`[ipc:fix] Applying fix: ${fixId}`)
    const result = await applyFix(fixId)
    console.log(`[ipc:fix] Fix ${fixId} result: ${result.success ? 'success' : result.error}`)
    return result
  })

  // Undo a previously applied fix
  ipcMain.handle('fix:undo', async (_event, fixId: string) => {
    console.log(`[ipc:fix] Undoing fix: ${fixId}`)
    const result = await undoFix(fixId)
    console.log(`[ipc:fix] Undo ${fixId} result: ${result.success ? 'success' : result.error}`)
    return result
  })

  // Apply multiple fixes in sequence
  ipcMain.handle('fix:applyAll', async (_event, fixIds: string[]) => {
    const results = []
    for (const id of fixIds) {
      results.push(await applyFix(id))
    }
    return results
  })

  // Get fix application history
  ipcMain.handle('fix:getHistory', () => {
    return getFixHistory()
  })

  // Get all available fix IDs
  ipcMain.handle('fix:getAll', () => {
    return getAllFixIds()
  })

  // Preview multiple fixes in sequence
  ipcMain.handle('fix:previewAll', async (_event, fixIds: string[]) => {
    const results = []
    for (const id of fixIds) {
      results.push(await previewFix(id))
    }
    return results
  })
}
