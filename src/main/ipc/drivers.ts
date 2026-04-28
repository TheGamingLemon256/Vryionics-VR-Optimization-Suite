// Vryionics VR Optimization Suite — Drivers IPC
//
// Thin bridge between the driver updater's in-memory state and the
// renderer's Drivers page. Renderer calls `drivers:getState` to hydrate,
// then subscribes to `drivers:state` for live updates.

import { ipcMain } from 'electron'
import { driverUpdater } from '../drivers/updater'

export function registerDriverHandlers(): void {
  ipcMain.handle('drivers:getState', () => driverUpdater.getState())
  ipcMain.handle('drivers:refreshAll', async () => {
    await driverUpdater.refreshAll()
    return driverUpdater.getState()
  })
  ipcMain.handle('drivers:refreshOne', async (_e, rowId: string) => {
    await driverUpdater.refreshOne(rowId)
    return driverUpdater.getState()
  })
  ipcMain.handle('drivers:install', async (_e, rowId: string) => {
    return driverUpdater.installRow(rowId)
  })
}
