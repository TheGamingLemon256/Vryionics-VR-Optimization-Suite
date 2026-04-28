// Vryionics VR Optimization Suite — Renderer Log Forwarder
//
// Mirrors the renderer's console output + uncaught errors into the main
// process's unified log file via IPC. Means bug reports contain both
// process sides together, even for crashes that happen before the user
// opens DevTools.
//
// Installed once from main.tsx before the React app mounts.

type Level = 'debug' | 'info' | 'warn' | 'error'

const MAX_MSG_LEN = 4000

function stringifyArgs(args: unknown[]): string {
  const parts: string[] = []
  for (const a of args) {
    if (a instanceof Error) {
      parts.push(`${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`)
    } else if (typeof a === 'string') {
      parts.push(a)
    } else {
      try { parts.push(JSON.stringify(a)) } catch { parts.push(String(a)) }
    }
  }
  let out = parts.join(' ')
  if (out.length > MAX_MSG_LEN) out = out.slice(0, MAX_MSG_LEN) + ' …[truncated]'
  return out
}

function forward(level: Level, namespace: string, args: unknown[]): void {
  const api = (window as unknown as { api?: { logging?: { write?: (l: string, n: string, m: string) => void } } }).api
  if (!api?.logging?.write) return
  try {
    api.logging.write(level, namespace, stringifyArgs(args))
  } catch { /* swallow — logging must never crash the app */ }
}

export function installRendererLogForwarder(): void {
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)
  const origInfo = console.info?.bind(console) ?? origLog
  const origDebug = console.debug?.bind(console) ?? origLog

  console.log = (...args: unknown[]): void => { origLog(...args);   forward('info',  'console', args) }
  console.info = (...args: unknown[]): void => { origInfo(...args); forward('info',  'console', args) }
  console.warn = (...args: unknown[]): void => { origWarn(...args); forward('warn',  'console', args) }
  console.error = (...args: unknown[]): void => { origError(...args); forward('error', 'console', args) }
  console.debug = (...args: unknown[]): void => { origDebug(...args); forward('debug', 'console', args) }

  // Uncaught synchronous errors
  window.addEventListener('error', (e: ErrorEvent) => {
    forward('error', 'window.error', [
      `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`,
      e.error instanceof Error ? e.error : '',
    ])
  })
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    forward('error', 'window.unhandledrejection', [e.reason])
  })

  // Startup breadcrumb so every bug report has a "here's where the renderer
  // started" anchor point
  forward('info', 'renderer', [`Renderer boot · ${navigator.userAgent}`])
}
