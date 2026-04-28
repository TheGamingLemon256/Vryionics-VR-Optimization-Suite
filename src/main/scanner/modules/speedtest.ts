// VR Optimization Suite — Internet Speed Test Module
// Uses PowerShell + .NET HttpClient to download from Cloudflare's speed endpoint.
// No third-party tools. Skip gracefully on timeout or no internet.
//
// Context: Internet speed matters for:
//  1. Standalone headsets downloading game updates
//  2. Cloud gaming via VR (GeForce NOW, Xbox Cloud)
//  3. Streaming VR content (YouTube VR, SteamVR theatre)
// For local PCVR wireless streaming (AirLink/VD), network.ts covers local Wi-Fi quality.

import { tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, SpeedTestData } from '../types'

// Cloudflare Speed Test public endpoint (no API key needed)
const CF_DOWN_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'   // 5MB
const CF_PING_URL = 'https://speed.cloudflare.com/__down?bytes=0'

/** Measure single round-trip latency to an HTTPS endpoint via PowerShell. Returns ms. */
async function measureHttpLatency(url: string): Promise<number | null> {
  const out = await tryRunPowerShell(`
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $req = [System.Net.WebRequest]::Create('${url}')
  $req.Method = 'HEAD'
  $req.Timeout = 4000
  $resp = $req.GetResponse()
  $resp.Close()
  $sw.Stop()
  [math]::Round($sw.Elapsed.TotalMilliseconds, 1)
} catch { $sw.Stop(); '-1' }
`, 8000)
  if (!out) return null
  const ms = parseFloat(out.trim())
  return ms > 0 ? ms : null
}

/** Download a file and return throughput in Mbps. */
async function measureDownload(url: string, timeoutMs: number): Promise<{ mbps: number; bytes: number } | null> {
  const out = await tryRunPowerShell(`
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $wc = New-Object System.Net.WebClient
  $bytes = $wc.DownloadData('${url}')
  $sw.Stop()
  $secs = $sw.Elapsed.TotalSeconds
  if ($secs -gt 0) {
    $mbps = [math]::Round(($bytes.Length * 8) / ($secs * 1000000), 2)
    "$($bytes.Length),$mbps"
  } else { '0,0' }
} catch { $sw.Stop(); '0,0' }
`, timeoutMs)
  if (!out || !out.trim() || out.trim() === '0,0') return null
  const parts = out.trim().split(',')
  if (parts.length < 2) return null
  const bytes = parseInt(parts[0])
  const mbps = parseFloat(parts[1])
  if (isNaN(bytes) || isNaN(mbps) || mbps <= 0) return null
  return { mbps, bytes }
}

/** Upload a small payload and return throughput in Mbps. */
async function measureUpload(timeoutMs: number): Promise<number | null> {
  const out = await tryRunPowerShell(`
$payload = [byte[]]::new(1000000)  # 1 MB
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add('Content-Type', 'application/octet-stream')
  $resp = $wc.UploadData('https://speed.cloudflare.com/__up', 'POST', $payload)
  $sw.Stop()
  $secs = $sw.Elapsed.TotalSeconds
  if ($secs -gt 0) {
    [math]::Round(($payload.Length * 8) / ($secs * 1000000), 2)
  } else { '0' }
} catch { $sw.Stop(); '0' }
`, timeoutMs)
  if (!out) return null
  const mbps = parseFloat(out.trim())
  return mbps > 0 ? mbps : null
}

export async function scanSpeedTest(): Promise<ScanModuleResult<SpeedTestData>> {
  console.log('[scan:speedtest] Starting internet speed test (Cloudflare)...')

  try {
    // 1. Latency — quick HEAD request, measure round-trip
    const pingMs = await measureHttpLatency(CF_PING_URL)
    console.log(`[scan:speedtest] Ping: ${pingMs ?? 'N/A'} ms`)

    // 2. Download
    const dl = await measureDownload(CF_DOWN_URL, 20000)
    console.log(`[scan:speedtest] Download: ${dl?.mbps ?? 'N/A'} Mbps`)

    // 3. Jitter — measure latency 4 more times and compute variance
    let jitterMs: number | null = null
    if (pingMs !== null) {
      const samples: number[] = [pingMs]
      for (let i = 0; i < 3; i++) {
        const t = await measureHttpLatency(CF_PING_URL)
        if (t !== null) samples.push(t)
      }
      if (samples.length >= 2) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        const variance = samples.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / samples.length
        jitterMs = Math.round(Math.sqrt(variance) * 10) / 10
      }
    }

    // 4. Upload — optional, lower priority, shorter timeout
    const uploadMbps = await measureUpload(12000)
    console.log(`[scan:speedtest] Upload: ${uploadMbps ?? 'N/A'} Mbps`)

    const data: SpeedTestData = {
      downloadMbps: dl?.mbps ?? null,
      uploadMbps,
      pingMs,
      jitterMs,
      testServer: 'speed.cloudflare.com',
      skipped: false,
      note: 'Measured to Cloudflare CDN. Relevant for content download and cloud VR. For wireless PCVR quality, check the Wi-Fi metrics instead.'
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
        note: 'Test could not complete — no internet access or timed out.'
      }
    }
  }
}
