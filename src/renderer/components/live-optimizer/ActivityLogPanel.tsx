import React, { useEffect, useState } from 'react'
import type { SessionRecord } from '../../stores/live-optimizer-store'

function formatTs(ts: number | null): string {
  if (ts == null) return 'still active'
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SessionItem({ session }: { session: SessionRecord }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const raisedCount = session.raised.length
  const loweredCount = session.lowered.length

  return (
    <li className="rounded-lg border border-white/8 bg-white/3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/5"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-white truncate">
            {session.triggerProcess}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {formatTs(session.activatedAt)} {' → '} {formatTs(session.deactivatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] text-gray-400">
            raised {raisedCount} / lowered {loweredCount}
          </span>
          <span className="text-gray-500 text-xs">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] border-t border-white/5">
          {session.raised.length > 0 && (
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] font-semibold mb-1">Raised</p>
              <ul className="space-y-0.5">
                {session.raised.map((p) => (
                  <li key={`r-${p.pid}`} className="flex justify-between text-gray-300 font-mono">
                    <span>{p.name}</span>
                    <span className="text-gray-500">pid {p.pid} {'•'} {p.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {session.lowered.length > 0 && (
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] font-semibold mb-1">Lowered</p>
              <ul className="space-y-0.5">
                {session.lowered.map((p) => (
                  <li key={`l-${p.pid}`} className="flex justify-between text-gray-300 font-mono">
                    <span>{p.name}</span>
                    <span className="text-gray-500">pid {p.pid} {'•'} prio {p.originalPriority}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {session.notes.length > 0 && (
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] font-semibold mb-1">Notes</p>
              <ul className="space-y-0.5">
                {session.notes.map((n, i) => (
                  <li key={i} className="text-amber-300/90">{n}</li>
                ))}
              </ul>
            </div>
          )}
          {session.raised.length === 0 && session.lowered.length === 0 && session.notes.length === 0 && (
            <p className="text-gray-600 italic">No process changes recorded for this session.</p>
          )}
        </div>
      )}
    </li>
  )
}

export function ActivityLogPanel(): React.ReactElement {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as unknown as { api: { liveOptimizer: { readActivityLog: () => Promise<SessionRecord[]> } } }).api
      const data = await api.liveOptimizer.readActivityLog()
      setSessions(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  if (loading && !sessions) {
    return <p className="text-xs text-gray-500">Loading activity log…</p>
  }
  if (error) {
    return <p className="text-xs text-vr-critical">Failed to load activity log: {error}</p>
  }
  if (!sessions || sessions.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No sessions recorded yet. Activity will appear here after the optimizer activates and deactivates during a VR session.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">Last {sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
        <button
          onClick={() => { void reload() }}
          className="text-[11px] text-gray-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
      <ul className="space-y-1.5">
        {sessions.map((s, i) => (
          <SessionItem key={`${s.activatedAt}-${i}`} session={s} />
        ))}
      </ul>
    </div>
  )
}
