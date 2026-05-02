import psList from 'ps-list'
import os from 'node:os'
import { log } from '../logger'
import { loadTriggers, loadAllowlist } from './allowlist'
import { NEVER_TOUCH_PROCESSES } from './never-touch'
import * as state from './state-store'
import * as activity from './activity-log'
import type { LiveOptimizerStatus } from './types'

const POLL_INTERVAL_MS = 2000
const MAX_LOWERED = 25

interface PsProc { pid: number; name: string; readonly [extra: string]: unknown }

let running = false
let pollTimer: NodeJS.Timeout | null = null
let triggers: Set<string> = new Set()
let allowlist: string[] = []
let activeSession: activity.SessionRecord | null = null
let statusCallback: ((s: LiveOptimizerStatus) => void) | null = null

export async function start(onStatus?: (s: LiveOptimizerStatus) => void): Promise<void> {
  if (onStatus) statusCallback = onStatus
  if (running) return
  running = true
  triggers = await loadTriggers()
  allowlist = await loadAllowlist()
  await crashRecover()
  schedulePoll()
  emitStatus()
}

export async function stop(): Promise<void> {
  running = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  await deactivate()
  statusCallback = null
}

export function isRunning(): boolean {
  return running
}

export function getStatus(): LiveOptimizerStatus {
  if (!running) {
    return { phase: 'disabled', activatedAt: null, triggerProcess: null, raised: [], lowered: [], notes: [] }
  }
  if (activeSession) {
    return {
      phase: 'active',
      activatedAt: activeSession.activatedAt,
      triggerProcess: activeSession.triggerProcess,
      raised: activeSession.raised,
      lowered: activeSession.lowered,
      notes: activeSession.notes,
    }
  }
  return { phase: 'monitoring', activatedAt: null, triggerProcess: null, raised: [], lowered: [], notes: [] }
}

function emitStatus(): void {
  statusCallback?.(getStatus())
}

async function crashRecover(): Promise<void> {
  const entries = await state.read()
  if (entries.length === 0) return
  log.info('live-optimizer', `crash recovery: ${entries.length} entries to evaluate`)
  const live = await psList()
  const liveByPid = new Map<number, PsProc>(live.map(p => [p.pid, { pid: p.pid, name: p.name }]))
  for (const entry of entries) {
    const proc = liveByPid.get(entry.pid)
    if (!proc) continue
    if (proc.name !== entry.imageName) continue
    const current = os.getPriority(entry.pid)
    if (!state.LOWERED_PRIORITY_CLASSES.has(current)) continue
    try {
      os.setPriority(entry.pid, entry.originalPriority)
    } catch (err: unknown) {
      log.warn('live-optimizer', `crash recover failed for pid ${entry.pid}: ${(err as Error).message}`)
    }
  }
  await state.clear()
}

function schedulePoll(): void {
  if (!running) return
  pollTimer = setTimeout(() => {
    poll()
      .catch((err: unknown) => log.warn('live-optimizer', `poll error: ${(err as Error).message}`))
      .finally(() => schedulePoll())
  }, POLL_INTERVAL_MS)
}

async function poll(): Promise<void> {
  const procs = await psList()
  const triggerProc = procs.find(p => triggers.has(p.name))
  if (triggerProc && !activeSession) {
    await activate(triggerProc, procs)
    emitStatus()
  } else if (!triggerProc && activeSession) {
    await deactivate()
    emitStatus()
  }
}

async function activate(triggerProc: PsProc, procs: PsProc[]): Promise<void> {
  const session: activity.SessionRecord = {
    activatedAt: Date.now(),
    deactivatedAt: null,
    triggerProcess: triggerProc.name,
    raised: [],
    lowered: [],
    notes: [],
  }

  const allowedSet = new Set(allowlist)
  const allMatched = procs.filter(p => allowedSet.has(p.name) && !NEVER_TOUCH_PROCESSES.has(p.name))
  const targets = allMatched.slice(0, MAX_LOWERED)
  if (allMatched.length > MAX_LOWERED) {
    session.notes.push(`allowlist matched ${allMatched.length} processes; only the first ${MAX_LOWERED} were lowered`)
  }

  const stateEntries: state.StateEntry[] = []
  for (const target of targets) {
    try {
      const original = os.getPriority(target.pid)
      os.setPriority(target.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
      stateEntries.push({
        pid: target.pid,
        imageName: target.name,
        originalPriority: original,
        currentPriority: os.constants.priority.PRIORITY_BELOW_NORMAL,
      })
      session.lowered.push({ pid: target.pid, name: target.name, originalPriority: original })
    } catch (err: unknown) {
      log.warn('live-optimizer', `lower failed for ${target.name} (${target.pid}): ${(err as Error).message}`)
    }
  }

  if (!NEVER_TOUCH_PROCESSES.has(triggerProc.name)) {
    let result: 'high' | 'above-normal' | 'failed' = 'failed'
    try {
      os.setPriority(triggerProc.pid, os.constants.priority.PRIORITY_HIGH)
      result = 'high'
    } catch {
      try {
        os.setPriority(triggerProc.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL)
        result = 'above-normal'
        session.notes.push('HIGH priority denied; fell back to ABOVE_NORMAL')
      } catch (err: unknown) {
        session.notes.push(`could not raise ${triggerProc.name} priority: ${(err as Error).message}`)
      }
    }
    session.raised.push({ pid: triggerProc.pid, name: triggerProc.name, result })
  }

  await state.write(stateEntries)
  activeSession = session
  log.info('live-optimizer', `activated for ${triggerProc.name} (lowered ${session.lowered.length}, raised ${session.raised.length})`)
}

async function deactivate(): Promise<void> {
  if (!activeSession) return
  const entries = await state.read()
  for (const entry of entries) {
    try {
      os.setPriority(entry.pid, entry.originalPriority)
    } catch (err: unknown) {
      log.warn('live-optimizer', `restore failed for pid ${entry.pid}: ${(err as Error).message}`)
    }
  }
  await state.clear()
  activeSession.deactivatedAt = Date.now()
  await activity.appendSession(activeSession)
  log.info('live-optimizer', `deactivated, restored ${entries.length} processes`)
  activeSession = null
}
