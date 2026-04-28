// Vryionics VR Optimization Suite — Profile Export / Import
//
// Produces a portable JSON document describing every active fix the user
// has applied locally, plus their setup wizard answers (headset, connection
// type, etc.). Friends can import the file and Vryionics will replay the
// same fixes on their machine.
//
// Privacy: profile excludes raw scan data, hardware IDs, MACs, paths, and
// anything tied to a specific machine. It's portable across users with
// the same headset/connection archetype.

import { app, dialog } from 'electron'
import * as fs from 'fs'
import { getFixHistory } from './fixes/engine'
import { log } from './logger'

interface ExportedProfile {
  /** File-format version. Bump when schema changes. */
  formatVersion: 1
  /** App version that produced the file. */
  appVersion: string
  /** ISO timestamp when exported. */
  exportedAt: string
  /** Setup wizard answers — what kind of system this profile is tuned for. */
  setup: {
    headsetId?: string
    connectionArchetype?: string
    pcType?: string
    primaryUseCase?: string
  } | null
  /** List of fix IDs the user had ACTIVELY APPLIED (not undone) at export time. */
  activeFixes: string[]
  /** Optional human-readable description from the exporter. */
  description: string
}

/**
 * Build the in-memory profile from current fix history. Pure function — does
 * not write to disk. Settings store is read for the wizard answers.
 */
export function buildProfile(setup: ExportedProfile['setup'], description = ''): ExportedProfile {
  const history = getFixHistory()
  // A fix is "active" iff its most recent applied entry is more recent than
  // its most recent undone entry. The history is append-only, so we group
  // by fixId and look at the timestamps.
  const byId: Record<string, { lastApplied: number; lastUndone: number }> = {}
  for (const entry of history) {
    const slot = byId[entry.fixId] ?? { lastApplied: 0, lastUndone: 0 }
    if (entry.appliedAt && entry.appliedAt > slot.lastApplied) slot.lastApplied = entry.appliedAt
    if (entry.undoneAt  && entry.undoneAt  > slot.lastUndone)  slot.lastUndone  = entry.undoneAt
    byId[entry.fixId] = slot
  }
  const active = Object.entries(byId)
    .filter(([, s]) => s.lastApplied > 0 && s.lastApplied > s.lastUndone)
    .map(([id]) => id)
    .sort()

  return {
    formatVersion: 1,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    setup: setup ?? null,
    activeFixes: active,
    description,
  }
}

/** Show a save-dialog and write the profile to disk. */
export async function exportProfile(setup: ExportedProfile['setup'], description: string): Promise<string | null> {
  const profile = buildProfile(setup, description)
  const result = await dialog.showSaveDialog({
    title: 'Export Vryionics tuning profile',
    defaultPath: `vryionics-profile-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Vryionics Profile', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, JSON.stringify(profile, null, 2), 'utf-8')
  log.info('profile-export', `Profile exported to ${result.filePath} (${profile.activeFixes.length} fixes)`)
  return result.filePath
}

/** Read a profile from disk and validate. */
export async function importProfileFromDisk(): Promise<ExportedProfile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import Vryionics tuning profile',
    properties: ['openFile'],
    filters: [{ name: 'Vryionics Profile', extensions: ['json'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
    if (data?.formatVersion !== 1 || !Array.isArray(data?.activeFixes)) {
      throw new Error('Not a valid Vryionics profile file (missing formatVersion or activeFixes)')
    }
    log.info('profile-export', `Profile imported from ${result.filePaths[0]} (${data.activeFixes.length} fixes)`)
    return data as ExportedProfile
  } catch (err) {
    log.warn('profile-export', `Import failed: ${(err as Error).message}`)
    throw err
  }
}
