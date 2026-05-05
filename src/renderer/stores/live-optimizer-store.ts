import { create } from 'zustand'

export type OptimizerPhase = 'disabled' | 'monitoring' | 'active'

export interface RaisedProcessSummary {
  pid: number
  name: string
  result: 'high' | 'above-normal' | 'failed'
}

export interface LoweredProcessSummary {
  pid: number
  name: string
  originalPriority: number
}

export interface LiveOptimizerStatus {
  phase: OptimizerPhase
  activatedAt: number | null
  triggerProcess: string | null
  raised: RaisedProcessSummary[]
  lowered: LoweredProcessSummary[]
  notes: string[]
}

export interface LiveOptimizerFlags {
  enabled: boolean
  disclosureAccepted: boolean
  autoEnableOnVrDetected: boolean
}

export interface SessionRecord {
  activatedAt: number
  deactivatedAt: number | null
  triggerProcess: string
  raised: RaisedProcessSummary[]
  lowered: LoweredProcessSummary[]
  notes: string[]
}

const DEFAULT_STATUS: LiveOptimizerStatus = {
  phase: 'disabled',
  activatedAt: null,
  triggerProcess: null,
  raised: [],
  lowered: [],
  notes: [],
}

const DEFAULT_FLAGS: LiveOptimizerFlags = {
  enabled: false,
  disclosureAccepted: false,
  autoEnableOnVrDetected: true,
}

interface LiveOptimizerApi {
  status: () => Promise<{ running: boolean; status: LiveOptimizerStatus }>
  enable: () => Promise<void>
  disable: () => Promise<void>
  getFlags: () => Promise<LiveOptimizerFlags>
  setDisclosureAccepted: (accepted: boolean) => Promise<void>
  setAutoEnable: (value: boolean) => Promise<void>
  openTriggerFile: () => Promise<string>
  openAllowlistFile: () => Promise<string>
  readActivityLog: () => Promise<SessionRecord[]>
  onStatusUpdate: (cb: (status: LiveOptimizerStatus) => void) => () => void
}

function api(): LiveOptimizerApi {
  return (window as unknown as { api: { liveOptimizer: LiveOptimizerApi } }).api.liveOptimizer
}

interface LiveOptimizerState {
  status: LiveOptimizerStatus
  flags: LiveOptimizerFlags
  running: boolean
  initialized: boolean
  error: string | null

  init: () => Promise<void>
  enable: () => Promise<void>
  disable: () => Promise<void>
  acceptDisclosure: () => Promise<void>
  setAutoEnable: (value: boolean) => Promise<void>
}

export const useLiveOptimizerStore = create<LiveOptimizerState>((set, get) => ({
  status: DEFAULT_STATUS,
  flags: DEFAULT_FLAGS,
  running: false,
  initialized: false,
  error: null,

  init: async () => {
    if (get().initialized) return
    try {
      const [snap, flags] = await Promise.all([api().status(), api().getFlags()])
      set({
        status: snap.status ?? DEFAULT_STATUS,
        running: !!snap.running,
        flags: { ...DEFAULT_FLAGS, ...flags },
        initialized: true,
      })
      api().onStatusUpdate((s) => {
        set({ status: s, running: s.phase !== 'disabled' })
      })
    } catch (err) {
      set({ initialized: true, error: (err as Error).message })
    }
  },

  enable: async () => {
    try {
      await api().enable()
      set((s) => ({ flags: { ...s.flags, enabled: true }, running: true, error: null }))
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  disable: async () => {
    await api().disable()
    set((s) => ({ flags: { ...s.flags, enabled: false }, running: false }))
  },

  acceptDisclosure: async () => {
    await api().setDisclosureAccepted(true)
    set((s) => ({ flags: { ...s.flags, disclosureAccepted: true } }))
  },

  setAutoEnable: async (value) => {
    await api().setAutoEnable(value)
    set((s) => ({ flags: { ...s.flags, autoEnableOnVrDetected: value } }))
  },
}))
