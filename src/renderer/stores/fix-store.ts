import { create } from 'zustand'

export interface FixHistoryEntry {
  fixId: string
  name: string
  appliedAt: number
  undoneAt: number | null
}

// Shape returned by the main-process fix engine's getFixHistory()
interface EngineHistoryEntry {
  fixId: string
  appliedAt: number
  undoneAt: number | null
  backupValues?: Record<string, unknown>
}

interface FixState {
  appliedFixes: Set<string>
  fixHistory: FixHistoryEntry[]
  isApplying: boolean

  /** Load persisted fix history from disk on startup and rebuild appliedFixes. */
  loadFromDisk: () => Promise<void>
  applyFix: (fixId: string) => Promise<{ success: boolean; error?: string }>
  undoFix: (fixId: string) => Promise<{ success: boolean; error?: string }>
  markFixed: (ruleId: string) => void
}

export const useFixStore = create<FixState>((set, get) => ({
  appliedFixes: new Set(),
  fixHistory: [],
  isApplying: false,

  loadFromDisk: async () => {
    try {
      const api = (window as any).api
      const history: EngineHistoryEntry[] = await api.fix.getHistory()
      if (!Array.isArray(history)) return

      // Rebuild applied set: a fix is "applied" if it has been applied and NOT undone
      const appliedIds = new Set<string>()
      const entries: FixHistoryEntry[] = []

      for (const entry of history) {
        if (!entry.fixId) continue
        if (entry.undoneAt === null || entry.undoneAt === undefined) {
          appliedIds.add(entry.fixId)
        }
        entries.push({
          fixId: entry.fixId,
          name: entry.fixId, // name isn't stored in engine history, use id as label
          appliedAt: entry.appliedAt,
          undoneAt: entry.undoneAt ?? null
        })
      }

      set({ appliedFixes: appliedIds, fixHistory: entries })
    } catch {
      // History not yet written (first run) or IPC error — start empty
    }
  },

  applyFix: async (fixId: string) => {
    const api = (window as any).api
    set({ isApplying: true })
    try {
      const result = await api.fix.apply(fixId)
      if (result.success) {
        set((s) => ({
          appliedFixes: new Set([...Array.from(s.appliedFixes), fixId]),
          fixHistory: [
            ...s.fixHistory,
            { fixId, name: fixId, appliedAt: Date.now(), undoneAt: null }
          ]
        }))
      }
      return result
    } finally {
      set({ isApplying: false })
    }
  },

  undoFix: async (fixId: string) => {
    const api = (window as any).api
    set({ isApplying: true })
    try {
      const result = await api.fix.undo(fixId)
      if (result.success) {
        set((s) => {
          const newApplied = new Set(s.appliedFixes)
          newApplied.delete(fixId)
          return {
            appliedFixes: newApplied,
            fixHistory: s.fixHistory.map((h) =>
              h.fixId === fixId ? { ...h, undoneAt: Date.now() } : h
            )
          }
        })
      }
      return result
    } finally {
      set({ isApplying: false })
    }
  },

  markFixed: (ruleId) => {
    set((s) => ({ appliedFixes: new Set([...Array.from(s.appliedFixes), ruleId]) }))
  }
}))
