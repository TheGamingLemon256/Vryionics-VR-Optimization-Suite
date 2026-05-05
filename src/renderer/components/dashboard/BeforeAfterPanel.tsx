// Vryionics VR Optimization Suite — Before/After Diff Panel
//
// Shown on the Dashboard whenever a `preFixSnapshot` exists in the scan
// store. Two states:
//   1. "Verify your fixes" — snapshot exists, user hasn't rescanned since
//      auto-fix completed → CTA to rescan now
//   2. "Result" — snapshot exists AND lastScanData was generated AFTER the
//      snapshot was captured → side-by-side delta view (score, severity
//      counts, finding-level diff)
//
// Dismissable. Cleared on dismiss or on next manual full rescan that the
// user opts not to compare against.

import React, { useMemo } from 'react'
import { useScanStore } from '../../stores/scan-store'
import type { Finding } from '../../../main/rules/types'

interface SeverityCounts {
  critical: number
  warning: number
  info: number
}

function countSeverities(findings: Finding[]): SeverityCounts {
  return {
    critical: findings.filter((f) => f.result.severity === 'critical').length,
    warning:  findings.filter((f) => f.result.severity === 'warning').length,
    info:     findings.filter((f) => f.result.severity === 'info').length,
  }
}

function scoreFor(findings: Finding[]): number {
  const c = countSeverities(findings)
  return Math.max(0, Math.min(100, 100 - 15 * c.critical - 5 * c.warning - 1 * c.info))
}

export function BeforeAfterPanel(): React.ReactElement | null {
  const snapshot = useScanStore((s) => s.preFixSnapshot)
  const lastScanData = useScanStore((s) => s.lastScanData)
  const currentFindings = useScanStore((s) => s.findings)
  const isScanning = useScanStore((s) => s.isScanning)
  const startScan = useScanStore((s) => s.startScan)
  const clearSnapshot = useScanStore((s) => s.clearPreFixSnapshot)

  const lastScanTimestamp = (lastScanData as { timestamp?: number } | null)?.timestamp ?? 0
  const hasFreshScan = !!snapshot && lastScanTimestamp > snapshot.capturedAt

  const diff = useMemo(() => {
    if (!snapshot || !hasFreshScan) return null
    const beforeIds = new Set(snapshot.findings.map((f) => f.result.ruleId))
    const afterIds = new Set(currentFindings.map((f) => f.result.ruleId))
    const resolved = snapshot.findings.filter((f) => !afterIds.has(f.result.ruleId))
    const introduced = currentFindings.filter((f) => !beforeIds.has(f.result.ruleId))
    const beforeCounts = countSeverities(snapshot.findings)
    const afterCounts = countSeverities(currentFindings)
    return {
      beforeScore: snapshot.score,
      afterScore: scoreFor(currentFindings),
      beforeCounts,
      afterCounts,
      resolved,
      introduced,
    }
  }, [snapshot, hasFreshScan, currentFindings])

  if (!snapshot) return null

  if (!hasFreshScan) {
    return (
      <div className="glass-panel-sm rounded-xl p-4 border border-accent-primary/30 flex items-center gap-3 flex-wrap">
        <span className="text-accent-primary text-base flex-shrink-0">✓</span>
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-white">
            {snapshot.appliedFixIds.length} fix{snapshot.appliedFixIds.length === 1 ? '' : 'es'} applied
          </p>
          <p className="text-xs text-gray-400">
            Re-scan to see the impact on your VR system health.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => startScan()}
            disabled={isScanning}
            className="glass-button btn-spring text-xs py-2 px-4 disabled:opacity-50"
          >
            {isScanning ? 'Scanning…' : 'Verify with rescan'}
          </button>
          <button
            onClick={clearSnapshot}
            className="text-xs text-gray-500 hover:text-gray-300 px-2"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  if (!diff) return null
  const scoreDelta = diff.afterScore - diff.beforeScore
  const scoreColor =
    scoreDelta > 0 ? 'text-vr-healthy'
    : scoreDelta < 0 ? 'text-vr-warning'
    : 'text-gray-400'

  return (
    <div className="glass-panel-sm rounded-xl p-5 border border-accent-primary/30">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-accent-primary uppercase tracking-widest mb-1">
            Before / After
          </p>
          <h3 className="text-base font-semibold text-white">
            {snapshot.appliedFixIds.length} fix{snapshot.appliedFixIds.length === 1 ? '' : 'es'} applied · {diff.resolved.length} issue{diff.resolved.length === 1 ? '' : 's'} resolved
          </h3>
        </div>
        <button
          onClick={clearSnapshot}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Score comparison */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <ScoreColumn label="Before" score={diff.beforeScore} counts={diff.beforeCounts} />
        <div className="flex flex-col items-center justify-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Change</p>
          <p className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
            {scoreDelta > 0 ? '+' : ''}{scoreDelta}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">health score</p>
        </div>
        <ScoreColumn label="After" score={diff.afterScore} counts={diff.afterCounts} highlight />
      </div>

      {/* Resolved findings */}
      {diff.resolved.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-vr-healthy mb-2">
            ✓ Resolved ({diff.resolved.length})
          </p>
          <ul className="space-y-1">
            {diff.resolved.slice(0, 5).map((f) => (
              <li key={f.result.ruleId} className="text-[11px] text-gray-300 leading-relaxed">
                <span className="text-gray-500">·</span> {f.result.explanation.simple}
              </li>
            ))}
            {diff.resolved.length > 5 && (
              <li className="text-[11px] text-gray-500 italic">
                +{diff.resolved.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* New findings (regressions or genuinely new) */}
      {diff.introduced.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-vr-warning mb-2">
            ⚠ New since rescan ({diff.introduced.length})
          </p>
          <ul className="space-y-1">
            {diff.introduced.slice(0, 3).map((f) => (
              <li key={f.result.ruleId} className="text-[11px] text-gray-300 leading-relaxed">
                <span className="text-gray-500">·</span> {f.result.explanation.simple}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.resolved.length === 0 && diff.introduced.length === 0 && (
        <p className="text-xs text-gray-400">
          No findings changed. The fixes ran but didn't move any of the rules-engine signals — your system was already clean on those checks, or the fix targeted something the rules engine doesn't surface.
        </p>
      )}
    </div>
  )
}

function ScoreColumn({
  label,
  score,
  counts,
  highlight,
}: {
  label: string
  score: number
  counts: SeverityCounts
  highlight?: boolean
}): React.ReactElement {
  return (
    <div className={`text-center rounded-lg p-3 ${highlight ? 'bg-accent-primary/8 border border-accent-primary/20' : 'bg-white/3 border border-white/5'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${highlight ? 'text-white' : 'text-gray-400'}`}>{score}</p>
      <p className="text-[10px] text-gray-500 mt-2 font-mono">
        <span className="text-vr-critical">{counts.critical}c</span>{' · '}
        <span className="text-vr-warning">{counts.warning}w</span>{' · '}
        <span className="text-gray-500">{counts.info}i</span>
      </p>
    </div>
  )
}
