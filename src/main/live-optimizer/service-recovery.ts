// Vryionics VR Optimization Suite — Service Recovery State
//
// Persists "services we've stopped that haven't been restored yet" to disk
// so a crash, force-quit, or unexpected app exit doesn't leave the user's
// system with critical Windows services (Audio, Search, Print Spooler etc.)
// permanently stopped.
//
// On app startup, recoverStoppedServices() reads this file and attempts to
// restart anything that's still in it — the typical cause being Quantum's
// reported scenario: app closed/crashed while the optimizer had services
// paused, leaving the desktop unusable until reboot.

import Store from 'electron-store'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { log } from '../logger'

const execFileAsync = promisify(execFile)

interface PendingService {
  name: string
  displayName: string
  stoppedAt: number
}

const store = new Store({ name: 'vros-pending-restore' })
const KEY = 'pendingServices'

function read(): PendingService[] {
  return (store.get(KEY) as PendingService[] | undefined) ?? []
}

function write(list: PendingService[]): void {
  store.set(KEY, list)
}

/** Add a service to the pending-restore list. Idempotent. */
export function markStopped(name: string, displayName: string): void {
  const list = read()
  if (list.some((s) => s.name === name)) return
  list.push({ name, displayName, stoppedAt: Date.now() })
  write(list)
  log.info('service-recovery', `Marked stopped: ${name}`)
}

/** Remove a service from the pending list — call after a successful restart. */
export function markRestored(name: string): void {
  const list = read().filter((s) => s.name !== name)
  write(list)
}

/** Drop the entire list — used after a clean session. */
export function clearAll(): void {
  write([])
}

/**
 * Start a Windows service via sc.exe. sc returns exit 0 only when the SCM
 * accepts the start command, which is good enough for our recovery purpose:
 * if the service is already running sc returns 1056 and we treat that as
 * success (it's already in the desired state).
 */
async function startService(name: string): Promise<boolean> {
  try {
    await execFileAsync('sc', ['start', name], { timeout: 15_000 })
    return true
  } catch (err) {
    const msg = (err as Error & { code?: number }).message
    if (/1056/.test(msg)) return true
    return false
  }
}

/**
 * Walk the persisted pending list and try to restart everything still in it.
 * Called on app startup. Critical for the "crashed while VR was running →
 * desktop is dead" failure mode.
 */
export async function recoverStoppedServices(): Promise<void> {
  const pending = read()
  if (pending.length === 0) return
  log.warn('service-recovery', `Found ${pending.length} services in pending-restore from a previous session — attempting recovery`)

  for (const svc of pending) {
    log.info('service-recovery', `Restarting: ${svc.displayName}`)
    const ok = await startService(svc.name)
    if (ok) {
      markRestored(svc.name)
      log.info('service-recovery', `✓ Restarted: ${svc.displayName}`)
    } else {
      log.warn('service-recovery', `⚠ Could not restart ${svc.displayName} — left in pending list`)
    }
  }

  const stillPending = read()
  if (stillPending.length === 0) {
    log.info('service-recovery', 'Recovery complete — all services restored')
  } else {
    log.warn('service-recovery', `${stillPending.length} services still pending — may need manual recovery`)
  }
}
