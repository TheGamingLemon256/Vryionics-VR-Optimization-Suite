// VR Optimization Suite — Performance History Chart
//
// Lightweight SVG line chart of health-score-over-time from saved reports.
// No external chart library. Uses ResizeObserver so the viewBox tracks the
// container width in real pixels — no aspect-ratio stretching regardless of
// how wide the parent is.

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { buildHistoryPoints, type SavedReport, type HistoryPoint } from '../../stores/reports-store'

interface Props {
  reports: SavedReport[]
  /** Height in px. Width is fluid (100% of container). */
  height?: number
}

type FilterWindow = 'all' | 1 | 7 | 30

const MARGIN = { top: 20, right: 24, bottom: 32, left: 42 }

const FILTER_OPTIONS: { value: FilterWindow; label: string; full: string }[] = [
  { value: 1, label: '24h', full: 'Last 24 hours' },
  { value: 7, label: '7d', full: 'Last 7 days' },
  { value: 30, label: '30d', full: 'Last 30 days' },
  { value: 'all', label: 'All', full: 'All time' },
]

export default function PerformanceHistoryChart({ reports, height = 220 }: Props): React.ReactElement {
  const allPoints = useMemo(() => buildHistoryPoints(reports), [reports])
  const [filter, setFilter] = useState<FilterWindow>('all')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const points = useMemo(() => {
    if (filter === 'all') return allPoints
    const cutoff = Date.now() - filter * 24 * 60 * 60 * 1000
    return allPoints.filter((p) => p.timestamp >= cutoff)
  }, [allPoints, filter])

  useEffect(() => { setHoverIdx(null) }, [filter])

  return (
    <div className="glass-panel-sm rounded-xl p-4">
      <FilterBar
        filter={filter}
        onChange={setFilter}
        allPoints={allPoints}
        visibleCount={points.length}
      />

      {points.length < 2 ? (
        <div className="flex items-center justify-center text-center" style={{ minHeight: height }}>
          <div className="max-w-md">
            <p className="text-xs text-gray-500 leading-relaxed">
              {allPoints.length < 2
                ? 'Run a few scans and save them — this chart will track your VR system health over time, showing how your score changes as you apply fixes or as Windows/driver updates alter your setup.'
                : `Not enough scans in the selected window. Try a wider range — you have ${allPoints.length} saved scan${allPoints.length === 1 ? '' : 's'} total.`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ChartInternal
            points={points}
            height={height}
            hoverIdx={hoverIdx}
            onHover={setHoverIdx}
          />
          <Summary points={points} hoverIdx={hoverIdx} />
        </>
      )}
    </div>
  )
}

function FilterBar({
  filter,
  onChange,
  allPoints,
  visibleCount,
}: {
  filter: FilterWindow
  onChange: (f: FilterWindow) => void
  allPoints: HistoryPoint[]
  visibleCount: number
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
      <span className="text-[10px] text-gray-500 tabular-nums">
        {visibleCount} of {allPoints.length} scan{allPoints.length === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-1 glass-panel-sm rounded-full p-0.5">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value
          return (
            <button
              key={String(opt.value)}
              onClick={() => onChange(opt.value)}
              title={opt.full}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-colors ${
                active
                  ? 'bg-accent-primary text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tracks the container's actual pixel width via ResizeObserver. The SVG
 * viewBox is set to the real pixel dimensions so the chart renders 1:1 with
 * no horizontal stretching regardless of how wide the surrounding layout is.
 */
function useContainerWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.round(w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width]
}

function ChartInternal({
  points,
  height,
  hoverIdx,
  onHover,
}: {
  points: HistoryPoint[]
  height: number
  hoverIdx: number | null
  onHover: (i: number | null) => void
}): React.ReactElement {
  const [wrapperRef, W] = useContainerWidth()
  const H = height
  const innerW = Math.max(1, W - MARGIN.left - MARGIN.right)
  const innerH = Math.max(1, H - MARGIN.top - MARGIN.bottom)

  // Y-axis domain — always 0..100 but clamp the drawn range to leave a tiny
  // margin at the extremes so the line never overlaps the top/bottom axis.
  const yDomain = [0, 100]
  const yFor = (score: number): number => {
    const t = (score - yDomain[0]) / (yDomain[1] - yDomain[0])
    return MARGIN.top + innerH - t * innerH
  }

  const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW
  const xFor = (i: number): number => MARGIN.left + i * xStep

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.score)}`)
    .join(' ')

  const areaData =
    `M${MARGIN.left},${MARGIN.top + innerH} ` +
    points.map((p, i) => `L${xFor(i)},${yFor(p.score)}`).join(' ') +
    ` L${xFor(points.length - 1)},${MARGIN.top + innerH} Z`

  const firstDate = new Date(points[0].timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
  const lastDate = new Date(points[points.length - 1].timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
  const sameDay = firstDate === lastDate

  const yTicks = [0, 25, 50, 75, 100]

  return (
    <div ref={wrapperRef} style={{ width: '100%', height }}>
      {/* viewBox matches pixel dimensions so there is NO scaling distortion.
          preserveAspectRatio set to default 'xMidYMid meet' — but since
          viewBox equals the actual render size, meet/slice is a no-op. */}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Y-axis gridlines + labels */}
        {yTicks.map((v) => {
          const y = yFor(v)
          const isMajor = v === 0 || v === 50 || v === 100
          return (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + innerW}
                y1={y}
                y2={y}
                stroke={isMajor ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
                strokeDasharray={isMajor ? '2 4' : '1 5'}
              />
              <text
                x={MARGIN.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill={isMajor ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)'}
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Left + right axis (subtle) */}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={MARGIN.top + innerH}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
        />

        {/* X-axis date labels */}
        {sameDay ? (
          <text x={MARGIN.left + innerW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">
            {firstDate}
          </text>
        ) : (
          <>
            <text x={MARGIN.left} y={H - 8} fontSize="10" fill="rgba(255,255,255,0.5)">{firstDate}</text>
            <text x={MARGIN.left + innerW} y={H - 8} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.5)">{lastDate}</text>
          </>
        )}

        {/* Area fill under the line */}
        <path d={areaData} fill="rgba(var(--accent-rgb), 0.15)" stroke="none" />

        {/* The line itself */}
        <path
          d={pathData}
          stroke="var(--accent-primary)"
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points with hover hit-targets */}
        {points.map((p, i) => {
          const x = xFor(i)
          const y = yFor(p.score)
          const isHover = hoverIdx === i
          return (
            <g key={p.id}>
              <circle
                cx={x}
                cy={y}
                r={14}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
              />
              <circle
                cx={x}
                cy={y}
                r={isHover ? 5 : 3.5}
                fill={p.scanCondition === 'under-load' ? '#f59e0b' : 'var(--accent-primary)'}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={isHover ? 2 : 1}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Summary({
  points,
  hoverIdx,
}: {
  points: HistoryPoint[]
  hoverIdx: number | null
}): React.ReactElement {
  if (hoverIdx !== null && points[hoverIdx]) {
    const p = points[hoverIdx]
    const d = new Date(p.timestamp)
    return (
      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-300 px-1 flex-wrap gap-2">
        <span>
          {d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} —{' '}
          <span style={{ color: 'var(--accent-text)' }}>score {p.score}</span>
          {' · '}
          {p.scanCondition === 'under-load' ? 'Under load' : 'Idle'}
        </span>
        <span className="text-gray-500">
          {p.criticalCount} crit · {p.warningCount} warn · {p.infoCount} info
        </span>
      </div>
    )
  }

  const latest = points[points.length - 1]
  const earliest = points[0]
  const delta = latest.score - earliest.score
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`
  return (
    <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 px-1 flex-wrap gap-2">
      <span>
        {points.length} scan{points.length !== 1 ? 's' : ''} — latest score{' '}
        <span style={{ color: 'var(--accent-text)' }}>{latest.score}</span>
      </span>
      <span className={delta > 0 ? 'text-vr-healthy' : delta < 0 ? 'text-vr-warning' : 'text-gray-500'}>
        {delta >= 0 ? '▲' : '▼'} {deltaText} vs first scan in range
      </span>
    </div>
  )
}
