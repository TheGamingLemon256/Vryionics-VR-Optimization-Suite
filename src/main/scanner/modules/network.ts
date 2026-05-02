// VR Optimization Suite — Network Scanner Module
// Collects Wi-Fi metrics, nearby networks, adapter list, and gateway latency.

import os from 'node:os'
import { runExe } from '../../utils/exec'
import { readValue } from '../../utils/registry-read'
import { enumerateRegistrySubkeys } from '../../utils/registry'
import type { ScanModuleResult, NetworkData, NetworkAdapter, WifiInfo } from '../types'

// Network class GUID — adapter friendly name, description, and physical
// media type all live under HKLM\SYSTEM\CurrentControlSet\Control\Class\{this}.
const NETWORK_CLASS = '{4d36e972-e325-11ce-bfc1-08002be10318}'

/**
 * Parse "Key                 : Value" lines from netsh output into a flat map.
 */
function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s{1,}(.+?)\s{2,}:\s*(.+?)\s*$/)
    if (m) {
      const key = m[1].toLowerCase().trim()
      result[key] = m[2].trim()
    }
  }
  return result
}

function inferBand(channel: number | null, bandStr: string | null, radioType: string | null): '2.4GHz' | '5GHz' | '6GHz' | null {
  if (bandStr) {
    if (bandStr.includes('2.4')) return '2.4GHz'
    if (bandStr.includes('6')) return '6GHz'
    if (bandStr.includes('5')) return '5GHz'
  }
  if (channel !== null) {
    if (channel > 177) return '6GHz'
    if (channel >= 36) return '5GHz'
    if (channel >= 1 && channel <= 14) return '2.4GHz'
    return null
  }
  if (radioType) {
    const rt = radioType.toLowerCase()
    if (rt.includes('802.11ac') || rt.includes('802.11ax') || rt.includes('802.11be')) return '5GHz'
    if (rt.includes('802.11n') || rt.includes('802.11g') || rt.includes('802.11b')) return '2.4GHz'
  }
  return null
}

function parseNearbyNetworks(output: string): WifiInfo['nearbyNetworks'] {
  const networks: Array<{ ssid: string; channel: number; signal: number }> = []
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

/**
 * Classify a Wi-Fi adapter by its InterfaceDescription string.
 * Wi-Fi chipset heavily influences wireless VR quality; the buckets correspond
 * roughly to community-reported reliability under sustained UDP load.
 */
function classifyWifiChipset(desc: string): {
  vendor: NonNullable<NetworkAdapter['chipsetVendor']>
  family: string
  vrSuitability: NonNullable<NetworkAdapter['vrSuitability']>
} {
  const d = desc.toLowerCase()

  if (d.includes('intel')) {
    if (/\bbe\s?20\d\b/i.test(desc) || d.includes('wi-fi 7')) {
      return { vendor: 'Intel', family: extractFamily(desc, /be\s?\d{3}/i) + ' (Wi-Fi 7)', vrSuitability: 'excellent' }
    }
    if (/ax21\d/i.test(desc) || (d.includes('wi-fi 6e') && d.includes('ax'))) {
      return { vendor: 'Intel', family: extractFamily(desc, /ax\d{3}/i) + ' (Wi-Fi 6E)', vrSuitability: 'excellent' }
    }
    if (/ax200/i.test(desc)) {
      return { vendor: 'Intel', family: 'AX200 (Wi-Fi 6)', vrSuitability: 'excellent' }
    }
    if (/ax20\d/i.test(desc)) {
      return { vendor: 'Intel', family: extractFamily(desc, /ax\d{3}/i) + ' (Wi-Fi 6, 80MHz)', vrSuitability: 'good' }
    }
    if (/ac\s?9\d{3}/i.test(desc) || /ac\s?8\d{3}/i.test(desc)) {
      return { vendor: 'Intel', family: extractFamily(desc, /ac\s?\d{4}/i) + ' (Wi-Fi 5)', vrSuitability: 'good' }
    }
    return { vendor: 'Intel', family: 'Unknown Intel Wi-Fi', vrSuitability: 'good' }
  }

  if (d.includes('qualcomm') || d.includes('fastconnect') || d.includes('atheros')) {
    if (d.includes('fastconnect')) {
      return { vendor: 'Qualcomm', family: 'FastConnect (Wi-Fi 6E/7)', vrSuitability: 'excellent' }
    }
    if (d.includes('atheros') && !d.includes('qualcomm')) {
      return { vendor: 'Qualcomm', family: 'Atheros (legacy)', vrSuitability: 'poor' }
    }
    return { vendor: 'Qualcomm', family: 'Qualcomm Wi-Fi', vrSuitability: 'good' }
  }

  if (d.includes('mediatek') || /mt7\d{3}/i.test(desc)) {
    if (/mt792[12]/i.test(desc)) {
      return { vendor: 'MediaTek', family: extractFamily(desc, /mt7\d{3}/i) + ' (Wi-Fi 6)', vrSuitability: 'good' }
    }
    return { vendor: 'MediaTek', family: extractFamily(desc, /mt7\d{3}/i) || 'MediaTek Wi-Fi', vrSuitability: 'good' }
  }

  if (d.includes('realtek') || /rtl88\d{2}/i.test(desc)) {
    if (/rtl885\d/i.test(desc) || d.includes('wi-fi 6')) {
      return { vendor: 'Realtek', family: extractFamily(desc, /rtl\d{4}\w?/i) + ' (Wi-Fi 6)', vrSuitability: 'mediocre' }
    }
    return { vendor: 'Realtek', family: extractFamily(desc, /rtl\d{4}\w?/i) || 'Realtek Wi-Fi', vrSuitability: 'poor' }
  }

  if (d.includes('broadcom') || d.includes('bcm')) {
    return { vendor: 'Broadcom', family: 'Broadcom Wi-Fi', vrSuitability: 'mediocre' }
  }

  return { vendor: 'Unknown', family: desc.slice(0, 60), vrSuitability: 'unknown' }
}

function extractFamily(desc: string, pattern: RegExp): string {
  const m = desc.match(pattern)
  return m ? m[0].toUpperCase() : ''
}

interface AdapterRegEntry {
  classIdx: string
  driverDesc: string
  netCfgInstanceId: string | null
  isWifi: boolean
  isEthernet: boolean
  linkSpeedMbps: number
}

async function enumerateAdapterRegistry(): Promise<AdapterRegEntry[]> {
  const subkeys = enumerateRegistrySubkeys('HKLM', `SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS}`)
  const out: AdapterRegEntry[] = []
  for (const sk of subkeys) {
    if (!/^\d{4}$/.test(sk)) continue
    const path = `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS}\\${sk}`
    const desc = await readValue(path, 'DriverDesc')
    if (!desc || (desc.type !== 'REG_SZ' && desc.type !== 'REG_EXPAND_SZ')) continue

    const guid = await readValue(path, 'NetCfgInstanceId')
    const guidStr = guid && (guid.type === 'REG_SZ' || guid.type === 'REG_EXPAND_SZ') ? guid.data : null

    const desc_l = desc.data.toLowerCase()
    const isWifi = /wi-?fi|wireless|802\.11/i.test(desc_l)
    const isEthernet = !isWifi && /ethernet|gigabit|gbe|i2[12]\d|rtl81\d{2}/i.test(desc_l)

    // *LinkSpeed isn't generally present but some adapters publish a
    // numeric "MaxSpeed" or vendor-specific field. We try a couple of
    // common ones and fall back to zero.
    let linkSpeedMbps = 0
    const maxSpeed = await readValue(path, 'MaxSpeed')
    if (maxSpeed && maxSpeed.type === 'REG_DWORD') {
      linkSpeedMbps = Math.round(maxSpeed.data / 1_000_000)
    }

    out.push({
      classIdx: sk,
      driverDesc: desc.data,
      netCfgInstanceId: guidStr,
      isWifi,
      isEthernet,
      linkSpeedMbps,
    })
  }
  return out
}

async function getDefaultGatewayIp(): Promise<string | null> {
  // route.exe prints the IPv4 routing table; the row with "0.0.0.0" as the
  // network destination has the gateway IP in the third column.
  const out = await runExe('route', ['print', '-4'], 5000)
  if (!out) return null

  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('0.0.0.0')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const gw = parts[2]
    if (gw && gw !== '0.0.0.0' && /^\d+\.\d+\.\d+\.\d+$/.test(gw)) return gw
  }
  return null
}

async function pingHost(ip: string): Promise<number | null> {
  // ping.exe -n 4 -w <timeout-per-reply-ms>
  const out = await runExe('ping', ['-n', '4', '-w', '1000', ip], 8000)
  if (!out) return null
  const m = out.match(/Average\s*=\s*(\d+)\s*ms/i)
  if (!m) return null
  const ms = parseInt(m[1], 10)
  return Number.isFinite(ms) ? ms : null
}

async function readTcpRetransmits(): Promise<number> {
  // netstat -s prints per-protocol totals. The IPv4 TCP block has
  // a "Segments Retransmitted = N" line.
  const out = await runExe('netstat', ['-s', '-p', 'tcp'], 8000)
  if (!out) return 0
  const m = out.match(/Segments Retransmitted\s*=\s*(\d+)/i)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : 0
}

export async function scanNetwork(): Promise<ScanModuleResult<NetworkData>> {
  console.log('[scan:network] Starting network scan...')
  const adapters: NetworkAdapter[] = []
  let wifi: WifiInfo | null = null
  let gatewayMs: number | null = null

  try {
    // Wi-Fi state from netsh wlan show interfaces. netsh.exe is a stock
    // Windows binary; we shell to it via execFile rather than wrapping
    // it in a PowerShell pipeline.
    const wifiOut = await runExe('netsh', ['wlan', 'show', 'interfaces'], 12000)
    if (wifiOut && wifiOut.includes('SSID') && !wifiOut.includes('There are 0 interfaces')) {
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
        // Per-adapter power-management state previously came from
        // Get-NetAdapterPowerManagement; without WMI/CIM it isn't exposed
        // through any plain Win32 API or registry value, so we report
        // null and let the rule engine treat that as 'unknown'.
        powerSavingEnabled: null,
      }

      const nearbyOut = await runExe('netsh', ['wlan', 'show', 'networks', 'mode=Bssid'], 12000)
      if (nearbyOut && nearbyOut.includes('SSID')) {
        wifi.nearbyNetworks = parseNearbyNetworks(nearbyOut)
      }
    }

    const regAdapters = await enumerateAdapterRegistry()
    const liveIfaces = os.networkInterfaces()

    for (const reg of regAdapters) {
      const type: 'Wi-Fi' | 'Ethernet' | 'Unknown' = reg.isWifi ? 'Wi-Fi' : reg.isEthernet ? 'Ethernet' : 'Unknown'

      // os.networkInterfaces() keys by friendly name (e.g. "Wi-Fi", "Ethernet"),
      // not class index, so we cannot link 1:1 to the registry entry. Treat
      // an adapter as connected if any non-internal interface of the matching
      // type has a non-internal IPv4 address.
      const connected = Object.entries(liveIfaces).some(([name, addrs]) => {
        if (!addrs) return false
        if (type === 'Wi-Fi' && !/wi-?fi|wlan|wireless/i.test(name)) return false
        if (type === 'Ethernet' && !/ethernet|local area connection/i.test(name)) return false
        return addrs.some((a) => !a.internal && a.family === 'IPv4')
      })

      const adapter: NetworkAdapter = {
        name: reg.driverDesc,
        type,
        speed: reg.linkSpeedMbps,
        connected,
      }

      if (type === 'Wi-Fi') {
        const classification = classifyWifiChipset(reg.driverDesc)
        adapter.chipsetVendor = classification.vendor
        adapter.chipsetFamily = classification.family
        adapter.vrSuitability = classification.vrSuitability
      }

      adapters.push(adapter)
    }

    const gw = await getDefaultGatewayIp()
    if (gw) {
      gatewayMs = await pingHost(gw)
    }

    const tcpRetransmits = await readTcpRetransmits()

    console.log(
      `[scan:network] Complete. adapters=${adapters.length} ` +
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
        tcpRetransmits,
      },
    }
  } catch (error) {
    console.error(`[scan:network] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { adapters, wifi, latency: { gateway: null, dns: null }, tcpRetransmits: 0 },
    }
  }
}
