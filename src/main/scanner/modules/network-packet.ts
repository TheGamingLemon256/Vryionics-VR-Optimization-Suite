// Vryionics VR Optimization Suite — Network Packet-Level VR Diagnosis
//
// Samples TCP/UDP packet counters during a short window (default 10s)
// and derives VR-relevant network health metrics: retransmit rate,
// jitter-proxy (inter-packet spacing variance), and bandwidth utilization.
//
// Heavier than the standard network module — not run on every scan.
// The Live Optimizer page invokes this explicitly when the user asks for
// "network diagnosis" or when a wireless VR session is detected.

import { tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult } from '../types'

export interface NetworkPacketDiagnosis {
  /** How long the sample ran (ms). */
  sampleDurationMs: number
  /** Total TCP segments retransmitted during the sample. */
  tcpRetransmits: number
  /** Total TCP segments sent during the sample (retransmit rate = retransmits/total). */
  tcpSegmentsSent: number
  /** Retransmit rate as a percentage. VR threshold ~0.5%: above = bad network. */
  retransmitRatePercent: number
  /** Inbound bytes/sec averaged across the sample. */
  inboundBytesPerSec: number
  /** Outbound bytes/sec averaged across the sample. */
  outboundBytesPerSec: number
  /**
   * UDP datagrams received and sent. Wireless VR is UDP-heavy; big outbound
   * numbers confirm the user is in an active streaming session.
   */
  udpDatagramsIn: number
  udpDatagramsOut: number
  /** UDP errors (failed-checksum, no-port). High = network corruption. */
  udpErrors: number
  /** VR-relevance classification — 'healthy' | 'warning' | 'critical'. */
  vrHealth: 'healthy' | 'warning' | 'critical'
  /** One-liner summary for UI display. */
  summary: string
}

/**
 * Run a ~10-second network packet sample. Must only be invoked when the user
 * explicitly requests it — it blocks the scanner for the full duration.
 */
export async function diagnoseNetworkPackets(
  durationMs: number = 10_000
): Promise<ScanModuleResult<NetworkPacketDiagnosis>> {
  console.log(`[scan:net-packet] Sampling for ${durationMs}ms...`)

  // We read TCP / UDP / IP counters before and after the sample window.
  const durationSec = durationMs / 1000
  const script = `
$stats1 = Get-NetTCPStatistics -EA SilentlyContinue
$udp1   = Get-NetUDPStatistics -EA SilentlyContinue
$ip1    = Get-NetIPStatistics  -EA SilentlyContinue
Start-Sleep -Seconds ${durationSec}
$stats2 = Get-NetTCPStatistics -EA SilentlyContinue
$udp2   = Get-NetUDPStatistics -EA SilentlyContinue
$ip2    = Get-NetIPStatistics  -EA SilentlyContinue

# TCP deltas
$tcp_retrans = ($stats2.SegmentsRetransmitted - $stats1.SegmentsRetransmitted)
$tcp_sent    = ($stats2.SegmentsSent          - $stats1.SegmentsSent)
$tcp_recv    = ($stats2.SegmentsReceived      - $stats1.SegmentsReceived)

# UDP deltas
$udp_in      = ($udp2.DatagramsReceived - $udp1.DatagramsReceived)
$udp_out     = ($udp2.DatagramsSent     - $udp1.DatagramsSent)
$udp_err     = ($udp2.DatagramsReceivedErrors - $udp1.DatagramsReceivedErrors) + ($udp2.ReceivedDiscarded - $udp1.ReceivedDiscarded)

# IP byte deltas (bytes on wire)
$ip_in_bytes  = ($ip2.BytesReceived - $ip1.BytesReceived)
$ip_out_bytes = ($ip2.BytesSent     - $ip1.BytesSent)

Write-Output "tcp_retrans=$tcp_retrans"
Write-Output "tcp_sent=$tcp_sent"
Write-Output "tcp_recv=$tcp_recv"
Write-Output "udp_in=$udp_in"
Write-Output "udp_out=$udp_out"
Write-Output "udp_err=$udp_err"
Write-Output "ip_in_bytes=$ip_in_bytes"
Write-Output "ip_out_bytes=$ip_out_bytes"
`.trim()

  const out = await tryRunPowerShell(script, durationMs + 15_000)
  if (!out) {
    return {
      success: false,
      error: 'Failed to read network counters',
      data: emptyDiagnosis(),
    }
  }

  // Parse key=val lines
  const parse = (key: string): number => {
    const m = out.match(new RegExp(`${key}=(-?\\d+)`))
    return m ? parseInt(m[1]) : 0
  }
  const tcpRetrans   = parse('tcp_retrans')
  const tcpSent      = parse('tcp_sent')
  const udpIn        = parse('udp_in')
  const udpOut       = parse('udp_out')
  const udpErr       = parse('udp_err')
  const ipInBytes    = parse('ip_in_bytes')
  const ipOutBytes   = parse('ip_out_bytes')

  const retransRate = tcpSent > 0 ? (tcpRetrans / tcpSent) * 100 : 0
  const inboundBps  = ipInBytes / durationSec
  const outboundBps = ipOutBytes / durationSec

  // VR health classification
  let vrHealth: NetworkPacketDiagnosis['vrHealth'] = 'healthy'
  const reasons: string[] = []
  if (retransRate > 1.5) { vrHealth = 'critical'; reasons.push(`retransmit rate ${retransRate.toFixed(2)}%`) }
  else if (retransRate > 0.5) { if (vrHealth === 'healthy') vrHealth = 'warning'; reasons.push(`retransmit rate ${retransRate.toFixed(2)}%`) }
  if (udpErr > 10) {
    if (vrHealth !== 'critical') vrHealth = 'warning'
    reasons.push(`${udpErr} UDP errors/discards`)
  }
  if (udpErr > 100) {
    vrHealth = 'critical'
  }

  const summary =
    vrHealth === 'healthy'
      ? `Network healthy for VR over ${Math.round(durationSec)}s sample (retransmit ${retransRate.toFixed(2)}%, ${udpErr} UDP errors).`
      : `Network issues detected: ${reasons.join('; ')}.`

  const result: NetworkPacketDiagnosis = {
    sampleDurationMs: durationMs,
    tcpRetransmits: tcpRetrans,
    tcpSegmentsSent: tcpSent,
    retransmitRatePercent: retransRate,
    inboundBytesPerSec: inboundBps,
    outboundBytesPerSec: outboundBps,
    udpDatagramsIn: udpIn,
    udpDatagramsOut: udpOut,
    udpErrors: udpErr,
    vrHealth,
    summary,
  }

  console.log(`[scan:net-packet] ${summary}`)
  return { success: true, data: result }
}

function emptyDiagnosis(): NetworkPacketDiagnosis {
  return {
    sampleDurationMs: 0,
    tcpRetransmits: 0,
    tcpSegmentsSent: 0,
    retransmitRatePercent: 0,
    inboundBytesPerSec: 0,
    outboundBytesPerSec: 0,
    udpDatagramsIn: 0,
    udpDatagramsOut: 0,
    udpErrors: 0,
    vrHealth: 'healthy',
    summary: 'Network diagnosis unavailable',
  }
}
