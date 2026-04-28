// VR Optimization Suite — Executive Summary / Action Plan
// Translates the action plan built by summary-engine.ts into a
// prioritized, step-by-step UI the user can work through.

import React, { useState, useCallback, useRef } from 'react'
import { useScanStore } from '../../stores/scan-store'
import { useAppStore } from '../../stores/app-store'
import { useFixStore } from '../../stores/fix-store'
import type { ActionPlan, ActionStep, ActionImpact, ActionEffort } from '../../../main/rules/types'
import AutoFixModal from './AutoFixModal'
import { OrbitalLoader } from '../shared/OrbitalLoader'
import { VmscPromoCard } from '../shared/PromoCards'

// ── Step type icon + label ────────────────────────────────────

const STEP_ICONS: Record<NonNullable<ActionStep['type']>, string> = {
  do:      '▸',
  open:    '⊞',
  setting: '⚙',
  install: '⬇',
  reboot:  '↺',
  info:    'ℹ'
}

const STEP_COLORS: Record<NonNullable<ActionStep['type']>, string> = {
  do:      'text-blue-300',
  open:    'text-purple-300',
  setting: 'text-yellow-300',
  install: 'text-green-300',
  reboot:  'text-orange-300',
  info:    'text-gray-400'
}

// ── Impact badge ─────────────────────────────────────────────

const IMPACT_COLORS: Record<ActionImpact, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
  medium:   'bg-teal-500/20 text-teal-300 border-teal-500/30',
  low:      'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

const IMPACT_LABELS: Record<ActionImpact, string> = {
  critical: 'Critical Impact',
  high:     'High Impact',
  medium:   'Medium Impact',
  low:      'Low Impact'
}

// ── Effort badge ─────────────────────────────────────────────

const EFFORT_COLORS: Record<ActionEffort, string> = {
  instant:  'bg-green-500/20 text-green-300 border-green-500/30',
  minutes:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  hours:    'bg-purple-500/20 text-purple-300 border-purple-500/30',
  research: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

const EFFORT_LABELS: Record<ActionEffort, string> = {
  instant:  '⚡ Instant',
  minutes:  '⏱ Minutes',
  hours:    '🔧 Hours',
  research: '🔍 Research'
}

// ── Priority badge colour ─────────────────────────────────────

function priorityColor(n: number): string {
  if (n === 1) return 'bg-red-500 text-white'
  if (n === 2) return 'bg-amber-500 text-black'
  if (n <= 4)  return 'bg-blue-500/80 text-white'
  return 'bg-gray-600 text-gray-200'
}

// ── Fix change (matches engine's FixChange) ───────────────────

interface FixChange {
  target: string
  currentValue: string
  newValue: string
}

interface FixPreview {
  fixId: string
  name: string
  description: string
  changes: FixChange[]
  requiresAdmin: boolean
  requiresReboot: boolean
  error?: string
}

// ── Per-card fix button state machine ─────────────────────────

type CardFixPhase = 'idle' | 'previewing' | 'confirming' | 'applying' | 'success' | 'failed' | 'undoing' | 'undone'

function isEmptyBloatPreview(preview: FixPreview): boolean {
  return (
    preview.fixId === 'fix-disable-startup-bloat' &&
    preview.changes.length === 1 &&
    preview.changes[0].currentValue.toLowerCase().includes('no known bloat')
  )
}

// ── Single action plan card ───────────────────────────────────

interface ActionCardProps {
  plan: ActionPlan
  index: number
}

function ActionCard({ plan, index }: ActionCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(index === 0) // first card open by default
  const [fixPhase, setFixPhase] = useState<CardFixPhase>('idle')
  const [preview, setPreview] = useState<FixPreview | null>(null)
  const [fixError, setFixError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const { markFixed } = useFixStore()

  const api = (window as any).api

  // Step 1: Load preview and enter confirmation panel
  const handleClickFix = useCallback(async () => {
    if (!plan.fixId) return
    cancelledRef.current = false
    setFixPhase('previewing')
    setFixError(null)
    try {
      const p: FixPreview = await api.fix.preview(plan.fixId)
      if (cancelledRef.current) return
      if (p.error) {
        setFixError(p.error)
        setFixPhase('failed')
        return
      }
      setPreview(p)
      setFixPhase('confirming')
    } catch (err) {
      if (!cancelledRef.current) {
        setFixError((err as Error)?.message ?? 'Failed to load preview')
        setFixPhase('failed')
      }
    }
  }, [plan.fixId])

  // Step 2: Actually apply after user confirms
  const handleConfirmApply = useCallback(async () => {
    if (!plan.fixId) return
    setFixPhase('applying')
    setFixError(null)
    try {
      const result = await api.fix.apply(plan.fixId)
      if (result.success) {
        setFixPhase('success')
        markFixed(plan.fixId)  // keep fix-store in sync so visiblePlans filters this card out
      } else {
        setFixError(result.error ?? 'Fix returned failure')
        setFixPhase('failed')
      }
    } catch (err) {
      setFixError((err as Error)?.message ?? 'Unexpected error')
      setFixPhase('failed')
    }
  }, [plan.fixId])

  // Undo previously applied fix
  const handleUndo = useCallback(async () => {
    if (!plan.fixId) return
    setFixPhase('undoing')
    try {
      const result = await api.fix.undo(plan.fixId)
      setFixPhase(result.success ? 'undone' : 'failed')
      if (!result.success) setFixError(result.error ?? 'Undo failed')
    } catch (err) {
      setFixError((err as Error)?.message ?? 'Unexpected error')
      setFixPhase('failed')
    }
  }, [plan.fixId])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    setFixPhase('idle')
    setPreview(null)
    setFixError(null)
  }, [])

  const handleReset = useCallback(() => {
    setFixPhase('idle')
    setPreview(null)
    setFixError(null)
  }, [])

  // Derived
  const isEmpty = preview ? isEmptyBloatPreview(preview) : false

  return (
    <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">
      {/* Card header */}
      <button
        className="w-full flex items-start gap-4 p-4 text-left hover:bg-white/3 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Priority badge */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${priorityColor(plan.priority)}`}
        >
          {plan.priority}
        </div>

        {/* Title + summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{plan.title}</span>
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              {plan.category}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{plan.summary}</p>
        </div>

        {/* Right side: badges + chevron */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_COLORS[plan.impact]}`}>
              {IMPACT_LABELS[plan.impact]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${EFFORT_COLORS[plan.effort]}`}>
              {EFFORT_LABELS[plan.effort]}
            </span>
          </div>
          <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-glass-border px-4 pb-4 pt-3">
          {/* Expected gain */}
          <div className="bg-white/3 rounded-lg px-3 py-2 mb-3 border border-white/8">
            <p className="text-xs text-gray-300">
              <span className="text-green-400 font-semibold mr-1">Expected gain:</span>
              {plan.expectedGain}
            </p>
          </div>

          {/* Steps */}
          <ol className="space-y-2">
            {plan.steps.map((s, i) => {
              const type = s.type ?? 'do'
              const icon = STEP_ICONS[type]
              const iconColor = STEP_COLORS[type]
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={`flex-shrink-0 w-5 text-center text-sm mt-0.5 font-bold ${iconColor}`}>
                    {icon}
                  </span>
                  <span className="text-xs text-gray-300 leading-relaxed">{s.text}</span>
                </li>
              )
            })}
          </ol>

          {/* One-click fix area */}
          {plan.fixId && (
            <div className="mt-4 space-y-2">

              {/* Idle: show the trigger button */}
              {fixPhase === 'idle' && (
                <button
                  onClick={handleClickFix}
                  className="w-full py-2 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/30 transition-colors"
                >
                  ⚡ Apply Fix Automatically
                </button>
              )}

              {/* Previewing: loading spinner */}
              {fixPhase === 'previewing' && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/3 border border-white/8">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
                  <span className="text-xs text-gray-400">Loading preview…</span>
                  <button onClick={handleCancel} className="ml-auto text-xs text-gray-600 hover:text-gray-400">Cancel</button>
                </div>
              )}

              {/* Confirming: preview panel with changes table */}
              {fixPhase === 'confirming' && preview && (
                <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
                  {/* Preview header */}
                  <div className="px-3 py-2 border-b border-white/6 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{preview.name}</span>
                    {preview.requiresAdmin && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                        🔒 Requires Admin
                      </span>
                    )}
                    {preview.requiresReboot && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
                        🔄 Reboot Required
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-gray-400 px-3 pt-2 pb-1">{preview.description}</p>

                  {/* Changes table */}
                  <div className="px-3 pb-2 space-y-1.5">
                    {isEmpty ? (
                      <div className="text-[11px] text-gray-500 italic py-1">
                        {preview.changes[0].currentValue}
                      </div>
                    ) : (
                      preview.changes.map((c, i) => (
                        <div key={i} className="bg-black/30 rounded p-2 text-[11px] space-y-1">
                          <p className="text-gray-500 font-mono truncate">{c.target}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 line-through truncate max-w-[40%]">{c.currentValue}</span>
                            <span className="text-gray-600">→</span>
                            <span className="text-vr-healthy truncate">{c.newValue}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Confirm / Cancel */}
                  <div className="flex gap-2 px-3 pb-3">
                    {!isEmpty ? (
                      <button
                        onClick={handleConfirmApply}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)]/25 border border-[var(--accent)]/45 text-[var(--accent)] hover:bg-[var(--accent)]/35 transition-colors"
                      >
                        ✓ Confirm & Apply
                      </button>
                    ) : (
                      <div className="flex-1" />
                    )}
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Applying: spinner */}
              {fixPhase === 'applying' && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/3 border border-white/8">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
                  <span className="text-xs text-gray-400">Applying fix…</span>
                </div>
              )}

              {/* Success */}
              {fixPhase === 'success' && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-vr-healthy/10 border border-vr-healthy/25">
                  <span className="text-vr-healthy text-sm">✅</span>
                  <span className="text-xs text-vr-healthy font-medium flex-1">Fix applied successfully</span>
                  {preview?.requiresReboot && (
                    <span className="text-[10px] text-blue-300 bg-blue-500/15 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
                      🔄 Reboot to take effect
                    </span>
                  )}
                  <button
                    onClick={handleUndo}
                    className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
                  >
                    Undo
                  </button>
                </div>
              )}

              {/* Undoing */}
              {fixPhase === 'undoing' && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/3 border border-white/8">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
                  <span className="text-xs text-gray-400">Undoing fix…</span>
                </div>
              )}

              {/* Undone */}
              {fixPhase === 'undone' && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-gray-500/10 border border-gray-500/25">
                  <span className="text-gray-400 text-sm">↩</span>
                  <span className="text-xs text-gray-400 flex-1">Fix undone — settings restored</span>
                  <button onClick={handleReset} className="text-[11px] text-gray-600 hover:text-gray-300 transition-colors">Dismiss</button>
                </div>
              )}

              {/* Failed */}
              {fixPhase === 'failed' && (
                <div className="rounded-lg bg-vr-critical/10 border border-vr-critical/25 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-vr-critical text-sm">❌</span>
                    <span className="text-xs text-vr-critical font-medium flex-1">
                      {fixError ?? 'Fix failed'}
                    </span>
                    <button onClick={handleReset} className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">Dismiss</button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Overview stats row ────────────────────────────────────────

interface OverviewProps {
  plans: ActionPlan[]
}

function OverviewBar({ plans }: OverviewProps): React.ReactElement {
  const criticalCount = plans.filter((p) => p.impact === 'critical').length
  const highCount     = plans.filter((p) => p.impact === 'high').length
  const instantCount  = plans.filter((p) => p.effort === 'instant').length

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="glass-panel rounded-xl p-3 border border-glass-border text-center">
        <div className={`text-2xl font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {criticalCount}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Critical issues</div>
      </div>
      <div className="glass-panel rounded-xl p-3 border border-glass-border text-center">
        <div className={`text-2xl font-bold ${highCount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
          {highCount}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">High impact fixes</div>
      </div>
      <div className="glass-panel rounded-xl p-3 border border-glass-border text-center">
        <div className={`text-2xl font-bold ${instantCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>
          {instantCount}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Instant wins</div>
      </div>
    </div>
  )
}

// ── Category filter pills ─────────────────────────────────────

interface FilterBarProps {
  categories: string[]
  selected: string | null
  onSelect: (cat: string | null) => void
}

function FilterBar({ categories, selected, onSelect }: FilterBarProps): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      <button
        onClick={() => onSelect(null)}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
          selected === null
            ? 'bg-[var(--accent)]/30 text-[var(--accent)] border-[var(--accent)]/40'
            : 'text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat === selected ? null : cat)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            selected === cat
              ? 'bg-[var(--accent)]/30 text-[var(--accent)] border-[var(--accent)]/40'
              : 'text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}

// ── All clear state ───────────────────────────────────────────

function AllClearPanel(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h3 className="text-white text-lg font-semibold mb-2">Your system looks great!</h3>
      <p className="text-gray-400 text-sm max-w-md">
        No significant issues were found. Your VR setup is well-configured.
        Run another scan after making changes to track improvements.
      </p>
    </div>
  )
}

// ── No scan yet state ─────────────────────────────────────────

function NoScanPanel(): React.ReactElement {
  const startScan = useScanStore((s) => s.startScan)
  const isScanning = useScanStore((s) => s.isScanning)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="text-white text-lg font-semibold mb-2">No scan results yet</h3>
      <p className="text-gray-400 text-sm max-w-md mb-6">
        Run a full system scan to generate a personalised action plan with
        step-by-step instructions for improving your VR performance.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => setCurrentPage('dashboard')}
          className="px-4 py-2 rounded-lg text-sm border border-glass-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
        >
          Go to Dashboard
        </button>
        <button
          disabled={isScanning}
          onClick={() => startScan()}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40"
        >
          {isScanning ? 'Scanning…' : 'Run Scan Now'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function ExecutiveSummary(): React.ReactElement {
  const actionPlan   = useScanStore((s) => s.actionPlan)
  const lastScanData = useScanStore((s) => s.lastScanData)
  const isScanning   = useScanStore((s) => s.isScanning)
  const { appliedFixes, markFixed } = useFixStore()

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showOk, setShowOk] = useState(false)
  const [showAutoFix, setShowAutoFix] = useState(false)

  const autoFixableIds = [...new Set(
    actionPlan
      .filter(p => p.fixId && p.id !== 'combo-system-all-clear')
      .map(p => p.fixId!)
  )]

  // Plans minus the all-clear entry (impact: low, id ends in 'all-clear')
  const actionItems = actionPlan.filter((p) => p.id !== 'combo-system-all-clear')
  const allClear    = actionPlan.find((p) => p.id === 'combo-system-all-clear')

  const categories = Array.from(new Set(actionItems.map((p) => p.category))).sort()

  const visiblePlans = actionItems
    .filter((p) => !p.fixId || !appliedFixes.has(p.fixId))  // hide items whose fix was just applied
    .filter((p) => showOk || p.impact !== 'low')
    .filter((p) => selectedCategory === null || p.category === selectedCategory)

  const hiddenLowCount = actionItems.filter((p) => p.impact === 'low').length

  // Loading state
  if (isScanning) {
    return (
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Action Plan</h1>
          <p className="text-gray-400 text-sm mt-1">Scan in progress — plan will appear when complete.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <OrbitalLoader size="mini" />
          <p className="text-gray-400 text-sm">Analysing your system…</p>
        </div>
      </div>
    )
  }

  // No scan yet
  if (!lastScanData) {
    return (
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Action Plan</h1>
          <p className="text-gray-400 text-sm mt-1">Personalised step-by-step recommendations for your VR setup.</p>
        </div>
        <NoScanPanel />
      </div>
    )
  }

  const scanCondition = lastScanData.scanCondition

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Action Plan</h1>
        <p className="text-gray-400 text-sm mt-1">
          {actionItems.length > 0
            ? `${actionItems.length} recommendation${actionItems.length !== 1 ? 's' : ''} found — work through them top to bottom for the biggest gains.`
            : 'No issues found — your system is well-configured for VR.'}
        </p>
      </div>

      {/* Scan condition context */}
      {scanCondition === 'under-load' && (
        <div className="glass-panel-sm p-3 border border-[var(--accent)]/25 flex items-start gap-3 text-xs rounded-xl">
          <span className="text-[var(--accent)] text-base flex-shrink-0 mt-0.5">🥽</span>
          <div>
            <p className="text-[var(--accent)] font-semibold mb-0.5">Live VR session detected at scan time</p>
            <p className="text-gray-400 leading-relaxed">
              These recommendations are based on your system running <em>exactly as it does in VR</em>.
              CPU/GPU/RAM readings reflect real in-session pressure, making this the most accurate analysis
              possible. The apps you had open are what was used to understand your load profile.
            </p>
          </div>
        </div>
      )}
      {scanCondition === 'idle' && (
        <div className="glass-panel-sm p-3 border border-white/8 flex items-start gap-3 text-xs rounded-xl">
          <span className="text-gray-400 text-base flex-shrink-0 mt-0.5">💤</span>
          <div>
            <p className="text-gray-300 font-semibold mb-0.5">Scanned at idle — no VR processes were running</p>
            <p className="text-gray-500 leading-relaxed">
              For the most accurate results, try rescanning while SteamVR or your VR game is active.
              Idle-scan recommendations are still valid, but some CPU/GPU findings may differ under real VR load.
            </p>
          </div>
        </div>
      )}

      {/* Stats overview */}
      {actionItems.length > 0 && <OverviewBar plans={actionItems} />}

      {/* Auto-fix button */}
      {autoFixableIds.length > 0 && (
        <div className="flex items-center justify-center py-2">
          <button
            onClick={() => setShowAutoFix(true)}
            className="relative flex items-center gap-3 px-8 py-3.5 rounded-2xl font-bold text-base transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: `rgba(var(--accent-rgb), 0.18)`,
              border: `1.5px solid rgba(var(--accent-rgb), 0.45)`,
              color: `var(--accent-text)`,
              boxShadow: `0 0 30px rgba(var(--accent-rgb), 0.4), 0 0 70px rgba(var(--accent-rgb), 0.12), inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}
          >
            <span className="text-xl animate-pulse">⚡</span>
            <span>Auto-Fix {autoFixableIds.length} Issue{autoFixableIds.length !== 1 ? 's' : ''} Automatically</span>
            <span className="text-xs opacity-60 font-normal">— preview all changes first</span>
          </button>
        </div>
      )}

      {/* All-clear banner (shown alongside minor recommendations if present) */}
      {allClear && actionItems.length === 0 && <AllClearPanel />}

      {/* Category filter */}
      {categories.length > 1 && (
        <FilterBar
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {/* Action cards */}
      {visiblePlans.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visiblePlans.map((plan, i) => (
            <ActionCard key={plan.id} plan={plan} index={i} />
          ))}
        </div>
      ) : selectedCategory !== null ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No recommendations in this category.
        </div>
      ) : null}

      {/* Show low-impact items toggle */}
      {hiddenLowCount > 0 && !showOk && (
        <button
          onClick={() => setShowOk(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors py-2 border border-dashed border-gray-700 rounded-lg"
        >
          Show {hiddenLowCount} additional low-impact suggestion{hiddenLowCount !== 1 ? 's' : ''}
        </button>
      )}

      {/* Step icon legend */}
      <div className="glass-panel rounded-xl p-3 border border-glass-border">
        <p className="text-xs text-gray-600 font-semibold mb-2 uppercase tracking-wider">Step legend</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {(Object.entries(STEP_ICONS) as [NonNullable<ActionStep['type']>, string][]).map(([type, icon]) => (
            <span key={type} className="text-xs flex items-center gap-1">
              <span className={`font-bold ${STEP_COLORS[type]}`}>{icon}</span>
              <span className="text-gray-600 capitalize">{type}</span>
            </span>
          ))}
        </div>
      </div>

      {showAutoFix && (
        <AutoFixModal
          fixIds={autoFixableIds}
          onClose={() => setShowAutoFix(false)}
          onApplied={(ids) => ids.forEach(markFixed)}
        />
      )}

      {/* Promo footer — single VMSC card so the Summary page stays focused
          on action plans while still surfacing the sibling product. */}
      <div className="pt-2">
        <VmscPromoCard />
      </div>
    </div>
  )
}
