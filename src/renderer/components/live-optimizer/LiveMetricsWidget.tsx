// Polls GPU temp/power, CPU%, RAM via metrics:poll every 3s.

import React, { useEffect, useRef, useState } from 'react'


export interface MetricsSnapshot {
  cpu: { usagePercent: number }
  ram: { usedGB: number; totalGB: number; usagePercent: number }
  gpu: { temperatureC: number; powerW: number; utilizationPercent: number } | null
  timestamp: number
}


const POLL_INTERVAL_MS = 3_000
const FRESH_THRESHOLD_MS = 5_000

/**
 * Return a Tailwind text-color class based on a 0-100 percentage value.
 * >90 → critical, 70-90 → warning, <70 → healthy
 */
function usageColor(pct: number): string {
  if (pct > 90) return 'text-vr-critical'
  if (pct >= 70) return 'text-vr-warning'
  return 'text-vr-healthy'
}


function SkeletonPill(): React.ReactElement {
  return (
    <span className="inline-block w-16 h-4 rounded bg-white/10 animate-pulse" />
  )
}


function MetricSegment({
  label,
  value,
  colorClass,
  loading,
}: {
  label: string
  value: string
  colorClass: string
  loading: boolean
}): React.ReactElement {
  return (
    <span className="flex items-center gap-1">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      {loading ? (
        <SkeletonPill />
      ) : (
        <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>{value}</span>
      )}
    </span>
  )
}


function LiveBadge({ fresh, stale }: { fresh: boolean; stale: boolean }): React.ReactElement {
  if (stale) {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-white/10 text-gray-600 bg-white/5">
        Stale
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <span
        className={`w-1.5 h-1.5 rounded-full bg-vr-healthy flex-shrink-0 ${fresh ? 'animate-pulse' : ''}`}
      />
      <span className="text-[9px] font-semibold text-vr-healthy uppercase tracking-wide">Live</span>
    </span>
  )
}


interface LiveMetricsWidgetProps {
  /** When true the interval is stopped and cleared. */
  active: boolean
}

export default function LiveMetricsWidget({ active }: LiveMetricsWidgetProps): React.ReactElement {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null)
  const [error, setError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const api = (window as any).api as { metrics?: { poll: () => Promise<MetricsSnapshot> } }

    // Guard: preload may not have the metrics API in older builds
    if (!api?.metrics?.poll) return

    const doPoll = async (): Promise<void> => {
      try {
        const snap = await api.metrics!.poll()
        setSnapshot(snap)
        setError(false)
      } catch {
        setError(true)
      }
    }

    // Fire immediately then repeat
    doPoll()
    intervalRef.current = setInterval(doPoll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [active])

  const loading = snapshot === null && !error
  const isStale = error && snapshot !== null
  const isFresh = !error && snapshot !== null && Date.now() - snapshot.timestamp < FRESH_THRESHOLD_MS

  const cpuPct = snapshot?.cpu.usagePercent ?? 0
  const ramPct = snapshot?.ram.usagePercent ?? 0

  return (
    <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        {/* CPU */}
        <MetricSegment
          label="CPU"
          value={`${cpuPct}%`}
          colorClass={usageColor(cpuPct)}
          loading={loading}
        />

        <span className="text-white/15 select-none">|</span>

        {/* RAM */}
        <MetricSegment
          label="RAM"
          value={
            snapshot
              ? `${snapshot.ram.usedGB.toFixed(1)}/${snapshot.ram.totalGB.toFixed(0)} GB`
              : '— GB'
          }
          colorClass={usageColor(ramPct)}
          loading={loading}
        />

        {/* GPU — only rendered when data is present */}
        {(loading || snapshot?.gpu) && (
          <>
            <span className="text-white/15 select-none">|</span>

            {/* GPU Temp */}
            <MetricSegment
              label="GPU"
              value={snapshot?.gpu ? `${snapshot.gpu.temperatureC}°C` : '—'}
              colorClass={snapshot?.gpu ? usageColor((snapshot.gpu.temperatureC / 100) * 100) : 'text-gray-500'}
              loading={loading}
            />

            {/* GPU Power — only when nonzero */}
            {(loading || (snapshot?.gpu && snapshot.gpu.powerW > 0)) && (
              <MetricSegment
                label="PWR"
                value={snapshot?.gpu ? `${Math.round(snapshot.gpu.powerW)}W` : '—'}
                colorClass="text-gray-300"
                loading={loading}
              />
            )}
          </>
        )}
      </div>

      {!loading && (
        <LiveBadge fresh={isFresh} stale={isStale} />
      )}
    </div>
  )
}
