// VR Optimization Suite — Storage Debloat Panel
// Lets the user scan for junk files and selectively delete them.

import React, { useState, useCallback, useMemo } from 'react'

// ── Local type definitions ────────────────────────────────────
// (mirrored from src/main/scanner/modules/storage-debloat.ts — kept local
//  so the renderer bundle never imports from main)

interface DebloatCategory {
  id: string
  name: string
  description: string
  paths: string[]
  sizeMB: number
  safeToDelete: boolean
  deletable: boolean
}

interface DebloatScanResult {
  categories: DebloatCategory[]
  totalReclaimableMB: number
  scannedAt: number
}

// ── Helpers ───────────────────────────────────────────────────

function formatSize(mb: number): string {
  if (mb < 1) return '< 1 MB'
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Sub-components ────────────────────────────────────────────

interface SafeBadgeProps {
  safe: boolean
}

function SafeBadge({ safe }: SafeBadgeProps): React.ReactElement {
  if (safe) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30 font-medium whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
        Auto-Safe
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      Review
    </span>
  )
}

// ── Category row ──────────────────────────────────────────────

interface CategoryRowProps {
  cat: DebloatCategory
  checked: boolean
  onToggle: (id: string) => void
  onOpenFolder: (path: string) => void
}

function CategoryRow({ cat, checked, onToggle, onOpenFolder }: CategoryRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`border rounded-lg transition-colors ${
        checked
          ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5'
          : 'border-glass-border bg-white/2'
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Checkbox or info icon */}
        {cat.deletable ? (
          <button
            onClick={() => onToggle(cat.id)}
            aria-label={`${checked ? 'Deselect' : 'Select'} ${cat.name}`}
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              checked
                ? 'bg-[var(--accent)] border-[var(--accent)]'
                : 'border-gray-600 hover:border-gray-400 bg-transparent'
            }`}
          >
            {checked && (
              <svg className="w-3 h-3 text-black" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6.5L4.5 9L10 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ) : (
          <div className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-700 flex items-center justify-center">
            <span className="text-gray-500 text-xs">i</span>
          </div>
        )}

        {/* Name + description toggle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-medium">{cat.name}</span>
            <SafeBadge safe={cat.safeToDelete} />
            {!cat.deletable && (
              <span className="text-xs text-gray-500 italic">info only</span>
            )}
          </div>
          {expanded && (
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">{cat.description}</p>
          )}
        </div>

        {/* Right side: size + actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <span
            className={`text-sm font-semibold tabular-nums ${
              cat.sizeMB >= 500
                ? 'text-red-400'
                : cat.sizeMB >= 100
                  ? 'text-amber-400'
                  : 'text-gray-300'
            }`}
          >
            {formatSize(cat.sizeMB)}
          </span>

          {!cat.deletable && cat.paths[0] && (
            <button
              onClick={() => onOpenFolder(cat.paths[0])}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors whitespace-nowrap"
            >
              Open Folder
            </button>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-gray-600 hover:text-gray-400 transition-colors text-xs w-5 text-center"
            aria-label="Toggle details"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Scan idle state ───────────────────────────────────────────

interface ScanIdleProps {
  onScan: () => void
  isScanning: boolean
}

function ScanIdleState({ onScan, isScanning }: ScanIdleProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v.375c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
      <h3 className="text-white font-semibold mb-1.5">Find Junk Files</h3>
      <p className="text-gray-400 text-sm max-w-sm mb-6 leading-relaxed">
        Scan for temporary files, cache folders, and other junk that can be safely removed to free up disk space.
      </p>
      <button
        disabled={isScanning}
        onClick={onScan}
        className="px-6 py-2.5 rounded-lg font-semibold text-sm bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40"
      >
        {isScanning ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            Scanning…
          </span>
        ) : (
          'Scan for Junk Files'
        )}
      </button>
      <p className="text-gray-600 text-xs mt-4 max-w-xs">
        Only removes temporary/cache files — no app data, settings, or game saves are touched
      </p>
    </div>
  )
}

// ── Completion state ──────────────────────────────────────────

interface CompletionProps {
  freedMB: number
  errors: string[]
  onRescan: () => void
}

function CompletionState({ freedMB, errors, onRescan }: CompletionProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-white font-semibold mb-1">Cleanup Complete</h3>
      <p className="text-gray-300 text-sm mb-1">
        Freed <span className="text-green-400 font-bold">{formatSize(freedMB)}</span> of disk space
      </p>
      {errors.length > 0 && (
        <div className="mt-3 w-full max-w-sm text-left">
          <p className="text-amber-400 text-xs font-semibold mb-1">
            {errors.length} file{errors.length !== 1 ? 's' : ''} could not be deleted (likely in use):
          </p>
          <div className="bg-white/3 rounded-lg border border-amber-500/20 px-3 py-2 max-h-24 overflow-y-auto">
            {errors.slice(0, 5).map((e, i) => (
              <p key={i} className="text-gray-400 text-xs truncate">{e}</p>
            ))}
            {errors.length > 5 && (
              <p className="text-gray-500 text-xs">…and {errors.length - 5} more</p>
            )}
          </div>
        </div>
      )}
      <button
        onClick={onRescan}
        className="mt-5 px-5 py-2 rounded-lg text-sm border border-glass-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
      >
        Scan Again
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

type PanelPhase = 'idle' | 'scanning' | 'results' | 'cleaning' | 'done'

export default function StorageDebloatPanel(): React.ReactElement {
  const api = (window as any).api

  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [scanResult, setScanResult] = useState<DebloatScanResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [freedMB, setFreedMB] = useState(0)
  const [cleanErrors, setCleanErrors] = useState<string[]>([])
  const [cleanProgress, setCleanProgress] = useState<string[]>([])

  // ── Scan ──────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setPhase('scanning')
    setScanResult(null)
    setSelected(new Set())
    setCleanProgress([])

    try {
      const result: DebloatScanResult = await api.storage.scanDebloat()
      setScanResult(result)

      // Pre-select all safe+deletable categories
      const autoSelected = new Set(
        result.categories
          .filter((c) => c.safeToDelete && c.deletable)
          .map((c) => c.id)
      )
      setSelected(autoSelected)
      setPhase('results')
    } catch (err) {
      console.error('[debloat] Scan failed:', err)
      setPhase('idle')
    }
  }, [api])

  // ── Selection helpers ─────────────────────────────────────

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllSafe = useCallback(() => {
    if (!scanResult) return
    setSelected(
      new Set(
        scanResult.categories
          .filter((c) => c.safeToDelete && c.deletable)
          .map((c) => c.id)
      )
    )
  }, [scanResult])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // ── Computed values ───────────────────────────────────────

  const selectedCategories = useMemo(() => {
    if (!scanResult) return []
    return scanResult.categories.filter((c) => selected.has(c.id))
  }, [scanResult, selected])

  const selectedTotalMB = useMemo(
    () => selectedCategories.reduce((sum, c) => sum + c.sizeMB, 0),
    [selectedCategories]
  )

  // ── Clean ─────────────────────────────────────────────────

  const handleClean = useCallback(async () => {
    if (selectedCategories.length === 0) return
    setPhase('cleaning')
    setCleanProgress([])

    const ids = selectedCategories.map((c) => c.id)
    try {
      const result = await api.storage.deleteCategories(ids)
      setFreedMB(result.totalFreed ?? 0)
      setCleanErrors(result.errors ?? [])
      setPhase('done')
    } catch (err) {
      console.error('[debloat] Clean failed:', err)
      setCleanErrors([(err as Error).message])
      setPhase('done')
    }
  }, [selectedCategories, api])

  // ── Open folder (Downloads) ───────────────────────────────

  const handleOpenFolder = useCallback((folderPath: string) => {
    // shell.openPath is exposed via preload as api.shell.openPath in most setups
    if (api.shell?.openPath) {
      api.shell.openPath(folderPath)
    } else if (api.openPath) {
      api.openPath(folderPath)
    }
  }, [api])

  // ── Rescan ────────────────────────────────────────────────

  const handleRescan = useCallback(() => {
    setPhase('idle')
    setScanResult(null)
    setFreedMB(0)
    setCleanErrors([])
  }, [])

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Storage Debloat</h1>
        <p className="text-gray-400 text-sm mt-1">
          Remove temporary files and cache folders to reclaim disk space without touching app data or settings.
        </p>
      </div>

      {/* Panel body */}
      <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">

        {/* Idle / scanning */}
        {(phase === 'idle' || phase === 'scanning') && (
          <ScanIdleState onScan={handleScan} isScanning={phase === 'scanning'} />
        )}

        {/* Results */}
        {phase === 'results' && scanResult && (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border bg-white/2">
              <div>
                <span className="text-white text-sm font-semibold">
                  {scanResult.categories.length} categories found
                </span>
                <span className="text-gray-500 text-xs ml-2">
                  scanned at {formatTs(scanResult.scannedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">
                  Up to{' '}
                  <span className="text-green-400 font-semibold">
                    {formatSize(scanResult.totalReclaimableMB)}
                  </span>{' '}
                  reclaimable
                </span>
                <button
                  onClick={handleScan}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors border border-gray-700 rounded px-2 py-0.5"
                >
                  Re-scan
                </button>
              </div>
            </div>

            {/* Quick-select controls */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-glass-border">
              <span className="text-xs text-gray-500">Select:</span>
              <button
                onClick={selectAllSafe}
                className="text-xs px-2.5 py-1 rounded border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
              >
                All Safe
              </button>
              <button
                onClick={clearSelection}
                className="text-xs px-2.5 py-1 rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
              >
                None
              </button>
              <span className="ml-auto text-xs text-gray-500">
                {selected.size} selected
              </span>
            </div>

            {/* Category list */}
            <div className="px-4 py-3 flex flex-col gap-2 max-h-[420px] overflow-y-auto">
              {scanResult.categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  checked={selected.has(cat.id)}
                  onToggle={toggleSelected}
                  onOpenFolder={handleOpenFolder}
                />
              ))}
            </div>

            {/* Footer action bar */}
            <div className="px-4 py-3 border-t border-glass-border bg-white/2 flex items-center justify-between gap-4">
              <div>
                {selectedCategories.length > 0 ? (
                  <p className="text-sm text-white">
                    <span className="font-bold text-[var(--accent)]">
                      {formatSize(selectedTotalMB)}
                    </span>
                    <span className="text-gray-400 ml-1">
                      across {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">No categories selected</p>
                )}
                <p className="text-xs text-gray-600 mt-0.5">
                  Only removes temporary/cache files — no app data, settings, or game saves are touched
                </p>
              </div>

              <button
                disabled={selectedCategories.length === 0}
                onClick={handleClean}
                className="flex-shrink-0 px-5 py-2.5 rounded-lg font-semibold text-sm bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Clean Selected
              </button>
            </div>
          </>
        )}

        {/* Cleaning in progress */}
        {phase === 'cleaning' && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin mb-4" />
            <h3 className="text-white font-semibold mb-1">Cleaning…</h3>
            <p className="text-gray-400 text-sm">
              Removing {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'} —
              this may take a moment.
            </p>
            {cleanProgress.length > 0 && (
              <p className="text-gray-500 text-xs mt-2">{cleanProgress[cleanProgress.length - 1]}</p>
            )}
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <CompletionState
            freedMB={freedMB}
            errors={cleanErrors}
            onRescan={handleRescan}
          />
        )}
      </div>

      {/* Legend */}
      {phase === 'results' && (
        <div className="glass-panel rounded-xl p-3 border border-glass-border">
          <p className="text-xs text-gray-600 font-semibold mb-2 uppercase tracking-wider">Badge legend</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              <span className="text-xs text-gray-400">
                <span className="text-green-400 font-medium">Auto-Safe</span> — can be deleted without any side-effects
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              <span className="text-xs text-gray-400">
                <span className="text-amber-400 font-medium">Review</span> — safe but causes a one-time rebuild or re-download on next launch
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
