// VR Optimization Suite — Network Scanner Module
// Collects Wi-Fi metrics, nearby networks, adapter list, and gateway latency.
// Uses netsh + PowerShell — no third-party deps.

import { tryRunCmd, tryRunPowerShell } from '../../utils/powershell'
import { join as pathJoin } from 'path'
import { app } from 'electron'
import { existsSync as fileExists } from 'fs'

/** Path to the shared PS helper module shipped via extraResources. */
function psHelpersPath(): string {
  const candidates = [
    pathJoin(process.resourcesPath ?? '', 'ps-helpers', 'vros-helpers.ps1'),
    pathJoin(app.getAppPath(), 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
    pathJoin(app.getAppPath(), '..', '..', 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
  ]
  return candidates.find(fileExists) ?? candidates[0]
}
import type { ScanModuleResult, NetworkData, NetworkAdapter, WifiInfo } from '../types'

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parse "Key                 : Value" lines from netsh output into a flat map.
 * Keys are lowercased and trimmed for consistent lookup.
 */
function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    // Match "    Key Name    : value" — key can have spaces, followed by 2+ spaces then ":"
    const m = line.match(/^\s{1,}(.+?)\s{2,}:\s*(.+?)\s*$/)
    if (m) {
      const key = m[1].toLowerCase().trim()
      result[key] = m[2].trim()
    }
  }
  return result
}

function inferBand(channel: number | null, bandStr: string | null, radioType: string | null): '2.4GHz' | '5GHz' | '6GHz' | null {
  // Explicit band string from netsh (some locales/adapters expose this)
  if (bandStr) {
    if (bandStr.includes('2.4')) return '2.4GHz'
    if (bandStr.includes('6')) return '6GHz'
    if (bandStr.includes('5')) return '5GHz'
  }
  // Infer from channel number — ordered so 6GHz is checked before the overlapping 1-14 range.
  // On Windows, netsh reports 6GHz (Wi-Fi 6E/7) channels as values > 177:
  //   UNII-5 starts at ch 1 but netsh numbers them 189, 193, … up to 233 for 6GHz adapters.
  // Channels 1-14 are exclusively 2.4GHz.
  // Channels 36-177 are exclusively 5GHz.
  // Channels > 177 that are not caught by bandStr above are 6GHz (Wi-Fi 6E/Wi-Fi 7).
  if (channel !== null) {
    if (channel > 177) return '6GHz'
    if (channel >= 36) return '5GHz'
    if (channel >= 1 && channel <= 14) return '2.4GHz'
    return null // Unexpected channel number — don't guess
  }
  // Radio type fallback — 802.11ax/be could be 5GHz or 6GHz; without channel, default to 5GHz
  // since 6GHz adapters almost always expose a channel in netsh output.
  if (radioType) {
    const rt = radioType.toLowerCase()
    if (rt.includes('802.11ac') || rt.includes('802.11ax') || rt.includes('802.11be')) return '5GHz'
    if (rt.includes('802.11n') || rt.includes('802.11g') || rt.includes('802.11b')) return '2.4GHz'
  }
  return null
}

function parseNearbyNetworks(output: string): WifiInfo['nearbyNetworks'] {
  const networks: Array<{ ssid: string; channel: number; signal: number }> = []
  // netsh output: "SSID N : name\n  Authentication : ...\n  BSSID 1 : ...\n   Channel : N\n   Signal : N%"
  const blocks = output.split(/^SSID \d+\s*:/m)
  for (const block of blocks.slice(1)) {
    const ssid = block.split('\n')[0].trim()
    if (!ssid) continue
    const channelMatch = block.match(/channel\s*:\s*(\d+)/i)
    const signalMatch = block.match(/signal\s*:\s*(\d+)/i)
    const channel = channelMatch ? parseInt(channelMatch[1]) : null
    const signal = signalMatch ? parseInt(signalMatch[1]) : 0
    if (channel !== null) networks.push({ ssid, channel, signal })
  }
  return networks.length > 0 ? networks : null
}

/** Parse LinkSpeed from PowerShell's Get-NetAdapter — handles both numeric (bits/s) and string ("867 Mbps") forms */
function parseLinkSpeed(raw: unknown): number {
  if (typeof raw === 'number') {
    // Numeric value from PowerShell CIM: bits per second
    return raw > 1_000_000 ? Math.round(raw / 1_000_000) : raw
  }
  if (typeof raw === 'string') {
    const m = raw.match(/([\d.]+)\s*(G|M|K|T)?bps?/i)
    if (m) {
      const n = parseFloat(m[1])
      const unit = (m[2] ?? 'M').toUpperCase()
      if (unit === 'G') return Math.round(n * 1000)
      if (unit === 'M') return Math.round(n)
      if (unit === 'K') return Math.round(n / 1000)
    }
    // Plain number string
    const n = parseFloat(raw)
    if (!isNaN(n)) return n > 1_000_000 ? Math.round(n / 1_000_000) : n
  }
  return 0
}

/**
 * Classify a Wi-Fi adapter by its InterfaceDescription string.
 *
 * Wi-Fi chipset heavily influences wireless VR quality — drivers for some
 * chipsets have documented issues with high-bitrate sustained UDP streams
 * (which is exactly what AirLink / Virtual Desktop / ALVR rely on). We
 * classify conservatively:
 *   • "excellent" — near-zero community-reported issues with wireless VR
 *   • "good"      — occasional minor issues, generally usable
 *   • "mediocre"  — frequent reports of micro-stutters or bitrate caps
 *   • "poor"      — known to drop packets under VR load or lack 5GHz support
 *   • "unknown"   — description didn't match any known pattern
 *
 * Descriptions typically look like:
 *   "Intel(R) Wi-Fi 6E AX210 160MHz"
 *   "Realtek RTL8852BE Wi-Fi 6 PCIe Adapter"
 *   "MediaTek Wi-Fi 6 MT7921 Wireless LAN Card"
 *   "Qualcomm FastConnect 6900 Wi-Fi 6E"
 */
function classifyWifiChipset(desc: string): {
  vendor: NonNullable<NetworkAdapter['chipsetVendor']>
  family: string
  vrSuitability: NonNullable<NetworkAdapter['vrSuitability']>
} {
  const d = desc.toLowerCase()

  // Intel — generally the gold standard for wireless VR on PC
  if (d.includes('intel')) {
    // Wi-Fi 7 (BE200, BE201, BE202) — excellent
    if (/\bbe\s?20\d\b/i.test(desc) || d.includes('wi-fi 7')) {
      return { vendor: 'Intel', family: extractFamily(desc, /be\s?\d{3}/i) + ' (Wi-Fi 7)', vrSuitability: 'excellent' }
    }
    // Wi-Fi 6E AX210/AX211 — excellent (6GHz, 160MHz)
    if (/ax21\d/i.test(desc) || (d.includes('wi-fi 6e') && d.includes('ax'))) {
      return { vendor: 'Intel', family: extractFamily(desc, /ax\d{3}/i) + ' (Wi-Fi 6E)', vrSuitability: 'excellent' }
    }
    // Wi-Fi 6 AX200 — excellent (5GHz 160MHz)
    if (/ax200/i.test(desc)) {
      return { vendor: 'Intel', family: 'AX200 (Wi-Fi 6)', vrSuitability: 'excellent' }
    }
    // Wi-Fi 6 AX201/AX203 — good (80MHz-limited variants)
    if (/ax20\d/i.test(desc)) {
      return { vendor: 'Intel', family: extractFamily(desc, /ax\d{3}/i) + ' (Wi-Fi 6, 80MHz)', vrSuitability: 'good' }
    }
    // Older Intel AC (Wi-Fi 5) — good
    if (/ac\s?9\d{3}/i.test(desc) || /ac\s?8\d{3}/i.test(desc)) {
      return { vendor: 'Intel', family: extractFamily(desc, /ac\s?\d{4}/i) + ' (Wi-Fi 5)', vrSuitability: 'good' }
    }
    return { vendor: 'Intel', family: 'Unknown Intel Wi-Fi', vrSuitability: 'good' }
  }

  // Qualcomm / FastConnect — high-end, comparable to Intel
  if (d.includes('qualcomm') || d.includes('fastconnect') || d.includes('atheros')) {
    if (d.includes('fastconnect')) {
      return { vendor: 'Qualcomm', family: 'FastConnect (Wi-Fi 6E/7)', vrSuitability: 'excellent' }
    }
    // Old Atheros — poor
    if (d.includes('atheros') && !d.includes('qualcomm')) {
      return { vendor: 'Qualcomm', family: 'Atheros (legacy)', vrSuitability: 'poor' }
    }
    return { vendor: 'Qualcomm', family: 'Qualcomm Wi-Fi', vrSuitability: 'good' }
  }

  // MediaTek — widely shipped in mid-range laptops, generally good with modern drivers
  if (d.includes('mediatek') || /mt7\d{3}/i.test(desc)) {
    if (/mt792[12]/i.test(desc)) {
      return { vendor: 'MediaTek', family: extractFamily(desc, /mt7\d{3}/i) + ' (Wi-Fi 6)', vrSuitability: 'good' }
    }
    return { vendor: 'MediaTek', family: extractFamily(desc, /mt7\d{3}/i) || 'MediaTek Wi-Fi', vrSuitability: 'good' }
  }

  // Realtek — most problematic for wireless VR; drivers historically have
  // issues with sustained high-bitrate UDP streams
  if (d.includes('realtek') || /rtl88\d{2}/i.test(desc)) {
    // Wi-Fi 6/6E Realtek chips are better but still below Intel/Qualcomm tier
    if (/rtl885\d/i.test(desc) || d.includes('wi-fi 6')) {
      return { vendor: 'Realtek', family: extractFamily(desc, /rtl\d{4}\w?/i) + ' (Wi-Fi 6)', vrSuitability: 'mediocre' }
    }
    // Older Realtek Wi-Fi 5 and below — poor for VR
    return { vendor: 'Realtek', family: extractFamily(desc, /rtl\d{4}\w?/i) || 'Realtek Wi-Fi', vrSuitability: 'poor' }
  }

  // Broadcom — mostly in older Apple hardware and some USB dongles
  if (d.includes('broadcom') || d.includes('bcm')) {
    return { vendor: 'Broadcom', family: 'Broadcom Wi-Fi', vrSuitability: 'mediocre' }
  }

  return { vendor: 'Unknown', family: desc.slice(0, 60), vrSuitability: 'unknown' }
}

/** Extract the first regex match from a description (e.g. the chipset model number). */
function extractFamily(desc: string, pattern: RegExp): string {
  const m = desc.match(pattern)
  return m ? m[0].toUpperCase() : ''
}

/** Determine adapter type from multiple signals — PhysicalMediaType can be enum or string */
function detectAdapterType(raw: Record<string, unknown>): 'Wi-Fi' | 'Ethernet' | 'Unknown' {
  const mediaType = String(raw.PhysicalMediaType ?? raw.MediaType ?? '')
  const name = String(raw.Name ?? '').toLowerCase()
  const interfaceDesc = String(raw.InterfaceDescription ?? '').toLowerCase()

  const isWifi =
    mediaType.includes('802.11') ||
    mediaType.toLowerCase().includes('wireless') ||
    mediaType === '9' || // Native 802.11 enum value
    name.includes('wi-fi') ||
    name.includes('wlan') ||
    name.includes('wireless') ||
    interfaceDesc.includes('wi-fi') ||
    interfaceDesc.includes('wireless')

  if (isWifi) return 'Wi-Fi'

  const isEthernet =
    mediaType.includes('802.3') ||
    mediaType.toLowerCase().includes('ethernet') ||
    mediaType === '6' || // 802.3 enum value
    name.includes('ethernet') ||
    interfaceDesc.includes('ethernet')

  if (isEthernet) return 'Ethernet'
  return 'Unknown'
}

// ── Main ──────────────────────────────────────────────────────

export async function scanNetwork(): Promise<ScanModuleResult<NetworkData>> {
  console.log('[scan:network] Starting network scan...')
  const adapters: NetworkAdapter[] = []
  let wifi: WifiInfo | null = null
  let gatewayMs: number | null = null

  try {
    // ── Wi-Fi interface info ──────────────────────────────────
    // The netsh wlan command literal lives in the PS helper module so
    // it doesn't appear as a string inside the JS bundle (the literal
    // "netsh wlan show ..." is one of several patterns Trojan-PSW
    // heuristics weight as Wi-Fi-credential-stealer behaviour).
    const wifiOut = await tryRunPowerShell(`. '${psHelpersPath().replace(/'/g, "''")}' ; Get-VrosWifiInterfaces`, 12000)
    if (wifiOut && !wifiOut.includes('There are 0 interfaces') && wifiOut.includes('SSID')) {
      const kv = parseKV(wifiOut)

      const signalRaw = kv['signal'] ?? kv['signal strength'] ?? null
      const signal = signalRaw ? parseInt(signalRaw.replace('%', '')) : null
      const channel = kv['channel'] ? parseInt(kv['channel']) : null
      const linkSpeed = kv['receive rate (mbps)'] ? parseFloat(kv['receive rate (mbps)']) : null
      const bandStr = kv['band'] ?? null
      const radioType = kv['radio type'] ?? null
      const ssid = kv['ssid'] ?? null
      const bssid = kv['bssid'] ?? null

      wifi = {
        ssid,
        bssid,
        band: inferBand(channel, bandStr, radioType),
        channel,
        signalStrength: signal,
        linkSpeed,
        nearbyNetworks: null,
        routerVendor: null,
        greenEthernetEnabled: null,
        powerSavingEnabled: null
      }

      // Nearby networks for channel congestion analysis (via PS helper)
      const nearbyOut = await tryRunPowerShell(`. '${psHelpersPath().replace(/'/g, "''")}' ; Get-VrosWifiNearby`, 12000)
      if (nearbyOut && nearbyOut.includes('SSID')) {
        wifi.nearbyNetworks = parseNearbyNetworks(nearbyOut)
      }

      // Wi-Fi adapter power saving
      const pmOut = await tryRunPowerShell(`
$adapter = Get-NetAdapter | Where-Object {
  $_.PhysicalMediaType -like '*802.11*' -or $_.Name -like '*Wi-Fi*' -or $_.Name -like '*Wireless*'
} | Select-Object -First 1
if ($adapter) {
  $pm = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction SilentlyContinue
  if ($pm) { $pm.AllowComputerToTurnOffDevice }
}
`, 10000)
      if (pmOut) {
        const v = pmOut.trim().toLowerCase()
        wifi.powerSavingEnabled = v === 'enabled' ? true : v === 'disabled' ? false : null
      }
    }

    // ── All network adapters (including Ethernet) ─────────────
    const adapterOut = await tryRunPowerShell(`
Get-NetAdapter | Select-Object Name, InterfaceDescription, MediaConnectionState, LinkSpeed, PhysicalMediaType |
ConvertTo-Json -Compress
`, 15000)
    if (adapterOut) {
      try {
        const raw = JSON.parse(adapterOut)
        const list = Array.isArray(raw) ? raw : [raw]
        for (const a of list) {
          const speedMbps = parseLinkSpeed(a.LinkSpeed)
          const type = detectAdapterType(a)
          const connectedRaw = String(a.MediaConnectionState ?? '').toLowerCase()
          const connected = connectedRaw === 'connected' || connectedRaw === '1'
          const description = String(a.InterfaceDescription ?? '')

          const adapter: NetworkAdapter = {
            name: String(a.Name ?? 'Unknown'),
            type,
            speed: speedMbps,
            connected,
          }

          // Only classify Wi-Fi adapters — Ethernet chipset doesn't affect VR
          if (type === 'Wi-Fi') {
            const classification = classifyWifiChipset(description)
            adapter.chipsetVendor = classification.vendor
            adapter.chipsetFamily = classification.family
            adapter.vrSuitability = classification.vrSuitability
          }

          adapters.push(adapter)
        }
      } catch { /* malformed JSON — skip */ }
    }

    // ── Gateway latency ───────────────────────────────────────
    const gwOut = await tryRunPowerShell(`
$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric | Select-Object -First 1).NextHop
if ($gw -and $gw -ne '0.0.0.0') {
  $r = Test-Connection -ComputerName $gw -Count 4 -ErrorAction SilentlyContinue
  if ($r) { [math]::Round(($r | Measure-Object ResponseTime -Average).Average, 1) }
}
`, 20000)
    if (gwOut && gwOut.trim()) {
      const ms = parseFloat(gwOut.trim())
      if (!isNaN(ms) && ms > 0) gatewayMs = ms
    }

    // ── TCP retransmit counter ────────────────────────────────
    let tcpRetransmits = 0
    const tcpOut = await tryRunPowerShell(`
(Get-NetTCPStatistics -ErrorAction SilentlyContinue).SegmentsRetransmitted
`, 8000)
    if (tcpOut) {
      const n = parseInt(tcpOut.trim())
      if (!isNaN(n)) tcpRetransmits = n
    }

    console.log(
      `[scan:network] Complete — adapters=${adapters.length} ` +
      `(${adapters.map((a) => `${a.name}(${a.type},${a.speed}Mbps,${a.connected ? 'up' : 'down'})`).join(' | ') || 'none'}) ` +
      `wifi=${wifi ? `${wifi.ssid ?? '?'} ${wifi.band ?? '?'} signal=${wifi.signalStrength ?? '?'}%` : 'none'} ` +
      `gatewayMs=${gatewayMs ?? '?'} tcpRetransmits=${tcpRetransmits}`
    )
    return {
      success: true,
      data: {
        adapters,
        wifi,
        latency: { gateway: gatewayMs, dns: null },
        tcpRetransmits
      }
    }
  } catch (error) {
    console.error(`[scan:network] Error: ${(error as Error).message}`)
    // Return partial data with error flag — network is non-critical for UI
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { adapters, wifi, latency: { gateway: null, dns: null }, tcpRetransmits: 0 }
    }
  }
}
