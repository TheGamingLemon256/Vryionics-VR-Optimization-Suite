// Vryionics VR Optimization Suite — Report Comparison Modal
//
// Pick any two saved reports → side-by-side delta view of score, severity
// counts, and resolved/introduced findings. Generalises the Before/After
// pattern from Phase 1 to arbitrary historical pairs.

import React, { useMemo, useState, useEffect } from 'react'
import { computeHealthScore, type SavedReport } from '../../stores/reports-store'
import type { Finding } from '../../../main/rules/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function ReportCompareModal({ open, onClose }: Props): React.ReactElement | null {
  const [reports, setReports] = useState<SavedReport[]>([])
  const [aId, setAId] = useState<string | null>(null)
  const [bId, setBId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const api = (window as any).api?.reports
    api?.getAll().then((items: SavedReport[]) => {
      const sorted = [...(items ?? [])].sort((a, b) => b.timestamp - a.timestamp)
      setReports(sorted)
      // Default selection: most recent vs second most recent
      if (sorted.length >= 2) {
        setAId(sorted[1].id)
        setBId(sorted[0].id)
      } else if (sorted.length === 1) {
        setAId(sorted[0].id)
      }
    })
  }, [open])

  const a = reports.find((r) => r.id === aId)
  const b = reports.find((r) => r.id === bId)

  const diff = useMemo(() => {
    if (!a || !b) return null
    const aFindings = (a.findings as Finding[]) ?? []
    const bFindings = (b.findings as Finding[]) ?? []
    const aIds = new Set(aFindings.map((f) => f.result.ruleId))
    const bIds = new Set(bFindings.map((f) => f.result.ruleId))
    const resolved = aFindings.filter((f) => !bIds.has(f.result.ruleId))
    const introduced = bFindings.filter((f) => !aIds.has(f.result.ruleId))
    return {
      aScore: computeHealthScore(a),
      bScore: computeHealthScore(b),
      aCounts: { critical: a.criticalCount, warning: a.warningCount, info: a.infoCount },
      bCounts: { critical: b.criticalCount, warning: b.warningCount, info: b.infoCount },
      resolved,
      introduced,
    }
  }, [a, b])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-panel rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Compare Reports</h2>
            <p className="text-xs text-gray-500">Pick any two saved scans to see what changed.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg px-2">✕</button>
        </div>

        {reports.length < 2 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            Save at least two scans to compare them.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <ReportSelect label="Earlier" reports={reports} value={aId} onChange={setAId} />
              <ReportSelect label="Later"   reports={reports} value={bId} onChange={setBId} />
            </div>

            {diff && a && b && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <ScoreColumn label={shortDate(a.timestamp)} score={diff.aScore} counts={diff.aCounts} />
                  <DeltaColumn delta={diff.bScore - diff.aScore} />
                  <ScoreColumn label={shortDate(b.timestamp)} score={diff.bScore} counts={diff.bCounts} highlight />
                </div>

                {diff.resolved.length > 0 && (
                  <FindingDelta title={`Resolved (${diff.resolved.length})`} color="text-vr-healthy" findings={diff.resolved} />
                )}
                {diff.introduced.length > 0 && (
                  <FindingDelta title={`New since (${diff.introduced.length})`} color="text-vr-warning" findings={diff.introduced} />
                )}
                {diff.resolved.length === 0 && diff.introduced.length === 0 && (
                  <p className="text-xs text-gray-400 italic mt-3">No differences in rule findings between these two scans.</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ReportSelect({
  label, reports, value, onChange,
}: { label: string; reports: SavedReport[]; value: string | null; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
      >
        {reports.map((r) => (
          <option key={r.id} value={r.id}>
            {shortDate(r.timestamp)} · score {computeHealthScore(r)}
          </option>
        ))}
      </select>
    </div>
  )
}

function ScoreColumn({
  label, score, counts, highlight,
}: { label: string; score: number; counts: { critical: number; warning: number; info: number }; highlight?: boolean }): React.ReactElement {
  return (
    <div className={`text-center rounded-lg p-3 ${highlight ? 'bg-accent-primary/8 border border-accent-primary/20' : 'bg-white/3 border border-white/5'}`}>
      <p className="text-[10px] text-gray-500 mb-1 truncate">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${highlight ? 'text-white' : 'text-gray-400'}`}>{score}</p>
      <p className="text-[10px] text-gray-500 mt-2 font-mono">
        <span className="text-vr-critical">{counts.critical}c</span>{' · '}
        <span className="text-vr-warning">{counts.warning}w</span>{' · '}
        <span className="text-gray-500">{counts.info}i</span>
      </p>
    </div>
  )
}

function DeltaColumn({ delta }: { delta: number }): React.ReactElement {
  const color = delta > 0 ? 'text-vr-healthy' : delta < 0 ? 'text-vr-warning' : 'text-gray-400'
  return (
    <div className="flex flex-col items-center justify-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Change</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>
        {delta > 0 ? '+' : ''}{delta}
      </p>
      <p className="text-[10px] text-gray-500 mt-1">health score</p>
    </div>
  )
}

function FindingDelta({ title, color, findings }: { title: string; color: string; findings: Finding[] }): React.ReactElement {
  return (
    <div className="mb-3">
      <p className={`text-xs font-semibold mb-2 ${color}`}>{title}</p>
      <ul className="space-y-1">
        {findings.slice(0, 8).map((f) => (
          <li key={f.id} className="text-[11px] text-gray-300 leading-relaxed">
            <span className="text-gray-500">·</span> {f.result.explanation.simple}
          </li>
        ))}
        {findings.length > 8 && (
          <li className="text-[11px] text-gray-500 italic">+{findings.length - 8} more</li>
        )}
      </ul>
    </div>
  )
}

function shortDate(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
