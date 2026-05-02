// VR Optimization Suite — Settings Page
// App preferences: report mode, admin info, setup reset, about section

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { useSetupStore } from '../../stores/setup-store'
import { useThemeStore, type AccentColor } from '../../stores/theme-store'
import { PromoDuoFull } from '../shared/PromoCards'
import { BugReportModal } from '../support/BugReportModal'
import { LiveOptimizerSettingsCard } from '../live-optimizer/LiveOptimizerSettingsCard'

const ACCENT_OPTIONS: Array<{ id: AccentColor; label: string; hex: string }> = [
  { id: 'purple', label: 'Purple', hex: '#7c5bf5' },
  { id: 'blue',   label: 'Blue',   hex: '#3b82f6' },
  { id: 'cyan',   label: 'Cyan',   hex: '#06b6d4' },
  { id: 'green',  label: 'Green',  hex: '#10b981' },
  { id: 'orange', label: 'Orange', hex: '#f59e0b' }
]

export default function SettingsPage(): React.ReactElement {
  const { advancedMode, setAdvancedMode, isAdmin, setCurrentPage } = useAppStore()
  const { config, resetSetup, isComplete } = useSetupStore()
  const { accent, setAccent, glassOpacity, setGlassOpacity, reducedMotion, setReducedMotion } = useThemeStore()
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [adminStatus, setAdminStatus] = useState<boolean | null>(null)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  useEffect(() => {
    const api = (window as any).api
    api.app?.getVersion?.()?.then?.(setAppVersion).catch?.(() => {})
    api.system?.isAdmin?.()?.then?.(setAdminStatus).catch?.(() => setAdminStatus(false))
  }, [])

  const handleReset = () => {
    resetSetup()
    setCurrentPage('wizard')
  }

  return (
    <div className="page-enter flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">App preferences and configuration</p>
      </div>

      {/* Report Mode */}
      <SettingsSection title="Report Mode" description="Control how much technical detail appears in scan results.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Advanced Mode</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {advancedMode
                ? 'Showing full technical details, registry paths, and exact values'
                : 'Showing plain-English explanations only'}
            </p>
          </div>
          <Toggle value={advancedMode} onChange={setAdvancedMode} />
        </div>
      </SettingsSection>

      {/* Headset Setup */}
      {isComplete && config && (
        <SettingsSection title="VR Setup" description="Your configured headset and connection.">
          <div className="space-y-3">
            <InfoRow label="Headset" value={config.headsetModel} />
            <InfoRow label="Brand" value={config.headsetBrand} />
            <InfoRow label="Connection" value={config.connectionArchetype} />
            <InfoRow label="Report Style" value={config.skillLevel} />
            {config.completedAt && (
              <InfoRow label="Setup Date" value={new Date(config.completedAt).toLocaleDateString()} />
            )}
            <div className="pt-2">
              {!showResetConfirm ? (
                <button
                  className="text-xs text-vr-warning hover:text-vr-critical transition-colors"
                  onClick={() => setShowResetConfirm(true)}
                >
                  Reset setup and re-run wizard
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-vr-critical">Are you sure? This will clear your headset profile.</p>
                  <button
                    className="text-xs glass-button-danger px-3 py-1 rounded"
                    onClick={handleReset}
                  >
                    Yes, reset
                  </button>
                  <button
                    className="text-xs text-gray-400 hover:text-white"
                    onClick={() => setShowResetConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      {/* System Info */}
      <SettingsSection title="System" description="Runtime environment and permissions.">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Administrator Privileges</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {adminStatus === null ? 'Checking...' :
                 adminStatus ? 'Running with admin rights — all fixes available' :
                 'Running without admin — some registry fixes may be limited'}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              adminStatus === null ? 'bg-white/10 text-gray-400' :
              adminStatus ? 'bg-vr-healthy/15 text-vr-healthy' :
              'bg-vr-warning/15 text-vr-warning'
            }`}>
              {adminStatus === null ? '…' : adminStatus ? 'Admin' : 'Standard'}
            </span>
          </div>
          {adminStatus === false && (
            <p className="text-xs text-gray-500 glass-panel-sm p-3 rounded-lg">
              💡 To enable all fixes, right-click the app and select "Run as Administrator".
            </p>
          )}
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About" description="Version and build information.">
        <div className="space-y-3">
          <InfoRow label="Version" value={`v${appVersion}`} />
          <InfoRow label="Build" value="Phase 1a — Core Diagnostics" />
          <InfoRow label="Engine" value="Electron + React + TypeScript" />
          <div className="pt-1">
            <button
              className="text-xs text-accent-primary hover:underline"
              onClick={() => (window as any).api?.app?.openExternal?.('https://vryionic.com')}
            >
              vryionic.com ↗
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Software Updates — manual check in addition to the titlebar chip */}
      <SettingsSection title="Software Updates" description="Check for a newer version of Vryionics VR Optimization Suite.">
        <UpdateCheckRow />
      </SettingsSection>

      {/* First-launch tour reset — for users who want to replay the coach marks */}
      <SettingsSection title="Onboarding" description="Replay the first-launch guided tour.">
        <button
          onClick={() => {
            try { localStorage.removeItem('vros-first-launch-tour-complete') } catch { /* ignore */ }
            window.location.reload()
          }}
          className="glass-button btn-spring text-sm py-2 px-4"
        >
          Replay tour
        </button>
      </SettingsSection>

      {/* Tuning profile — export/import the user's applied fix list as JSON. */}
      <SettingsSection
        title="Tuning Profile"
        description="Export your applied fixes as a portable JSON file to share with friends, or import a friend's profile to apply their tweaks."
      >
        <ProfileExportRow />
      </SettingsSection>

      <SettingsSection
        title="Live Optimizer"
        description="Lowers CPU priority on allowlisted background apps while VR is running, restores everything when VR closes."
      >
        <LiveOptimizerSettingsCard />
      </SettingsSection>

      {/* Background scheduler */}
      <SettingsSection
        title="Scheduled Scans"
        description="Vryionics can run a system scan in the background on a schedule and notify you if your health score drops."
      >
        <SchedulerRow />
      </SettingsSection>

      {/* Theme */}
      <SettingsSection title="Appearance" description="Accent color and glass effect intensity.">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-2">Accent Color</p>
            <div className="flex items-center gap-3">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAccent(opt.id)}
                  title={opt.label}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${
                    accent === opt.id ? 'border-white scale-115 shadow-lg' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: opt.hex }}
                />
              ))}
            </div>
          </div>

          {/* Live preview strip — clearly shows the current accent across all UI elements */}
          <div
            className="rounded-lg p-3 flex items-center gap-3 transition-all duration-300"
            style={{ background: 'rgba(var(--accent-rgb), 0.12)', border: '1px solid rgba(var(--accent-rgb), 0.25)' }}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: 'var(--accent-primary)' }}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
                {ACCENT_OPTIONS.find((o) => o.id === accent)?.label ?? 'Purple'} accent active
              </p>
              <p className="text-[10px] text-gray-500">Buttons, toggles, badges, and active nav items use this color</p>
            </div>
            <button
              className="glass-button btn-spring text-xs px-3 py-1"
              style={{}}
            >
              Preview
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Glass Intensity</p>
              <span className="text-xs" style={{ color: 'var(--accent-text)' }}>{Math.round(glassOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={95}
              value={Math.round(glassOpacity * 100)}
              onChange={(e) => setGlassOpacity(parseInt(e.target.value) / 100)}
              className="w-full accent-[var(--accent-primary)]"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Reduce Motion</p>
              <p className="text-xs text-gray-400 mt-0.5">Disables panel entrance and transition animations</p>
            </div>
            <Toggle value={reducedMotion} onChange={setReducedMotion} />
          </div>
        </div>
      </SettingsSection>

      {/* Quick links to dedicated pages */}
      <SettingsSection title="Tools" description="Quick access to dedicated optimization pages.">
        <div className="space-y-2">
          <button
            onClick={() => setCurrentPage('optimizer')}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
          >
            <span className="text-xl">⚡</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Live Optimizer</p>
              <p className="text-xs text-gray-500">Auto-close background apps during VR sessions</p>
            </div>
            <span className="text-gray-600 group-hover:text-gray-300 transition-colors">→</span>
          </button>
          <button
            onClick={() => setCurrentPage('storage')}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
          >
            <span className="text-xl">🗑</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Storage Cleanup</p>
              <p className="text-xs text-gray-500">Remove cache files, temp data, and VR bloat</p>
            </div>
            <span className="text-gray-600 group-hover:text-gray-300 transition-colors">→</span>
          </button>
        </div>
      </SettingsSection>

      {/* Help & Feedback — bug report trigger */}
      <SettingsSection
        title="Help &amp; Feedback"
        description="Report a bug, request a feature, or send diagnostic data to the developer."
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Include a description of the issue — optionally attach your scan data, applied fixes,
            and system info. Reports go directly to the Vryionics developer Discord.
          </p>
          <button
            onClick={() => setBugReportOpen(true)}
            className="glass-button btn-spring text-xs px-4 py-2 font-medium flex-shrink-0"
          >
            Send Bug Report
          </button>
        </div>
      </SettingsSection>

      {/* Support the project — VMSC + Patreon promo cards */}
      <SettingsSection
        title="Support the Project"
        description="Vryionics is a one-person studio. These tools stay free because of the people who support them."
      >
        <PromoDuoFull />
      </SettingsSection>

      {/* Phase 2 teaser */}
      <div className="glass-panel-sm p-4 border border-accent-primary/15 flex items-start gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Phase 2 Coming Soon</p>
          <p className="text-xs text-gray-400 mt-1">
            One-click automated fixes, MMCSS tuning, shader cache management, and GPU power plan optimization.
            Fixes with preview, backup, and undo.
          </p>
        </div>
      </div>

      {/* Bug report modal — overlay */}
      <BugReportModal open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
    </div>
  )
}

// ── Shared Components ─────────────────────────────────────────

function SettingsSection({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="glass-panel-sm p-5 space-y-4">
      <div className="border-b border-white/5 pb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-white capitalize">{value}</span>
    </div>
  )
}

/**
 * Manual update-check row. Uses the same IPC as the titlebar UpdateChip
 * but exposes an explicit "check now" button for users who want to
 * confirm they're up to date without waiting for the background poll.
 */
function UpdateCheckRow(): React.ReactElement {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const checkNow = async (): Promise<void> => {
    setChecking(true)
    setResult(null)
    try {
      const status = await (window as any).api.updater.checkForUpdates()
      if (status.available && status.updateInfo) {
        setResult(`Update available: v${status.updateInfo.version}`)
      } else if (status.error) {
        setResult(`Error: ${status.error}`)
      } else {
        setResult("You're up to date!")
      }
    } catch (err: any) {
      setResult(`Error: ${err?.message ?? 'check failed'}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={checkNow}
        disabled={checking}
        className="glass-button btn-spring text-sm py-2 px-4 flex items-center gap-2"
      >
        {checking ? (
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
            Check for Updates
          </>
        )}
      </button>
      {result && (
        <span className={`text-xs ${
          result.startsWith('Error') ? 'text-red-400'
            : result.includes('available') ? 'text-blue-400'
            : 'text-green-400'
        }`}>
          {result}
        </span>
      )}
    </div>
  )
}

/** Export / import tuning profile (Phase 10). */
function ProfileExportRow(): React.ReactElement {
  const setup = useSetupStore((s) => s.config)
  const [busy, setBusy] = useState<'idle' | 'exporting' | 'importing' | 'applying'>('idle')
  const [result, setResult] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<{ activeFixes: string[]; description: string } | null>(null)

  const doExport = async (): Promise<void> => {
    setBusy('exporting')
    setResult(null)
    try {
      const path = await (window as any).api.profile.export(
        setup ? {
          headsetId: setup.headsetId,
          connectionArchetype: setup.connectionArchetype,
          pcType: setup.pcType,
          primaryUseCase: setup.primaryUseCase,
        } : null,
        '',
      )
      setResult(path ? `Exported to ${path}` : 'Cancelled')
    } catch (err) {
      setResult(`Export failed: ${(err as Error).message}`)
    } finally {
      setBusy('idle')
    }
  }

  const doImport = async (): Promise<void> => {
    setBusy('importing')
    setResult(null)
    try {
      const profile = await (window as any).api.profile.import()
      if (!profile) {
        setResult('Import cancelled')
      } else {
        setImportPreview({ activeFixes: profile.activeFixes, description: profile.description })
      }
    } catch (err) {
      setResult(`Import failed: ${(err as Error).message}`)
    } finally {
      setBusy('idle')
    }
  }

  const applyPreview = async (): Promise<void> => {
    if (!importPreview) return
    setBusy('applying')
    try {
      const results = await (window as any).api.profile.applyImported(importPreview.activeFixes)
      const ok = results.filter((r: { success: boolean }) => r.success).length
      const fail = results.length - ok
      setResult(`Applied ${ok} / ${results.length}${fail > 0 ? ` (${fail} failed)` : ''}`)
      setImportPreview(null)
    } catch (err) {
      setResult(`Apply failed: ${(err as Error).message}`)
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={doExport}
          disabled={busy !== 'idle'}
          className="glass-button btn-spring text-sm py-2 px-4 disabled:opacity-50"
        >
          {busy === 'exporting' ? 'Exporting…' : 'Export profile'}
        </button>
        <button
          onClick={doImport}
          disabled={busy !== 'idle'}
          className="glass-button btn-spring text-sm py-2 px-4 disabled:opacity-50"
        >
          {busy === 'importing' ? 'Importing…' : 'Import profile'}
        </button>
        {result && <span className="text-xs text-gray-400">{result}</span>}
      </div>

      {importPreview && (
        <div className="glass-panel-sm rounded-lg p-3 border border-accent-primary/30">
          <p className="text-xs font-semibold text-white mb-1">
            Profile contains {importPreview.activeFixes.length} fix{importPreview.activeFixes.length === 1 ? '' : 'es'}
          </p>
          {importPreview.description && (
            <p className="text-[11px] text-gray-400 mb-2 italic">{importPreview.description}</p>
          )}
          <ul className="text-[11px] text-gray-400 mb-3 space-y-0.5 max-h-32 overflow-y-auto">
            {importPreview.activeFixes.map((id) => <li key={id}>· {id}</li>)}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={applyPreview}
              disabled={busy !== 'idle'}
              className="glass-button text-xs py-1.5 px-3"
            >
              {busy === 'applying' ? 'Applying…' : 'Apply all'}
            </button>
            <button
              onClick={() => { setImportPreview(null); setResult(null) }}
              className="text-xs text-gray-500 hover:text-gray-300 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Scheduled scan toggle + interval (Phase 6). */
function SchedulerRow(): React.ReactElement {
  const [enabled, setEnabled] = useState(true)
  const [intervalDays, setIntervalDays] = useState(7)

  useEffect(() => {
    const api = (window as any).api?.scheduler
    if (!api?.getConfig) return
    api.getConfig().then((cfg: { enabled: boolean; intervalDays: number }) => {
      setEnabled(cfg.enabled)
      setIntervalDays(cfg.intervalDays)
    }).catch(() => { /* defaults stand */ })
  }, [])

  const save = async (next: { enabled?: boolean; intervalDays?: number }): Promise<void> => {
    const e = next.enabled ?? enabled
    const d = next.intervalDays ?? intervalDays
    setEnabled(e)
    setIntervalDays(d)
    try {
      await (window as any).api?.scheduler?.setConfig?.({ enabled: e, intervalDays: d })
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Run scheduled scans</p>
          <p className="text-xs text-gray-400 mt-0.5">A scan runs in the background if your last one is older than the interval below.</p>
        </div>
        <Toggle value={enabled} onChange={(v) => save({ enabled: v })} />
      </div>
      {enabled && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Run every</span>
          <select
            value={intervalDays}
            onChange={(e) => save({ intervalDays: parseInt(e.target.value, 10) })}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
          >
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      )}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        value ? 'bg-accent-primary' : 'bg-white/20'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
