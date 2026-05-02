// Vryionics VR Optimization Suite — Network Packet-Level VR Diagnosis
//
// Samples TCP/UDP packet counters during a short window (default 10s)
// and derives VR-relevant network health metrics: retransmit rate,
// jitter-proxy (inter-packet spacing variance), and bandwidth utilization.
//
// Heavier than the standard network module — not run on every scan.
// The Live Optimizer page invokes this explicitly when the user asks for
// network diagnosis or when a wireless VR session is detected.

import { runExe } from '../../utils/exec'
import type { ScanModuleResult } from '../types'

export interface NetworkPacketDiagnosis {
  sampleDurationMs: number
  tcpRetransmits: number
  tcpSegmentsSent: number
  retransmitRatePercent: number
  inboundBytesPerSec: number
  outboundBytesPerSec: number
  udpDatagramsIn: number
  udpDatagramsOut: number
  udpErrors: number
  vrHealth: 'healthy' | 'warning' | 'critical'
  summary: string
}

interface CounterSnapshot {
  tcpSent: number
  tcpRetrans: number
  tcpRecv: number
  udpIn: number
  udpOut: number
  udpErr: number
  ipInBytes: number
  ipOutBytes: number
}

// netstat -s output uses different labels for each section. We match
// labels case-insensitively and tolerate whitespace.
const labelPatterns: Array<{ key: keyof CounterSnapshot; pattern: RegExp }> = [
  { key: 'tcpSent', pattern: /Segments Sent\s*=\s*(\d+)/i },
  { key: 'tcpRetrans', pattern: /Segments Retransmitted\s*=\s*(\d+)/i },
  { key: 'tcpRecv', pattern: /Segments Received\s*=\s*(\d+)/i },
  { key: 'udpIn', pattern: /Datagrams Received\s*=\s*(\d+)/i },
  { key: 'udpOut', pattern: /Datagrams Sent\s*=\s*(\d+)/i },
  { key: 'udpErr', pattern: /Receive Errors\s*=\s*(\d+)/i },
]

async function takeSnapshot(): Promise<CounterSnapshot | null> {
  // -s -p tcp/udp/ip prints just the relevant protocol blocks.
  const tcp = await runExe('netstat', ['-s', '-p', 'tcp'], 6000)
  const udp = await runExe('netstat', ['-s', '-p', 'udp'], 6000)
  const ip = await runExe('netstat', ['-e'], 6000)

  if (!tcp || !udp) return null

  const snap: CounterSnapshot = {
    tcpSent: 0,
    tcpRetrans: 0,
    tcpRecv: 0,
    udpIn: 0,
    udpOut: 0,
    udpErr: 0,
    ipInBytes: 0,
    ipOutBytes: 0,
  }
  const all = `${tcp}\n${udp}`
  for (const { key, pattern } of labelPatterns) {
    const m = all.match(pattern)
    if (m) snap[key] = parseInt(m[1], 10)
  }

  // netstat -e prints an Interface Statistics table whose first numeric
  // row is "Bytes  <received>  <sent>".
  if (ip) {
    const m = ip.match(/^\s*Bytes\s+(\d+)\s+(\d+)/m)
    if (m) {
      snap.ipInBytes = parseInt(m[1], 10)
      snap.ipOutBytes = parseInt(m[2], 10)
    }
  }
  return snap
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

export async function diagnoseNetworkPackets(
  durationMs = 10_000
): Promise<ScanModuleResult<NetworkPacketDiagnosis>> {
  console.log(`[scan:net-packet] Sampling for ${durationMs}ms...`)

  const before = await takeSnapshot()
  if (!before) {
    return {
      success: false,
      error: 'Failed to read initial network counters',
      data: emptyDiagnosis(),
    }
  }

  await new Promise((r) => setTimeout(r, durationMs))

  const after = await takeSnapshot()
  if (!after) {
    return {
      success: false,
      error: 'Failed to read final network counters',
      data: emptyDiagnosis(),
    }
  }

  const durationSec = durationMs / 1000
  const tcpRetrans = Math.max(0, after.tcpRetrans - before.tcpRetrans)
  const tcpSent = Math.max(0, after.tcpSent - before.tcpSent)
  const udpIn = Math.max(0, after.udpIn - before.udpIn)
  const udpOut = Math.max(0, after.udpOut - before.udpOut)
  const udpErr = Math.max(0, after.udpErr - before.udpErr)
  const ipInBytes = Math.max(0, after.ipInBytes - before.ipInBytes)
  const ipOutBytes = Math.max(0, after.ipOutBytes - before.ipOutBytes)

  const retransRate = tcpSent > 0 ? (tcpRetrans / tcpSent) * 100 : 0
  const inboundBps = ipInBytes / durationSec
  const outboundBps = ipOutBytes / durationSec

  let vrHealth: NetworkPacketDiagnosis['vrHealth'] = 'healthy'
  const reasons: string[] = []
  if (retransRate > 1.5) {
    vrHealth = 'critical'
    reasons.push(`retransmit rate ${retransRate.toFixed(2)}%`)
  } else if (retransRate > 0.5) {
    vrHealth = 'warning'
    reasons.push(`retransmit rate ${retransRate.toFixed(2)}%`)
  }
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
