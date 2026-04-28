// Vryionics VR Optimization Suite — Live Optimizer Auto-Enable Watcher
//
// Lightweight background poller that watches Windows for VR processes and
// flips Live Optimizer on/off automatically as VR sessions start and end.
//
// Design intent — never override a user choice:
//   • If the optimizer is currently OFF and the user has autoEnableOnVrDetected
//     turned on, we'll start it the moment a VR process is detected.
//   • When the VR process exits we stop the optimizer, but ONLY if WE were
//     the ones who started it. A user who enabled it manually keeps it on.
//
// Polling cost: one Get-Process call every 10 s. Cheaper than the optimizer's
// own 5 s monitor loop because we don't need to enumerate every process —
// we only need to know whether ANY VR process is running.

import { spawn } from 'child_process'
import { log } from '../logger'
import { startRecording as startSession, finalise as finaliseSession, getActiveSummary } from '../session-recorder'
import { notify } from '../notifier'

const VR_PROCESS_NAMES = [
  // SteamVR
  'vrserver', 'vrcompositor', 'vrdashboard', 'vrwebhelper',
  // Oculus / Meta
  'OVRServer_x64', 'OculusClient', 'OVRRedir', 'OVRServiceLauncher',
  // Wireless streaming
  'virtualdesktop.streamer', 'virtualdesktop.server',
  'ALVR Launcher', 'alvr_dashboard',
  // Headset companion apps
  'VirtualDesktop.Streamer', 'wivrn-server',
  // VR titles that own their own runtime detection (so we still
  // auto-enable for users who launch a VR game directly)
  'vrchat',
]

const POLL_INTERVAL_MS = 10_000

let pollTimer: NodeJS.Timeout | null = null
/** True iff the watcher is the entity that turned the optimizer on. */
let weEnabledIt = false
/** Whether VR was detected on the previous poll — used to detect transitions. */
let lastDetected = false

interface AutoEnableHooks {
  /** Returns true if the watcher should be active. */
  shouldRun: () => boolean
  /** Returns true if the optimizer is currently on. */
  isOptimizerOn: () => boolean
  /** Called when VR is detected and optimizer is currently off. */
  enable: () => void
  /** Called when VR is no longer detected and we previously enabled it. */
  disable: () => void
}

/**
 * Sample currently-running VR processes via PowerShell. Returns the names
 * of VR processes detected. Async — does not block the event loop.
 */
function pollVrProcesses(): Promise<string[]> {
  // Build a comma-separated list for Get-Process
  const namesArg = VR_PROCESS_NAMES.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const script = `Get-Process -Name ${namesArg} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name -Unique`

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (c: string) => { stdout += c })

    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ } resolve([]) }, 8_000)
    child.on('error', () => { clearTimeout(timer); resolve([]) })
    child.on('close', () => {
      clearTimeout(timer)
      const names = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      resolve(names)
    })
  })
}

async function poll(hooks: AutoEnableHooks): Promise<void> {
  if (!hooks.shouldRun()) return

  const procs = await pollVrProcesses()
  const detected = procs.length > 0

  if (detected && !lastDetected) {
    log.info('liveopt:auto-enable', 'VR processes detected — entering session state')

    // Begin session recording the moment VR launches, regardless of whether
    // the user wants auto-enable. Recording is purely observational and the
    // resulting telemetry helps debug VR perf issues.
    if (!getActiveSummary()) startSession(procs)

    if (!hooks.isOptimizerOn()) {
      log.info('liveopt:auto-enable', 'Optimizer was off — auto-enabling')
      weEnabledIt = true
      hooks.enable()
      notify(
        'liveopt-enabled',
        'Vryionics: Live Optimizer engaged',
        `VR session detected (${procs[0] ?? 'unknown'}). Background processes throttled, VR processes prioritised.`,
      )
    } else {
      log.info('liveopt:auto-enable', 'Optimizer already on (user-managed) — leaving alone')
    }
  } else if (!detected && lastDetected) {
    log.info('liveopt:auto-enable', 'VR processes ended — exiting session state')
    // The session recorder finalises itself on its own 2-tick rule, but
    // call it explicitly here as a belt-and-braces in case our 10s poll
    // beat the recorder's 1s loop to the empty-procs detection.
    finaliseSession('completed')
    if (weEnabledIt && hooks.isOptimizerOn()) {
      log.info('liveopt:auto-enable', 'Auto-disabling (we owned this enable)')
      hooks.disable()
      notify(
        'liveopt-disabled',
        'Vryionics: VR session ended',
        'Live Optimizer disengaged. System restored to normal scheduling.',
      )
    }
    weEnabledIt = false
  }

  lastDetected = detected
}

export function startAutoEnableWatcher(hooks: AutoEnableHooks): void {
  stopAutoEnableWatcher()
  log.info('liveopt:auto-enable', `Background watcher started — poll=${POLL_INTERVAL_MS / 1000}s`)
  // Fire once immediately so we react to a VR session that's already running
  // when the app starts up
  poll(hooks).catch((err) => log.warn('liveopt:auto-enable', 'Initial poll threw:', err as Error))
  pollTimer = setInterval(() => {
    poll(hooks).catch((err) => log.warn('liveopt:auto-enable', 'Poll threw:', err as Error))
  }, POLL_INTERVAL_MS)
}

export function stopAutoEnableWatcher(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  weEnabledIt = false
  lastDetected = false
}

/** Did the watcher start the current session? Used by the IPC layer when
 *  the user manually disables — it should reset our "owns this enable"
 *  flag so we don't immediately re-enable on the next poll tick. */
export function clearAutoEnableOwnership(): void {
  weEnabledIt = false
}
