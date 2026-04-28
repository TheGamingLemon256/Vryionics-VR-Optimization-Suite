// Vryionics VR Optimization Suite — Bug Report Modal
//
// Opened from Settings → "Send Bug Report". Collects a user message plus
// opt-in diagnostic attachments, then hands off to the main process which
// posts everything to the shared Discord webhook.
//
// UX decisions:
//   • Attachments default OFF — the user consciously opts in to share
//     diagnostic data. Matches the "if they wish to" language in the spec.
//   • Character counter becomes visible only past 80% of the soft limit;
//     before that it's just noise.
//   • Success / error feedback replaces the form for a beat, then the modal
//     closes on success so the user isn't stuck staring at a dead form.

import React, { useState, useMemo } from 'react'
import { Modal } from '../shared/Modal'
import { useScanStore } from '../../stores/scan-store'

const SOFT_LIMIT = 2000       // character count where we start warning the user
const HARD_LIMIT = 10_000     // matches the main-process validation cap

interface BugReportModalProps {
  open: boolean
  onClose: () => void
}

type Phase = 'editing' | 'sending' | 'success' | 'error'

export function BugReportModal({ open, onClose }: BugReportModalProps): React.ReactElement | null {
  const [message, setMessage] = useState('')
  const [includeScan,     setIncludeScan]     = useState(false)
  const [includeFixes,    setIncludeFixes]    = useState(false)
  const [includeSystem,   setIncludeSystem]   = useState(true)   // low-sensitivity; defaulted on
  const [includeAppLog,   setIncludeAppLog]   = useState(true)   // defaulted on — log is low-sensitivity and usually the most diagnostic attachment
  const [phase, setPhase] = useState<Phase>('editing')
  const [errorText, setErrorText] = useState('')
  // Set on success — describes where the bundle file was saved + whether
  // it was too long for the issue URL. v0.2.8 routes through GitHub
  // Issues instead of the legacy webhook, so the user has to actually
  // submit the issue themselves once their browser opens.
  const [successNote, setSuccessNote] = useState('')

  const lastScanData = useScanStore((s) => s.lastScanData)

  const charCount = message.length
  const overSoft  = charCount >= Math.floor(SOFT_LIMIT * 0.8)
  const overLimit = charCount > HARD_LIMIT
  const canSend   = message.trim().length > 0 && !overLimit && phase === 'editing'

  const scanAvailable = !!lastScanData

  const resetAndClose = (): void => {
    // Preserve message if user cancels an error — losing a 500-word description
    // on an error feels awful. Only clear on successful send.
    setPhase('editing')
    setErrorText('')
    onClose()
  }

  const handleSend = async (): Promise<void> => {
    if (!canSend) return
    setPhase('sending')
    setErrorText('')
    try {
      const api = (window as any).api
      const scanDataJson =
        includeScan && lastScanData
          ? JSON.stringify(lastScanData)
          : undefined

      const result = await api.support.sendBugReport({
        message: message.trim(),
        includeScanData:   includeScan && !!lastScanData,
        includeFixHistory: includeFixes,
        includeSystemInfo: includeSystem,
        includeAppLog:     includeAppLog,
        scanDataJson,
      })

      if (result?.ok) {
        setPhase('success')
        // Surface the bundle path + truncation hint when relevant — the
        // user may need to attach the file manually if their bundle was
        // too long for a URL.
        if (result.bundleTruncated) {
          setSuccessNote(`Report opened in your browser. The diagnostic bundle was longer than GitHub's URL limit — please drag-and-drop this file into your issue:\n${result.bundlePath}`)
        } else if (result.bundlePath) {
          setSuccessNote(`Report opened in your browser. A copy of what was sent is saved at:\n${result.bundlePath}`)
        }
        // Don't auto-close — the user needs to actually submit the issue
        // in their browser. Reset the form but leave the modal showing
        // the success message + bundle path.
        setMessage('')
        setIncludeScan(false)
        setIncludeFixes(false)
        setIncludeAppLog(true)
      } else {
        setPhase('error')
        setErrorText(result?.error ?? 'Unknown error')
      }
    } catch (err) {
      setPhase('error')
      setErrorText((err as Error)?.message ?? 'Unexpected error')
    }
  }

  // ── Footer buttons (change per phase) ───────────────────────
  const footer = useMemo<React.ReactNode>(() => {
    if (phase === 'success') {
      return (
        <button
          className="glass-button btn-spring px-4 py-2 text-xs font-semibold"
          onClick={resetAndClose}
        >
          Done
        </button>
      )
    }
    if (phase === 'sending') {
      return <span className="text-xs text-gray-400">Opening browser…</span>
    }
    return (
      <>
        <button
          className="glass-button-danger btn-spring px-4 py-2 text-xs"
          onClick={resetAndClose}
        >
          Cancel
        </button>
        <button
          className="glass-button btn-spring px-4 py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={!canSend}
        >
          Open Issue on GitHub
        </button>
      </>
    )
  }, [phase, canSend])

  if (!open) return null

  return (
    <Modal open={open} onClose={resetAndClose} title="Send Bug Report" footer={footer} width="lg">
      <div className="space-y-4">
        {phase === 'error' && (
          <div className="text-xs text-vr-critical bg-vr-critical/10 border border-vr-critical/25 rounded-lg p-3">
            Failed to send: {errorText}. Your message has not been discarded — you can edit and retry.
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-white block mb-1">
            What happened?
          </label>
          <p className="text-[11px] text-gray-500 mb-2">
            Describe the problem, what you were doing when it happened, and anything else that might help.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, HARD_LIMIT + 100))}
            placeholder="e.g. The live optimizer crashed my PC when I launched VRChat — it seems to have happened right after the 'Stopping services' log line..."
            rows={6}
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent)]/50 resize-y"
            style={{ minHeight: 120 }}
            disabled={phase !== 'editing'}
          />
          {(overSoft || overLimit) && (
            <p className={`text-[10px] mt-1 ${overLimit ? 'text-vr-critical' : 'text-gray-500'}`}>
              {charCount.toLocaleString()} / {HARD_LIMIT.toLocaleString()} characters
              {overLimit ? ' — too long, please trim' : ''}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-white mb-1">Include diagnostics (optional)</p>
          <p className="text-[11px] text-gray-500 mb-2">
            Attach additional context to help reproduce the issue. Nothing is sent until you click Send Report.
          </p>
          <div className="space-y-1.5">
            <AttachCheckbox
              label="System information"
              description="OS, CPU, RAM, Electron/Node versions — low sensitivity"
              checked={includeSystem}
              onChange={setIncludeSystem}
              disabled={phase !== 'editing'}
            />
            <AttachCheckbox
              label="Latest scan data"
              description={
                scanAvailable
                  ? 'Full JSON of your most recent scan — includes hardware detection and rule findings'
                  : 'No scan available yet — run a scan from the Dashboard first'
              }
              checked={includeScan}
              onChange={setIncludeScan}
              disabled={!scanAvailable || phase !== 'editing'}
            />
            <AttachCheckbox
              label="Applied fix history"
              description="Which fixes you've applied, when, and whether any were later undone"
              checked={includeFixes}
              onChange={setIncludeFixes}
              disabled={phase !== 'editing'}
            />
            <AttachCheckbox
              label="Recent app log"
              description="Last ~500 lines covering scans, fixes, updater, and any errors (main + renderer processes)"
              checked={includeAppLog}
              onChange={setIncludeAppLog}
              disabled={phase !== 'editing'}
            />
          </div>
        </div>

        <div className="text-[10px] text-gray-600 leading-relaxed border-t border-white/5 pt-3">
          Reports go to the Vryionics developer Discord. Only the content you see above is sent —
          no telemetry or background data is attached. You can review exactly what gets included
          by checking the boxes above.
        </div>
      </div>
    </Modal>
  )
}

// ── Attachment checkbox row ───────────────────────────────────

function AttachCheckbox({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : checked
            ? 'bg-accent-primary/10 border border-accent-primary/25 hover:bg-accent-primary/15'
            : 'bg-white/3 border border-white/8 hover:bg-white/5'
      }`}
      style={
        checked && !disabled
          ? { background: 'rgba(var(--accent-rgb), 0.08)', borderColor: 'rgba(var(--accent-rgb), 0.3)' }
          : undefined
      }
    >
      {/* Checkbox square */}
      <span
        className="mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
        style={{
          background: checked && !disabled ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
          border: checked && !disabled
            ? '1px solid var(--accent-primary)'
            : '1px solid rgba(255,255,255,0.18)',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
            <path d="M2 5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  )
}
