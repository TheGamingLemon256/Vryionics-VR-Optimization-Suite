// Vryionics VR Optimization Suite — VR Session Recorder
//
// While a VR process is running, samples CPU/RAM/GPU metrics + the VR
// process list at 1 Hz and writes the timeline to a JSON file under
// %APPDATA%/<app>/sessions/. After the session ends, the file becomes
// available in the Sessions tab for replay/scrubbing.
//
// Key design choices:
//   • Sampling cadence is 1 Hz — fast enough to catch thermal-throttle
//     spikes, slow enough that 60 minutes of VR produces a ~700 KB file.
//   • Recorder hooks into the same VR-process detection used by the
//     auto-enable watcher (single source of truth).
//   • Sessions auto-finalise on app close + on graceful VR exit. If the
//     app is killed mid-session, the partial file stays — a "[crashed]"
//     marker is added on next launch when we find an unfinalised file.
//   • We deliberately don't ship every collected datapoint to the
//     renderer in real-time — too chatty. The renderer reads the
//     finalised file on demand.

import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { log } from './logger'
import { getNvidiaGpuMetrics, getAmdGpuMetrics, getIntelGpuTemperature } from './utils/gpu-metrics'
import { notify } from './notifier'

export interface SessionSample {
  /** Seconds since session start. */
  t: number
  cpu: number          // 0-100 %
  ramUsedGB: number
  gpuTempC: number | null
  gpuPowerW: number | null
  gpuUtil: number | null
  vrProcs: string[]    // names of VR processes detected this tick
}

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number | null   // null while in-progress
  samples: SessionSample[]
  /** "completed" or "crashed" — set when finalised. */
  status: 'recording' | 'completed' | 'crashed'
  /** First VR process detected — used as the title (e.g. "vrchat" / "vrserver"). */
  primaryProc: string | null
}

const SAMPLE_INTERVAL_MS = 1_000

// VR processes worth tracking — overlap with auto-enable.ts
const VR_PROCESS_NAMES = [
  'vrserver', 'vrcompositor', 'vrdashboard', 'vrwebhelper',
  'OVRServer_x64', 'OculusClient',
  'virtualdesktop.streamer', 'virtualdesktop.server',
  'vrchat',
]

let activeRecord: SessionRecord | null = null
let sampleTimer: NodeJS.Timeout | null = null
let mainWindow: (() => BrowserWindow | null) | null = null

export function setMainWindow(getter: () => BrowserWindow | null): void {
  mainWindow = getter
}

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions')
}

function recordPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`)
}

function ensureDir(): void {
  try { fs.mkdirSync(sessionsDir(), { recursive: true }) } catch { /* ignore */ }
}

/** Detect any unfinalised session files left over from a previous crash. */
export function reconcileCrashedRecords(): void {
  ensureDir()
  try {
    for (const f of fs.readdirSync(sessionsDir())) {
      if (!f.endsWith('.json')) continue
      const full = path.join(sessionsDir(), f)
      try {
        const data: SessionRecord = JSON.parse(fs.readFileSync(full, 'utf-8'))
        if (data.status === 'recording') {
          data.status = 'crashed'
          data.endedAt = data.endedAt ?? data.samples[data.samples.length - 1]?.t
            ? data.startedAt + (data.samples[data.samples.length - 1]?.t ?? 0) * 1000
            : data.startedAt
          fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8')
          log.warn('session-recorder', `Reconciled crashed record ${data.id}`)
        }
      } catch { /* corrupted, skip */ }
    }
  } catch { /* ignore */ }
}

/** Returns the names of currently-running VR processes. */
function pollVrProcesses(): Promise<string[]> {
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
    const timer = setTimeout(() => { try { child.kill() } catch {} resolve([]) }, 5_000)
    child.on('error', () => { clearTimeout(timer); resolve([]) })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    })
  })
}

/** Quick CPU + RAM sample via PowerShell. Async — non-blocking. */
function pollCpuRam(): Promise<{ cpu: number; ramUsedGB: number }> {
  const script = `
    $cpu = (Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples[0].CookedValue
    $os = Get-CimInstance Win32_OperatingSystem
    $usedKB = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory
    Write-Output "cpu:$cpu"
    Write-Output "ram:$usedKB"
  `
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (c: string) => { stdout += c })
    const timer = setTimeout(() => { try { child.kill() } catch {} resolve({ cpu: 0, ramUsedGB: 0 }) }, 3_000)
    child.on('error', () => { clearTimeout(timer); resolve({ cpu: 0, ramUsedGB: 0 }) })
    child.on('close', () => {
      clearTimeout(timer)
      const cpu = Math.round(parseFloat(stdout.match(/cpu:([\d.]+)/)?.[1] ?? '0'))
      const ramKB = parseFloat(stdout.match(/ram:(\d+)/)?.[1] ?? '0')
      resolve({ cpu, ramUsedGB: ramKB / 1024 / 1024 })
    })
  })
}

async function pollGpu(): Promise<{ tempC: number | null; powerW: number | null; util: number | null }> {
  // Try NVIDIA first, then AMD, then Intel — return whichever produces data.
  // Existing helpers return slightly different shapes; we normalise here.
  try {
    const n = await getNvidiaGpuMetrics()
    if (n) return { tempC: n.temperature ?? null, powerW: n.powerDraw ?? null, util: null }
  } catch { /* fall through */ }
  try {
    const a = await getAmdGpuMetrics()
    if (a) return { tempC: a.temperature ?? null, powerW: a.powerDraw ?? null, util: null }
  } catch { /* fall through */ }
  try {
    const i = await getIntelGpuTemperature()
    if (typeof i === 'number' && i > 0) return { tempC: i, powerW: null, util: null }
  } catch { /* fall through */ }
  return { tempC: null, powerW: null, util: null }
}

async function takeSample(): Promise<void> {
  if (!activeRecord) return
  const tSec = (Date.now() - activeRecord.startedAt) / 1000
  const [{ cpu, ramUsedGB }, gpu, vrProcs] = await Promise.all([
    pollCpuRam(),
    pollGpu(),
    pollVrProcesses(),
  ])
  activeRecord.samples.push({
    t: Math.round(tSec * 10) / 10,
    cpu,
    ramUsedGB: Math.round(ramUsedGB * 10) / 10,
    gpuTempC: gpu.tempC,
    gpuPowerW: gpu.powerW,
    gpuUtil: gpu.util,
    vrProcs,
  })

  // Real-time thermal-throttle toast — only fires when GPU temp crosses 88°C
  // (typical thermal-throttle threshold for modern NVIDIA + AMD cards) AND
  // the previous sample was below it (prevents per-tick spam during sustained
  // throttle). Cooldown in the notifier itself caps frequency at 1/5min.
  const samples = activeRecord.samples
  if (samples.length >= 2 && gpu.tempC != null && gpu.tempC > 88) {
    const prev = samples[samples.length - 2]
    if (prev.gpuTempC == null || prev.gpuTempC <= 88) {
      notify(
        'thermal',
        'GPU thermal throttle detected',
        `GPU hit ${Math.round(gpu.tempC)}°C during your VR session — likely cause of stutter. Improve case airflow or undervolt.`,
      )
    }
  }

  // If VR processes vanished mid-session for two consecutive samples, end
  // the session. Single-tick blips (e.g. brief recompositor restart) don't
  // count — we require persistence.
  const recent = activeRecord.samples.slice(-2)
  if (recent.length === 2 && recent.every((s) => s.vrProcs.length === 0)) {
    log.info('session-recorder', `VR processes ended for 2+ ticks — finalising session ${activeRecord.id}`)
    finalise('completed')
  }
}

/** Begin recording a new session. Idempotent — calling while one is active is a no-op. */
export function startRecording(initialProcs: string[]): void {
  if (activeRecord) return
  ensureDir()
  const id = `session-${new Date().toISOString().replace(/[:.]/g, '-')}`
  activeRecord = {
    id,
    startedAt: Date.now(),
    endedAt: null,
    samples: [],
    status: 'recording',
    primaryProc: initialProcs[0] ?? null,
  }
  log.info('session-recorder', `Started session ${id} (primary=${activeRecord.primaryProc})`)
  // Persist the empty record immediately so a crash leaves SOMETHING on disk
  persist()
  sampleTimer = setInterval(() => {
    takeSample().catch((err) => log.warn('session-recorder', 'Sample threw:', err as Error))
    persist()
  }, SAMPLE_INTERVAL_MS)
  notifyRenderer()
}

/** Finalise the active recording with a status. */
export function finalise(status: 'completed' | 'crashed'): void {
  if (!activeRecord) return
  if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null }
  activeRecord.endedAt = Date.now()
  activeRecord.status = status
  persist()
  log.info('session-recorder', `Finalised session ${activeRecord.id} (${status}, ${activeRecord.samples.length} samples)`)
  activeRecord = null
  notifyRenderer()
}

function persist(): void {
  if (!activeRecord) return
  try {
    fs.writeFileSync(recordPath(activeRecord.id), JSON.stringify(activeRecord, null, 2), 'utf-8')
  } catch (err) {
    log.warn('session-recorder', 'Persist failed:', err as Error)
  }
}

function notifyRenderer(): void {
  const win = mainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('session-recorder:state', getActiveSummary())
  }
}

export function getActiveSummary(): { id: string; startedAt: number; primaryProc: string | null; sampleCount: number } | null {
  if (!activeRecord) return null
  return {
    id: activeRecord.id,
    startedAt: activeRecord.startedAt,
    primaryProc: activeRecord.primaryProc,
    sampleCount: activeRecord.samples.length,
  }
}

export function listSessions(): Array<{ id: string; startedAt: number; endedAt: number | null; status: string; primaryProc: string | null; sampleCount: number; durationSec: number }> {
  ensureDir()
  const out: ReturnType<typeof listSessions> = []
  try {
    for (const f of fs.readdirSync(sessionsDir())) {
      if (!f.endsWith('.json')) continue
      try {
        const data: SessionRecord = JSON.parse(fs.readFileSync(path.join(sessionsDir(), f), 'utf-8'))
        const durationSec = data.endedAt ? Math.round((data.endedAt - data.startedAt) / 1000) : 0
        out.push({
          id: data.id,
          startedAt: data.startedAt,
          endedAt: data.endedAt,
          status: data.status,
          primaryProc: data.primaryProc,
          sampleCount: data.samples.length,
          durationSec,
        })
      } catch { /* corrupted */ }
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

export function getSession(id: string): SessionRecord | null {
  try {
    return JSON.parse(fs.readFileSync(recordPath(id), 'utf-8')) as SessionRecord
  } catch { return null }
}

export function deleteSession(id: string): boolean {
  try { fs.unlinkSync(recordPath(id)); return true } catch { return false }
}
