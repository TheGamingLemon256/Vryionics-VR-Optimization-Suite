// VR Optimization Suite — Live Optimizer Panel

import React, { useState, useEffect, useRef } from 'react'
import { useLiveOptimizerStore, type LogEntry, type LogLevel } from '../../stores/live-optimizer-store'
import { useAppStore } from '../../stores/app-store'
import LiveMetricsWidget from './LiveMetricsWidget'

// ── Phase badge styling ────────────────────────────────────────
const PHASE_CONFIG = {
  disabled:   { label: 'Disabled',              dot: 'bg-gray-500',       text: 'text-gray-400',    pulse: false },
  monitoring: { label: 'Monitoring for VR…',    dot: 'bg-blue-400',       text: 'text-blue-300',    pulse: true  },
  countdown:  { label: 'VR detected — standby', dot: 'bg-amber-400',      text: 'text-amber-300',   pulse: true  },
  active:     { label: 'Active',                dot: 'bg-vr-healthy',     text: 'text-vr-healthy',  pulse: false },
  restoring:  { label: 'Restoring…',            dot: 'bg-purple-400',     text: 'text-purple-300',  pulse: true  },
}

// ── Log entry visual config ────────────────────────────────────
const LOG_STYLE: Record<LogLevel, { color: string; bg: string }> = {
  scan:    { color: 'text-blue-300',   bg: 'bg-blue-500/8'   },
  info:    { color: 'text-gray-400',   bg: ''                },
  spare:   { color: 'text-cyan-400',   bg: 'bg-cyan-500/5'   },
  kill:    { color: 'text-amber-300',  bg: 'bg-amber-500/8'  },
  success: { color: 'text-vr-healthy', bg: ''                },
  warning: { color: 'text-vr-warning', bg: 'bg-vr-warning/5' },
  service: { color: 'text-purple-300', bg: 'bg-purple-500/5' },
  restore: { color: 'text-blue-300',   bg: 'bg-blue-500/5'   },
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Sub-components ────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/8 border border-white/12 text-xs text-gray-300">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 text-gray-500 hover:text-vr-critical transition-colors text-xs leading-none"
        aria-label={`Remove ${label}`}
      >
        ✕
      </button>
    </span>
  )
}

function TagInput({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }): React.ReactElement {
  const [value, setValue] = useState('')
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }
  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent)]/50"
      />
      <button
        onClick={() => { if (value.trim()) { onAdd(value.trim()); setValue('') } }}
        className="glass-button btn-spring text-xs px-3 py-1.5"
      >
        Add
      </button>
    </div>
  )
}

function LogEntryRow({ entry }: { entry: LogEntry }): React.ReactElement {
  const style = LOG_STYLE[entry.level]
  return (
    <div className={`flex gap-2 px-2 py-1 rounded text-[11px] leading-relaxed ${style.bg}`}>
      <span className="text-gray-600 flex-shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>
      <div className="flex-1 min-w-0">
        <span className={style.color}>{entry.message}</span>
        {entry.detail && (
          <span className="text-gray-600 ml-1">— {entry.detail}</span>
        )}
      </div>
    </div>
  )
}

function ActivityLog({ entries }: { entries: LogEntry[] }): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }

  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-gray-600 italic text-center py-4">
        Activity will appear here once monitoring starts
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="max-h-52 overflow-y-auto space-y-0.5 pr-1"
      style={{ scrollbarWidth: 'thin' }}
    >
      {entries.map((entry) => (
        <LogEntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────

export default function LiveOptimizerPanel(): React.ReactElement {
  const {
    status, config, loading, initialized,
    init, setEnabled, updateConfig,
    addExclusion, removeExclusion,
    addTarget, removeTarget,
    forceOptimize, restore
  } = useLiveOptimizerStore()
  const { isAdmin } = useAppStore()

  useEffect(() => { init() }, [init])

  const phase = status.phase
  const phaseConfig = PHASE_CONFIG[phase]
  const hasAffected = status.affectedProcesses.length > 0 || status.affectedServices.length > 0

  const delayOptions = [5000, 10000, 15000, 30000, 60000]
  const delayLabels: Record<number, string> = {
    5000: '5s', 10000: '10s', 15000: '15s', 30000: '30s', 60000: '60s'
  }

  return (
    <div className="space-y-5">
      {/* ── Status + enable row ─────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${phaseConfig.dot} ${phaseConfig.pulse ? 'animate-pulse' : ''}`} />
          <div>
            <p className={`text-sm font-semibold ${phaseConfig.text}`}>{phaseConfig.label}</p>
            {phase === 'countdown' && status.countdownSecondsLeft != null && (
              <p className="text-xs text-amber-400/80">Optimizing in {status.countdownSecondsLeft}s…</p>
            )}
            {phase === 'active' && (
              <p className="text-xs text-gray-400">
                {status.affectedProcesses.length} process{status.affectedProcesses.length !== 1 ? 'es' : ''} paused,
                {' '}{status.affectedServices.length} service{status.affectedServices.length !== 1 ? 's' : ''} stopped
              </p>
            )}
            {phase === 'monitoring' && status.detectedVrProcessNames.length === 0 && (
              <p className="text-xs text-gray-500">No VR processes detected yet</p>
            )}
            {phase === 'monitoring' && status.detectedVrProcessNames.length > 0 && (
              <p className="text-xs text-blue-400/70">
                VR: {status.detectedVrProcessNames.slice(0, 3).join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin && (
            <span className="text-[10px] text-vr-warning bg-vr-warning/10 border border-vr-warning/20 px-2 py-0.5 rounded-full">
              Admin recommended
            </span>
          )}
          <button
            onClick={() => setEnabled(!config.enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
              config.enabled ? 'bg-accent-primary' : 'bg-white/20'
            }`}
            disabled={loading}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
              config.enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* ── Live System Metrics ─────────────────────── */}
      {(phase === 'monitoring' || phase === 'active' || phase === 'countdown') && (
        <div className="glass-panel-sm p-3 rounded-lg border border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Live System Metrics
          </p>
          <LiveMetricsWidget active={phase === 'monitoring' || phase === 'active' || phase === 'countdown'} />
        </div>
      )}

      {/* ── Action buttons ──────────────────────────── */}
      {config.enabled && (
        <div className="flex items-center gap-2">
          <button
            className="glass-button btn-spring text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-40"
            onClick={forceOptimize}
            disabled={phase === 'active' || phase === 'disabled' || phase === 'restoring'}
          >
            ⚡ Optimize Now
          </button>
          <button
            className="glass-button-danger btn-spring text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-40"
            onClick={restore}
            disabled={!hasAffected || phase === 'restoring'}
          >
            ↺ Restore All
          </button>
          <button
            className="glass-button btn-spring text-xs px-4 py-2 flex items-center gap-1.5 ml-auto"
            onClick={() => (window as any).api?.overlay?.open?.()}
            title="Open the always-on-top metrics overlay so you can watch CPU/GPU/RAM during VR sessions"
          >
            ⬚ Open Overlay
          </button>
        </div>
      )}

      {/* ── Activity Log ────────────────────────────── */}
      <div className="glass-panel-sm p-3 rounded-lg border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Activity Log
          </p>
          {status.activityLog.length > 0 && (
            <span className="text-[10px] text-gray-600">{status.activityLog.length} entries</span>
          )}
        </div>
        <ActivityLog entries={status.activityLog} />
      </div>

      {/* ── Active: affected list ───────────────────── */}
      {phase === 'active' && hasAffected && (
        <div className="glass-panel-sm p-3 rounded-lg border border-vr-healthy/20 space-y-2">
          {status.affectedProcesses.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Paused Processes</p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {status.affectedProcesses.map((p) => (
                  <div key={p.pid} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-vr-healthy flex-shrink-0" />
                    <span className="font-mono">{p.name}</span>
                    <span className="text-gray-600 ml-auto">PID {p.pid}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {status.affectedServices.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Stopped Services</p>
              <div className="space-y-1">
                {status.affectedServices.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span>{s.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Error ───────────────────────────────────── */}
      {status.error && (
        <div className="text-xs text-vr-critical bg-vr-critical/10 border border-vr-critical/20 rounded-lg p-2">
          ⚠ {status.error}
        </div>
      )}

      {/* ── Settings ────────────────────────────────── */}
      <div className="border-t border-white/5 pt-4 space-y-4">

        {/* Custom exclusions */}
        <div>
          <p className="text-xs font-semibold text-white mb-0.5">Protected Apps</p>
          <p className="text-[11px] text-gray-500 mb-2">These apps will never be closed, even if they match the default target list.</p>
          <div className="flex flex-wrap gap-1.5">
            {config.customExclusions.map((name) => (
              <Chip key={name} label={name} onRemove={() => removeExclusion(name)} />
            ))}
            {config.customExclusions.length === 0 && (
              <span className="text-[11px] text-gray-600 italic">None added yet</span>
            )}
          </div>
          <TagInput onAdd={addExclusion} placeholder="e.g. myapp.exe — press Enter" />
        </div>

        {/* Custom targets */}
        <div>
          <p className="text-xs font-semibold text-white mb-0.5">Always Close in VR</p>
          <p className="text-[11px] text-gray-500 mb-2">These apps will always be closed when a VR session starts, even if not on the default list.</p>
          <div className="flex flex-wrap gap-1.5">
            {config.customTargets.map((name) => (
              <Chip key={name} label={name} onRemove={() => removeTarget(name)} />
            ))}
            {config.customTargets.length === 0 && (
              <span className="text-[11px] text-gray-600 italic">None added yet</span>
            )}
          </div>
          <TagInput onAdd={addTarget} placeholder="e.g. bloatapp.exe — press Enter" />
        </div>

        {/* Activation delay */}
        <div>
          <p className="text-xs font-semibold text-white mb-1">
            Activation Delay: <span style={{ color: 'var(--accent-text)' }}>{delayLabels[config.activationDelayMs] ?? `${config.activationDelayMs / 1000}s`}</span>
          </p>
          <p className="text-[11px] text-gray-500 mb-2">Grace period after VR is detected before closing apps.</p>
          <div className="flex gap-1.5">
            {delayOptions.map((d) => (
              <button
                key={d}
                onClick={() => updateConfig({ activationDelayMs: d })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  config.activationDelayMs === d
                    ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent-text)]'
                    : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                {delayLabels[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Stop services toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-white">Stop Windows Services</p>
            <p className="text-[11px] text-gray-500">Pause SysMain, DiagTrack, WSearch, Windows Update during VR</p>
          </div>
          <button
            onClick={() => updateConfig({ stopServices: !config.stopServices })}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
              config.stopServices ? 'bg-accent-primary' : 'bg-white/20'
            }`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
              config.stopServices ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Process & Memory Management */}
        <div className="space-y-3 pt-3 border-t border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Process &amp; Memory Management</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Boost VR Process Priority</p>
              <p className="text-[11px] text-gray-500">Elevates VRChat, vrserver, vrcompositor to High CPU priority during VR</p>
            </div>
            <button
              onClick={() => updateConfig({ boostVrPriority: !config.boostVrPriority })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.boostVrPriority ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.boostVrPriority ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Throttle Background CPU &amp; Power</p>
              <p className="text-[11px] text-gray-500">BelowNormal priority + EcoQoS — prefers E-cores on Intel 12th gen+ / AMD hybrid</p>
            </div>
            <button
              onClick={() => updateConfig({ throttleBackground: !config.throttleBackground })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.throttleBackground ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.throttleBackground ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Trim Memory Working Sets</p>
              <p className="text-[11px] text-gray-500">Reclaim RAM from idle background processes on VR start (brief disk activity on resume)</p>
            </div>
            <button
              onClick={() => updateConfig({ trimMemory: !config.trimMemory })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.trimMemory ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.trimMemory ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Force EcoQoS on Background Apps</p>
              <p className="text-[11px] text-gray-500">Routes background apps to efficiency cores, reduces their CPU power draw</p>
            </div>
            <button
              onClick={() => updateConfig({ useEcoQoS: !config.useEcoQoS })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.useEcoQoS ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.useEcoQoS ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Windows Timer & Memory Management */}
        <div className="space-y-3 pt-3 border-t border-white/5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Windows Timer &amp; Memory</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Lock Timer Resolution to 0.5ms</p>
              <p className="text-[11px] text-gray-500">Drops Windows scheduler tick from 15.6ms to 0.5ms — reduces frame jitter. Released on VR exit.</p>
            </div>
            <button
              onClick={() => updateConfig({ lockTimerResolution: !config.lockTimerResolution })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.lockTimerResolution ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.lockTimerResolution ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Periodic Standby List Flush</p>
              <p className="text-[11px] text-gray-500">Flushes Windows' standby cache every 30s when it grows large — prevents sudden mid-session stutters (ISLC-style)</p>
            </div>
            <button
              onClick={() => updateConfig({ cleanStandbyList: !config.cleanStandbyList })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                config.cleanStandbyList ? 'bg-accent-primary' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                config.cleanStandbyList ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {!config.enabled && (
        <p className="text-[11px] text-gray-600 text-center py-1">
          Enable the toggle above to start monitoring for VR sessions.
        </p>
      )}
    </div>
  )
}
