// Vryionics VR Optimization Suite — Structured Logger
//
// Centralises all main-process logging behind a single API that:
//   • writes each line to a daily-rotated file in %APPDATA%/<app>/logs/
//   • keeps the last 2000 lines in memory for fast bug-report attach
//   • mirrors everything to stdout/stderr so `npm run dev` still works
//   • captures uncaughtException / unhandledRejection globally
//
// Usage:
//   import { log } from './logger'
//   log.info('scan:cpu', 'Detected %s cores', cores)
//   log.warn('updater', 'Background check failed:', err.message)
//   log.error('fix:mmcss', err)           // Error objects are serialised with stack
//
// Bug reporter reads `readLogTail(N)` to attach the most recent lines.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: LogLevel = 'debug'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB cap before rotate
const MAX_RING = 2000                   // lines held in memory
const RETENTION_DAYS = 7                // keep a week of daily files

// ── State ────────────────────────────────────────────────────
const ring: string[] = []
let logDir: string | null = null
let currentFile: string | null = null
let currentDateKey: string | null = null
let writeStream: fs.WriteStream | null = null
let initFailed = false

// ── Helpers ──────────────────────────────────────────────────

function dateKey(d = new Date()): string {
  // YYYY-MM-DD — local time is fine for log rotation keys
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ensureInit(): void {
  if (logDir || initFailed) return
  try {
    logDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    rotateIfNeeded()
    pruneOldFiles()
  } catch (err) {
    initFailed = true
    // eslint-disable-next-line no-console
    console.warn('[logger] Failed to initialise log dir:', (err as Error).message)
  }
}

function rotateIfNeeded(): void {
  if (!logDir) return
  const today = dateKey()
  if (today !== currentDateKey) {
    closeStream()
    currentDateKey = today
    currentFile = path.join(logDir, `vros-${today}.log`)
    openStream()
    return
  }
  // Size-based rotation: bump with a .1, .2, .3 suffix
  try {
    if (currentFile && fs.existsSync(currentFile)) {
      const stat = fs.statSync(currentFile)
      if (stat.size > MAX_FILE_SIZE) {
        closeStream()
        for (let i = 3; i >= 1; i--) {
          const from = `${currentFile}.${i}`
          const to = `${currentFile}.${i + 1}`
          if (fs.existsSync(from)) fs.renameSync(from, to)
        }
        fs.renameSync(currentFile, `${currentFile}.1`)
        openStream()
      }
    }
  } catch { /* best effort */ }
}

function openStream(): void {
  if (!currentFile) return
  try {
    writeStream = fs.createWriteStream(currentFile, { flags: 'a', encoding: 'utf-8' })
    writeStream.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn('[logger] write stream error:', err.message)
    })
  } catch { writeStream = null }
}

function closeStream(): void {
  if (writeStream) {
    try { writeStream.end() } catch { /* ignore */ }
    writeStream = null
  }
}

function pruneOldFiles(): void {
  if (!logDir) return
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const name of fs.readdirSync(logDir)) {
      if (!name.startsWith('vros-')) continue
      const full = path.join(logDir, name)
      const stat = fs.statSync(full)
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full)
    }
  } catch { /* best effort */ }
}

function format(level: LogLevel, namespace: string, args: unknown[]): string {
  const parts: string[] = []
  for (const a of args) {
    if (a instanceof Error) {
      parts.push(`${a.name}: ${a.message}\n${a.stack ?? ''}`)
    } else if (typeof a === 'string') {
      parts.push(a)
    } else {
      parts.push(util.inspect(a, { depth: 4, breakLength: 200 }))
    }
  }
  const msg = parts.join(' ')
  return `${new Date().toISOString()} [${level}] [${namespace}] ${msg}`
}

function emit(level: LogLevel, namespace: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return
  ensureInit()
  rotateIfNeeded()

  const line = format(level, namespace, args)

  // In-memory ring for bug reports (FIFO, bounded)
  ring.push(line)
  if (ring.length > MAX_RING) ring.shift()

  // File
  if (writeStream) {
    try { writeStream.write(line + '\n') } catch { /* best effort */ }
  }

  // Mirror to console — use appropriate stream for level so CI / dev workflows
  // still see warn/error in the right place.
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  sink(line)
}

// ── Public API ───────────────────────────────────────────────

export const log = {
  debug: (namespace: string, ...args: unknown[]): void => emit('debug', namespace, args),
  info:  (namespace: string, ...args: unknown[]): void => emit('info',  namespace, args),
  warn:  (namespace: string, ...args: unknown[]): void => emit('warn',  namespace, args),
  error: (namespace: string, ...args: unknown[]): void => emit('error', namespace, args),
}

/** Read the last N lines held in memory. Fast — no file I/O. */
export function readLogTail(lines = MAX_RING): string {
  const start = Math.max(0, ring.length - lines)
  return ring.slice(start).join('\n')
}

/** Full current log file path (for surfacing to the user). */
export function getCurrentLogFile(): string | null {
  ensureInit()
  return currentFile
}

/** Directory holding all logs. */
export function getLogDir(): string | null {
  ensureInit()
  return logDir
}

/**
 * Install process-wide handlers for uncaughtException + unhandledRejection so
 * crashes always land in the log. Call once from the main process entry.
 *
 * Also shims `console.log/warn/error/debug` to route through the same logger —
 * this captures every existing `console.*` call in the codebase (scanner,
 * fix engine, updater, live-optimizer, etc.) without having to rewrite each
 * site individually. The namespace is sniffed from `[prefix]` strings already
 * present in most log lines (e.g. `[scan:cpu] ...`).
 */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    log.error('process', 'UNCAUGHT EXCEPTION —', err)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('process', 'UNHANDLED REJECTION —', reason as unknown)
  })

  // Console shim — captures the 1000+ existing `console.*` calls already
  // sprinkled through the main process. Preserves original stdout/stderr
  // mirroring via the `emit()` path.
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)
  const origDebug = console.debug?.bind(console) ?? origLog

  const sniffNamespace = (args: unknown[]): { namespace: string; args: unknown[] } => {
    const first = args[0]
    if (typeof first === 'string') {
      // Match "[namespace] rest" — using [\s\S] to avoid the `s` flag which
      // requires ES2018+ (our tsconfig targets ES2017 on the main process).
      const m = first.match(/^\[([^\]]{1,48})\]\s?([\s\S]*)$/)
      if (m) {
        const rest = m[2].length > 0 ? [m[2], ...args.slice(1)] : args.slice(1)
        return { namespace: m[1], args: rest }
      }
    }
    return { namespace: 'main', args }
  }

  console.log = (...args: unknown[]): void => {
    const { namespace, args: a } = sniffNamespace(args)
    // Avoid infinite recursion: our own logger also calls console.log below,
    // which would re-enter. The logger detects that via a sentinel string
    // already matching the ISO timestamp pattern — skip formatting again.
    if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(args[0])) {
      origLog(...args)
      return
    }
    emit('info', namespace, a)
  }
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(args[0])) {
      origWarn(...args)
      return
    }
    const { namespace, args: a } = sniffNamespace(args)
    emit('warn', namespace, a)
  }
  console.error = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(args[0])) {
      origError(...args)
      return
    }
    const { namespace, args: a } = sniffNamespace(args)
    emit('error', namespace, a)
  }
  console.debug = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(args[0])) {
      origDebug(...args)
      return
    }
    const { namespace, args: a } = sniffNamespace(args)
    emit('debug', namespace, a)
  }

  // Flush stream on exit
  process.on('exit', () => closeStream())
  process.on('SIGINT', () => { closeStream(); process.exit(0) })
  process.on('SIGTERM', () => { closeStream(); process.exit(0) })
}

/**
 * Log a line coming FROM the renderer (via IPC). Keeps renderer output in the
 * same unified log so bug reports show both processes together.
 */
export function logFromRenderer(level: LogLevel, namespace: string, message: string): void {
  emit(level, `renderer:${namespace}`, [message])
}
