// Vryionics VR Optimization Suite — Drivers Page
//
// Dedicated driver-updater surface. Lists every detected driver in our
// supported categories (GPU, USB, audio, chipset, storage, Wi-Fi, BT,
// Ethernet) as a row with: hardware name, installed version, latest
// version, status badge, and action button.
//
// Auto-tier categories (GPU/USB/audio on desktop) get an "Update" button
// that runs the silent installer with signature + hash verification.
// Guided-tier categories get an "Open download" button that opens the
// vendor's support page in the user's browser.

import React, { useEffect, useMemo, useState } from 'react'

type FreshnessState = 'current' | 'warning' | 'outdated' | 'not-yet-supported' | 'unknown'
type InstallMode = 'auto' | 'guided'
type DriverCategory = 'gpu' | 'chipset' | 'usb' | 'audio' | 'ethernet' | 'wifi' | 'bluetooth' | 'storage' | 'unknown'

interface InstallProgress {
  phase: 'restore-point' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error'
  percent?: number
  message?: string
  error?: string
}

interface DriverRow {
  hardware: {
    id: string
    vendor: string
    category: DriverCategory
    hardwareName: string
    installedVersion: string
    installedDate?: string
  }
  latest: { version: string; releaseDate?: string; downloadUrl?: string; installable?: boolean; source?: string } | null
  freshness: FreshnessState
  installMode: InstallMode
  checkError?: string
  checkedAt: number
}

interface DriverUpdaterState {
  rows: DriverRow[]
  lastCheckedAt: number | null
  isChecking: boolean
  isLaptop: boolean
  activeInstall: { rowId: string; progress: InstallProgress } | null
}

const CATEGORY_LABEL: Record<DriverCategory, string> = {
  gpu:       'Graphics',
  usb:       'USB Controllers',
  audio:     'Audio',
  chipset:   'Chipset',
  storage:   'Storage Controller',
  ethernet:  'Ethernet',
  wifi:      'Wi-Fi',
  bluetooth: 'Bluetooth',
  unknown:   'Other',
}

const CATEGORY_ORDER: DriverCategory[] = [
  'gpu', 'chipset', 'usb', 'audio', 'storage', 'ethernet', 'wifi', 'bluetooth', 'unknown',
]

export default function DriversPage(): React.ReactElement {
  const [state, setState] = useState<DriverUpdaterState>({
    rows: [],
    lastCheckedAt: null,
    isChecking: false,
    isLaptop: false,
    activeInstall: null,
  })
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const api = (window as any).api?.drivers
    if (!api) return
    api.getState().then(setState)
    const unsub = api.onState((s: DriverUpdaterState) => setState(s))
    return unsub
  }, [])

  const rowsByCategory = useMemo(() => {
    const grouped = new Map<DriverCategory, DriverRow[]>()
    for (const row of state.rows) {
      const cat = row.hardware.category
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(row)
    }
    return grouped
  }, [state.rows])

  const summary = useMemo(() => {
    const outdated = state.rows.filter((r) => r.freshness === 'outdated').length
    const warning  = state.rows.filter((r) => r.freshness === 'warning').length
    const current  = state.rows.filter((r) => r.freshness === 'current').length
    const unknown  = state.rows.filter((r) => r.freshness === 'unknown').length
    return { total: state.rows.length, outdated, warning, current, unknown }
  }, [state.rows])

  const handleRefresh = async (): Promise<void> => {
    await (window as any).api.drivers.refreshAll()
  }

  const handleInstall = async (rowId: string): Promise<void> => {
    setActionErrors((e) => { const { [rowId]: _, ...rest } = e; return rest })
    const result = await (window as any).api.drivers.install(rowId)
    if (!result.success && result.error) {
      setActionErrors((e) => ({ ...e, [rowId]: result.error }))
    }
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Drivers</h1>
          <p className="text-sm text-gray-400 mt-1">
            {state.lastCheckedAt
              ? `Last checked ${new Date(state.lastCheckedAt).toLocaleTimeString()}`
              : 'Checks for outdated drivers on every launch and every 24 hours'}
            {state.isLaptop && <span className="text-vr-warning ml-2">· Laptop detected — all updates are guided</span>}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={state.isChecking}
          className="glass-button btn-spring text-sm py-2 px-4 flex items-center gap-2"
        >
          {state.isChecking ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6" strokeDasharray="30" strokeDashoffset="10" />
              </svg>
              Checking...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.2-8.6" />
                <path d="M21 3v5h-5" />
              </svg>
              Check Now
            </>
          )}
        </button>
      </div>

      {/* Summary chips */}
      {state.rows.length > 0 && (
        <div className="flex gap-3 text-xs flex-wrap">
          <SummaryChip label="Up to date" count={summary.current} color="text-vr-healthy" />
          <SummaryChip label="Update recommended" count={summary.warning} color="text-vr-warning" />
          <SummaryChip label="Outdated" count={summary.outdated} color="text-vr-critical" />
          {summary.unknown > 0 && (
            <SummaryChip label="Manual check" count={summary.unknown} color="text-gray-500" />
          )}
          <SummaryChip label="Total" count={summary.total} color="text-gray-400" />
        </div>
      )}

      {/* Active install banner */}
      {state.activeInstall && (
        <ActiveInstallBanner
          state={state.activeInstall}
          rowName={state.rows.find((r) => r.hardware.id === state.activeInstall!.rowId)?.hardware.hardwareName ?? 'driver'}
        />
      )}

      {/* Empty state */}
      {state.rows.length === 0 && !state.isChecking && (
        <div className="glass-panel-sm rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">
            No driver scan yet. Click <span className="text-white font-medium">Check Now</span> to scan your system.
          </p>
        </div>
      )}

      {state.rows.length === 0 && state.isChecking && (
        <div className="glass-panel-sm rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">Scanning drivers and checking vendor sources...</p>
        </div>
      )}

      {/* Grouped rows */}
      {CATEGORY_ORDER.map((cat) => {
        const rows = rowsByCategory.get(cat)
        if (!rows || rows.length === 0) return null
        return (
          <div key={cat}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              {CATEGORY_LABEL[cat]}
              <span className="text-[10px] text-gray-600 normal-case tracking-normal">
                {rows[0].installMode === 'auto' ? '· safe to auto-install' : '· guided install — opens vendor page'}
              </span>
            </h2>
            <div className="space-y-2">
              {rows.map((row) => (
                <DriverRowView
                  key={row.hardware.id}
                  row={row}
                  error={actionErrors[row.hardware.id]}
                  disabled={!!state.activeInstall}
                  onInstall={() => handleInstall(row.hardware.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Disclaimer */}
      <div className="glass-panel-sm rounded-xl p-4 text-[11px] text-gray-500 leading-relaxed">
        <p className="font-semibold text-gray-400 mb-1">How this works</p>
        <p>
          Vryionics checks vendor websites (NVIDIA, AMD, Intel) for the latest public drivers matching your hardware.
          A System Restore Point is created before any auto-install, and installers are verified to be digitally signed
          by the expected publisher before running. For higher-risk drivers (Wi-Fi, Ethernet, chipset, storage) we only
          open the vendor's page in your browser so you can review and install manually.
        </p>
      </div>
    </div>
  )
}

function SummaryChip({ label, count, color }: { label: string; count: number; color: string }): React.ReactElement {
  return (
    <div className="glass-panel-sm rounded-full px-3 py-1 flex items-center gap-2">
      <span className={`font-semibold ${color}`}>{count}</span>
      <span className="text-gray-500">{label}</span>
    </div>
  )
}

function DriverRowView({
  row,
  error,
  disabled,
  onInstall,
}: {
  row: DriverRow
  error?: string
  disabled: boolean
  onInstall: () => void
}): React.ReactElement {
  const badge = freshnessBadge(row.freshness)
  const hasDownloadUrl = !!row.latest?.downloadUrl
  const knownOutdated = row.freshness === 'warning' || row.freshness === 'outdated'
  // installable=false means downloadUrl is HTML, not a real installer —
  // never offer "Update" (silent install), only "Open vendor page".
  const isInstallable = row.latest?.installable !== false && row.latest?.source !== 'static-fallback'
  const canSilentInstall = row.installMode === 'auto' && knownOutdated && hasDownloadUrl && isInstallable

  // Three button states:
  //   • canSilentInstall     → "Update" (silent .exe /S with verification)
  //   • hasDownloadUrl only  → "Open vendor page" (opens URL in default browser)
  //   • freshness=current    → "✓ Up to date"
  //   • otherwise            → "—"
  let button: React.ReactNode = <span className="text-[11px] text-gray-600">—</span>
  if (canSilentInstall) {
    button = (
      <button
        onClick={onInstall}
        disabled={disabled}
        className="text-xs px-4 py-2 rounded-md font-medium bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 border border-accent-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Update
      </button>
    )
  } else if (row.freshness === 'current') {
    button = <span className="text-[11px] text-vr-healthy">✓ Up to date</span>
  } else if (hasDownloadUrl) {
    button = (
      <button
        onClick={onInstall}
        disabled={disabled}
        className="text-xs px-4 py-2 rounded-md font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Open vendor page
      </button>
    )
  }

  const showsLatest = row.latest && row.latest.version !== '—'

  return (
    <div className="glass-panel-sm rounded-lg p-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-white">{row.hardware.hardwareName}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.label}</span>
        </div>
        <p className="text-[11px] text-gray-500 font-mono">
          Installed <span className="text-gray-300">{row.hardware.installedVersion}</span>
          {row.hardware.installedDate && <span className="text-gray-600"> · {row.hardware.installedDate}</span>}
          {showsLatest && (
            <>
              {' '}· Latest <span className={knownOutdated ? 'text-accent-primary' : 'text-gray-300'}>{row.latest!.version}</span>
              {row.latest!.releaseDate && <span className="text-gray-600"> · {row.latest!.releaseDate}</span>}
            </>
          )}
        </p>
        {row.checkError && <p className="text-[10px] text-vr-warning mt-1">Couldn't check vendor: {row.checkError}</p>}
        {error && <p className="text-[10px] text-vr-critical mt-1">{error}</p>}
      </div>
      <div className="flex-shrink-0">{button}</div>
    </div>
  )
}

function ActiveInstallBanner({
  state,
  rowName,
}: {
  state: { rowId: string; progress: InstallProgress }
  rowName: string
}): React.ReactElement {
  const phase = state.progress.phase
  const color =
    phase === 'error' ? 'vr-critical'
    : phase === 'complete' ? 'vr-healthy'
    : 'accent-primary'
  return (
    <div className={`glass-panel-sm rounded-xl p-4 border border-${color}/30`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-white">
          {phase === 'error' ? 'Install failed' : phase === 'complete' ? 'Install complete' : `Installing ${rowName}`}
        </p>
        {state.progress.percent != null && phase !== 'complete' && phase !== 'error' && (
          <span className="text-xs text-gray-400 tabular-nums">{state.progress.percent}%</span>
        )}
      </div>
      {state.progress.percent != null && phase !== 'error' && (
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full bg-${color} transition-all duration-300`}
            style={{ width: `${state.progress.percent}%` }}
          />
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">{state.progress.message ?? state.progress.error ?? ''}</p>
    </div>
  )
}

function freshnessBadge(freshness: FreshnessState): { label: string; className: string } {
  switch (freshness) {
    case 'current':
      return { label: 'Current', className: 'bg-vr-healthy/10 text-vr-healthy border-vr-healthy/30' }
    case 'warning':
      return { label: 'Update available', className: 'bg-vr-warning/10 text-vr-warning border-vr-warning/30' }
    case 'outdated':
      return { label: 'Outdated', className: 'bg-vr-critical/10 text-vr-critical border-vr-critical/30' }
    case 'not-yet-supported':
    case 'unknown':
    default:
      return { label: 'Manual check', className: 'bg-white/5 text-gray-500 border-white/10' }
  }
}
