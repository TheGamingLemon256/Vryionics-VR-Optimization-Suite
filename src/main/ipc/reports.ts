// VR Optimization Suite — Scan Reports Log IPC Handlers

import { ipcMain, app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_REPORTS = 100

export interface SavedReport {
  id: string
  timestamp: number
  label: string
  scanCondition: 'idle' | 'under-load'
  scanDurationMs: number
  headsetProfileId: string | null
  criticalCount: number
  warningCount: number
  infoCount: number
  scanData: unknown
  findings: unknown[]
  actionPlan: unknown[]
  healthCards: unknown[]
}

function getReportsPath(): string {
  return join(app.getPath('userData'), 'scan-reports.json')
}

function loadReports(): SavedReport[] {
  try {
    const path = getReportsPath()
    if (!existsSync(path)) return []
    const raw = readFileSync(path, 'utf8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveReports(reports: SavedReport[]): void {
  try {
    writeFileSync(getReportsPath(), JSON.stringify(reports, null, 2), 'utf8')
  } catch { /* ignore */ }
}

export function registerReportsHandlers(): void {
  ipcMain.handle('reports:save', (_event, report: SavedReport) => {
    const reports = loadReports()
    // Remove duplicate by id if exists, then prepend
    const filtered = reports.filter((r) => r.id !== report.id)
    filtered.unshift(report)
    // Trim to max
    const trimmed = filtered.slice(0, MAX_REPORTS)
    saveReports(trimmed)
    console.log(
      `[reports:save] Saved report id="${report.id}" label="${report.label}" ` +
      `critical=${report.criticalCount} warn=${report.warningCount} — ` +
      `${trimmed.length}/${MAX_REPORTS} total stored`
    )
  })

  ipcMain.handle('reports:getAll', () => {
    // Return without full scan data for listing performance
    return loadReports().map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      label: r.label,
      scanCondition: r.scanCondition,
      scanDurationMs: r.scanDurationMs,
      headsetProfileId: r.headsetProfileId,
      criticalCount: r.criticalCount,
      warningCount: r.warningCount,
      infoCount: r.infoCount,
      // Include full data as well so renderer can load it
      scanData: r.scanData,
      findings: r.findings,
      actionPlan: r.actionPlan,
      healthCards: r.healthCards,
    } satisfies SavedReport))
  })

  ipcMain.handle('reports:get', (_event, id: string) => {
    const reports = loadReports()
    return reports.find((r) => r.id === id) ?? null
  })

  ipcMain.handle('reports:delete', (_event, id: string) => {
    console.log(`[reports:delete] Deleting report id="${id}"`)
    const reports = loadReports()
    saveReports(reports.filter((r) => r.id !== id))
  })

  ipcMain.handle('reports:clear', () => {
    console.log('[reports:clear] Clearing all saved scan reports')
    saveReports([])
  })
}
