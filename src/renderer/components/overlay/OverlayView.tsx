// VR Optimization Suite — Always-on-Top Overlay View
//
// Minimal floating metrics panel rendered when the app is loaded with
// #/overlay hash. Designed to sit in a corner during VR sessions.
// Polls metrics:poll at 2 Hz — same IPC as the main Live Optimizer widget.

import React, { useEffect, useState } from 'react'

interface Snapshot {
  cpu: { usagePercent: number }
  ram: { usedGB: number; totalGB: number; usagePercent: number }
  gpu: { temperatureC: number; powerW: number; utilizationPercent: number } | null
  timestamp: number
}

function colorFor(pct: number): string {
  if (pct > 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}

export default function OverlayView(): React.ReactElement {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const api = (window as any).api as { metrics?: { poll: () => Promise<Snapshot> } }
    if (!api?.metrics?.poll) { setError(true); return }
    let cancelled = false
    const doPoll = async () => {
      try {
        const s = await api.metrics!.poll()
        if (!cancelled) { setSnap(s); setError(false) }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    doPoll()
    const id = setInterval(doPoll, 500)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div
      className="flex flex-col gap-1 p-3"
      style={{
        WebkitAppRegion: 'drag',
        height: '100vh',
        background: 'linear-gradient(135deg, rgba(10,10,20,0.88), rgba(20,15,40,0.88))',
        border: '1px solid rgba(var(--accent-rgb), 0.3)',
        borderRadius: 12,
        backdropFilter: 'blur(18px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      } as any}
    >
      <div className="flex items-center justify-between mb-1" style={{ WebkitAppRegion: 'drag' } as any}>
        <span className="text-[10px] font-semibold text-white uppercase tracking-wider">
          Vryionics
        </span>
        <button
          onClick={() => (window as any).api?.overlay?.close?.()}
          className="text-[11px] text-gray-500 hover:text-white leading-none px-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title="Close overlay"
        >
          ✕
        </button>
      </div>

      {error && <p className="text-[10px] text-red-300">Metrics unavailable</p>}

      {snap && (
        <div className="flex flex-col gap-0.5 text-[11px] font-mono tabular-nums">
          <Row label="CPU" value={`${snap.cpu.usagePercent}%`} color={colorFor(snap.cpu.usagePercent)} />
          <Row
            label="RAM"
            value={`${snap.ram.usedGB.toFixed(1)}/${snap.ram.totalGB.toFixed(0)}GB`}
            color={colorFor(snap.ram.usagePercent)}
          />
          {snap.gpu && (
            <>
              <Row
                label="GPU"
                value={`${snap.gpu.temperatureC}°C`}
                color={colorFor((snap.gpu.temperatureC / 95) * 100)}
              />
              {snap.gpu.powerW > 0 && (
                <Row label="PWR" value={`${Math.round(snap.gpu.powerW)}W`} color="#9ca3af" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
