// Setup wizard, config, system utility handlers.

import { ipcMain, shell } from 'electron'
import { execFileSync } from 'child_process'
import { loadAllProfiles, getProfile, getProfileSummaries } from '../headsets/loader'
import Store from 'electron-store'

const store = new Store({ name: 'vros-config' })
const setupStore = new Store({ name: 'vros-setup' })

export function registerSystemHandlers(): void {
  // Admin detection. Kept around for any future surface that wants to know
  // (e.g. driver-installer status badges); v0.2.9 has no admin-required
  // fixes so the result is informational only.
  ipcMain.handle('system:isAdmin', () => {
    try {
      execFileSync('net', ['session'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })

  // Headset profiles
  ipcMain.handle('setup:getHeadsetProfiles', () => {
    const summaries = getProfileSummaries()
    console.log(`[setup:getHeadsetProfiles] Returning ${summaries.length} headset profile(s)`)
    return summaries
  })

  ipcMain.handle('setup:getProfile', (_event, id: string) => {
    console.log(`[setup:getProfile] Loading profile id="${id}"`)
    return getProfile(id)
  })

  ipcMain.handle('setup:saveSetup', (_event, config: unknown) => {
    console.log('[setup:saveSetup] Saving user setup configuration')
    setupStore.set('userSetup', config)
  })

  ipcMain.handle('setup:getSetup', () => {
    const existing = setupStore.get('userSetup') ?? null
    console.log(`[setup:getSetup] ${existing ? 'Returning saved setup' : 'No saved setup found'}`)
    return existing
  })

  // Config key/value store
  ipcMain.handle('config:get', (_event, key: string) => {
    return store.get(key)
  })

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    console.log(`[config:set] ${key} = ${JSON.stringify(value)}`)
    store.set(key, value)
  })

  // Open external URL in default browser
  ipcMain.handle('app:openExternal', (_event, url: string) => {
    console.log(`[app:openExternal] Opening: ${url}`)
    shell.openExternal(url)
  })
}
