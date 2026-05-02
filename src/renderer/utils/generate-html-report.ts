// VR Optimization Suite — HTML Report Generator
// Produces a single self-contained HTML file with all styles inline.
// No external dependencies — safe to post on Reddit or email as an attachment.

import type { ScanData } from '../../main/scanner/types'
import type { Finding, ActionPlan } from '../../main/rules/types'
import type { FixHistoryEntry } from '../stores/fix-store'


function esc(str: unknown): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function row(label: string, value: string | null | undefined): string {
  if (value == null || value === '') return ''
  return `<tr><td class="spec-label">${esc(label)}</td><td class="spec-value">${esc(value)}</td></tr>`
}

function badge(text: string, cls: string): string {
  return `<span class="badge badge-${esc(cls)}">${esc(text)}</span>`
}

function overallSeverity(findings: Finding[]): 'critical' | 'warning' | 'ok' {
  if (findings.some(f => f.result.severity === 'critical')) return 'critical'
  if (findings.some(f => f.result.severity === 'warning')) return 'warning'
  return 'ok'
}

function severityLabel(sev: 'critical' | 'warning' | 'ok'): string {
  return sev === 'critical' ? 'Critical Issues Found'
    : sev === 'warning' ? 'Warnings Found'
    : 'System OK'
}

function headsetMethodLabel(method: string | null | undefined): string {
  const map: Record<string, string> = {
    'airlink': 'Meta AirLink (wireless)',
    'virtual-desktop': 'Virtual Desktop (wireless)',
    'alvr': 'ALVR (wireless)',
    'usb-link': 'USB Link (wired tether)',
    'steamvr-usb': 'SteamVR USB (wired)',
    'wmr': 'Windows Mixed Reality',
    'psvr2-pc': 'PSVR2 via PC adapter',
    'steam-link-vr': 'Steam Link VR',
    'unknown-wireless': 'Wireless (detected)',
    'unknown-wired': 'Wired (detected)',
    'none': 'No headset detected',
  }
  return method ? (map[method] ?? method) : 'Not detected'
}

function impactColor(impact: string): string {
  return impact === 'critical' ? 'red'
    : impact === 'high' ? 'amber'
    : impact === 'medium' ? 'blue'
    : 'gray'
}

function effortLabel(effort: string): string {
  return effort === 'instant' ? 'Instant'
    : effort === 'minutes' ? 'Minutes'
    : effort === 'hours' ? 'Hours'
    : 'Research needed'
}


const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --card: #1a1d27;
    --card2: #21253a;
    --border: rgba(255,255,255,0.08);
    --accent: #7c3aed;
    --accent-light: #a78bfa;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --red: #ef4444;
    --red-bg: rgba(239,68,68,0.10);
    --red-border: rgba(239,68,68,0.25);
    --amber: #f59e0b;
    --amber-bg: rgba(245,158,11,0.10);
    --amber-border: rgba(245,158,11,0.25);
    --blue: #3b82f6;
    --blue-bg: rgba(59,130,246,0.10);
    --blue-border: rgba(59,130,246,0.20);
    --green: #22c55e;
    --green-bg: rgba(34,197,94,0.10);
    --green-border: rgba(34,197,94,0.20);
    --gray: #64748b;
    --gray-bg: rgba(100,116,139,0.12);
    --gray-border: rgba(100,116,139,0.20);
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
  }

  .wrapper {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }

  .header {
    margin-bottom: 32px;
  }
  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 12px;
  }
  .app-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-light);
    margin-bottom: 6px;
  }
  .scan-title {
    font-size: 24px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .scan-meta {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 13px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .scan-meta-sep { color: var(--text-dim); }

  .severity-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.01em;
    border: 1px solid;
  }
  .severity-badge.critical { background: var(--red-bg); color: var(--red); border-color: var(--red-border); }
  .severity-badge.warning  { background: var(--amber-bg); color: var(--amber); border-color: var(--amber-border); }
  .severity-badge.ok       { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }

  .condition-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(124,58,237,0.12);
    color: var(--accent-light);
    border: 1px solid rgba(124,58,237,0.25);
  }
  .condition-pill.idle {
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
    border-color: var(--border);
  }

  .summary-counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  .count-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }
  .count-number { font-size: 28px; font-weight: 800; line-height: 1; }
  .count-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; }
  .count-card.critical .count-number { color: var(--red); }
  .count-card.warning  .count-number { color: var(--amber); }
  .count-card.info     .count-number { color: var(--blue); }

  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .specs-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .spec-group-header td {
    background: var(--card2);
    padding: 7px 14px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  .specs-table tr:not(.spec-group-header):not(:last-child) td {
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .spec-label {
    padding: 8px 14px;
    color: var(--text-dim);
    font-size: 12px;
    width: 190px;
    vertical-align: top;
    white-space: nowrap;
  }
  .spec-value {
    padding: 8px 14px;
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    word-break: break-word;
  }

  .findings-group { margin-bottom: 16px; }
  .findings-group-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .findings-group-label.critical { color: var(--red); }
  .findings-group-label.warning  { color: var(--amber); }
  .findings-group-label.info     { color: var(--blue); }

  .finding-card {
    background: var(--card);
    border-radius: 10px;
    border: 1px solid var(--border);
    border-left: 3px solid;
    padding: 12px 16px;
    margin-bottom: 8px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .finding-card.critical { border-left-color: var(--red); }
  .finding-card.warning  { border-left-color: var(--amber); }
  .finding-card.info     { border-left-color: var(--blue); }

  .finding-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
  .finding-body { flex: 1; min-width: 0; }
  .finding-rule {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .finding-explanation { font-size: 13px; color: var(--text); line-height: 1.5; }
  .finding-advanced {
    font-size: 11px;
    color: var(--text-dim);
    font-family: 'Consolas', 'Courier New', monospace;
    margin-top: 6px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .finding-footer { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .fix-chip {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    background: rgba(124,58,237,0.15);
    color: var(--accent-light);
    border: 1px solid rgba(124,58,237,0.30);
    letter-spacing: 0.04em;
  }

  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .badge-red    { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-border); }
  .badge-amber  { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }
  .badge-blue   { background: var(--blue-bg);  color: var(--blue);  border: 1px solid var(--blue-border); }
  .badge-green  { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
  .badge-gray   { background: var(--gray-bg);  color: var(--text-muted); border: 1px solid var(--gray-border); }
  .badge-purple { background: rgba(124,58,237,0.15); color: var(--accent-light); border: 1px solid rgba(124,58,237,0.30); }

  .action-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 10px;
  }
  .action-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .action-priority {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(124,58,237,0.15);
    border: 1px solid rgba(124,58,237,0.30);
    color: var(--accent-light);
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .action-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .action-summary { font-size: 12px; color: var(--text-muted); }
  .action-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
  .action-gain {
    font-size: 12px;
    color: var(--green);
    margin-bottom: 10px;
  }
  .action-gain::before { content: '↑ '; }
  .steps-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .step-item {
    font-size: 12px;
    color: var(--text-muted);
    padding: 5px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .step-num {
    display: inline-block;
    width: 18px;
    height: 18px;
    background: rgba(255,255,255,0.08);
    border-radius: 50%;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    line-height: 18px;
    margin-right: 8px;
    color: var(--text);
    flex-shrink: 0;
  }

  .fix-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    font-size: 12px;
  }
  .fix-table th {
    background: var(--card2);
    padding: 8px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }
  .fix-table td {
    padding: 9px 14px;
    color: var(--text-muted);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    vertical-align: middle;
  }
  .fix-table tr:last-child td { border-bottom: none; }
  .fix-name { color: var(--text); font-weight: 500; }

  .footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .footer-brand { font-size: 11px; font-weight: 700; color: var(--accent-light); letter-spacing: 0.08em; text-transform: uppercase; }
  .footer-note { font-size: 11px; color: var(--text-dim); }

  .no-data { color: var(--text-dim); font-size: 12px; font-style: italic; padding: 10px 0; }

  @media print {
    body { background: #fff; color: #111; }
    :root {
      --bg: #fff; --card: #f8f9fa; --card2: #f1f3f5; --border: #dee2e6;
      --text: #212529; --text-muted: #495057; --text-dim: #6c757d;
    }
    .wrapper { max-width: 100%; padding: 20px; }
    .severity-badge, .badge, .condition-pill, .fix-chip { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .finding-card { border-left-width: 3px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }

  @media (max-width: 600px) {
    .header-top { flex-direction: column; }
    .summary-counts { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .count-number { font-size: 22px; }
    .spec-label { width: 130px; }
    .action-header { flex-direction: column; }
  }
`


function buildHeaderHtml(scanData: ScanData | null, findings: Finding[]): string {
  const scanTime = scanData ? new Date(scanData.timestamp).toLocaleString() : new Date().toLocaleString()
  const duration = scanData?.scanDurationMs ? `${(scanData.scanDurationMs / 1000).toFixed(1)}s scan` : null
  const sev = overallSeverity(findings)
  const sevIcon = sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '✅'
  const condition = scanData?.scanCondition

  const conditionPill = condition
    ? `<span class="condition-pill ${condition === 'idle' ? 'idle' : ''}">
        ${condition === 'under-load' ? '🥽 Scanned during active VR session' : '💤 Scanned at idle'}
       </span>`
    : ''

  return `
  <div class="header">
    <div class="header-top">
      <div>
        <div class="app-name">Vryionics VR Optimization Suite</div>
        <div class="scan-title">System Scan Report</div>
        <div class="scan-meta">
          <span>${esc(scanTime)}</span>
          ${duration ? `<span class="scan-meta-sep">·</span><span>${esc(duration)}</span>` : ''}
          ${conditionPill}
        </div>
      </div>
      <div class="severity-badge ${sev}">
        <span>${sevIcon}</span>
        <span>${esc(severityLabel(sev))}</span>
      </div>
    </div>
  </div>`
}

function buildSummaryCountsHtml(findings: Finding[]): string {
  const critical = findings.filter(f => f.result.severity === 'critical').length
  const warning = findings.filter(f => f.result.severity === 'warning').length
  const info = findings.filter(f => f.result.severity === 'info').length

  return `
  <div class="summary-counts">
    <div class="count-card critical">
      <div class="count-number">${critical}</div>
      <div class="count-label">Critical</div>
    </div>
    <div class="count-card warning">
      <div class="count-number">${warning}</div>
      <div class="count-label">Warnings</div>
    </div>
    <div class="count-card info">
      <div class="count-number">${info}</div>
      <div class="count-label">Info</div>
    </div>
  </div>`
}

function buildSpecsHtml(scanData: ScanData): string {
  const rows: string[] = []

  const groupHeader = (label: string) =>
    `<tr class="spec-group-header"><td colspan="2">${esc(label)}</td></tr>`

  // CPU
  if (scanData.cpu) {
    const c = scanData.cpu
    rows.push(groupHeader('CPU'))
    rows.push(row('Model', c.model))
    rows.push(row('Cores / Threads', `${c.cores}C / ${c.threads}T`))
    rows.push(row('Clock', `${c.baseClock} MHz base${c.boostClock > 0 ? ` · ${c.boostClock} MHz boost` : ''}`))
    if (c.architecture) rows.push(row('Architecture', c.architecture))
    rows.push(row('Avg Usage', `${c.avgUsage.toFixed(1)}%`))
    if (c.temperature != null) rows.push(row('Temperature', `${c.temperature}°C`))
    if (c.hasVCache) rows.push(row('3D V-Cache', 'Present'))
  }

  // GPU
  if (scanData.gpu?.devices?.length) {
    for (const g of scanData.gpu.devices) {
      rows.push(groupHeader(scanData.gpu.devices.length > 1 ? `GPU (${g.name})` : 'GPU'))
      rows.push(row('Name', g.name))
      rows.push(row('VRAM', `${g.vramTotal} MB${g.vramUsed > 0 ? ` (${g.vramUsed} MB used)` : ''}`))
      rows.push(row('Driver', g.driverVersion || null))
      if (g.driverDate) rows.push(row('Driver Date', g.driverDate))
      if (g.gpuGeneration) rows.push(row('Architecture', g.gpuGeneration))
      if (g.temperature > 0) rows.push(row('Temperature', `${g.temperature}°C`))
      if (g.powerDraw > 0) rows.push(row('Power Draw', `${g.powerDraw.toFixed(0)} W${g.powerLimit > 0 ? ` / ${g.powerLimit.toFixed(0)} W limit` : ''}`))
      if (g.pcieGen > 0) rows.push(row('PCIe', `Gen ${g.pcieGen} x${g.pcieLinkWidth}`))
      rows.push(row('ReBAR / SAM', g.rebarEnabled || g.samEnabled ? 'Enabled' : 'Disabled'))
      rows.push(row('HAGS', g.hagsEnabled ? 'Enabled' : 'Disabled'))
    }
  }

  // RAM
  if (scanData.ram) {
    const r = scanData.ram
    rows.push(groupHeader('Memory (RAM)'))
    rows.push(row('Total', `${r.totalGB.toFixed(1)} GB`))
    rows.push(row('Used', `${r.usedGB.toFixed(1)} GB (${r.usagePercent.toFixed(0)}%)`))
    rows.push(row('Type', r.type))
    rows.push(row('Speed', `${r.speed} MHz${r.xmpSpeed ? ` (XMP: ${r.xmpSpeed} MHz)` : ''}`))
    rows.push(row('Channels', String(r.channels)))
  }

  // OS
  if (scanData.osConfig) {
    const o = scanData.osConfig
    rows.push(groupHeader('Operating System'))
    rows.push(row('Windows', `${o.windowsVersion} (Build ${o.windowsBuild})`))
    rows.push(row('Power Plan', o.powerPlan))
    rows.push(row('Game Mode', o.gameModeEnabled ? 'Enabled' : 'Disabled'))
    if (o.timerResolution) rows.push(row('Timer Resolution', `${o.timerResolution.current.toFixed(3)} ms`))
  }

  // VR Runtime
  if (scanData.vrRuntime) {
    const v = scanData.vrRuntime
    rows.push(groupHeader('VR Runtime'))
    rows.push(row('Active Runtime', v.activeRuntime ?? 'None detected'))
    if (v.steamvrInstalled) rows.push(row('SteamVR', v.steamvrVersion ? `v${v.steamvrVersion}` : 'Installed'))
    if (v.oculusInstalled) rows.push(row('Oculus Software', v.oculusVersion ? `v${v.oculusVersion}` : 'Installed'))
    if (v.wmrInstalled) rows.push(row('WMR', 'Installed'))
    rows.push(row('Supersampling', v.supersampling != null ? `${(v.supersampling * 100).toFixed(0)}%` : 'Auto'))
    if (v.reprojectionMode) rows.push(row('Reprojection', v.reprojectionMode))
    if (v.motionSmoothingEnabled != null) rows.push(row('Motion Smoothing', v.motionSmoothingEnabled ? 'Enabled' : 'Disabled'))
  }

  // Headset Connection
  if (scanData.headsetConnection) {
    const h = scanData.headsetConnection
    rows.push(groupHeader('Headset Connection'))
    rows.push(row('Method', headsetMethodLabel(h.method)))
    if (h.detectedDeviceName) rows.push(row('Device', h.detectedDeviceName))
    if (h.usbControllerType) rows.push(row('USB Controller', h.usbControllerType))
    if (h.usbGeneration) rows.push(row('USB Gen', h.usbGeneration))
    if (h.streamingBitrateMbps) rows.push(row('Streaming Bitrate', `${h.streamingBitrateMbps} Mbps`))
    if (h.encoderInUse) rows.push(row('Encoder', h.encoderInUse))
  }

  // Network (brief — just the key details useful for VR)
  if (scanData.network) {
    const n = scanData.network
    rows.push(groupHeader('Network'))
    if (n.wifi) {
      const w = n.wifi
      rows.push(row('Wi-Fi SSID', w.ssid ?? 'Connected'))
      rows.push(row('Band / Channel', `${w.band ?? '?'} · Ch${w.channel ?? '?'}`))
      rows.push(row('Signal Strength', w.signalStrength != null ? `${w.signalStrength}%` : null))
      rows.push(row('Link Speed', w.linkSpeed != null ? `${w.linkSpeed} Mbps` : null))
      if (w.powerSavingEnabled != null) rows.push(row('Wi-Fi Power Saving', w.powerSavingEnabled ? 'ON (bad for VR)' : 'Off'))
    }
    const eth = n.adapters.filter(a => a.type === 'Ethernet' && a.connected)
    for (const a of eth) {
      rows.push(row('Ethernet', `${a.name} · ${a.speed > 0 ? `${a.speed} Mbps` : 'connected'}`))
    }
    if (n.latency.gateway != null) rows.push(row('Gateway Latency', `${n.latency.gateway} ms`))
  }

  const validRows = rows.filter(r => r !== '')
  if (validRows.length === 0) return '<p class="no-data">No system specification data available.</p>'

  return `
  <table class="specs-table">
    <tbody>
      ${validRows.join('\n      ')}
    </tbody>
  </table>`
}

function buildFindingsHtml(findings: Finding[]): string {
  if (findings.length === 0) {
    return '<p class="no-data">No findings — system looks good!</p>'
  }

  const critical = findings.filter(f => f.result.severity === 'critical')
  const warnings = findings.filter(f => f.result.severity === 'warning')
  const info = findings.filter(f => f.result.severity === 'info')

  const renderGroup = (label: string, items: Finding[], cls: string, icon: string): string => {
    if (items.length === 0) return ''
    const cards = items.map(f => `
      <div class="finding-card ${cls}">
        <div class="finding-icon">${icon}</div>
        <div class="finding-body">
          <div class="finding-rule">${esc(f.result.ruleId)}</div>
          <div class="finding-explanation">${esc(f.result.explanation.simple)}</div>
          ${f.result.explanation.advanced !== f.result.explanation.simple
            ? `<div class="finding-advanced">${esc(f.result.explanation.advanced)}</div>`
            : ''}
          <div class="finding-footer">
            ${badge(f.result.category, cls === 'critical' ? 'red' : cls === 'warning' ? 'amber' : 'blue')}
            ${f.fixAvailable ? '<span class="fix-chip">Auto-fix available</span>' : ''}
          </div>
        </div>
      </div>`).join('')

    return `
    <div class="findings-group">
      <div class="findings-group-label ${cls}">
        <span>${icon}</span>
        <span>${esc(label)} (${items.length})</span>
      </div>
      ${cards}
    </div>`
  }

  return [
    renderGroup('Critical Issues', critical, 'critical', '🔴'),
    renderGroup('Warnings', warnings, 'warning', '🟡'),
    renderGroup('Info', info, 'info', 'ℹ️'),
  ].join('')
}

function buildActionPlanHtml(actionPlan: ActionPlan[]): string {
  if (!actionPlan || actionPlan.length === 0) {
    return '<p class="no-data">No action plan items generated for this scan.</p>'
  }

  return actionPlan.map(item => {
    const impactCls = impactColor(item.impact)
    const stepsHtml = item.steps.length > 0
      ? `<ol class="steps-list">${item.steps.map((s, i) =>
          `<li class="step-item"><span class="step-num">${i + 1}</span>${esc(s.text)}</li>`
        ).join('')}</ol>`
      : ''

    return `
    <div class="action-card">
      <div class="action-header">
        <div class="action-priority">${item.priority}</div>
        <div>
          <div class="action-title">${esc(item.title)}</div>
          <div class="action-summary">${esc(item.summary)}</div>
        </div>
      </div>
      <div class="action-meta">
        ${badge(`Impact: ${item.impact}`, impactCls)}
        ${badge(`Effort: ${effortLabel(item.effort)}`, 'gray')}
        ${badge(item.category, 'purple')}
        ${item.fixId ? '<span class="fix-chip">Auto-fix available in app</span>' : ''}
      </div>
      ${item.expectedGain ? `<div class="action-gain">${esc(item.expectedGain)}</div>` : ''}
      ${stepsHtml}
    </div>`
  }).join('')
}

function buildFixHistoryHtml(fixHistory: FixHistoryEntry[]): string {
  if (!fixHistory || fixHistory.length === 0) return ''

  const tableRows = fixHistory.map(h => {
    const applied = new Date(h.appliedAt).toLocaleString()
    const undone = h.undoneAt ? new Date(h.undoneAt).toLocaleString() : null
    const statusBadge = undone
      ? badge('Undone', 'gray')
      : badge('Applied', 'green')

    return `
      <tr>
        <td class="fix-name">${esc(h.name || h.fixId)}</td>
        <td>${esc(applied)}</td>
        <td>${undone ? esc(undone) : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td>${statusBadge}</td>
      </tr>`
  }).join('')

  return `
  <div class="section">
    <div class="section-title">Fix History</div>
    <table class="fix-table">
      <thead>
        <tr>
          <th>Fix</th>
          <th>Applied At</th>
          <th>Undone At</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>`
}


export interface HtmlReportOptions {
  scanData: ScanData | null
  findings: Finding[]
  actionPlan: ActionPlan[]
  fixHistory?: FixHistoryEntry[]
  /**
   * Redaction mode — strips personally-identifying info so the report can
   * be shared publicly (support forum posts, community help threads).
   * Redacts: hostname, Wi-Fi SSID/BSSID, user profile paths, installed-VR-tool
   * install paths, MAC addresses, email-like strings.
   */
  redact?: boolean
}


const REDACTED = '[redacted]'

/** Walk a scan-data object and strip identifying fields in-place (clone-first). */
function applyRedaction(scanData: ScanData | null): ScanData | null {
  if (!scanData) return scanData
  const clone: ScanData = JSON.parse(JSON.stringify(scanData))

  // Network — strip SSID / BSSID + remove identifying nearby-networks list
  if (clone.network?.wifi) {
    if (clone.network.wifi.ssid)  clone.network.wifi.ssid = REDACTED
    if (clone.network.wifi.bssid) clone.network.wifi.bssid = REDACTED
    if (clone.network.wifi.nearbyNetworks) clone.network.wifi.nearbyNetworks = null
  }

  // Motherboard manufacturer + BIOS version are usually fine to keep, but
  // skip full install paths in installed VR tools
  if (clone.compat?.installedVrTools) {
    for (const t of clone.compat.installedVrTools) t.installPath = REDACTED
  }

  // Storage drive letters are fine; strip drive Model SKU serial-number fragments
  // (Model typically looks like "SAMSUNG MZVL2512HDJD-00B00" — keep brand, strip serial suffix)
  if (clone.storage?.drives) {
    for (const d of clone.storage.drives) {
      // Nothing identifying — drive types + capacities aren't unique enough to redact
    }
  }

  // Remove any top-level string fields that match common PII patterns
  walkAndRedact(clone)

  return clone
}

/** Recursive string scrubber — replaces user-path-like and email-like strings. */
function walkAndRedact(obj: unknown): void {
  if (obj === null || obj === undefined) return
  if (typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string') {
      let out = v
      // C:\Users\<name>\ → C:\Users\[redacted]\
      out = out.replace(/([A-Z]:\\Users\\)([^\\]+)(\\)/gi, `$1${REDACTED}$3`)
      // Email-like strings
      out = out.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, REDACTED)
      // MAC addresses
      out = out.replace(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/gi, REDACTED)
      if (out !== v) (obj as Record<string, unknown>)[k] = out
    } else if (typeof v === 'object') {
      walkAndRedact(v)
    }
  }
}

export function generateHtmlReport(opts: HtmlReportOptions): string {
  const { findings, actionPlan, fixHistory = [], redact = false } = opts
  const scanData = redact ? applyRedaction(opts.scanData) : opts.scanData

  const headerHtml = buildHeaderHtml(scanData, findings)
  const summaryHtml = buildSummaryCountsHtml(findings)
  const specsHtml = scanData ? buildSpecsHtml(scanData) : '<p class="no-data">No scan data available.</p>'
  const findingsHtml = buildFindingsHtml(findings)
  const actionPlanHtml = buildActionPlanHtml(actionPlan)
  const fixHistoryHtml = buildFixHistoryHtml(fixHistory)

  const exportDate = new Date().toLocaleString()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VR Scan Report — ${esc(exportDate)}</title>
  <style>
${CSS}
  </style>
</head>
<body>
  <div class="wrapper">

    ${headerHtml}

    ${summaryHtml}

    <div class="section">
      <div class="section-title">System Specifications</div>
      ${specsHtml}
    </div>

    <div class="section">
      <div class="section-title">Findings</div>
      ${findingsHtml}
    </div>

    <div class="section">
      <div class="section-title">Action Plan</div>
      ${actionPlanHtml}
    </div>

    ${fixHistoryHtml}

    <div class="footer">
      <span class="footer-brand">Vryionics VR Optimization Suite</span>
      <span class="footer-note">Exported ${esc(exportDate)}</span>
    </div>

  </div>
</body>
</html>`
}
