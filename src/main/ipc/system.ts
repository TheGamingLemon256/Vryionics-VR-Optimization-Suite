// VR Optimization Suite — System IPC Handlers
// Setup wizard, config, and system utility handlers.

import { ipcMain, shell } from 'electron'
import { execSync } from 'child_process'
import { loadAllProfiles, getProfile, getProfileSummaries } from '../headsets/loader'
import Store from 'electron-store'

const store = new Store({ name: 'vros-config' })
const setupStore = new Store({ name: 'vros-setup' })

export function registerSystemHandlers(): void {
  // Admin detection
  ipcMain.handle('system:isAdmin', () => {
    try {
      execSync('net session', { stdio: 'ignore' })
      console.log('[system:isAdmin] Running as administrator')
      return true
    } catch {
      console.warn('[system:isAdmin] NOT running as administrator — some fixes will be unavailable')
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
