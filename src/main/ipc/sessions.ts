// Vryionics VR Optimization Suite — Sessions IPC
//
// Exposes the session recorder's stored timeline to the renderer Sessions
// page. Read-only from the renderer's perspective — recording lifecycle is
// owned by the auto-enable watcher.

import { ipcMain } from 'electron'
import {
  listSessions, getSession, deleteSession, getActiveSummary,
} from '../session-recorder'

export function registerSessionHandlers(): void {
  ipcMain.handle('sessions:list',     () => listSessions())
  ipcMain.handle('sessions:get',      (_e, id: string) => getSession(id))
  ipcMain.handle('sessions:delete',   (_e, id: string) => deleteSession(id))
  ipcMain.handle('sessions:active',   () => getActiveSummary())
}
