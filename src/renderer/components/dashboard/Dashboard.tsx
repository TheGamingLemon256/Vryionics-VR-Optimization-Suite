import React, { useCallback, useEffect } from 'react'
import { useScanStore } from '../../stores/scan-store'
import { useAppStore } from '../../stores/app-store'
import { useSetupStore } from '../../stores/setup-store'
import { HealthCard } from './HealthCard'
import { useReportsStore } from '../../stores/reports-store'
import ReportSelector from './ReportSelector'
import { OrbitalLoader } from '../shared/OrbitalLoader'
import { PromoDuoInline } from '../shared/PromoCards'
import PerformanceHistoryChart from './PerformanceHistoryChart'
import { BeforeAfterPanel } from './BeforeAfterPanel'
import { ReportCompareModal } from './ReportCompareModal'

function EmptyState({ onScan }: { onScan: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-96 space-y-4 text-center">
      <div className="w-16 h-16 rounded-2xl glass-panel flex items-center justify-center text-4xl">
        🔍
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Ready to scan your VR system</h2>
        <p className="text-sm text-gray-400 max-w-md">
          Run a full scan to analyze your hardware, VR runtime, network, and OS configuration
          for performance bottlenecks.
        </p>
      </div>
      <button
        className="glass-button btn-spring flex items-center gap-2 px-6 py-3 text-sm font-medium"
        onClick={onScan}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 2" />
        </svg>
        Run Full Scan
      </button>
    </div>
  )
}

export default function Dashboard(): React.ReactElement {
  const [compareOpen, setCompareOpen] = React.useState(false)
  const { isScanning, scanProgress, healthCards, lastScanData, scanError, startScan, cancelScan } = useScanStore()
  const { advancedMode, toggleAdvancedMode, setCurrentPage } = useAppStore()
  const { config: setupConfig } = useSetupStore()
  const { reports, activeReportId, loadReport, loadAll, deleteReport, clearAll } = useReportsStore()

  useEffect(() => { loadAll() }, [])

  const handleReportSelect = useCallback((id: string | null) => {
    if (id === null) return  // "current scan" — already loaded
    loadReport(id)
  }, [loadReport])

  const handleScan = () => {
    startScan({
      headsetProfileId: setupConfig?.headsetId,
      connectionArchetype: setupConfig?.connectionArchetype
    })
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            {lastScanData
              ? `Last scanned ${new Date(lastScanData.timestamp).toLocaleTimeString()}`
              : 'VR system health at a glance'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Simple/Advanced toggle */}
          <div className="flex items-center gap-2 glass-panel-sm px-3 py-1.5 rounded-full">
            <span className={`text-xs transition-colors ${!advancedMode ? 'text-white' : 'text-gray-500'}`}>Simple</span>
            <button
              onClick={toggleAdvancedMode}
              className={`relative w-10 h-5 rounded-full transition-colors ${advancedMode ? 'bg-accent-primary' : 'bg-white/20'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${advancedMode ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
            <span className={`text-xs transition-colors ${advancedMode ? 'text-white' : 'text-gray-500'}`}>Advanced</span>
          </div>

          {/* Scan button */}
          {isScanning ? (
            <button
              className="glass-button-danger btn-spring flex items-center gap-2 px-5 py-2.5 text-sm"
              onClick={cancelScan}
            >
              <span className="w-3 h-3 bg-white rounded-sm" />
              Cancel
            </button>
          ) : (
            <button
              data-tour-target="run-scan"
              className="glass-button btn-spring flex items-center gap-2 px-5 py-2.5 text-sm"
              onClick={handleScan}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3l2 2" />
              </svg>
              {lastScanData ? 'Rescan' : 'Run Full Scan'}
            </button>
          )}
          {reports.length >= 2 && (
            <button
              onClick={() => setCompareOpen(true)}
              className="glass-button-sm btn-spring text-xs py-2 px-3"
              title="Compare two saved reports"
            >
              Compare
            </button>
          )}
          <ReportSelector
            reports={reports}
            activeReportId={activeReportId}
            onSelect={handleReportSelect}
            onDelete={(id) => deleteReport(id)}
            onClearAll={clearAll}
            loading={false}
          />
        </div>
      </div>

      {/* Before/after fix-impact panel — only renders when a snapshot exists */}
      <BeforeAfterPanel />

      {/* Under-load context banner */}
      {lastScanData?.scanCondition === 'under-load' && !isScanning && (
        <div className="glass-panel-sm p-3 border border-accent-primary/25 flex items-center gap-3 text-xs">
          <span className="text-accent-primary text-base flex-shrink-0">🥽</span>
          <div className="flex-1 min-w-0">
            <span className="text-accent-primary font-semibold">Scanned during active VR session — </span>
            <span className="text-gray-400">
              VR processes were running at scan time. Metrics and recommendations reflect
              real in-session load, giving you the most accurate picture of your VR performance.
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {scanError && (
        <div className="glass-panel-sm p-4 border border-vr-critical/30 text-vr-critical text-sm">
          ⚠️ Scan error: {scanError}
        </div>
      )}

      {/* Health cards grid, scanning animation, or empty state */}
      {isScanning ? (
        <OrbitalLoader
          percent={scanProgress?.percent ?? 0}
          moduleLabel={scanProgress?.moduleLabel ?? 'Initialising…'}
        />
      ) : healthCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {healthCards.map((card, i) => (
            <HealthCard key={card.category} card={card} animDelay={i} />
          ))}
        </div>
      ) : (
        <EmptyState onScan={handleScan} />
      )}

      {/* View full report link */}
      {lastScanData && !isScanning && (
        <div className="flex justify-center">
          <button
            className="text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4"
            onClick={() => setCurrentPage('report')}
          >
            View full scan report →
          </button>
        </div>
      )}

      {/* Performance history — hidden until there's enough data */}
      {!isScanning && reports.length >= 2 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Health Score History
          </p>
          <PerformanceHistoryChart reports={reports} />
        </div>
      )}

      {/* Subtle promo row — always at the very bottom so it never competes
          with primary content. Visible after everything else has been read. */}
      {!isScanning && (
        <div className="pt-2">
          <PromoDuoInline />
        </div>
      )}

      <ReportCompareModal open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  )
}
