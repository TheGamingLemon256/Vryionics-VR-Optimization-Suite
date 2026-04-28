// Vryionics VR Optimization Suite — Support / Bug-Report IPC
//
// Exposes `support:sendBugReport` to the renderer. The renderer sends a
// structured payload (message + optional diagnostic attachments), and the
// main process assembles everything into one human-readable text bundle and
// posts it to the shared Discord webhook used by VMSC Universal.

import { ipcMain, app, shell } from 'electron'
import { getFixHistory } from '../fixes/engine'
import { readLogTail, getCurrentLogFile, log } from '../logger'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

/** Result returned to the renderer for the bug-report flow. */
export interface BugReportResult {
  ok: boolean
  /** Where the bundle was written on disk (so the user can attach it manually if too long for URL) */
  bundlePath?: string
  /** URL we opened in the browser */
  issueUrl?: string
  /** Whether the bundle had to be truncated to fit in the URL */
  bundleTruncated?: boolean
  error?: string
}

const REPO = 'TheGamingLemon256/Vryionics-VR-Optimization-Suite'
// GitHub's hard URL limit is ~8 KB. Modern browsers and the GitHub backend
// both accept up to ~6 KB reliably; we cap the in-URL bundle there and
// instruct the user to drag-and-drop the local file for the rest.
const MAX_URL_BUNDLE_BYTES = 6000

/**
 * Payload shape the renderer sends. Kept deliberately forgiving — every
 * attachment is optional, and unknown keys are simply ignored so future
 * versions of the renderer can send extra context without breaking the
 * main process.
 */
interface BugReportPayload {
  message: string
  includeScanData?: boolean
  includeFixHistory?: boolean
  includeSystemInfo?: boolean
  includeAppLog?: boolean
  // If the renderer passed its current scan result, avoid an extra IPC round-trip
  scanDataJson?: string
  // Optional stable identifier the renderer persists locally
  clientId?: string
}

/**
 * Assemble a single text bundle from all opted-in attachments. Uses a simple
 * "=== SECTION ===" delimiter so the support recipient can read it linearly
 * in Discord's file preview without a JSON parser.
 */
function buildBundle(payload: BugReportPayload): string {
  const parts: string[] = []
  const ts = new Date().toISOString()

  parts.push(`VRYIONICS VR OPTIMIZATION SUITE — BUG REPORT`)
  parts.push(`Generated: ${ts}`)
  parts.push(`Version:   ${app.getVersion()}`)
  parts.push('')
  parts.push('=== USER MESSAGE ===')
  parts.push(payload.message?.trim() || '(no message provided)')
  parts.push('')

  if (payload.includeSystemInfo !== false) {
    parts.push('=== SYSTEM INFO ===')
    parts.push(`Platform:  ${process.platform} ${process.arch}`)
    parts.push(`OS:        ${os.type()} ${os.release()}`)
    parts.push(`Hostname:  ${os.hostname()}`)
    parts.push(`CPU:       ${os.cpus()[0]?.model ?? 'unknown'} × ${os.cpus().length}`)
    parts.push(`Memory:    ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total`)
    parts.push(`Uptime:    ${Math.round(os.uptime() / 60)} min`)
    parts.push(`Electron:  ${process.versions.electron ?? 'n/a'}`)
    parts.push(`Node:      ${process.versions.node}`)
    parts.push(`Chromium:  ${process.versions.chrome ?? 'n/a'}`)
    parts.push('')
  }

  if (payload.includeScanData && payload.scanDataJson) {
    parts.push('=== LATEST SCAN DATA ===')
    // Pretty-print by re-serializing — the renderer may have sent compact JSON
    try {
      const parsed = JSON.parse(payload.scanDataJson)
      parts.push(JSON.stringify(parsed, null, 2))
    } catch {
      parts.push(payload.scanDataJson)
    }
    parts.push('')
  }

  if (payload.includeFixHistory) {
    parts.push('=== APPLIED FIX HISTORY ===')
    try {
      const history = getFixHistory()
      if (!history || history.length === 0) {
        parts.push('(no fixes have been applied)')
      } else {
        for (const entry of history) {
          const applied = entry.appliedAt ? new Date(entry.appliedAt).toISOString() : 'unknown'
          const status = entry.undoneAt ? `undone ${new Date(entry.undoneAt).toISOString()}` : 'active'
          parts.push(`- ${entry.fixId}  (${status})  applied=${applied}`)
        }
      }
    } catch (err) {
      parts.push(`(failed to read fix history: ${(err as Error).message})`)
    }
    parts.push('')
  }

  if (payload.includeAppLog) {
    parts.push('=== APP LOG (last 500 lines) ===')
    const logFile = getCurrentLogFile()
    if (logFile) parts.push(`Source: ${logFile}`)
    const tail = readLogTail(500)
    parts.push(tail || '(log is empty — session just started)')
    parts.push('')
  }

  parts.push('=== END OF REPORT ===')
  return parts.join('\n')
}

/**
 * Save the assembled bundle to a known location so the user can attach it
 * to their GitHub issue if it exceeded the URL length limit, and so they
 * have a local copy of what was sent regardless.
 */
function writeBundleFile(bundle: string): string {
  const dir = path.join(app.getPath('userData'), 'bug-reports')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  const filename = `vros-bug-report-${Date.now()}.txt`
  const fullPath = path.join(dir, filename)
  try {
    fs.writeFileSync(fullPath, bundle, 'utf-8')
  } catch (err) {
    log.warn('support', `Failed to write bundle file: ${(err as Error).message}`)
  }
  return fullPath
}

/**
 * Build the issue body. If the bundle fits, embed it inline in a code
 * block. Otherwise, embed the head of the bundle plus a note pointing the
 * user at the local file they can attach.
 */
function buildIssueBody(payload: BugReportPayload, bundle: string, bundlePath: string): { body: string; truncated: boolean } {
  const message = (payload.message ?? '').trim()
  let body = `${message}\n\n---\n\n`
  let truncated = false

  // GitHub renders ```...``` as a code block. We measure the body size,
  // not just the bundle, because the URL limit applies to the whole thing.
  const wrapper = `<details>\n<summary>Diagnostic bundle (auto-generated)</summary>\n\n\`\`\`\n`
  const wrapperEnd = `\n\`\`\`\n</details>\n`
  const overhead = body.length + wrapper.length + wrapperEnd.length + 200 // safety

  if (bundle.length + overhead <= MAX_URL_BUNDLE_BYTES) {
    body += wrapper + bundle + wrapperEnd
  } else {
    truncated = true
    const room = Math.max(0, MAX_URL_BUNDLE_BYTES - overhead - 400)
    body +=
      wrapper +
      bundle.slice(0, room) +
      '\n\n[bundle truncated — full report saved locally]\n' +
      wrapperEnd +
      `\n> ⚠ The full diagnostic bundle was too long to fit in the issue URL.\n> ` +
      `It was saved locally at: \`${bundlePath}\`\n> ` +
      `Please drag-and-drop that file into this issue as an attachment so we can see the rest.\n`
  }

  return { body, truncated }
}

/** Build the final issue-creation URL. */
function buildIssueUrl(title: string, body: string): string {
  const params = new URLSearchParams({
    title,
    body,
    labels: 'bug,user-report',
  })
  return `https://github.com/${REPO}/issues/new?${params.toString()}`
}

export function registerSupportHandlers(): void {
  // Replaces the previous webhook-based reporter. The webhook approach
  // shipped a Discord webhook URL inside the install (resources/webhook.txt)
  // which gave anyone who unpacked the installer a free spam/abuse vector
  // against our support channel — flagged via responsible disclosure on
  // 2026-04-28. Bug reports now route through GitHub Issues:
  //   1. Build the same bundle we used to POST to Discord
  //   2. Save it locally so the user has a copy + can attach if too long
  //   3. Open a GitHub issue URL pre-filled with title + body
  //   4. User reviews + submits via their own GitHub account
  //
  // No client-side webhook URL anywhere. Abuse mitigation handled by GitHub.
  ipcMain.handle(
    'support:sendBugReport',
    async (_event, payloadRaw: unknown): Promise<BugReportResult> => {
      try {
        const payload = (payloadRaw as BugReportPayload) ?? ({} as BugReportPayload)
        const message = typeof payload.message === 'string' ? payload.message : ''

        if (!message || message.trim().length === 0) {
          return { ok: false, error: 'Please describe the issue first.' }
        }
        if (message.length > 10_000) {
          return { ok: false, error: 'Message is too long (max 10,000 chars).' }
        }

        const bundle = buildBundle(payload)
        const bundlePath = writeBundleFile(bundle)

        // Take the first line of the message as the issue title (the `s`
        // dotall flag would let us match across newlines, but it requires
        // ES2018 target — this codebase targets ES2017 on the main process).
        const firstLine = message.split('\n')[0]
        const title = `[bug] ${firstLine.slice(0, 80)}`
        const { body, truncated } = buildIssueBody(payload, bundle, bundlePath)
        const url = buildIssueUrl(title, body)

        try {
          await shell.openExternal(url)
          log.info('support', `Opened GitHub Issues URL (truncated=${truncated}, bundlePath=${bundlePath})`)
          return { ok: true, bundlePath, issueUrl: url, bundleTruncated: truncated }
        } catch (err) {
          return { ok: false, error: `Could not open browser: ${(err as Error).message}`, bundlePath }
        }
      } catch (err) {
        log.warn('support', 'sendBugReport internal error:', err as Error)
        return { ok: false, error: (err as Error).message || 'unknown error' }
      }
    },
  )
}
