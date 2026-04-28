// Vryionics VR Optimization Suite — AMD Driver Lookup
//
// AMD does not expose a stable JSON endpoint the way NVIDIA does. The
// closest equivalent is scraping www.amd.com/en/support/download/drivers.html
// for the "Latest Driver" tile, which AMD maintains as a single source of
// truth for Radeon Software.
//
// Strategy: hit the support-driver page once per 24h, extract the first
// version string that matches the Radeon Software pattern (two or three
// dotted numbers followed by an optional minor). Cheap, no API key.
//
// If the scrape ever breaks, the updater falls back to the static table.

import * as https from 'https'
import type { LatestAvailable } from '../types'

const AMD_DRIVER_PAGE_HOST = 'www.amd.com'
const AMD_DRIVER_PAGE_PATH = '/en/support/download/drivers.html'

function httpsGetText(host: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'Vryionics-VROS-DriverCheck/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      (res) => {
        // AMD's page sometimes redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = new URL(res.headers.location, `https://${host}${path}`)
          return httpsGetText(loc.hostname, loc.pathname + loc.search).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`AMD page HTTP ${res.statusCode}`))
          return
        }
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
      },
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => {
      req.destroy()
      reject(new Error('AMD page timeout'))
    })
    req.end()
  })
}

/**
 * Extract the latest Adrenalin/Radeon Software version from the support page.
 * Pattern: "Adrenalin 24.12.1" or "25.1.1 Recommended". We take the first
 * match of the three-dot-numbers pattern associated with "Adrenalin" or
 * "Radeon Software".
 */
function parseLatestVersion(html: string): string | null {
  // Tightened match: must have "Adrenalin" or "Radeon Software" nearby to
  // avoid picking up random version numbers elsewhere on the page.
  const windowed = html.match(/(?:Adrenalin|Radeon Software)[\s\S]{0,300}?(\d{2}\.\d{1,2}\.\d{1,2})/i)
  return windowed?.[1] ?? null
}

/**
 * AMD doesn't expose "latest for my specific GPU" cleanly via public API.
 * The consolidated Adrenalin driver covers RX 400 series onward, so one
 * version number fits all modern Radeon cards. That's what VR users run.
 */
export async function fetchLatestAmd(gpuName: string): Promise<LatestAvailable | null> {
  const n = gpuName.toLowerCase()
  // Modern Adrenalin driver covers:
  //   • Discrete: RX 400/500/5000/6000/7000/9000-series, Radeon Pro
  //   • Integrated: Ryzen APUs reporting as "AMD Radeon(TM) Graphics"
  //     (these use a separate AMD Software Adrenalin Edition build, but
  //     the support page surfaces the same latest-version banner)
  const isSupported =
    /rx\s*[456789]\d{3}/.test(n) ||
    /radeon\s*pro/.test(n) ||
    /radeon.*graphics/.test(n) || // Ryzen iGPU
    /vega\s*\d/.test(n)
  if (!isSupported) {
    return null
  }

  const html = await httpsGetText(AMD_DRIVER_PAGE_HOST, AMD_DRIVER_PAGE_PATH)
  const version = parseLatestVersion(html)
  if (!version) return null

  return {
    version,
    // The "downloadUrl" is the AMD support HTML page, not a direct .exe.
    // We mark `installable: false` so the UI forces guided "Open vendor
    // page" instead of attempting a silent install (which would fail the
    // 50 MB minimum-size check with a misleading "file too small" error
    // — Quantum's reported false-positive on RX 9070 XT).
    downloadUrl: `https://${AMD_DRIVER_PAGE_HOST}${AMD_DRIVER_PAGE_PATH}`,
    installable: false,
    source: 'vendor-endpoint',
  }
}
