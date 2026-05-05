import { ipcMain, app, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { log } from '../logger'
import { start, stop, isRunning, getStatus } from '../live-optimizer/optimizer'
import * as activity from '../live-optimizer/activity-log'
import {
  startAutoEnableWatcher, clearAutoEnableOwnership,
} from '../live-optimizer/auto-enable'

// extraResources lands files at process.resourcesPath/resources/ in production.
// In dev they sit at the project root under resources/.
const RESOURCE_DIR = process.env.NODE_ENV === 'development'
  ? join(process.cwd(), 'resources')
  : join(process.resourcesPath, 'resources')

interface PersistedFlags {
  enabled: boolean
  disclosureAccepted: boolean
  autoEnableOnVrDetected: boolean
}

const DEFAULT_FLAGS: PersistedFlags = {
  enabled: false,
  disclosureAccepted: false,
  autoEnableOnVrDetected: true,
}

function flagsPath(): string {
  return join(app.getPath('userData'), 'live-optimizer-flags.json')
}

async function loadFlags(): Promise<PersistedFlags> {
  try {
    const raw = await fs.readFile(flagsPath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return { ...DEFAULT_FLAGS, ...(parsed as Partial<PersistedFlags>) }
    }
    return { ...DEFAULT_FLAGS }
  } catch {
    return { ...DEFAULT_FLAGS }
  }
}

async function saveFlags(flags: PersistedFlags): Promise<void> {
  try {
    await fs.writeFile(flagsPath(), JSON.stringify(flags, null, 2), 'utf8')
  } catch (err: unknown) {
    log.warn('liveopt:ipc', `failed to persist flags: ${(err as Error).message}`)
  }
}

export function registerLiveOptimizerHandlers(mainWindow: BrowserWindow): void {
  const pushStatus = (): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('liveopt:statusUpdate', getStatus())
    }
  }

  // Resume on launch only when the user previously enabled AND accepted the
  // disclosure. The disclosure check is belt-and-suspenders; you can't reach
  // enabled=true without accepting, but it makes the invariant explicit.
  void (async (): Promise<void> => {
    const flags = await loadFlags()
    if (flags.enabled && flags.disclosureAccepted) {
      log.info('liveopt:ipc', 'resuming optimizer (enabled at last shutdown)')
      await start(pushStatus)
    }
  })()

  startAutoEnableWatcher({
    shouldRun: () => true,
    isOptimizerOn: () => isRunning(),
    enable: () => {
      void (async (): Promise<void> => {
        const flags = await loadFlags()
        if (!flags.autoEnableOnVrDetected) return
        if (!flags.disclosureAccepted) return
        await saveFlags({ ...flags, enabled: true })
        await start(pushStatus)
        pushStatus()
      })()
    },
    disable: () => {
      void (async (): Promise<void> => {
        const flags = await loadFlags()
        await saveFlags({ ...flags, enabled: false })
        await stop()
        pushStatus()
      })()
    },
  })

  ipcMain.handle('liveopt:status', () => ({
    running: isRunning(),
    status: getStatus(),
  }))

  ipcMain.handle('liveopt:enable', async () => {
    const flags = await loadFlags()
    if (!flags.disclosureAccepted) {
      throw new Error('disclosure must be accepted before enabling')
    }
    await saveFlags({ ...flags, enabled: true })
    await start(pushStatus)
    pushStatus()
  })

  ipcMain.handle('liveopt:disable', async () => {
    const flags = await loadFlags()
    await saveFlags({ ...flags, enabled: false })
    await stop()
    // The watcher will otherwise re-enable on the next poll. Reset its
    // ownership flag so a manual disable sticks until the user re-enables.
    clearAutoEnableOwnership()
    pushStatus()
  })

  ipcMain.handle('liveopt:getFlags', () => loadFlags())

  ipcMain.handle('liveopt:setDisclosureAccepted', async (_e, accepted: boolean) => {
    const flags = await loadFlags()
    await saveFlags({ ...flags, disclosureAccepted: !!accepted })
  })

  ipcMain.handle('liveopt:setAutoEnable', async (_e, value: boolean) => {
    const flags = await loadFlags()
    await saveFlags({ ...flags, autoEnableOnVrDetected: !!value })
  })

  ipcMain.handle('liveopt:openTriggerFile', () =>
    shell.openPath(join(RESOURCE_DIR, 'live-optimizer-triggers.json')),
  )

  ipcMain.handle('liveopt:openAllowlistFile', () =>
    shell.openPath(join(RESOURCE_DIR, 'live-optimizer-allowlist.json')),
  )

  ipcMain.handle('liveopt:readActivityLog', () => activity.loadRecent())
}
