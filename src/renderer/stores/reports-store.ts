import { create } from 'zustand'
import { useScanStore } from './scan-store'
import type { ScanData } from '../../main/scanner/types'
import type { Finding, HealthCardData, ActionPlan } from '../../main/rules/types'

// Local type (mirrors main process SavedReport)
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

/**
 * Computed health score for a scan. 0-100.
 * 100 = no findings. 0 = many criticals.
 * Heuristic: 100 - 15 × critical - 5 × warning - 1 × info, floored at 0.
 */
export function computeHealthScore(r: Pick<SavedReport, 'criticalCount' | 'warningCount' | 'infoCount'>): number {
  const raw = 100 - 15 * r.criticalCount - 5 * r.warningCount - 1 * r.infoCount
  return Math.max(0, Math.min(100, raw))
}

/** Time-series point for the performance history chart. */
export interface HistoryPoint {
  id: string
  timestamp: number
  score: number
  criticalCount: number
  warningCount: number
  infoCount: number
  scanCondition: 'idle' | 'under-load'
}

/** Build a chronological history from saved reports — oldest first. */
export function buildHistoryPoints(reports: SavedReport[]): HistoryPoint[] {
  return [...reports]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      score: computeHealthScore(r),
      criticalCount: r.criticalCount,
      warningCount: r.warningCount,
      infoCount: r.infoCount,
      scanCondition: r.scanCondition,
    }))
}

function buildLabel(timestamp: number, condition: 'idle' | 'under-load'): string {
  const d = new Date(timestamp)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${months[d.getMonth()]} ${d.getDate()} ${time} — ${condition === 'under-load' ? 'Under Load' : 'Idle'}`
}

interface ReportsState {
  reports: SavedReport[]
  activeReportId: string | null
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
  saveCurrentScan: () => Promise<void>
  loadReport: (id: string) => Promise<void>
  deleteReport: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  reports: [],
  activeReportId: null,
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const api = (window as any).api
      const reports: SavedReport[] = await api.reports.getAll()
      set({ reports: reports ?? [], loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  saveCurrentScan: async () => {
    const scanState = useScanStore.getState()
    const { lastScanData, findings, healthCards, actionPlan } = scanState
    if (!lastScanData) return

    const data = lastScanData as ScanData
    const report: SavedReport = {
      id: crypto.randomUUID(),
      timestamp: data.timestamp,
      label: buildLabel(data.timestamp, data.scanCondition ?? 'idle'),
      scanCondition: data.scanCondition ?? 'idle',
      scanDurationMs: data.scanDurationMs ?? 0,
      headsetProfileId: data.headsetProfileId,
      criticalCount: (findings as Finding[]).filter((f) => f.result.severity === 'critical').length,
      warningCount: (findings as Finding[]).filter((f) => f.result.severity === 'warning').length,
      infoCount: (findings as Finding[]).filter((f) => f.result.severity === 'info').length,
      scanData: lastScanData,
      findings: findings,
      actionPlan: actionPlan,
      healthCards: healthCards,
    }

    try {
      const api = (window as any).api
      await api.reports.save(report)
      // Add to local list
      set((s) => ({ reports: [report, ...s.reports.filter((r) => r.id !== report.id)].slice(0, 100) }))
    } catch { /* ignore */ }
  },

  loadReport: async (id: string) => {
    const existing = get().reports.find((r) => r.id === id)
    const report = existing ?? await (async () => {
      try {
        const api = (window as any).api
        return await api.reports.get(id) as SavedReport | null
      } catch { return null }
    })()

    if (!report) return

    // Push into scan store
    useScanStore.getState().loadFromReport({
      scanData: report.scanData,
      findings: report.findings,
      actionPlan: report.actionPlan,
      healthCards: report.healthCards,
    })
    set({ activeReportId: id })
  },

  deleteReport: async (id: string) => {
    try {
      const api = (window as any).api
      await api.reports.delete(id)
      set((s) => ({
        reports: s.reports.filter((r) => r.id !== id),
        activeReportId: s.activeReportId === id ? null : s.activeReportId
      }))
    } catch { /* ignore */ }
  },

  clearAll: async () => {
    try {
      const api = (window as any).api
      await api.reports.clear()
      set({ reports: [], activeReportId: null })
    } catch { /* ignore */ }
  }
}))
