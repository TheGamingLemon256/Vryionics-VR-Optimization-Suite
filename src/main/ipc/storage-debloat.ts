// Exposes storage:scanDebloat, storage:deleteCategory, storage:deleteCategories.

import { ipcMain, app } from 'electron'
import { scanDebloat, deleteDebloatCategory } from '../scanner/modules/storage-debloat'

export function registerStorageDebloatHandlers(): void {
  // Scan for debloatable files across all categories
  ipcMain.handle('storage:scanDebloat', async () => {
    console.log('[storage:debloat] Starting debloat scan...')
    const result = await scanDebloat()
    const totalMB = result.categories.reduce((sum, cat) => sum + cat.sizeMB, 0)
    console.log(
      `[storage:debloat] Scan complete — ${result.categories.length} categories, ` +
      `${totalMB.toFixed(0)} MB potentially freeable`
    )
    return result
  })

  // Delete a single category by id
  ipcMain.handle('storage:deleteCategory', async (_event, categoryId: string) => {
    console.log(`[storage:debloat] Deleting category: ${categoryId}`)
    const userHome = app.getPath('home')
    const result = await deleteDebloatCategory(categoryId, userHome)
    const freedMB = (result.freed / 1024 / 1024).toFixed(1)
    if (result.errors.length > 0) {
      console.warn(`[storage:debloat] ${categoryId} — freed ${freedMB} MB, ${result.errors.length} error(s): ${result.errors.slice(0, 2).join('; ')}`)
    } else {
      console.log(`[storage:debloat] ${categoryId} — freed ${freedMB} MB`)
    }
    return result
  })

  // Delete multiple categories sequentially and return an aggregate result
  ipcMain.handle('storage:deleteCategories', async (_event, categoryIds: string[]) => {
    console.log(`[storage:debloat] Deleting ${categoryIds.length} categories: [${categoryIds.join(', ')}]`)
    const userHome = app.getPath('home')
    const results: Record<string, { freed: number; errors: string[] }> = {}

    for (const id of categoryIds) {
      results[id] = await deleteDebloatCategory(id, userHome)
    }

    const totalFreed = Object.values(results).reduce((sum, r) => sum + r.freed, 0)
    const allErrors = Object.values(results).flatMap((r) => r.errors)
    const totalMB = (totalFreed / 1024 / 1024).toFixed(1)
    console.log(
      `[storage:debloat] Batch delete complete — freed ${totalMB} MB total, ` +
      `${allErrors.length} total error(s)`
    )

    return { results, totalFreed, errors: allErrors }
  })
}
