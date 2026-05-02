// Scan state: progress, results, findings, health cards.

import { create } from 'zustand'
import type { ScanData, ScanProgress } from '../../main/scanner/types'
import type { Finding, HealthCardData, HealthStatus, RuleCategory, ActionPlan } from '../../main/rules/types'

/**
 * Dedupe a list of {name, cpuPercent, ramMB} items by case-insensitive name.
 * Combines duplicates (msedgewebview2 ×11, discord ×7) instead of repeating
 * the same name over and over in the RAW DATA panel. Sorted by count desc.
 */
/**
 * Coerce any value to a comma-joined string. Defends against PowerShell
 * ConvertTo-Json returning a bare string when a single element is present,
 * which otherwise throws "x.join is not a function" at render time.
 */
function toStringList(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ')
  if (typeof v === 'string' && v.length > 0) return v
  return ''
}

function summariseProcessList(
  list: Array<{ name: string; cpuPercent: number; ramMB: number }>,
  limit = 12,
): string {
  const map = new Map<string, { name: string; count: number; cpu: number; ram: number }>()
  for (const p of list) {
    const key = p.name.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      existing.cpu += p.cpuPercent
      existing.ram += p.ramMB
    } else {
      map.set(key, { name: p.name, count: 1, cpu: p.cpuPercent, ram: p.ramMB })
    }
  }
  const deduped = [...map.values()].sort((a, b) => b.count - a.count || b.ram - a.ram)
  const head = deduped.slice(0, limit)
  const tail = deduped.length - head.length
  const parts = head.map((d) => (d.count > 1 ? `${d.name} ×${d.count}` : d.name))
  if (tail > 0) parts.push(`+${tail} more`)
  return parts.join(', ')
}


const CATEGORY_LABELS: Record<RuleCategory, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'Memory',
  storage: 'Storage',
  network: 'Network',
  'vr-runtime': 'VR Runtime',
  processes: 'Processes',
  'os-config': 'OS Config',
  streaming: 'Streaming',
  audio: 'Audio',
  usb: 'USB'
}

const PHASE1_CATEGORIES: RuleCategory[] = [
  'cpu', 'gpu', 'ram', 'storage', 'network', 'vr-runtime', 'processes', 'os-config'
]

function severityToStatus(findings: Finding[]): HealthStatus {
  if (findings.some((f) => f.result.severity === 'critical')) return 'critical'
  if (findings.some((f) => f.result.severity === 'warning')) return 'warning'
  if (findings.length > 0) return 'healthy'
  return 'healthy'
}

function buildQuickStats(category: RuleCategory, scanData: ScanData): string {
  switch (category) {
    case 'cpu': {
      const cpu = scanData.cpu
      if (!cpu) return 'No data'
      return `${cpu.avgUsage.toFixed(0)}% avg · ${cpu.cores} cores`
    }
    case 'gpu': {
      const gpu = scanData.gpu?.devices[0]
      if (!gpu) return 'No data'
      const temp = gpu.temperature > 0 ? `${gpu.temperature}°C · ` : ''
      return `${temp}${gpu.utilization.toFixed(0)}% util`
    }
    case 'ram': {
      const ram = scanData.ram
      if (!ram) return 'No data'
      return `${ram.usedGB.toFixed(1)}/${ram.totalGB}GB · ${ram.usagePercent.toFixed(0)}%`
    }
    case 'storage': {
      const storage = scanData.storage
      if (!storage || storage.drives.length === 0) return 'No data'
      const vrDrive = storage.drives.find((d) => d.letter.startsWith(storage.vrInstallDrive ?? ''))
      const drive = vrDrive ?? storage.drives[0]
      return `${drive.freeGB.toFixed(0)}GB free · ${drive.type}`
    }
    case 'network': {
      const net = scanData.network
      if (!net) return 'No data'
      const wifi = net.wifi
      if (!wifi) {
        const eth = net.adapters.find((a) => a.type === 'Ethernet' && a.connected)
        return eth ? `Ethernet · ${eth.speed} Mbps` : 'No active adapters'
      }
      return `${wifi.band ?? 'Unknown'} · ${wifi.linkSpeed ?? '?'} Mbps`
    }
    case 'vr-runtime': {
      const rt = scanData.vrRuntime
      if (!rt) return 'No data'
      const runtime = rt.activeRuntime ?? 'none'
      return `${runtime} · SS: ${rt.supersampling != null ? `${(rt.supersampling * 100).toFixed(0)}%` : 'auto'}`
    }
    case 'processes': {
      const procs = scanData.processes
      if (!procs) return 'No data'
      return `${procs.all.length} running · ${procs.bloat.length} bloat`
    }
    case 'os-config': {
      const os = scanData.osConfig
      if (!os) return 'No data'
      return os.powerPlan
    }
    default:
      return ''
  }
}


type RawRow = { label: string; value: string }

function buildRawData(category: RuleCategory, scanData: ScanData): RawRow[] | undefined {
  switch (category) {
    case 'cpu': {
      const cpu = scanData.cpu
      if (!cpu) return undefined
      const rows: RawRow[] = [
        { label: 'Model', value: cpu.model },
        { label: 'Cores / Threads', value: `${cpu.cores}C / ${cpu.threads}T` },
        { label: 'Base Clock', value: `${cpu.baseClock} MHz` },
        { label: 'Boost Clock', value: cpu.boostClock > 0 ? `${cpu.boostClock} MHz` : 'N/A' },
        { label: 'Architecture', value: cpu.architecture || 'Unknown' },
        { label: 'Avg Usage', value: `${cpu.avgUsage.toFixed(1)}%` },
        { label: 'Temperature', value: cpu.temperature != null ? `${cpu.temperature}°C` : 'N/A' },
        { label: 'Context Switches/s', value: cpu.contextSwitchesPerSec.toLocaleString() },
        { label: 'VCache', value: cpu.hasVCache ? 'Present' : 'Not present' }
      ]
      if (cpu.perCoreUsage.length > 0) {
        const coreStr = cpu.perCoreUsage.map((u, i) => `C${i}:${u.toFixed(0)}%`).join('  ')
        rows.push({ label: 'Per-Core Usage', value: coreStr })
      }
      return rows
    }
    case 'gpu': {
      const gpuData = scanData.gpu
      if (!gpuData || gpuData.devices.length === 0) return undefined
      const rows: RawRow[] = []
      gpuData.devices.forEach((gpu, i) => {
        const prefix = gpuData.devices.length > 1 ? `GPU ${i}: ` : ''
        rows.push(
          { label: `${prefix}Name`, value: gpu.name },
          { label: `${prefix}Vendor`, value: gpu.vendor },
          { label: `${prefix}Driver`, value: gpu.driverVersion || 'Unknown' },
          { label: `${prefix}VRAM Total`, value: gpu.vramTotal >= 1024 ? `${(gpu.vramTotal / 1024).toFixed(1)} GB` : `${gpu.vramTotal} MB` },
          { label: `${prefix}VRAM Used`, value: gpu.vramUsed > 0 ? (gpu.vramUsed >= 1024 ? `${(gpu.vramUsed / 1024).toFixed(1)} GB` : `${gpu.vramUsed} MB`) : 'N/A' },
          { label: `${prefix}Utilization`, value: `${gpu.utilization.toFixed(1)}%` },
          { label: `${prefix}Temperature`, value: gpu.temperature > 0 ? `${gpu.temperature}°C` : 'N/A' },
          { label: `${prefix}Power Draw`, value: gpu.powerDraw > 0 ? `${gpu.powerDraw.toFixed(1)} W` : 'N/A' },
          { label: `${prefix}Power Limit`, value: gpu.powerLimit > 0 ? `${gpu.powerLimit.toFixed(1)} W` : 'N/A' },
          { label: `${prefix}Encoder Util`, value: gpu.encoderUtilization > 0 ? `${gpu.encoderUtilization.toFixed(1)}%` : 'N/A' },
          { label: `${prefix}Decoder Util`, value: gpu.decoderUtilization > 0 ? `${gpu.decoderUtilization.toFixed(1)}%` : 'N/A' },
          { label: `${prefix}PCIe Gen`, value: gpu.pcieGen > 0 ? `Gen ${gpu.pcieGen} x${gpu.pcieLinkWidth}` : 'N/A' },
          { label: `${prefix}ReBAR`, value: gpu.rebarEnabled ? 'Enabled' : 'Disabled' },
          { label: `${prefix}HAGS`, value: gpu.hagsEnabled ? 'Enabled' : 'Disabled' }
        )
      })
      return rows
    }
    case 'ram': {
      const ram = scanData.ram
      if (!ram) return undefined
      return [
        { label: 'Total', value: `${ram.totalGB.toFixed(1)} GB` },
        { label: 'Used', value: `${ram.usedGB.toFixed(1)} GB (${ram.usagePercent.toFixed(0)}%)` },
        { label: 'Available', value: `${ram.availableGB.toFixed(1)} GB` },
        { label: 'Type', value: ram.type },
        { label: 'Speed (Actual)', value: `${ram.speed} MHz` },
        { label: 'Speed (XMP/EXPO)', value: ram.xmpSpeed ? `${ram.xmpSpeed} MHz` : 'N/A' },
        { label: 'Channels', value: String(ram.channels) },
        { label: 'Commit Charge', value: `${ram.commitChargePercent.toFixed(1)}%` },
        { label: 'Non-Paged Pool', value: `${ram.nonpagedPoolMB.toFixed(0)} MB` },
        { label: 'Modified Pages', value: `${ram.modifiedPagesMB.toFixed(0)} MB` }
      ]
    }
    case 'storage': {
      const storage = scanData.storage
      if (!storage) return undefined
      const rows: RawRow[] = []
      for (const drive of storage.drives) {
        const usedGB = drive.totalGB - drive.freeGB
        rows.push(
          { label: `${drive.letter}: Type`, value: drive.type },
          { label: `${drive.letter}: Free`, value: `${drive.freeGB.toFixed(1)} GB / ${drive.totalGB.toFixed(1)} GB` },
          { label: `${drive.letter}: Used`, value: `${usedGB.toFixed(1)} GB (${(usedGB / drive.totalGB * 100).toFixed(0)}%)` },
          { label: `${drive.letter}: Queue`, value: drive.queueLength > 0 ? drive.queueLength.toFixed(2) : '0' }
        )
        if (drive.temperature) rows.push({ label: `${drive.letter}: Temp`, value: `${drive.temperature}°C` })
        if (drive.wearPercent != null) rows.push({ label: `${drive.letter}: NVMe Wear`, value: `${drive.wearPercent}%` })
      }
      if (storage.vrInstallDrive) rows.push({ label: 'VR Install Drive', value: storage.vrInstallDrive })
      if (storage.shaderCacheSizeMB > 0) rows.push({ label: 'Shader Cache', value: `${(storage.shaderCacheSizeMB / 1024).toFixed(2)} GB` })
      if (storage.vrchatCacheSizeGB > 0) rows.push({ label: 'VRChat Cache', value: `${storage.vrchatCacheSizeGB.toFixed(2)} GB` })
      return rows
    }
    case 'network': {
      const net = scanData.network
      if (!net) return undefined
      const rows: RawRow[] = []
      // Adapters
      for (const a of net.adapters) {
        rows.push({
          label: `${a.type}: ${a.name}`,
          value: a.connected ? `Connected · ${a.speed > 0 ? `${a.speed} Mbps` : 'Speed N/A'}` : 'Disconnected'
        })
      }
      // Wi-Fi details
      if (net.wifi) {
        const w = net.wifi
        if (w.ssid) rows.push({ label: 'Wi-Fi SSID', value: w.ssid })
        if (w.band) rows.push({ label: 'Wi-Fi Band', value: w.band })
        if (w.channel) rows.push({ label: 'Wi-Fi Channel', value: String(w.channel) })
        if (w.signalStrength != null) rows.push({ label: 'Wi-Fi Signal', value: `${w.signalStrength}%` })
        if (w.linkSpeed != null) rows.push({ label: 'Wi-Fi Link Speed', value: `${w.linkSpeed} Mbps` })
        if (w.powerSavingEnabled != null) rows.push({ label: 'Wi-Fi Power Saving', value: w.powerSavingEnabled ? 'On' : 'Off' })
        if (w.nearbyNetworks) {
          const sameChannel = w.channel ? w.nearbyNetworks.filter((n) => n.channel === w.channel).length : 0
          rows.push({ label: 'Nearby Networks', value: `${w.nearbyNetworks.length} detected${sameChannel > 0 ? ` (${sameChannel} on same channel)` : ''}` })
        }
      }
      // Latency
      if (net.latency.gateway != null) rows.push({ label: 'Gateway Latency', value: `${net.latency.gateway} ms` })
      if (net.tcpRetransmits > 0) rows.push({ label: 'TCP Retransmits', value: net.tcpRetransmits.toLocaleString() })
      return rows
    }
    case 'vr-runtime': {
      const rt = scanData.vrRuntime
      if (!rt) return undefined
      const rows: RawRow[] = [
        { label: 'Active Runtime', value: rt.activeRuntime ?? 'None detected' },
        { label: 'OpenXR Runtime', value: rt.openxrRuntime ?? 'N/A' },
        { label: 'SteamVR', value: rt.steamvrInstalled ? `Installed${rt.steamvrVersion ? ` v${rt.steamvrVersion}` : ''}` : 'Not installed' },
        { label: 'Oculus Software', value: rt.oculusInstalled ? `Installed${rt.oculusVersion ? ` v${rt.oculusVersion}` : ''}` : 'Not installed' },
        { label: 'WMR', value: rt.wmrInstalled ? 'Installed' : 'Not installed' },
        { label: 'Supersampling', value: rt.supersampling != null ? `${(rt.supersampling * 100).toFixed(0)}%` : 'Auto' },
        { label: 'Reprojection', value: rt.reprojectionMode ?? 'Unknown' },
        { label: 'Motion Smoothing', value: rt.motionSmoothingEnabled != null ? (rt.motionSmoothingEnabled ? 'Enabled' : 'Disabled') : 'Unknown' }
      ]
      return rows
    }
    case 'processes': {
      const procs = scanData.processes
      if (!procs) return undefined
      const rows: RawRow[] = [
        { label: 'Total Processes', value: String(procs.all.length) },
        { label: 'VR Critical', value: String(procs.vrCritical.length) },
        { label: 'VR Overlays', value: String(procs.vrOverlay.length) },
        { label: 'VR Tracking', value: String(procs.vrTracking.length) },
        { label: 'Streaming Apps', value: String(procs.streaming.length) },
        // Dedupe duplicates so the list reads "msedgewebview2 ×11, discord ×7" instead of
        // "discord, discord, discord, ...". Shows unique-app count in the prefix; total-instance
        // count is on the Total Processes row above.
        { label: 'Bloat Processes', value: procs.bloat.length > 0 ? `${new Set(procs.bloat.map((p) => p.name.toLowerCase())).size} unique (${procs.bloat.length} instances): ${summariseProcessList(procs.bloat)}` : 'None' },
        { label: 'Audio Apps', value: String(procs.audio.length) }
      ]
      if (procs.vrCritical.length > 0) {
        // Dedupe VR processes too (vrserver/vrcompositor often spawn helpers)
        const vrDeduped = [...new Map(procs.vrCritical.map((p) => [p.name.toLowerCase(), p])).values()]
        rows.push({ label: 'VR Processes', value: vrDeduped.map((p) => `${p.name} (${p.cpuPercent.toFixed(1)}% CPU)`).join(', ') })
      }
      return rows
    }
    case 'os-config': {
      const os = scanData.osConfig
      if (!os) return undefined
      return [
        { label: 'Windows Build', value: `${os.windowsVersion} (Build ${os.windowsBuild})` },
        { label: 'Power Plan', value: os.powerPlan },
        { label: 'Game Mode', value: os.gameModeEnabled ? 'Enabled' : 'Disabled' },
        { label: 'HPET', value: os.hpetEnabled != null ? (os.hpetEnabled ? 'Enabled' : 'Disabled') : 'Unknown' },
        { label: 'Timer Resolution', value: os.timerResolution ? `${os.timerResolution.current.toFixed(3)} ms` : 'Unknown' },
        // Defensive coercion: old scans / PowerShell single-item returns can
        // leave defenderExclusions/virtualizationDrivers as a bare string.
        { label: 'Defender Exclusions', value: toStringList(os.defenderExclusions) || 'None' },
        { label: 'Startup Items', value: `${os.startupItems.length} total (${os.startupItems.filter((s) => s.enabled).length} enabled)` },
        { label: 'Virt. Drivers', value: toStringList(os.virtualizationDrivers) || 'None' }
      ]
    }
    default:
      return undefined
  }
}

function buildSummary(category: RuleCategory, scanData: ScanData): string {
  switch (category) {
    case 'cpu': return scanData.cpu?.model ?? 'Unknown CPU'
    case 'gpu': return scanData.gpu?.devices[0]?.name ?? 'Unknown GPU'
    case 'ram': return `${scanData.ram?.totalGB ?? '?'}GB ${scanData.ram?.type ?? ''} @ ${scanData.ram?.speed ?? '?'}MHz`
    case 'vr-runtime': {
      const rt = scanData.vrRuntime
      if (!rt) return 'Not detected'
      if (rt.steamvrInstalled) return `SteamVR${rt.steamvrVersion ? ` ${rt.steamvrVersion}` : ''}`
      if (rt.oculusInstalled) return 'Oculus PC Software'
      return 'No runtime detected'
    }
    default: return ''
  }
}

function buildHealthCards(findings: Finding[], scanData: ScanData): HealthCardData[] {
  const grouped: Record<string, Finding[]> = {}
  for (const f of findings) {
    const cat = f.result.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(f)
  }

  return PHASE1_CATEGORIES.map((category) => {
    const categoryFindings = grouped[category] ?? []
    const status: HealthStatus =
      scanData.errors[category] ? 'error' : severityToStatus(categoryFindings)

    return {
      category,
      label: CATEGORY_LABELS[category] ?? category,
      status,
      counts: {
        critical: categoryFindings.filter((f) => f.result.severity === 'critical').length,
        warning: categoryFindings.filter((f) => f.result.severity === 'warning').length,
        info: categoryFindings.filter((f) => f.result.severity === 'info').length,
        ok: categoryFindings.filter((f) => f.result.severity === 'ok').length
      },
      findings: categoryFindings,
      summary: buildSummary(category, scanData),
      quickStats: buildQuickStats(category, scanData),
      rawData: buildRawData(category, scanData)
    }
  })
}


/**
 * Snapshot of "what the scan looked like before fixes were applied" — captured
 * by AutoFixModal at the moment it kicks off the first fix. Held in-memory so
 * that after the user re-scans (manually or via the "verify" prompt), the
 * Dashboard can render a side-by-side diff showing what improved.
 */
export interface PreFixSnapshot {
  capturedAt: number
  appliedFixIds: string[]      // populated as fixes succeed, for context in the diff UI
  findings: Finding[]
  healthCards: HealthCardData[]
  score: number                // 0-100 derived score (mirrors reports-store.computeHealthScore)
}

interface ScanState {
  isScanning: boolean
  scanProgress: ScanProgress | null
  lastScanData: ScanData | null
  findings: Finding[]
  healthCards: HealthCardData[]
  actionPlan: ActionPlan[]
  scanError: string | null
  /** Snapshot captured before auto-fix; cleared on dismiss or after comparison shown. */
  preFixSnapshot: PreFixSnapshot | null

  startScan: (options?: { headsetProfileId?: string; connectionArchetype?: string }) => Promise<void>
  cancelScan: () => void
  clearScan: () => void
  loadFromReport: (report: {
    scanData: unknown
    findings: unknown[]
    actionPlan: unknown[]
    healthCards: unknown[]
  }) => void
  /** Capture current findings + score as the "before" snapshot. Called by AutoFixModal. */
  capturePreFixSnapshot: () => void
  /** Append a fix ID to the in-flight snapshot's applied list. */
  recordAppliedFix: (fixId: string) => void
  /** Dismiss the snapshot (used when the user closes the comparison without re-scanning, or manually). */
  clearPreFixSnapshot: () => void
}

/** Severity-weighted health score — mirrors reports-store.computeHealthScore. */
function scoreFromFindings(findings: Finding[]): number {
  const crit = findings.filter((f) => f.result.severity === 'critical').length
  const warn = findings.filter((f) => f.result.severity === 'warning').length
  const info = findings.filter((f) => f.result.severity === 'info').length
  const raw = 100 - 15 * crit - 5 * warn - 1 * info
  return Math.max(0, Math.min(100, raw))
}

export const useScanStore = create<ScanState>((set, get) => ({
  isScanning: false,
  scanProgress: null,
  lastScanData: null,
  findings: [],
  healthCards: [],
  actionPlan: [],
  scanError: null,
  preFixSnapshot: null,

  capturePreFixSnapshot: (): void => {
    const { findings, healthCards } = get()
    set({
      preFixSnapshot: {
        capturedAt: Date.now(),
        appliedFixIds: [],
        findings: [...findings],
        healthCards: [...healthCards],
        score: scoreFromFindings(findings),
      },
    })
  },
  recordAppliedFix: (fixId: string): void => {
    const snap = get().preFixSnapshot
    if (!snap) return
    if (snap.appliedFixIds.includes(fixId)) return
    set({ preFixSnapshot: { ...snap, appliedFixIds: [...snap.appliedFixIds, fixId] } })
  },
  clearPreFixSnapshot: (): void => set({ preFixSnapshot: null }),

  startScan: async (options = {}) => {
    if (get().isScanning) return

    set({ isScanning: true, scanProgress: null, scanError: null })

    // Subscribe to progress events
    const api = (window as any).api
    const unsubscribe = api.scan.onProgress((progress: ScanProgress) => {
      set({ scanProgress: progress })
    })

    try {
      const scanData: ScanData = await api.scan.runFull(options)
      const findings: Finding[] = await api.rules.evaluate(scanData)
      const healthCards = buildHealthCards(findings, scanData)
      const actionPlan: ActionPlan[] = await api.summary.generate(findings, scanData).catch(() => [])

      set({
        lastScanData: scanData,
        findings,
        healthCards,
        actionPlan,
        isScanning: false,
        scanProgress: null
      })

      // Auto-save report (fire and forget)
      try {
        const { useReportsStore } = await import('./reports-store')
        useReportsStore.getState().saveCurrentScan().catch(() => {})
      } catch { /* never crash */ }
    } catch (error) {
      set({
        isScanning: false,
        scanProgress: null,
        scanError: (error as Error).message
      })
    } finally {
      unsubscribe()
    }
  },

  cancelScan: () => {
    const api = (window as any).api
    api.scan.cancel()
    set({ isScanning: false, scanProgress: null })
  },

  clearScan: () => {
    set({ lastScanData: null, findings: [], healthCards: [], actionPlan: [], scanError: null })
  },

  loadFromReport: (report) => {
    set({
      lastScanData: report.scanData as ScanData,
      findings: report.findings as Finding[],
      healthCards: report.healthCards as HealthCardData[],
      actionPlan: report.actionPlan as ActionPlan[],
      isScanning: false,
      scanProgress: null,
      scanError: null
    })
  }
}))
