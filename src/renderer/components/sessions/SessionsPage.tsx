// Vryionics VR Optimization Suite — VR Session Recordings Page
//
// Lists every VR session the recorder captured and renders an inline
// timeline chart (CPU + GPU temp + GPU power) for the selected one. Helps
// diagnose "why was VR choppy at minute 23?" by showing what was happening
// across the whole session at the time.

import React, { useEffect, useState, useMemo } from 'react'

interface SessionSample {
  t: number
  cpu: number
  ramUsedGB: number
  gpuTempC: number | null
  gpuPowerW: number | null
  gpuUtil: number | null
  vrProcs: string[]
}

interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number | null
  status: 'recording' | 'completed' | 'crashed'
  primaryProc: string | null
  samples: SessionSample[]
}

interface SessionListItem {
  id: string
  startedAt: number
  endedAt: number | null
  status: string
  primaryProc: string | null
  sampleCount: number
  durationSec: number
}

interface ActiveSummary {
  id: string
  startedAt: number
  primaryProc: string | null
  sampleCount: number
}

export default function SessionsPage(): React.ReactElement {
  const [list, setList] = useState<SessionListItem[]>([])
  const [active, setActive] = useState<ActiveSummary | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SessionRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async (): Promise<void> => {
    const api = (window as any).api?.sessions
    if (!api) return
    const [items, act] = await Promise.all([api.list(), api.active()])
    setList(items)
    setActive(act)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const api = (window as any).api?.sessions
    const unsub = api?.onState((s: ActiveSummary | null) => {
      setActive(s)
      // Refresh list when a session ends so it appears
      if (!s) refresh()
    })
    const intervalId = setInterval(refresh, 5_000)
    return () => { unsub?.(); clearInterval(intervalId) }
  }, [])

  // Auto-load the most recent session on mount
  useEffect(() => {
    if (selectedId === null && list.length > 0) {
      setSelectedId(list[0].id)
    }
  }, [list, selectedId])

  useEffect(() => {
    if (!selectedId) { setSelected(null); return }
    const api = (window as any).api?.sessions
    api?.get(selectedId).then((r: SessionRecord | null) => setSelected(r))
  }, [selectedId])

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('Delete this session recording?')) return
    await (window as any).api.sessions.delete(id)
    if (selectedId === id) setSelectedId(null)
    refresh()
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">VR Sessions</h1>
        <p className="text-sm text-gray-400 mt-1">
          {active
            ? `Recording in progress: ${active.primaryProc ?? 'VR session'} · ${active.sampleCount} samples`
            : 'Hardware metrics recorded automatically while VR is running. Use these to diagnose stutter, throttling, and background interference.'}
        </p>
      </div>

      {loading && <div className="text-xs text-gray-500">Loading sessions…</div>}

      {!loading && list.length === 0 && !active && (
        <div className="glass-panel-sm rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">
            No VR sessions recorded yet. Launch SteamVR, the Oculus app, Virtual Desktop, or VRChat — recording starts automatically.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Session list */}
        <div className="space-y-2">
          {active && (
            <div className="glass-panel-sm rounded-lg p-3 border border-vr-healthy/30 animate-pulse-subtle">
              <p className="text-[10px] text-vr-healthy uppercase tracking-widest font-semibold mb-1">● Recording</p>
              <p className="text-sm font-semibold text-white">{active.primaryProc ?? 'VR session'}</p>
              <p className="text-[10px] text-gray-500 font-mono">
                {fmtDuration((Date.now() - active.startedAt) / 1000)} · {active.sampleCount} samples
              </p>
            </div>
          )}
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left glass-panel-sm rounded-lg p-3 transition-colors ${
                selectedId === s.id ? 'border border-accent-primary/50' : 'border border-transparent hover:border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-white truncate">{s.primaryProc ?? 'VR session'}</p>
                {s.status === 'crashed' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-vr-warning/20 text-vr-warning border border-vr-warning/30">crashed</span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 font-mono">
                {new Date(s.startedAt).toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-500 font-mono">
                {fmtDuration(s.durationSec)} · {s.sampleCount} samples
              </p>
            </button>
          ))}
        </div>

        {/* Selected session detail */}
        <div>
          {selected ? (
            <SessionDetail record={selected} onDelete={() => handleDelete(selected.id)} />
          ) : (
            <div className="glass-panel-sm rounded-xl p-8 text-center text-xs text-gray-500">
              Select a session to inspect its timeline.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m - h * 60}m`
}


function SessionDetail({ record, onDelete }: { record: SessionRecord; onDelete: () => void }): React.ReactElement {
  const stats = useMemo(() => {
    const samples = record.samples
    if (samples.length === 0) return null
    const cpus = samples.map((s) => s.cpu)
    const temps = samples.map((s) => s.gpuTempC).filter((v): v is number => v != null)
    const powers = samples.map((s) => s.gpuPowerW).filter((v): v is number => v != null)
    return {
      avgCpu: Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length),
      maxCpu: Math.max(...cpus),
      avgGpuTemp: temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
      maxGpuTemp: temps.length ? Math.max(...temps) : null,
      avgGpuPower: powers.length ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null,
      thermalEvents: temps.filter((t) => t > 85).length,
    }
  }, [record])

  return (
    <div className="glass-panel-sm rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-accent-primary uppercase tracking-widest">
            {record.status === 'crashed' ? 'Crashed Session' : 'Session'}
          </p>
          <h3 className="text-base font-bold text-white">{record.primaryProc ?? 'VR session'}</h3>
          <p className="text-[11px] text-gray-500 font-mono">
            {new Date(record.startedAt).toLocaleString()} · {record.samples.length} samples
          </p>
        </div>
        <button
          onClick={onDelete}
          className="text-[11px] text-gray-500 hover:text-vr-critical px-2 py-1"
        >
          Delete
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Avg CPU" value={`${stats.avgCpu}%`} color={stats.avgCpu > 80 ? 'text-vr-warning' : 'text-white'} />
          <Stat label="Max CPU" value={`${stats.maxCpu}%`} color={stats.maxCpu > 95 ? 'text-vr-critical' : 'text-white'} />
          {stats.avgGpuTemp != null && (
            <Stat label="Avg GPU°C" value={`${stats.avgGpuTemp}°`} color={stats.avgGpuTemp > 80 ? 'text-vr-warning' : 'text-white'} />
          )}
          {stats.maxGpuTemp != null && (
            <Stat
              label="Max GPU°C"
              value={`${stats.maxGpuTemp}°`}
              color={stats.maxGpuTemp > 90 ? 'text-vr-critical' : stats.maxGpuTemp > 85 ? 'text-vr-warning' : 'text-white'}
            />
          )}
        </div>
      )}

      {stats && stats.thermalEvents > 5 && (
        <div className="glass-panel-sm rounded-lg p-3 border border-vr-warning/30 text-xs text-vr-warning">
          ⚠ Thermal warning: GPU exceeded 85°C for {stats.thermalEvents} samples — likely cause of stutter at those timestamps. Consider improving case airflow or undervolting.
        </div>
      )}

      <SessionChart samples={record.samples} />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }): React.ReactElement {
  return (
    <div className="bg-white/3 rounded-lg p-2 text-center">
      <p className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  )
}

// Compact SVG chart — three overlaid line series (CPU%, GPU°C, GPU power W)
function SessionChart({ samples }: { samples: SessionSample[] }): React.ReactElement {
  if (samples.length < 2) {
    return (
      <div className="glass-panel-sm rounded-lg p-6 text-center text-xs text-gray-500">
        Not enough samples to chart.
      </div>
    )
  }
  const W = 800, H = 200, MARG = { top: 10, right: 10, bottom: 24, left: 32 }
  const innerW = W - MARG.left - MARG.right
  const innerH = H - MARG.top - MARG.bottom
  const tMax = samples[samples.length - 1].t
  const x = (t: number): number => MARG.left + (t / tMax) * innerW
  const y100 = (v: number): number => MARG.top + innerH - (v / 100) * innerH

  // CPU% (0-100)
  const cpuPath = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t)},${y100(s.cpu)}`).join(' ')
  // GPU temp — normalise 30-95°C to 0-100
  const tempPath = samples
    .map((s, i) => {
      if (s.gpuTempC == null) return ''
      const norm = Math.max(0, Math.min(100, ((s.gpuTempC - 30) / 65) * 100))
      return `${i === 0 ? 'M' : 'L'}${x(s.t)},${y100(norm)}`
    })
    .filter(Boolean)
    .join(' ')
  // GPU power — normalise 0-450W to 0-100
  const powerPath = samples
    .map((s, i) => {
      if (s.gpuPowerW == null) return ''
      const norm = Math.max(0, Math.min(100, (s.gpuPowerW / 450) * 100))
      return `${i === 0 ? 'M' : 'L'}${x(s.t)},${y100(norm)}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div className="flex items-center gap-4 text-[10px] text-gray-400 mb-2 flex-wrap">
        <span><span className="inline-block w-3 h-0.5 bg-accent-primary mr-1 align-middle" />CPU%</span>
        <span><span className="inline-block w-3 h-0.5 bg-vr-warning mr-1 align-middle" />GPU°C (30–95 norm.)</span>
        <span><span className="inline-block w-3 h-0.5 bg-vr-healthy mr-1 align-middle" />GPU W (0–450 norm.)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={MARG.left} x2={MARG.left + innerW} y1={y100(v)} y2={y100(v)}
              stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <text x={MARG.left - 6} y={y100(v) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)">{v}</text>
          </g>
        ))}
        <text x={MARG.left} y={H - 6} fontSize="9" fill="rgba(255,255,255,0.4)">0s</text>
        <text x={MARG.left + innerW} y={H - 6} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)">{Math.round(tMax)}s</text>
        <path d={cpuPath} stroke="var(--accent-primary)" strokeWidth="1.5" fill="none" />
        {tempPath && <path d={tempPath} stroke="#f59e0b" strokeWidth="1.5" fill="none" />}
        {powerPath && <path d={powerPath} stroke="#10b981" strokeWidth="1.5" fill="none" />}
      </svg>
    </div>
  )
}
