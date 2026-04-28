// VR Optimization Suite — Live Optimizer Store
import { create } from 'zustand'

// Types (local mirror — keep in sync with src/main/live-optimizer/types.ts)
type OptimizerPhase = 'disabled' | 'monitoring' | 'countdown' | 'active' | 'restoring'
export type LogLevel = 'scan' | 'info' | 'spare' | 'kill' | 'success' | 'warning' | 'service' | 'restore'

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  message: string
  detail?: string
}

export interface LiveOptimizerConfig {
  enabled: boolean
  monitorIntervalMs: number
  activationDelayMs: number
  stopServices: boolean
  customExclusions: string[]
  customTargets: string[]
  boostVrPriority: boolean
  throttleBackground: boolean
  trimMemory: boolean
  useEcoQoS: boolean
}

export interface AffectedProcess {
  name: string; pid: number; path: string | null; killedAt: number
}
export interface AffectedService {
  name: string; displayName: string; stoppedAt: number
}

export interface LiveOptimizerStatus {
  phase: OptimizerPhase
  vrDetectedAt: number | null
  activatedAt: number | null
  countdownSecondsLeft: number | null
  affectedProcesses: AffectedProcess[]
  affectedServices: AffectedService[]
  detectedVrProcessNames: string[]
  activityLog: LogEntry[]
  error: string | null
}

const DEFAULT_STATUS: LiveOptimizerStatus = {
  phase: 'disabled',
  vrDetectedAt: null,
  activatedAt: null,
  countdownSecondsLeft: null,
  affectedProcesses: [],
  affectedServices: [],
  detectedVrProcessNames: [],
  activityLog: [],
  error: null
}

const DEFAULT_CONFIG: LiveOptimizerConfig = {
  enabled: false,
  monitorIntervalMs: 5000,
  activationDelayMs: 15000,
  stopServices: true,
  customExclusions: [],
  customTargets: [],
  boostVrPriority: true,
  throttleBackground: true,
  trimMemory: false,
  useEcoQoS: true
}

interface LiveOptimizerState {
  status: LiveOptimizerStatus
  config: LiveOptimizerConfig
  loading: boolean
  error: string | null
  initialized: boolean

  init: () => Promise<void>
  setEnabled: (v: boolean) => Promise<void>
  updateConfig: (partial: Partial<LiveOptimizerConfig>) => Promise<void>
  addExclusion: (name: string) => Promise<void>
  removeExclusion: (name: string) => Promise<void>
  addTarget: (name: string) => Promise<void>
  removeTarget: (name: string) => Promise<void>
  forceOptimize: () => Promise<void>
  restore: () => Promise<void>
}

export const useLiveOptimizerStore = create<LiveOptimizerState>((set, get) => ({
  status: DEFAULT_STATUS,
  config: DEFAULT_CONFIG,
  loading: false,
  error: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ loading: true })
    try {
      const api = (window as any).api
      const [status, config] = await Promise.all([
        api.liveOptimizer.getStatus(),
        api.liveOptimizer.getConfig()
      ])
      set({
        status: status ?? DEFAULT_STATUS,
        config: { ...DEFAULT_CONFIG, ...(config ?? {}) },
        loading: false,
        initialized: true
      })
      // Subscribe to live status updates
      api.liveOptimizer.onStatusUpdate((s: LiveOptimizerStatus) => {
        set({ status: s })
      })
    } catch (err) {
      set({ loading: false, error: (err as Error).message, initialized: true })
    }
  },

  setEnabled: async (v) => {
    const api = (window as any).api
    if (v) await api.liveOptimizer.enable()
    else await api.liveOptimizer.disable()
    set((s) => ({ config: { ...s.config, enabled: v } }))
  },

  updateConfig: async (partial) => {
    const next = { ...get().config, ...partial }
    set({ config: next })
    const api = (window as any).api
    await api.liveOptimizer.setConfig(next)
  },

  addExclusion: async (name) => {
    const lower = name.toLowerCase().trim()
    if (!lower) return
    const config = get().config
    if (config.customExclusions.includes(lower)) return
    await get().updateConfig({ customExclusions: [...config.customExclusions, lower] })
  },

  removeExclusion: async (name) => {
    const config = get().config
    await get().updateConfig({ customExclusions: config.customExclusions.filter((e) => e !== name) })
  },

  addTarget: async (name) => {
    const lower = name.toLowerCase().trim()
    if (!lower) return
    const config = get().config
    if (config.customTargets.includes(lower)) return
    await get().updateConfig({ customTargets: [...config.customTargets, lower] })
  },

  removeTarget: async (name) => {
    const config = get().config
    await get().updateConfig({ customTargets: config.customTargets.filter((t) => t !== name) })
  },

  forceOptimize: async () => {
    const api = (window as any).api
    await api.liveOptimizer.forceOptimize()
  },

  restore: async () => {
    const api = (window as any).api
    await api.liveOptimizer.restore()
  }
}))
