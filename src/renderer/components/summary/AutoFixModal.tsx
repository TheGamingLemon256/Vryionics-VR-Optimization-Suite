import React, { useState, useEffect } from 'react'
import { useScanStore } from '../../stores/scan-store'

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

interface FixResult {
  fixId: string
  success: boolean
  error?: string
  requiresReboot?: boolean
}

interface AutoFixModalProps {
  fixIds: string[]
  onClose: () => void
  onApplied?: (appliedFixIds: string[]) => void
}

type Phase = 'loading' | 'preview' | 'applying' | 'done'
type FixStatus = 'pending' | 'applying' | 'success' | 'failed' | 'skipped'

// IDs whose preview errored — tracked separately so we can warn without blocking
interface PreviewError {
  fixId: string
  error: string
}

// Whether the startup-bloat fix has a "nothing found" payload
function isEmptyBloatPreview(preview: FixPreview): boolean {
  return (
    preview.fixId === 'fix-disable-startup-bloat' &&
    preview.changes.length === 1 &&
    preview.changes[0].currentValue.toLowerCase().includes('no known bloat')
  )
}

export default function AutoFixModal({ fixIds, onClose, onApplied }: AutoFixModalProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('loading')
  const [previews, setPreviews] = useState<FixPreview[]>([])
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([])
  const [expandedFix, setExpandedFix] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, FixStatus>>({})
  const [results, setResults] = useState<FixResult[]>([])
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set())
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [applyProgress, setApplyProgress] = useState(0)
  const [needsReboot, setNeedsReboot] = useState(false)

  const api = (window as any).api

  useEffect(() => {
    loadPreviews()
  }, [])

  async function loadPreviews() {
    try {
      const raw: FixPreview[] = await api.fix.previewAll(fixIds)
      const good: FixPreview[] = []
      const bad: PreviewError[] = []
      for (const p of raw) {
        if (p.error) {
          bad.push({ fixId: p.fixId, error: p.error })
        } else {
          good.push(p)
        }
      }
      setPreviews(good)
      setPreviewErrors(bad)
    } catch (err) {
      // Network/IPC failure — show no previews but allow cancellation
      setPreviewErrors([{ fixId: '(all)', error: String(err) }])
    }
    setPhase('preview')
  }

  // Only apply fixes that successfully previewed
  const applyableIds = previews.map((p) => p.fixId)

  async function applyAll() {
    if (applyableIds.length === 0) return
    setPhase('applying')
    const initial: Record<string, FixStatus> = {}
    for (const id of applyableIds) initial[id] = 'pending'
    setStatuses(initial)

    // Capture pre-fix snapshot so the Dashboard can render a before/after
    // diff after the user re-scans. Done once, before the first apply, so
    // the snapshot reflects the system as it was before ANY fix ran.
    useScanStore.getState().capturePreFixSnapshot()

    const allResults: FixResult[] = []
    let reboot = false

    for (let i = 0; i < applyableIds.length; i++) {
      const id = applyableIds[i]
      setStatuses(s => ({ ...s, [id]: 'applying' }))
      try {
        const result: FixResult = await api.fix.apply(id)
        allResults.push(result)
        setStatuses(s => ({ ...s, [id]: result.success ? 'success' : 'failed' }))
        if (result.success) useScanStore.getState().recordAppliedFix(id)
        if (result.requiresReboot) reboot = true
      } catch {
        allResults.push({ fixId: id, success: false, error: 'Unexpected error' })
        setStatuses(s => ({ ...s, [id]: 'failed' }))
      }
      setApplyProgress(Math.round(((i + 1) / applyableIds.length) * 100))
    }

    setResults(allResults)
    setNeedsReboot(reboot)
    setPhase('done')

    // Notify parent so it can immediately remove applied items from the action plan list
    const successIds = allResults.filter((r) => r.success).map((r) => r.fixId)
    if (successIds.length > 0) onApplied?.(successIds)
  }

  async function handleUndo(fixId: string) {
    setUndoingId(fixId)
    try {
      const result: FixResult = await api.fix.undo(fixId)
      if (result.success) {
        setUndoneIds(prev => new Set([...prev, fixId]))
      }
    } catch {
      // Undo failed silently — user can retry
    } finally {
      setUndoingId(null)
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const adminCount = previews.filter(p => p.requiresAdmin).length
  const rebootCount = previews.filter(p => p.requiresReboot).length

  const glowStyle: React.CSSProperties = {
    background: `rgba(var(--accent-rgb), 0.2)`,
    border: `1.5px solid rgba(var(--accent-rgb), 0.5)`,
    color: `var(--accent-text)`,
    boxShadow: `0 0 28px rgba(var(--accent-rgb), 0.45), 0 0 60px rgba(var(--accent-rgb), 0.15), inset 0 1px 0 rgba(255,255,255,0.08)`,
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'applying') onClose() }}
    >
      <div
        className="glass-panel rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              Auto-Fix Everything
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {phase === 'loading' && 'Loading fix previews…'}
              {phase === 'preview' && previews.length === 0 && previewErrors.length === 0 && 'No fixes available.'}
              {phase === 'preview' && previews.length > 0 && `${previews.length} fix${previews.length !== 1 ? 'es' : ''} ready — review changes below`}
              {phase === 'preview' && previews.length === 0 && previewErrors.length > 0 && 'Could not load fix previews.'}
              {phase === 'applying' && 'Applying fixes — please wait…'}
              {phase === 'done' && `${successCount} applied, ${failCount} failed`}
            </p>
          </div>
          {phase !== 'applying' && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-lg leading-none ml-4"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderTopColor: 'transparent', borderColor: 'var(--accent-primary)' }}
              />
            </div>
          )}

          {/* Preview error banner */}
          {phase === 'preview' && previewErrors.length > 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-red-300">
                {previewErrors.length === 1 && previewErrors[0].fixId === '(all)'
                  ? 'Failed to load any fix previews'
                  : `${previewErrors.length} fix preview${previewErrors.length !== 1 ? 's' : ''} could not be loaded and will be skipped:`}
              </p>
              {previewErrors[0]?.fixId !== '(all)' && previewErrors.map(e => (
                <p key={e.fixId} className="text-[11px] text-red-400 font-mono">{e.fixId}: {e.error}</p>
              ))}
              {previewErrors[0]?.fixId === '(all)' && (
                <p className="text-[11px] text-red-400">{previewErrors[0].error}</p>
              )}
            </div>
          )}

          {/* Empty state — no previews and no errors */}
          {phase === 'preview' && previews.length === 0 && previewErrors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-gray-400 text-sm">No fixes are available to apply right now.</p>
            </div>
          )}

          {/* Preview list */}
          {phase === 'preview' && previews.map(preview => {
            const isEmpty = isEmptyBloatPreview(preview)
            return (
              <div
                key={preview.fixId}
                className="glass-panel-sm rounded-xl border border-white/6 overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-white/3 transition-colors"
                  onClick={() => setExpandedFix(expandedFix === preview.fixId ? null : preview.fixId)}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className={`text-sm ${isEmpty ? 'text-gray-500' : 'text-vr-healthy'}`}>
                      {isEmpty ? '–' : '✓'}
                    </span>
                    <span className="text-sm font-medium text-white truncate">{preview.name}</span>
                    <div className="flex gap-1 ml-auto mr-2 flex-shrink-0">
                      {preview.requiresAdmin && (
                        <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                          🔒 Admin
                        </span>
                      )}
                      {preview.requiresReboot && (
                        <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
                          🔄 Reboot
                        </span>
                      )}
                      {isEmpty && (
                        <span className="text-[10px] bg-gray-500/15 text-gray-400 border border-gray-500/25 px-1.5 py-0.5 rounded-full">
                          Nothing to do
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-600 text-xs flex-shrink-0">
                    {expandedFix === preview.fixId ? '▲' : '▼'}
                  </span>
                </button>

                {expandedFix === preview.fixId && (
                  <div className="px-3 pb-3 space-y-2 border-t border-white/5">
                    <p className="text-[11px] text-gray-400 mt-2">{preview.description}</p>

                    {isEmpty ? (
                      <div className="bg-black/20 rounded-lg p-2.5 text-[11px] text-gray-500 italic">
                        {preview.changes[0].currentValue}
                      </div>
                    ) : (
                      preview.changes.map((c, i) => (
                        <div key={i} className="bg-black/20 rounded-lg p-2.5 text-[11px] space-y-1">
                          <p className="text-gray-500 font-mono truncate">{c.target}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 line-through truncate max-w-[40%]">
                              {c.currentValue}
                            </span>
                            <span className="text-gray-600">→</span>
                            <span className="text-vr-healthy truncate">{c.newValue}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Applying progress */}
          {phase === 'applying' && (
            <div className="space-y-2">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${applyProgress}%`, background: 'var(--accent-primary)' }}
                />
              </div>
              {applyableIds.map(id => {
                const preview = previews.find(p => p.fixId === id)
                const status = statuses[id] ?? 'pending'
                const icon = { pending: '⏳', applying: '⚡', success: '✅', failed: '❌', skipped: '⏭' }[status]
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-sm"
                    style={{ background: status === 'applying' ? 'rgba(var(--accent-rgb),0.08)' : '' }}
                  >
                    <span className={status === 'applying' ? 'animate-pulse' : ''}>{icon}</span>
                    <span className={
                      status === 'success' ? 'text-vr-healthy' :
                      status === 'failed' ? 'text-vr-critical' :
                      'text-gray-400'
                    }>
                      {preview?.name ?? id}
                    </span>
                    {preview?.requiresAdmin && status === 'applying' && (
                      <span className="text-[10px] text-amber-400 ml-auto">🔒 needs admin</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Done results */}
          {phase === 'done' && results.map(result => {
            const preview = previews.find(p => p.fixId === result.fixId)
            const isUndone = undoneIds.has(result.fixId)
            const isUndoing = undoingId === result.fixId
            return (
              <div
                key={result.fixId}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg text-sm ${
                  isUndone ? 'bg-gray-500/8' :
                  result.success ? 'bg-vr-healthy/8' : 'bg-vr-critical/8'
                }`}
              >
                <span>{isUndone ? '↩' : result.success ? '✅' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={
                      isUndone ? 'text-gray-400 line-through' :
                      result.success ? 'text-vr-healthy' : 'text-vr-critical'
                    }>
                      {preview?.name ?? result.fixId}
                    </p>
                    {preview?.requiresAdmin && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                        🔒 Admin
                      </span>
                    )}
                    {preview?.requiresReboot && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
                        🔄 Reboot
                      </span>
                    )}
                    {isUndone && (
                      <span className="text-[10px] text-gray-500">undone</span>
                    )}
                  </div>
                  {result.error && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{result.error}</p>
                  )}
                </div>
                {/* Undo button — only for successful, not-yet-undone fixes */}
                {result.success && !isUndone && (
                  <button
                    onClick={() => handleUndo(result.fixId)}
                    disabled={isUndoing}
                    className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
                  >
                    {isUndoing ? '…' : 'Undo'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-white/6">
          {phase === 'preview' && (
            <div className="space-y-3">
              {(adminCount > 0 || rebootCount > 0) && (
                <p className="text-[11px] text-gray-500">
                  {adminCount > 0 && `${adminCount} fix${adminCount > 1 ? 'es' : ''} require admin rights. `}
                  {rebootCount > 0 && `${rebootCount} fix${rebootCount > 1 ? 'es' : ''} require a reboot to take effect.`}
                </p>
              )}
              <div className="flex gap-3">
                {previews.length > 0 ? (
                  <button
                    onClick={applyAll}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={glowStyle}
                  >
                    ⚡ Apply {previews.length} Fix{previews.length !== 1 ? 'es' : ''} Now
                  </button>
                ) : (
                  <div className="flex-1" />
                )}
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-xl text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-3">
              {needsReboot && (
                <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                  <span className="text-amber-400">🔄</span>
                  <p className="text-[12px] text-amber-300">
                    Some fixes require a restart to take full effect.
                  </p>
                </div>
              )}
              {undoneIds.size > 0 && (
                <p className="text-[11px] text-gray-500 text-center">
                  {undoneIds.size} fix{undoneIds.size !== 1 ? 'es were' : ' was'} undone.
                </p>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 border border-white/10 text-gray-300"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
