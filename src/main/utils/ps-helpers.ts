// Vryionics VR Optimization Suite — PS Helper Path Resolver
//
// Returns a dot-source statement for the shared PowerShell helper module
// shipped via electron-builder extraResources. Centralised here so every
// caller (live optimizer, gpu metrics, network module, display scanner,
// etc.) uses the same lookup logic — and the resolution string isn't
// duplicated across files.

import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

/** Resolve the absolute path to vros-helpers.ps1. */
export function resolvePsHelpersPath(): string {
  const candidates = [
    join(process.resourcesPath ?? '', 'ps-helpers', 'vros-helpers.ps1'),
    join(app.getAppPath(), 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
    join(app.getAppPath(), '..', '..', 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

/** A `. 'path/to/vros-helpers.ps1'` statement, escaped for PS. */
export function dotSourcePsHelpers(): string {
  return `. '${resolvePsHelpersPath().replace(/'/g, "''")}'`
}
