// VR Optimization Suite — Fix Engine Types
// Every fix follows: Preview -> Backup -> Apply -> Verify -> Log -> Undo

export interface FixPreview {
  fixId: string
  name: string
  description: string
  /** What will change — shown to user before applying */
  changes: FixChange[]
  requiresAdmin: boolean
  requiresReboot: boolean
  /**
   * Populated by the pre-flight dry-run layer in the engine wrapper.
   * `willCreateRestorePoint` = true means applying this fix will trigger
   * a System Restore Point as a safety net (throttled to once per 24h).
   */
  willCreateRestorePoint?: boolean
  /** Estimated impact summary from the fix engine — for confirmation UI. */
  estimatedImpact?: {
    reversible: boolean
    affectsBootState: boolean
    /** Human-readable summary line ("Changes 3 registry keys, reversible via Undo"). */
    summary: string
  }
}

export interface FixChange {
  /** What is being modified */
  target: string // e.g. "Registry: HKLM\...\SystemResponsiveness"
  /** Current value */
  currentValue: string
  /** Value after fix is applied */
  newValue: string
  /**
   * Populated by the pre-flight dry-run: if true, the `currentValue` was
   * re-read at preview time (not a stale initial value from when the scan
   * happened). Tells the user they're seeing a live picture.
   */
  liveReadAt?: number
}

export interface FixResult {
  fixId: string
  success: boolean
  /** Error message if failed */
  error?: string
  /** True if the change was applied but verification failed */
  unverified?: boolean
  /** True if a reboot is needed for the change to take effect */
  requiresReboot?: boolean
}

export interface FixHistoryEntry {
  fixId: string
  name: string
  appliedAt: number // timestamp
  changes: FixChange[]
  /** Backup data for undo */
  backupValues: Record<string, string>
  /** When the fix was undone (null if still active) */
  undoneAt: number | null
}

export interface Fix {
  id: string
  name: string
  description: string
  requiresAdmin: boolean
  requiresReboot: boolean
  /** Show what will change before applying */
  preview: () => Promise<FixPreview>
  /** Apply the fix */
  apply: () => Promise<FixResult>
  /** Reverse the fix (every fix MUST be reversible) */
  undo: () => Promise<FixResult>
}
