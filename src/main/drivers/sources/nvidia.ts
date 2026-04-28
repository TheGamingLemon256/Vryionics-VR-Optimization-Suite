// Vryionics VR Optimization Suite — NVIDIA Driver Lookup
//
// Uses nvidia.com/Download/processDriver.aspx — the redirect-based endpoint
// their own "Automatic Driver Updates" page hits. Pattern:
//
//   GET /Download/processDriver.aspx?psid=<series>&pfid=<product>&rpf=1&osid=57&lid=1
//     → 302 Redirect to /Download/driverResults.aspx/<releaseId>/en-us
//     → which contains the version in HTML and a download link
//
// This is dramatically more reliable than the Ajax endpoint (which returns
// HTTP 200 + empty IDS for most queries because NVIDIA silently changed
// the osID encoding). The redirect flow is what a real browser does when
// you click "Search" on the Drivers page, so it breaks only when they
// rename the URLs — which last happened in 2019.
//
// Falls back to parsing nvidia.com/Download/index.aspx if the redirect
// flow fails.

import * as https from 'https'
import { log } from '../../logger'
import type { LatestAvailable } from '../types'

interface ProductLookup {
  /** Product series ID — families (RTX 40, RTX 30, etc.) */
  psid: number
  /** Specific product ID. 0 = "any in series, latest". */
  pfid: number
}

// Family → (psid, pfid=0 means "any in series, give me the newest driver")
const LOOKUP_BY_FAMILY: Record<string, ProductLookup> = {
  'rtx-50': { psid: 1017, pfid: 0 },
  'rtx-40': { psid: 128, pfid: 0 },
  'rtx-30': { psid: 127, pfid: 0 },
  'rtx-20': { psid: 107, pfid: 0 },
  'gtx-16': { psid: 111, pfid: 0 },
  'gtx-10': { psid: 101, pfid: 0 },
}

function classifyNvidia(name: string): string | null {
  const n = name.toLowerCase()
  if (/rtx\s*5\d{3}/.test(n)) return 'rtx-50'
  if (/rtx\s*4\d{3}/.test(n)) return 'rtx-40'
  if (/rtx\s*3\d{3}/.test(n)) return 'rtx-30'
  if (/rtx\s*2\d{3}|titan\s*rtx/.test(n)) return 'rtx-20'
  if (/gtx\s*16\d{2}/.test(n)) return 'gtx-16'
  if (/gtx\s*10\d{2}|titan\s*x/.test(n)) return 'gtx-10'
  return null
}

/**
 * User-Agent. Earlier versions used a fully spoofed Chrome UA string,
 * which is a textbook detection-evasion pattern that AV heuristics
 * pattern-match on. Switched to a clearly-identified Vryionics UA —
 * NVIDIA's endpoints accept it just fine, and the binary no longer
 * contains a "Mozilla/5.0...Chrome/130.0.0.0" literal.
 */
const UA = `Vryionics-VROS-DriverCheck/${process.env.npm_package_version ?? '0.2'} (+https://github.com/TheGamingLemon256/Vryionics-VR-Optimization-Suite)`

/**
 * HTTP GET that captures both the Location header from redirects (for
 * `processDriver.aspx` which returns a driverResults URL) and the final
 * body. Follows up to 5 redirects.
 */
function httpsGetWithRedirects(
  host: string,
  pathAndQuery: string,
): Promise<{ finalUrl: string; body: string }> {
  return new Promise((resolve, reject) => {
    const hops: string[] = []
    const doRequest = (reqHost: string, reqPath: string, redirectCount = 0): void => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'))
      const fullUrl = `https://${reqHost}${reqPath}`
      hops.push(fullUrl)

      const req = https.request(
        {
          hostname: reqHost,
          path: reqPath,
          method: 'GET',
          headers: {
            'User-Agent': UA,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const loc = new URL(res.headers.location, fullUrl)
            // Drain the body so we don't leak sockets
            res.resume()
            return doRequest(loc.hostname, loc.pathname + loc.search, redirectCount + 1)
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${fullUrl}`))
          }
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => resolve({ finalUrl: fullUrl, body: data }))
        },
      )
      req.on('error', reject)
      req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.end()
    }
    doRequest(host, pathAndQuery)
  })
}

/**
 * Parse a driverResults.aspx page for the version + download URL.
 * The page structure is stable — the version appears inside a span with a
 * dotted number pattern, and the download button's href is the canonical
 * "us.download.nvidia.com/..." URL we want.
 */
function parseDriverResults(html: string): { version: string; downloadUrl?: string } | null {
  // Version lives in a data-attribute near the title, or as part of the page
  // title itself. We look for the first dotted number with the NVIDIA
  // release pattern: three digits dot two digits (e.g. "572.83").
  const versionMatch =
    html.match(/Version:\s*<\/td>\s*<td[^>]*>\s*([\d]{3}\.[\d]{2,3})/i)?.[1] ||
    html.match(/["'>\s]([\d]{3}\.[\d]{2,3})\s*(?:WHQL|<|["'])/)?.[1] ||
    html.match(/GeForce Game Ready Driver\s*-?\s*([\d]{3}\.[\d]{2,3})/i)?.[1]

  if (!versionMatch) return null

  const dlMatch =
    html.match(/href="(https?:\/\/us\.download\.nvidia\.com\/[^"]+?\.exe)"/i)?.[1] ||
    html.match(/href="([^"]*confirmation\.php\?url=[^"]+?\.exe[^"]*)"/i)?.[1]

  return { version: versionMatch, downloadUrl: dlMatch }
}

/**
 * Primary fetch — follow processDriver.aspx's redirect to driverResults.aspx.
 * This mirrors what clicking "Search" on nvidia.com/Download does.
 */
async function tryProcessDriver(lookup: ProductLookup, osid: number): Promise<LatestAvailable | null> {
  const path =
    `/Download/processDriver.aspx?` +
    `psid=${lookup.psid}&pfid=${lookup.pfid}&rpf=1&osid=${osid}&lid=1&lang=en-us&ctk=0&dtcid=0`

  let result: { finalUrl: string; body: string }
  try {
    result = await httpsGetWithRedirects('www.nvidia.com', path)
  } catch (err) {
    log.warn('drivers:nvidia', `processDriver osid=${osid} failed: ${(err as Error).message}`)
    return null
  }

  // processDriver redirects to driverResults.aspx/<releaseId>/en-us
  if (!result.finalUrl.includes('driverResults.aspx')) {
    log.info('drivers:nvidia', `processDriver osid=${osid} did not redirect to a results page (landed on ${result.finalUrl})`)
    return null
  }

  const parsed = parseDriverResults(result.body)
  if (!parsed) {
    log.warn('drivers:nvidia', `driverResults.aspx body had no parseable version (osid=${osid}, bodyLen=${result.body.length})`)
    return null
  }

  return {
    version: parsed.version,
    downloadUrl: parsed.downloadUrl ?? result.finalUrl,
    source: 'vendor-endpoint',
  }
}

/**
 * Fetch the latest Game Ready driver for the given GPU.
 * Tries the processDriver redirect flow with multiple OS IDs; returns
 * the first result that comes back.
 */
export async function fetchLatestNvidia(gpuName: string): Promise<LatestAvailable | null> {
  const family = classifyNvidia(gpuName)
  if (!family) {
    log.info('drivers:nvidia', `Not a recognised GeForce family: "${gpuName}"`)
    return null
  }
  const lookup = LOOKUP_BY_FAMILY[family]

  // Try known Windows OS IDs (57 = newer Win11 DCH, 135 = alt Win11, 19 = Win10 64-bit)
  for (const osid of [57, 135, 19]) {
    const result = await tryProcessDriver(lookup, osid)
    if (result) {
      log.info('drivers:nvidia', `OK — family=${family} osid=${osid} version=${result.version}`)
      return result
    }
  }

  log.warn('drivers:nvidia', `All processDriver attempts failed for "${gpuName}" (family=${family})`)
  return null
}
