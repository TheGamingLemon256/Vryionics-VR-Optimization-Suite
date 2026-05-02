// Public shapes for the Live Optimizer.
//
// The optimizer itself only needs `enabled`. The other fields exist because
// the IPC layer and renderer store still reference them; they will be
// reshaped in the v0.2.9 IPC/UI pass. Until then, defaults below model the
// new posture: lower allowlisted background, raise the trigger, no kills,
// no service stops.

export interface LiveOptimizerConfig {
  enabled: boolean
  autoEnableOnVrDetected: boolean
}

export const DEFAULT_CONFIG: LiveOptimizerConfig = {
  enabled: false,
  autoEnableOnVrDetected: true,
}

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
