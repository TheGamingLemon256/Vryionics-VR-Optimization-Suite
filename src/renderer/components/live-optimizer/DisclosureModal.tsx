import React, { useEffect, useState } from 'react'

interface DisclosureModalProps {
  open: boolean
  mode: 'pre-enable' | 'read-only'
  onCancel: () => void
  onEnable?: () => void | Promise<void>
}

// The body copy below is verbatim from
// docs/superpowers/specs/2026-04-30-vos-remediation-design.md
// (Appendix: Live Optimizer disclosure copy). Do not paraphrase.
function DisclosureBody(): React.ReactElement {
  return (
    <div className="space-y-4 text-sm text-gray-200 leading-relaxed">
      <p><strong>Live Optimizer: what this will do</strong></p>
      <p>
        When enabled, the Live Optimizer watches for a VR session to start. While VR is running,
        it temporarily lowers CPU priority on a list of background apps so your VR game gets more
        scheduler time. It also raises the VR game's priority. When VR closes, every change is
        reversed.
      </p>

      <p><strong>What it touches:</strong></p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Process priorities only. The same setting Task Manager exposes under Details, Set Priority.</li>
        <li>Nothing on disk.</li>
        <li>Nothing in the registry.</li>
        <li>No services started, stopped, or modified.</li>
        <li>No firewall rules. No network changes.</li>
        <li>No drivers loaded. No kernel calls.</li>
      </ul>

      <p><strong>How it triggers:</strong></p>
      <p>
        Once enabled, VOS polls the running process list every 2 seconds for known VR processes.
        The full list is in <code>resources/live-optimizer-triggers.json</code> and you can audit
        it from Settings.
      </p>
      <p>
        When a VR process starts, the optimizer activates. When all of them exit, the optimizer
        restores everything.
      </p>

      <p><strong>What gets lowered:</strong></p>
      <p>
        Only processes whose name matches the allowlist. The allowlist is a strict list, not a
        pattern. Nothing not on it is touched.
      </p>

      <p><strong>What gets raised:</strong></p>
      <p>
        The detected VR process itself, to High priority. Same call Task Manager makes. (If your
        system policy blocks raising to High, the optimizer falls back to Above Normal and logs a
        note to the activity log. The lowering still happens normally.)
      </p>

      <p><strong>What it will never touch, by design:</strong></p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          System processes (<code>System</code>, <code>lsass.exe</code>, <code>csrss.exe</code>,{' '}
          <code>svchost.exe</code>, <code>winlogon.exe</code>, <code>dwm.exe</code>, anything in{' '}
          <code>C:\Windows\System32</code> or <code>SysWOW64</code>).
        </li>
        <li>
          Anti-cheat services (<code>EasyAntiCheat.exe</code>, <code>BEService.exe</code>,{' '}
          <code>vgc.exe</code>, and friends).
        </li>
        <li>
          Headset runtime (<code>OVRServer_x64.exe</code>, <code>vrserver.exe</code>, the SteamVR
          compositor, anything Virtual Desktop or ALVR ships). These need full priority to keep
          frames flowing to your headset.
        </li>
        <li>Any process not on the lowered-allowlist.</li>
        <li>The VOS process itself.</li>
      </ul>

      <p><strong>Crash recovery:</strong></p>
      <p>
        If VOS or your PC crashes during a VR session, priority changes do not survive a process
        restart on Windows. They are per-process and die with the parent. On the next VOS launch,
        the optimizer reads its state file and restores any process still running at the priority
        it set, verifying both the process name and the priority class match before changing
        anything. You should never end up with a permanently de-prioritized Discord.
      </p>

      <p><strong>OBS exception:</strong></p>
      <p>
        OBS is not on the default allowlist. If you add it manually, be aware that lowering OBS
        while it's recording or streaming will silently degrade your capture. VOS will not check
        for this.
      </p>

      <p><strong>Off-by-default:</strong></p>
      <p>
        Live Optimizer is off until you enable it. Enabling it does not retroactively touch any
        process. Only processes that match the allowlist during a future VR session will be
        lowered.
      </p>
    </div>
  )
}

export function DisclosureModal({
  open, mode, onCancel, onEnable,
}: DisclosureModalProps): React.ReactElement | null {
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setAcknowledged(false)
      setBusy(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const handleEnable = async (): Promise<void> => {
    if (!onEnable || !acknowledged || busy) return
    setBusy(true)
    try {
      await onEnable()
    } finally {
      setBusy(false)
    }
  }

  // Backdrop click is intentionally a no-op. The user must explicitly cancel
  // or enable so they can't dismiss the disclosure by accident.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div className="glass-panel w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">
            {mode === 'pre-enable' ? 'Enable Live Optimizer' : 'About Live Optimizer'}
          </h2>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <DisclosureBody />

          {mode === 'pre-enable' && (
            <label className="mt-5 flex items-start gap-2 text-sm text-gray-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1"
              />
              <span>I've read the above. Enable Live Optimizer.</span>
            </label>
          )}
        </div>

        <div className="px-5 pb-5 pt-4 flex items-center justify-end gap-3 border-t border-white/8">
          <button
            onClick={onCancel}
            className="glass-button btn-spring text-sm py-2 px-4"
          >
            {mode === 'pre-enable' ? 'Cancel' : 'Close'}
          </button>
          {mode === 'pre-enable' && (
            <button
              onClick={() => { void handleEnable() }}
              disabled={!acknowledged || busy}
              className="glass-button btn-spring text-sm py-2 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'rgba(var(--accent-rgb), 0.4)' }}
            >
              {busy ? 'Enabling…' : 'Enable Live Optimizer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
