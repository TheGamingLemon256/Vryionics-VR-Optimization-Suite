// VR Optimization Suite — Full Report View
// Shows all findings from the last scan, grouped by category, with severity sorting

import React, { useState, useMemo, useCallback } from 'react'
import { useScanStore } from '../../stores/scan-store'
import { useAppStore } from '../../stores/app-store'
import { ExportMenu } from './ExportMenu'
import type { Finding } from '../../../main/rules/types'
import type { ScanData } from '../../../main/scanner/types'

// ── Severity config ───────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { icon: '🔴', color: 'text-vr-critical', bg: 'bg-vr-critical/8', border: 'border-vr-critical/20', order: 0 },
  warning:  { icon: '🟡', color: 'text-vr-warning',  bg: 'bg-vr-warning/8',  border: 'border-vr-warning/20',  order: 1 },
  info:     { icon: 'ℹ️',  color: 'text-gray-400',   bg: 'bg-white/3',       border: 'border-white/8',        order: 2 },
  ok:       { icon: '✅',  color: 'text-vr-healthy',  bg: 'bg-vr-healthy/5', border: 'border-vr-healthy/15',  order: 3 }
}

// ── Category display names ────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'Memory',
  storage: 'Storage',
  network: 'Network',
  'vr-runtime': 'VR Runtime',
  processes: 'Processes',
  'os-config': 'OS Config'
}

// ── Main Component ────────────────────────────────────────────

export default function ReportView(): React.ReactElement {
  const { findings, lastScanData, healthCards, isScanning, startScan } = useScanStore()
  const { advancedMode, setCurrentPage } = useAppStore()
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['cpu', 'gpu']))
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  // Group findings by category, sorted by severity
  const grouped = useMemo(() => {
    const groups: Record<string, Finding[]> = {}
    for (const f of findings) {
      const cat = f.result.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(f)
    }
    // Sort within each group: critical → warning → info → ok
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) =>
        (SEVERITY_CONFIG[a.result.severity as keyof typeof SEVERITY_CONFIG]?.order ?? 99) -
        (SEVERITY_CONFIG[b.result.severity as keyof typeof SEVERITY_CONFIG]?.order ?? 99)
      )
    }
    return groups
  }, [findings])

  const categoriesInOrder = Object.keys(CATEGORY_LABELS).filter((c) => grouped[c])

  const totalCritical = findings.filter((f) => f.result.severity === 'critical').length
  const totalWarning = findings.filter((f) => f.result.severity === 'warning').length
  const totalInfo = findings.filter((f) => f.result.severity === 'info').length

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const filteredFindings = (cat: string): Finding[] => {
    const all = grouped[cat] ?? []
    if (severityFilter === 'all') return all
    return all.filter((f) => f.result.severity === severityFilter)
  }

  // Empty state
  if (findings.length === 0 && !lastScanData) {
    return (
      <div className="page-enter flex flex-col items-center justify-center h-96 space-y-4 text-center">
        <div className="w-16 h-16 rounded-2xl glass-panel flex items-center justify-center text-4xl">📋</div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">No scan data yet</h2>
          <p className="text-sm text-gray-400 max-w-sm">Run a scan from the dashboard to see your full system report here.</p>
        </div>
        <button
          className="glass-button btn-spring px-6 py-2.5 text-sm font-medium"
          onClick={() => setCurrentPage('dashboard')}
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan Report</h1>
          {lastScanData && (
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>{new Date(lastScanData.timestamp).toLocaleString()}</span>
              {lastScanData.scanDurationMs ? <span>— {(lastScanData.scanDurationMs / 1000).toFixed(1)}s</span> : null}
              {lastScanData.scanCondition === 'under-load' && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/25">
                  🥽 Under Load
                </span>
              )}
              {lastScanData.scanCondition === 'idle' && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-400 border border-white/10">
                  💤 Idle
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ExportMenu />
          <button
            className="glass-button btn-spring flex items-center gap-2 px-4 py-2 text-xs"
            onClick={() => startScan({})}
            disabled={isScanning}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 2" />
            </svg>
            Rescan
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Critical"
          count={totalCritical}
          color="text-vr-critical"
          bg="bg-vr-critical/10"
          border="border-vr-critical/30"
          active={severityFilter === 'critical'}
          onClick={() => setSeverityFilter((f) => f === 'critical' ? 'all' : 'critical')}
        />
        <SummaryCard
          label="Warnings"
          count={totalWarning}
          color="text-vr-warning"
          bg="bg-vr-warning/10"
          border="border-vr-warning/30"
          active={severityFilter === 'warning'}
          onClick={() => setSeverityFilter((f) => f === 'warning' ? 'all' : 'warning')}
        />
        <SummaryCard
          label="Info"
          count={totalInfo}
          color="text-gray-400"
          bg="bg-white/5"
          border="border-white/10"
          active={severityFilter === 'info'}
          onClick={() => setSeverityFilter((f) => f === 'info' ? 'all' : 'info')}
        />
      </div>

      {severityFilter !== 'all' && (
        <button
          className="text-xs text-accent-primary hover:underline self-start"
          onClick={() => setSeverityFilter('all')}
        >
          ✕ Clear filter — showing {severityFilter} only
        </button>
      )}

      {/* Category sections */}
      <div className="space-y-3">
        {categoriesInOrder.map((cat, i) => {
          const visible = filteredFindings(cat)
          const allInCat = grouped[cat] ?? []
          const catCritical = allInCat.filter((f) => f.result.severity === 'critical').length
          const catWarning = allInCat.filter((f) => f.result.severity === 'warning').length
          const catStatus = catCritical > 0 ? 'critical' : catWarning > 0 ? 'warning' : 'healthy'
          const isOpen = expandedCategories.has(cat)

          // Skip category if filter is active and no matching findings
          if (severityFilter !== 'all' && visible.length === 0) return null

          return (
            <div
              key={cat}
              className={`glass-panel-sm border overflow-hidden panel-animate panel-animate-delay-${Math.min(i, 4)} ${
                catStatus === 'critical' ? 'border-vr-critical/25' :
                catStatus === 'warning' ? 'border-vr-warning/25' :
                'border-white/8'
              }`}
            >
              {/* Category header */}
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-white/3 transition-colors"
                onClick={() => toggleCategory(cat)}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    catStatus === 'critical' ? 'bg-vr-critical' :
                    catStatus === 'warning' ? 'bg-vr-warning' :
                    'bg-vr-healthy'
                  }`} />
                  <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat] ?? cat}</span>
                  <div className="flex items-center gap-1.5">
                    {catCritical > 0 && (
                      <span className="text-[10px] bg-vr-critical/20 text-vr-critical px-1.5 py-0.5 rounded-full font-medium">
                        {catCritical} critical
                      </span>
                    )}
                    {catWarning > 0 && (
                      <span className="text-[10px] bg-vr-warning/20 text-vr-warning px-1.5 py-0.5 rounded-full font-medium">
                        {catWarning} warning
                      </span>
                    )}
                    {catCritical === 0 && catWarning === 0 && (
                      <span className="text-[10px] bg-vr-healthy/15 text-vr-healthy px-1.5 py-0.5 rounded-full font-medium">
                        OK
                      </span>
                    )}
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Findings list */}
              {isOpen && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {visible.length === 0 ? (
                    <div className="p-4 flex items-center gap-2 text-vr-healthy text-xs">
                      <span>✓</span>
                      <span>No {severityFilter !== 'all' ? severityFilter + ' ' : ''}issues in this category.</span>
                    </div>
                  ) : visible.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      advancedMode={advancedMode}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Health card overview (mini) */}
      {healthCards.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Quick Overview</p>
          <div className="grid grid-cols-4 gap-2">
            {healthCards.map((card) => (
              <div key={card.category} className="glass-panel-sm p-3 text-center">
                <span className={`text-xs font-semibold ${
                  card.status === 'critical' ? 'text-vr-critical' :
                  card.status === 'warning' ? 'text-vr-warning' :
                  card.status === 'healthy' ? 'text-vr-healthy' : 'text-gray-400'
                }`}>{card.label}</span>
                <p className="text-[10px] text-gray-500 mt-0.5">{card.summary ?? card.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full raw scan dump */}
      {lastScanData && (
        <RawScanDump scanData={lastScanData} />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function SummaryCard({ label, count, color, bg, border, active, onClick }: {
  label: string
  count: number
  color: string
  bg: string
  border: string
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`glass-panel-sm p-4 text-center transition-all border btn-spring ${
        active ? `${bg} ${border}` : 'border-white/5 hover:border-white/15'
      }`}
    >
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </button>
  )
}

// ── Raw Scan Dump ─────────────────────────────────────────────

function formatRawDump(s: ScanData): string {
  const lines: string[] = []
  const sep = '─'.repeat(57)
  const bold = (t: string) => t.toUpperCase()

  lines.push('═'.repeat(59))
  lines.push('  VRYIONICS VR OPTIMIZATION SUITE — FULL SYSTEM SNAPSHOT')
  lines.push('═'.repeat(59))
  lines.push(`  Scan Time : ${new Date(s.timestamp).toLocaleString()}`)
  if (s.scanDurationMs) lines.push(`  Duration  : ${(s.scanDurationMs / 1000).toFixed(1)}s`)
  if (s.scanCondition) lines.push(`  Condition : ${s.scanCondition === 'under-load' ? 'Under Load (VR session active)' : 'Idle (no VR processes)'}`)
  lines.push('')

  // ── CPU
  if (s.cpu) {
    const c = s.cpu
    lines.push(bold('cpu'))
    lines.push(sep)
    lines.push(`  Model             : ${c.model}`)
    lines.push(`  Cores / Threads   : ${c.cores}C / ${c.threads}T`)
    lines.push(`  Base / Boost      : ${c.baseClock} MHz / ${c.boostClock > 0 ? c.boostClock + ' MHz' : 'N/A'}`)
    lines.push(`  Architecture      : ${c.architecture || 'Unknown'}`)
    lines.push(`  Average Usage     : ${c.avgUsage.toFixed(1)}%`)
    if (c.temperature != null) lines.push(`  Temperature       : ${c.temperature}°C`)
    lines.push(`  Context Switches  : ${c.contextSwitchesPerSec.toLocaleString()}/s`)
    lines.push(`  VCache            : ${c.hasVCache ? 'Present' : 'Not present'}`)
    if (c.perCoreUsage.length > 0) {
      lines.push(`  Per-Core Usage    : ${c.perCoreUsage.map((u, i) => `C${i}:${u.toFixed(0)}%`).join('  ')}`)
    }
    lines.push('')
  }

  // ── GPU
  if (s.gpu && s.gpu.devices.length > 0) {
    lines.push(bold('gpu'))
    lines.push(sep)
    s.gpu.devices.forEach((g, i) => {
      if (s.gpu!.devices.length > 1) lines.push(`  [GPU ${i}]`)
      lines.push(`  Name              : ${g.name}`)
      lines.push(`  Vendor            : ${g.vendor}`)
      lines.push(`  Driver            : ${g.driverVersion || 'Unknown'}`)
      lines.push(`  VRAM              : ${g.vramTotal} MB${g.vramUsed > 0 ? ` (${g.vramUsed} MB used)` : ''}`)
      lines.push(`  Utilization       : ${g.utilization.toFixed(1)}%`)
      if (g.temperature > 0) lines.push(`  Temperature       : ${g.temperature}°C`)
      if (g.powerDraw > 0) lines.push(`  Power             : ${g.powerDraw.toFixed(1)} W / ${g.powerLimit.toFixed(1)} W`)
      if (g.encoderUtilization > 0) lines.push(`  Encoder / Decoder : ${g.encoderUtilization.toFixed(1)}% / ${g.decoderUtilization.toFixed(1)}%`)
      if (g.pcieGen > 0) lines.push(`  PCIe              : Gen ${g.pcieGen} x${g.pcieLinkWidth}`)
      lines.push(`  ReBAR             : ${g.rebarEnabled ? 'Enabled' : 'Disabled'}`)
      lines.push(`  HAGS              : ${g.hagsEnabled ? 'Enabled' : 'Disabled'}`)
    })
    lines.push('')
  }

  // ── RAM
  if (s.ram) {
    const r = s.ram
    lines.push(bold('memory (ram)'))
    lines.push(sep)
    lines.push(`  Total             : ${r.totalGB.toFixed(1)} GB`)
    lines.push(`  Used              : ${r.usedGB.toFixed(1)} GB (${r.usagePercent.toFixed(0)}%)`)
    lines.push(`  Available         : ${r.availableGB.toFixed(1)} GB`)
    lines.push(`  Type / Speed      : ${r.type} @ ${r.speed} MHz`)
    if (r.xmpSpeed) lines.push(`  XMP/EXPO Speed    : ${r.xmpSpeed} MHz`)
    lines.push(`  Channels          : ${r.channels}`)
    lines.push(`  Commit Charge     : ${r.commitChargePercent.toFixed(1)}%`)
    lines.push(`  Non-Paged Pool    : ${r.nonpagedPoolMB.toFixed(0)} MB`)
    lines.push(`  Modified Pages    : ${r.modifiedPagesMB.toFixed(0)} MB`)
    lines.push('')
  }

  // ── Storage
  if (s.storage && s.storage.drives.length > 0) {
    lines.push(bold('storage'))
    lines.push(sep)
    for (const d of s.storage.drives) {
      const usedGB = d.totalGB - d.freeGB
      lines.push(`  ${d.letter}: ${d.type.padEnd(6)} ${d.freeGB.toFixed(1)} GB free / ${d.totalGB.toFixed(1)} GB total (${(usedGB / d.totalGB * 100).toFixed(0)}% used)`)
      if (d.temperature) lines.push(`     Temperature    : ${d.temperature}°C`)
      if (d.wearPercent != null) lines.push(`     NVMe Wear      : ${d.wearPercent}%`)
      if (d.queueLength > 0) lines.push(`     Queue Length   : ${d.queueLength.toFixed(2)}`)
    }
    if (s.storage.vrInstallDrive) lines.push(`  VR Install Drive  : ${s.storage.vrInstallDrive}`)
    if (s.storage.shaderCacheSizeMB > 0) lines.push(`  Shader Cache      : ${(s.storage.shaderCacheSizeMB / 1024).toFixed(2)} GB`)
    if (s.storage.vrchatCacheSizeGB > 0) lines.push(`  VRChat Cache      : ${s.storage.vrchatCacheSizeGB.toFixed(2)} GB`)
    lines.push('')
  }

  // ── Network
  if (s.network) {
    const n = s.network
    lines.push(bold('network'))
    lines.push(sep)
    for (const a of n.adapters) {
      lines.push(`  ${a.type.padEnd(9)}: ${a.name} — ${a.connected ? `Connected${a.speed > 0 ? ` @ ${a.speed} Mbps` : ''}` : 'Disconnected'}`)
    }
    if (n.wifi) {
      const w = n.wifi
      lines.push(`  Wi-Fi SSID        : ${w.ssid ?? 'N/A'}`)
      lines.push(`  Band / Channel    : ${w.band ?? '?'} / Ch ${w.channel ?? '?'}`)
      lines.push(`  Signal            : ${w.signalStrength != null ? w.signalStrength + '%' : 'N/A'}`)
      lines.push(`  Link Speed        : ${w.linkSpeed != null ? w.linkSpeed + ' Mbps' : 'N/A'}`)
      lines.push(`  Power Saving      : ${w.powerSavingEnabled != null ? (w.powerSavingEnabled ? 'ON ⚠' : 'Off') : 'Unknown'}`)
      if (w.nearbyNetworks) {
        const sameChannel = w.channel ? w.nearbyNetworks.filter((nn) => nn.channel === w.channel).length : 0
        lines.push(`  Nearby Networks   : ${w.nearbyNetworks.length}${sameChannel > 0 ? ` (${sameChannel} on same channel!)` : ''}`)
      }
    }
    if (n.latency.gateway != null) lines.push(`  Gateway Latency   : ${n.latency.gateway} ms`)
    if (n.tcpRetransmits > 0) lines.push(`  TCP Retransmits   : ${n.tcpRetransmits.toLocaleString()}`)
    lines.push('')
  }

  // ── VR Runtime
  if (s.vrRuntime) {
    const v = s.vrRuntime
    lines.push(bold('vr runtime'))
    lines.push(sep)
    lines.push(`  Active Runtime    : ${v.activeRuntime ?? 'None'}`)
    lines.push(`  OpenXR Runtime    : ${v.openxrRuntime ?? 'N/A'}`)
    lines.push(`  SteamVR           : ${v.steamvrInstalled ? `Installed${v.steamvrVersion ? ' v' + v.steamvrVersion : ''}` : 'Not installed'}`)
    lines.push(`  Oculus Software   : ${v.oculusInstalled ? `Installed${v.oculusVersion ? ' v' + v.oculusVersion : ''}` : 'Not installed'}`)
    lines.push(`  WMR               : ${v.wmrInstalled ? 'Installed' : 'Not installed'}`)
    lines.push(`  Supersampling     : ${v.supersampling != null ? (v.supersampling * 100).toFixed(0) + '%' : 'Auto'}`)
    lines.push(`  Reprojection      : ${v.reprojectionMode ?? 'Unknown'}`)
    lines.push(`  Motion Smoothing  : ${v.motionSmoothingEnabled != null ? (v.motionSmoothingEnabled ? 'Enabled' : 'Disabled') : 'Unknown'}`)
    lines.push('')
  }

  // ── OS Config
  if (s.osConfig) {
    const o = s.osConfig
    lines.push(bold('os configuration'))
    lines.push(sep)
    lines.push(`  Windows           : ${o.windowsVersion} (Build ${o.windowsBuild})`)
    lines.push(`  Power Plan        : ${o.powerPlan}`)
    lines.push(`  Game Mode         : ${o.gameModeEnabled ? 'Enabled' : 'Disabled'}`)
    lines.push(`  HPET              : ${o.hpetEnabled != null ? (o.hpetEnabled ? 'Enabled' : 'Disabled') : 'Unknown'}`)
    if (o.timerResolution) lines.push(`  Timer Resolution  : ${o.timerResolution.current.toFixed(3)} ms`)
    // Defensive: tolerate old scan data where these fields may be a bare string
    const defExcl = Array.isArray(o.defenderExclusions) ? o.defenderExclusions : (typeof o.defenderExclusions === 'string' && o.defenderExclusions ? [o.defenderExclusions] : [])
    const virtDrv = Array.isArray(o.virtualizationDrivers) ? o.virtualizationDrivers : (typeof o.virtualizationDrivers === 'string' && o.virtualizationDrivers ? [o.virtualizationDrivers] : [])
    if (defExcl.length > 0) lines.push(`  Defender Excl.    : ${defExcl.join(', ')}`)
    if (virtDrv.length > 0) lines.push(`  Virt. Drivers     : ${virtDrv.join(', ')}`)
    if (o.startupItems.length > 0) {
      const enabled = o.startupItems.filter((si) => si.enabled)
      lines.push(`  Startup Items     : ${o.startupItems.length} total, ${enabled.length} enabled`)
    }
    lines.push('')
  }

  // ── Processes
  if (s.processes) {
    const p = s.processes
    lines.push(bold('processes'))
    lines.push(sep)
    lines.push(`  Total Running     : ${p.all.length}`)
    if (p.vrCritical.length > 0) {
      lines.push(`  VR Critical       :`)
      for (const proc of p.vrCritical) {
        lines.push(`    ${proc.name.padEnd(28)} CPU: ${proc.cpuPercent.toFixed(1)}%  RAM: ${proc.ramMB.toFixed(0)} MB`)
      }
    }
    if (p.bloat.length > 0) {
      // Dedupe duplicates so 41 discord instances show as one line instead of 41
      const map = new Map<string, { name: string; count: number; cpu: number; ram: number }>()
      for (const proc of p.bloat) {
        const key = proc.name.toLowerCase()
        const ex = map.get(key)
        if (ex) { ex.count += 1; ex.cpu += proc.cpuPercent; ex.ram += proc.ramMB }
        else map.set(key, { name: proc.name, count: 1, cpu: proc.cpuPercent, ram: proc.ramMB })
      }
      const deduped = [...map.values()].sort((a, b) => b.count - a.count || b.ram - a.ram)
      lines.push(`  Bloat Processes   : ${deduped.length} unique (${p.bloat.length} instances)`)
      for (const d of deduped) {
        const label = d.count > 1 ? `${d.name} ×${d.count}` : d.name
        lines.push(`    ${label.padEnd(28)} CPU: ${d.cpu.toFixed(1)}%  RAM: ${d.ram.toFixed(0)} MB`)
      }
    }
    lines.push('')
  }

  lines.push('═'.repeat(59))
  lines.push('  Generated by Vryionics VR Optimization Suite')
  lines.push('═'.repeat(59))
  return lines.join('\n')
}

function RawScanDump({ scanData }: { scanData: ScanData }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const text = useMemo(() => formatRawDump(scanData), [scanData])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [text])

  const handleExport = useCallback(() => {
    const stamp = new Date(scanData.timestamp).toISOString().slice(0, 10)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vr-scan-raw-${stamp}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [text, scanData.timestamp])

  return (
    <div className="mt-4">
      <button
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="font-semibold uppercase tracking-widest text-[10px]">Raw Scan Data</span>
        <span className="text-[10px] text-gray-600">— full system snapshot as text</span>
      </button>

      {open && (
        <div className="mt-3 glass-panel-sm border border-white/8 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
            <span className="text-[10px] text-gray-500 font-mono">vr-scan-raw.txt</span>
            <div className="flex items-center gap-2">
              <button
                className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors"
                onClick={handleCopy}
              >
                {copied ? (
                  <><span className="text-vr-healthy">✓</span> Copied</>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="5" y="5" width="9" height="9" rx="1.5"/>
                      <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <button
                className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors"
                onClick={handleExport}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
                </svg>
                Save .txt
              </button>
            </div>
          </div>
          <pre className="text-[10px] leading-5 text-gray-300 font-mono p-4 overflow-x-auto whitespace-pre max-h-[500px] overflow-y-auto">
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}

function FindingRow({ finding, advancedMode }: { finding: Finding; advancedMode: boolean }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const sev = finding.result.severity as keyof typeof SEVERITY_CONFIG
  const cfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.info

  return (
    <div className={`px-4 py-3 ${expanded ? cfg.bg : ''} transition-colors`}>
      <button
        className="w-full flex items-start gap-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-sm mt-0.5 flex-shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-200 leading-relaxed">
            {advancedMode
              ? finding.result.explanation.advanced
              : finding.result.explanation.simple}
          </p>
          {finding.fixAvailable && !expanded && (
            <span className="text-[10px] text-accent-primary mt-1 inline-block">
              Fix available →
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className={`mt-3 ml-6 p-3 rounded-lg border ${cfg.border} ${cfg.bg}`}>
          {/* Always show advanced details when expanded in report */}
          <p className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
            {finding.result.explanation.advanced}
          </p>
          {finding.fixAvailable && (
            <button
              className="mt-3 text-xs text-accent-primary hover:underline flex items-center gap-1.5"
              onClick={(e) => { e.stopPropagation() /* Phase 2: trigger fix */ }}
            >
              🔧 Apply Fix
            </button>
          )}
          <p className="text-[10px] text-gray-600 mt-2">Rule ID: {finding.id}</p>
        </div>
      )}
    </div>
  )
}
