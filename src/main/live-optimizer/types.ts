// VR Optimization Suite — Live Optimizer Types

export interface LiveOptimizerConfig {
  enabled: boolean
  monitorIntervalMs: number      // default: 5000
  activationDelayMs: number      // grace period after VR detected, default: 15000
  stopServices: boolean          // default: true
  customExclusions: string[]     // user-added process names (lowercase) to NEVER kill
  customTargets: string[]        // user-added process names (lowercase) to ALWAYS kill when VR active
  boostVrPriority: boolean       // Boost VR processes to High CPU priority. Default: true
  throttleBackground: boolean    // Set background processes to BelowNormal + EcoQoS. Default: true
  trimMemory: boolean            // Trim working sets of background processes. Default: false
  useEcoQoS: boolean             // Apply EcoQoS power throttling to background procs. Default: true
  lockTimerResolution: boolean   // Lock Windows timer to 0.5ms for lower jitter. Default: true
  cleanStandbyList: boolean      // Periodically flush the standby list during VR. Default: true
  /**
   * When true, a lightweight background watcher polls for VR processes
   * (vrserver, vrcompositor, OculusClient, virtualdesktop.streamer, etc.)
   * and automatically enables Live Optimizer when one launches, then
   * disables it again when the VR session ends. Default: true.
   *
   * If the user has manually enabled the optimizer, the auto-enable
   * watcher leaves them alone — never disables a session the user owns.
   */
  autoEnableOnVrDetected: boolean
}

export const DEFAULT_CONFIG: LiveOptimizerConfig = {
  enabled: false,
  monitorIntervalMs: 5000,
  // Bumped from 15 s → 30 s after Quantum reported SteamLink disconnects on
  // first VR session. Streaming clients (Steam Link, Virtual Desktop) need
  // time to negotiate a connection with the headset before the optimizer
  // starts touching background processes. 30 s covers the slowest first-
  // launch handshake we've observed without feeling sluggish for repeats.
  activationDelayMs: 30000,
  stopServices: true,
  customExclusions: [],
  customTargets: [],
  boostVrPriority: true,
  throttleBackground: true,
  trimMemory: false,
  useEcoQoS: true,
  lockTimerResolution: true,
  cleanStandbyList: true,
  autoEnableOnVrDetected: true,
}

export interface AffectedProcess {
  name: string
  pid: number
  path: string | null
  killedAt: number
}

export interface AffectedService {
  name: string
  displayName: string
  stoppedAt: number
}

export type OptimizerPhase =
  | 'disabled'    // optimizer is off
  | 'monitoring'  // watching for VR
  | 'countdown'   // VR detected, waiting activation delay
  | 'active'      // optimizations applied
  | 'restoring'   // VR ended, restoring

// ── Activity log ──────────────────────────────────────────────

export type LogLevel =
  | 'scan'     // Scanning for processes
  | 'info'     // General status info
  | 'spare'    // Process being protected/spared
  | 'kill'     // Targeting a process for closure
  | 'success'  // Action confirmed successful
  | 'warning'  // Action failed or partial
  | 'service'  // Service stop/start activity
  | 'restore'  // Restore/restart phase

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  message: string
  detail?: string
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
