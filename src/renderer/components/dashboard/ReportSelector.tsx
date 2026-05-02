import React, { useState, useRef, useEffect, useCallback } from 'react'

export interface SavedReportMeta {
  id: string
  timestamp: number
  label: string
  scanCondition: 'idle' | 'under-load'
  criticalCount: number
  warningCount: number
  infoCount: number
}

interface ReportSelectorProps {
  reports: SavedReportMeta[]
  activeReportId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  loading?: boolean
}

export default function ReportSelector({
  reports,
  activeReportId,
  onSelect,
  onDelete,
  onClearAll,
  loading = false
}: ReportSelectorProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setConfirmClear(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const activeReport = reports.find((r) => r.id === activeReportId)

  const filtered = reports.filter((r) =>
    !search || r.label.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = useCallback((id: string | null) => {
    onSelect(id)
    setOpen(false)
    setSearch('')
  }, [onSelect])

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onDelete(id)
  }, [onDelete])

  const triggerLabel = activeReport
    ? `📋 ${activeReport.label}`
    : reports.length > 0
    ? `📋 Reports (${reports.length})`
    : '📋 No reports yet'

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
          activeReportId
            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/35 text-[var(--accent)]'
            : 'glass-panel-sm border-white/10 text-gray-400 hover:text-white hover:border-white/20'
        }`}
      >
        <span className="max-w-[180px] truncate">{triggerLabel}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 glass-panel border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto">
            {/* "Live / current scan" option */}
            {!search && (
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors ${
                  !activeReportId ? 'bg-[var(--accent)]/8' : ''
                }`}
                onClick={() => handleSelect(null)}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-vr-healthy flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white">Current scan (live)</p>
                  <p className="text-[10px] text-gray-500">Use the most recent scan result</p>
                </div>
                {!activeReportId && <span className="text-[10px] text-[var(--accent)]">Active</span>}
              </button>
            )}

            {/* Report rows */}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-600">
                {search ? 'No matching reports' : 'No saved reports yet'}
              </div>
            )}
            {filtered.map((r) => (
              <button
                key={r.id}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors group ${
                  activeReportId === r.id ? 'bg-[var(--accent)]/8' : ''
                }`}
                onClick={() => handleSelect(r.id)}
              >
                <span className="text-sm flex-shrink-0">
                  {r.scanCondition === 'under-load' ? '🥽' : '💤'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{r.label}</p>
                  <p className="text-[10px] text-gray-500">
                    {r.criticalCount > 0 && <span className="text-vr-critical">{r.criticalCount} critical</span>}
                    {r.criticalCount > 0 && r.warningCount > 0 && <span className="text-gray-600"> · </span>}
                    {r.warningCount > 0 && <span className="text-vr-warning">{r.warningCount} warnings</span>}
                    {r.criticalCount === 0 && r.warningCount === 0 && <span className="text-vr-healthy">All clear</span>}
                  </p>
                </div>
                {activeReportId === r.id && (
                  <span className="text-[10px] text-[var(--accent)] mr-1">Active</span>
                )}
                <button
                  onClick={(e) => handleDelete(e, r.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-vr-critical text-xs p-0.5 flex-shrink-0"
                  aria-label="Delete report"
                >
                  🗑
                </button>
              </button>
            ))}
          </div>

          {/* Footer */}
          {reports.length > 0 && !search && (
            <div className="border-t border-white/5 p-2">
              {confirmClear ? (
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-[10px] text-vr-critical">Delete all {reports.length} reports?</span>
                  <button
                    className="text-[10px] text-vr-critical hover:underline"
                    onClick={() => { onClearAll(); setOpen(false); setConfirmClear(false) }}
                  >
                    Yes
                  </button>
                  <button
                    className="text-[10px] text-gray-400 hover:underline"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="w-full text-center text-[10px] text-gray-600 hover:text-vr-critical transition-colors py-0.5"
                  onClick={() => setConfirmClear(true)}
                >
                  Clear all reports
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
