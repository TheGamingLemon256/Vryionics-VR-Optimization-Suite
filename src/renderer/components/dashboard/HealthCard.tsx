import React, { useState } from 'react'
import { useAppStore } from '../../stores/app-store'
import { useFixStore } from '../../stores/fix-store'
import { Modal } from '../shared/Modal'
import type { HealthCardData, HealthStatus } from '../../../main/rules/types'

// ── Status Colors ────────────────────────────────────────────

const STATUS_CONFIG: Record<HealthStatus, { dot: string; border: string; glow: string; label: string }> = {
  healthy: {
    dot: 'bg-vr-healthy',
    border: 'border-vr-healthy/30',
    glow: 'shadow-vr-healthy/20',
    label: 'OK'
  },
  warning: {
    dot: 'bg-vr-warning',
    border: 'border-vr-warning/30',
    glow: 'shadow-vr-warning/20',
    label: 'Issues'
  },
  critical: {
    dot: 'bg-vr-critical',
    border: 'border-vr-critical/30',
    glow: 'shadow-vr-critical/20',
    label: 'Critical'
  },
  scanning: {
    dot: 'bg-vr-scanning animate-pulse',
    border: 'border-vr-scanning/30',
    glow: 'shadow-vr-scanning/20',
    label: 'Scanning'
  },
  unknown: {
    dot: 'bg-gray-500',
    border: 'border-white/10',
    glow: 'shadow-black/20',
    label: 'Unknown'
  },
  error: {
    dot: 'bg-vr-critical',
    border: 'border-vr-critical/30',
    glow: 'shadow-vr-critical/20',
    label: 'Error'
  }
}

const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴',
  warning: '🟡',
  info: 'ℹ️',
  ok: '✅'
}

interface HealthCardProps {
  card: HealthCardData
  animDelay?: number
}

export function HealthCard({ card, animDelay = 0 }: HealthCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [fixModal, setFixModal] = useState<{ fixId: string; preview: Record<string, unknown> | null } | null>(null)
  const [fixApplying, setFixApplying] = useState(false)
  const [fixResult, setFixResult] = useState<{ success: boolean; error?: string } | null>(null)
  const advancedMode = useAppStore((s) => s.advancedMode)
  const { applyFix, appliedFixes } = useFixStore()
  const handleFixClick = async (fixId: string) => {
    setFixResult(null)
    const api = (window as any).api
    const preview = await api.fix.preview(fixId).catch(() => null)
    setFixModal({ fixId, preview })
  }

  const handleApplyFix = async () => {
    if (!fixModal) return
    setFixApplying(true)
    const result = await applyFix(fixModal.fixId)
    setFixApplying(false)
    setFixResult(result)
    if (result.success) {
      setTimeout(() => setFixModal(null), 1200)
    }
  }

  const config = STATUS_CONFIG[card.status]
  const issueCount = card.counts.critical + card.counts.warning
  const delayClass = animDelay > 0 ? `panel-animate-delay-${Math.min(animDelay, 4)}` : ''

  return (
    <>
    <Modal
      open={!!fixModal}
      onClose={() => { setFixModal(null); setFixResult(null) }}
      title={fixModal?.preview ? (fixModal.preview as any).name : 'Fix Preview'}
      footer={
        fixResult ? (
          <span className={`text-xs font-medium ${fixResult.success ? 'text-vr-healthy' : 'text-vr-critical'}`}>
            {fixResult.success ? '✓ Applied successfully' : `✗ ${fixResult.error}`}
          </span>
        ) : (
          <>
            <button className="glass-button-danger btn-spring px-4 py-2 text-xs" onClick={() => setFixModal(null)}>Cancel</button>
            <button
              className="glass-button btn-spring px-4 py-2 text-xs font-semibold"
              onClick={handleApplyFix}
              disabled={fixApplying}
            >
              {fixApplying ? 'Applying…' : '🔧 Apply Fix'}
            </button>
          </>
        )
      }
    >
      {fixModal?.preview ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{(fixModal.preview as any).description}</p>
          <div className="space-y-2">
            {((fixModal.preview as any).changes ?? []).map((c: any, i: number) => (
              <div key={i} className="glass-panel-sm p-3 rounded-lg space-y-1">
                <p className="text-[10px] text-gray-500 font-mono truncate">{c.target}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-vr-critical line-through opacity-60 truncate">{c.currentValue}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-vr-healthy truncate">{c.newValue}</span>
                </div>
              </div>
            ))}
          </div>
          {(fixModal.preview as any).requiresAdmin && (
            <p className="text-[10px] text-vr-warning">⚠ Requires administrator privileges</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Loading preview…</p>
      )}
    </Modal>

    <div
      className={`glass-panel-sm border ${config.border} shadow-lg ${config.glow} transition-all duration-200 hover-lift panel-animate ${delayClass} cursor-pointer`}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* ── Collapsed Header ─────────────────────── */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
            <h3 className="text-sm font-semibold text-white/90">{card.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${
              card.status === 'critical' ? 'text-vr-critical' :
              card.status === 'warning' ? 'text-vr-warning' :
              card.status === 'healthy' ? 'text-vr-healthy' : 'text-gray-400'
            }`}>
              {issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? 's' : ''}` : config.label}
            </span>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {card.summary && (
          <p className="text-xs text-gray-300 font-medium mb-1 truncate">{card.summary}</p>
        )}
        {card.quickStats && (
          <p className="text-xs text-gray-500">{card.quickStats}</p>
        )}
      </div>

      {/* ── Expanded Content ──────────────────────── */}
      {expanded && (
        <div
          className="border-t border-white/5 p-4 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {card.status === 'error' ? (
            <p className="text-xs text-vr-critical">
              Could not scan this category. Check the console for details.
            </p>
          ) : card.findings.length === 0 ? (
            <div className="flex items-center gap-2 text-vr-healthy">
              <span>✓</span>
              <p className="text-xs">No issues detected in this category.</p>
            </div>
          ) : advancedMode ? (
            <AdvancedExpansion card={card} onFixClick={handleFixClick} appliedFixes={appliedFixes} />
          ) : (
            <SimpleExpansion card={card} onFixClick={handleFixClick} appliedFixes={appliedFixes} />
          )}

          {/* Raw metrics table — always shown when data is available */}
          {card.rawData && card.rawData.length > 0 && (
            <RawMetricsTable rows={card.rawData} showHeader={card.findings.length > 0} />
          )}
        </div>
      )}
    </div>
    </>
  )
}

// ── Simple Mode Expansion ─────────────────────────────────────

function SimpleExpansion({ card, onFixClick, appliedFixes }: {
  card: HealthCardData
  onFixClick: (fixId: string) => void
  appliedFixes: Set<string>
}): React.ReactElement {
  const important = card.findings.filter(
    (f) => f.result.severity === 'critical' || f.result.severity === 'warning'
  )

  return (
    <div className="space-y-3">
      {important.map((finding) => {
        const fixId = finding.result.fixId
        const isFixed = fixId ? appliedFixes.has(fixId) : false
        return (
          <div key={finding.id} className="space-y-1">
            <div className="flex items-start gap-2">
              <span className="text-sm mt-0.5">{SEVERITY_ICONS[finding.result.severity]}</span>
              <div>
                <p className="text-xs text-gray-200 leading-relaxed">
                  {finding.result.explanation.simple}
                </p>
                {finding.fixAvailable && fixId && (
                  isFixed ? (
                    <span className="mt-2 text-xs text-vr-fixed inline-flex items-center gap-1">✓ Fixed</span>
                  ) : (
                    <button
                      className="mt-2 text-xs text-accent-primary hover:underline"
                      onClick={() => onFixClick(fixId)}
                    >
                      🔧 Fix this →
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )
      })}
      {card.findings.length > important.length && (
        <p className="text-xs text-gray-500 mt-2">
          + {card.findings.length - important.length} informational finding(s)
        </p>
      )}
    </div>
  )
}

// ── Raw Metrics Table ─────────────────────────────────────────

function RawMetricsTable({ rows, showHeader }: {
  rows: Array<{ label: string; value: string }>
  showHeader: boolean
}): React.ReactElement {
  return (
    <div>
      {showHeader && (
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Raw Data</p>
      )}
      <div className="grid grid-cols-1 gap-0.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-0.5">
            <span className="text-[11px] text-gray-500 shrink-0">{row.label}</span>
            <span className="text-[11px] text-gray-300 font-mono text-right break-all">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Advanced Mode Expansion ───────────────────────────────────

function AdvancedExpansion({ card, onFixClick, appliedFixes }: {
  card: HealthCardData
  onFixClick: (fixId: string) => void
  appliedFixes: Set<string>
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {card.findings.map((finding) => {
        const fixId = finding.result.fixId
        const isFixed = fixId ? appliedFixes.has(fixId) : false
        return (
          <div
            key={finding.id}
            className={`p-3 rounded-lg border ${
              finding.result.severity === 'critical' ? 'bg-vr-critical/5 border-vr-critical/20' :
              finding.result.severity === 'warning' ? 'bg-vr-warning/5 border-vr-warning/20' :
              'bg-white/3 border-white/5'
            }`}
          >
            <div className="flex items-start gap-2 mb-1.5">
              <span className="text-sm">{SEVERITY_ICONS[finding.result.severity]}</span>
              <span className={`text-xs font-semibold uppercase tracking-wide ${
                finding.result.severity === 'critical' ? 'text-vr-critical' :
                finding.result.severity === 'warning' ? 'text-vr-warning' : 'text-gray-400'
              }`}>
                {finding.result.severity}
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
              {finding.result.explanation.advanced}
            </p>
            {finding.fixAvailable && fixId && (
              isFixed ? (
                <span className="mt-2 text-xs text-vr-fixed inline-flex items-center gap-1.5">✓ Fix applied</span>
              ) : (
                <button
                  className="mt-2 text-xs text-accent-primary hover:underline"
                  onClick={() => onFixClick(fixId)}
                >
                  🔧 Apply Fix
                </button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
