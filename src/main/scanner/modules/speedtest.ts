// VR Optimization Suite — Internet Speed Test Module
// Uses Node's https module to download from Cloudflare's speed endpoint.
// Internet speed matters for standalone-headset game updates, cloud VR
// (GeForce NOW / Xbox Cloud), and streaming VR content. For local PCVR
// wireless quality, network.ts already covers Wi-Fi metrics.

import https from 'node:https'
import { URL } from 'node:url'
import type { ScanModuleResult, SpeedTestData } from '../types'

const CF_DOWN_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'
const CF_PING_URL = 'https://speed.cloudflare.com/__down?bytes=0'
const CF_UP_URL = 'https://speed.cloudflare.com/__up'

function timeRequest(url: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false
    const start = process.hrtime.bigint()
    const u = new URL(url)
    const req = https.request(
      {
        method: 'HEAD',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume()
        res.on('end', () => {
          if (settled) return
          settled = true
          const ms = Number(process.hrtime.bigint() - start) / 1_000_000
          resolve(Math.round(ms * 10) / 10)
        })
      }
    )
    req.on('error', () => {
      if (settled) return
      settled = true
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      if (settled) return
      settled = true
      resolve(null)
    })
    req.end()
  })
}

function downloadAndMeasure(url: string, timeoutMs: number): Promise<{ mbps: number; bytes: number } | null> {
  return new Promise((resolve) => {
    let settled = false
    const start = process.hrtime.bigint()
    const u = new URL(url)
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        timeout: timeoutMs,
      },
      (res) => {
        let total = 0
        res.on('data', (chunk: Buffer) => {
          total += chunk.length
        })
        res.on('end', () => {
          if (settled) return
          settled = true
          const secs = Number(process.hrtime.bigint() - start) / 1_000_000_000
          if (secs <= 0 || total === 0) return resolve(null)
          const mbps = Math.round(((total * 8) / (secs * 1_000_000)) * 100) / 100
          resolve({ mbps, bytes: total })
        })
        res.on('error', () => {
          if (settled) return
          settled = true
          resolve(null)
        })
      }
    )
    req.on('error', () => {
      if (settled) return
      settled = true
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      if (settled) return
      settled = true
      resolve(null)
    })
    req.end()
  })
}

function uploadAndMeasure(url: string, payloadSize: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false
    const payload = Buffer.alloc(payloadSize)
    const start = process.hrtime.bigint()
    const u = new URL(url)
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        res.resume()
        res.on('end', () => {
          if (settled) return
          settled = true
          const secs = Number(process.hrtime.bigint() - start) / 1_000_000_000
          if (secs <= 0) return resolve(null)
          const mbps = Math.round(((payload.length * 8) / (secs * 1_000_000)) * 100) / 100
          resolve(mbps > 0 ? mbps : null)
        })
      }
    )
    req.on('error', () => {
      if (settled) return
      settled = true
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      if (settled) return
      settled = true
      resolve(null)
    })
    req.write(payload)
    req.end()
  })
}

export async function scanSpeedTest(): Promise<ScanModuleResult<SpeedTestData>> {
  console.log('[scan:speedtest] Starting internet speed test (Cloudflare)...')

  try {
    const pingMs = await timeRequest(CF_PING_URL, 4000)
    console.log(`[scan:speedtest] Ping: ${pingMs ?? 'N/A'} ms`)

    const dl = await downloadAndMeasure(CF_DOWN_URL, 20000)
    console.log(`[scan:speedtest] Download: ${dl?.mbps ?? 'N/A'} Mbps`)

    let jitterMs: number | null = null
    if (pingMs !== null) {
      const samples: number[] = [pingMs]
      for (let i = 0; i < 3; i++) {
        const t = await timeRequest(CF_PING_URL, 4000)
        if (t !== null) samples.push(t)
      }
      if (samples.length >= 2) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        const variance = samples.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / samples.length
        jitterMs = Math.round(Math.sqrt(variance) * 10) / 10
      }
    }

    const uploadMbps = await uploadAndMeasure(CF_UP_URL, 1_000_000, 12000)
    console.log(`[scan:speedtest] Upload: ${uploadMbps ?? 'N/A'} Mbps`)

    const data: SpeedTestData = {
      downloadMbps: dl?.mbps ?? null,
      uploadMbps,
      pingMs,
      jitterMs,
      testServer: 'speed.cloudflare.com',
      skipped: false,
      note: 'Measured to Cloudflare CDN. Relevant for content download and cloud VR. For wireless PCVR quality, check the Wi-Fi metrics instead.',
    }

    return { success: true, data }
  } catch (error) {
    console.warn('[scan:speedtest] Speed test failed:', (error as Error).message)
    return {
      success: false,
      error: (error as Error).message,
      data: {
        downloadMbps: null,
        uploadMbps: null,
        pingMs: null,
        jitterMs: null,
        testServer: null,
        skipped: true,
        note: 'Test could not complete: no internet access or timed out.',
      },
    }
  }
}
