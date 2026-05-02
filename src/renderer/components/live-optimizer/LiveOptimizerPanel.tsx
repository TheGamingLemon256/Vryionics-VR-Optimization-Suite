import React, { useEffect, useState } from 'react'
import { useLiveOptimizerStore } from '../../stores/live-optimizer-store'
import LiveMetricsWidget from './LiveMetricsWidget'

const PHASE_CONFIG = {
  disabled:   { label: 'Disabled',           dot: 'bg-gray-500',   text: 'text-gray-400',   pulse: false },
  monitoring: { label: 'Monitoring for VR…', dot: 'bg-blue-400',   text: 'text-blue-300',   pulse: true  },
  active:     { label: 'Active',             dot: 'bg-vr-healthy', text: 'text-vr-healthy', pulse: false },
} as const

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-50 ${value ? 'bg-accent-primary' : 'bg-white/20'}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export default function LiveOptimizerPanel(): React.ReactElement {
  const { status, flags, running, init, enable, disable, setAutoEnable } = useLiveOptimizerStore()
  const [busy, setBusy] = useState(false)

  useEffect(() => { void init() }, [init])

  const phase = status.phase
  const cfg = PHASE_CONFIG[phase]

  const handleToggle = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (running || flags.enabled) await disable()
      else await enable()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <div>
            <p className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</p>
            {phase === 'active' && status.triggerProcess && (
              <p className="text-xs text-gray-400">
                Triggered by {status.triggerProcess} {'•'} raised {status.raised.length}, lowered {status.lowered.length}
              </p>
            )}
            {phase === 'monitoring' && (
              <p className="text-xs text-gray-500">Polling every 2s for known VR processes</p>
            )}
            {phase === 'disabled' && (
              <p className="text-xs text-gray-500">Off. Toggle on to start monitoring.</p>
            )}
          </div>
        </div>

        <Toggle value={flags.enabled} onChange={() => { void handleToggle() }} disabled={busy || !flags.disclosureAccepted} />
      </div>

      {phase !== 'disabled' && (
        <div className="glass-panel-sm p-3 rounded-lg border border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Live System Metrics
          </p>
          <LiveMetricsWidget active={true} />
        </div>
      )}

      {phase === 'active' && status.notes.length > 0 && (
        <div className="glass-panel-sm p-3 rounded-lg border border-amber-400/20 space-y-1">
          <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">Notes</p>
          {status.notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-200/90">{n}</p>
          ))}
        </div>
      )}

      <div className="border-t border-white/5 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-white">Auto-enable on VR detection</p>
            <p className="text-[11px] text-gray-500">When a VR runtime starts, flip the optimizer on automatically.</p>
          </div>
          <Toggle
            value={flags.autoEnableOnVrDetected}
            onChange={() => { void setAutoEnable(!flags.autoEnableOnVrDetected) }}
          />
        </div>

        {!flags.disclosureAccepted && (
          <p className="text-xs text-gray-500">
            Live Optimizer can be enabled from the Settings page after reviewing the disclosure.
          </p>
        )}
      </div>
    </div>
  )
}
