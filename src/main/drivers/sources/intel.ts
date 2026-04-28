// Vryionics VR Optimization Suite — Intel GPU Driver Lookup
//
// Intel exposes a JSON API backing downloadcenter.intel.com (the same one
// the Intel Driver & Support Assistant uses). We query the Graphics
// catalog for the Arc/Xe/UHD lineage the user has installed.
//
// Endpoint format derived from Intel's public cdrdv2.intel.com pages.
// Structure: https://www.intel.com/content/www/us/en/download/820182.html
// returns HTML with a latest version banner; the JSON sibling is at:
//   https://www.intel.com/content/dam/support/us/en/documents/graphics/latest-driver.json
// (name varies — we try the support-channel tags first, scrape fallback).

import * as https from 'https'
import type { LatestAvailable } from '../types'

const INTEL_ARC_DRIVER_PAGE = {
  host: 'www.intel.com',
  // Intel Arc & Iris Xe Graphics — Windows
  path: '/content/www/us/en/download/785597/intel-arc-iris-xe-graphics-windows.html',
}

const INTEL_UHD_DRIVER_PAGE = {
  host: 'www.intel.com',
  // Intel Graphics — Windows DCH (older UHD / HD)
  path: '/content/www/us/en/download/776137/intel-graphics-windows-dch-drivers.html',
}

function httpsGetText(host: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'Vryionics-VROS-DriverCheck/1.0',
          Accept: 'text/html',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = new URL(res.headers.location, `https://${host}${path}`)
          return httpsGetText(loc.hostname, loc.pathname + loc.search).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Intel page HTTP ${res.statusCode}`))
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
      reject(new Error('Intel page timeout'))
    })
    req.end()
  })
}

/**
 * Intel's download-center pages embed the version in a banner like:
 *   <span data-id="versionNumber">32.0.101.6734</span>
 * and release date nearby. We grab both.
 */
function parseIntelVersion(html: string): { version: string; releaseDate?: string } | null {
  const version =
    html.match(/"versionNumber"[^>]*>\s*([\d.]+)/)?.[1] ||
    html.match(/(?:Latest|Recommended)[\s\S]{0,200}?(\d+\.\d+\.\d+\.\d+)/i)?.[1] ||
    null
  if (!version) return null
  const releaseDate =
    html.match(/"releaseDate"[^>]*>\s*([\d/-]+)/)?.[1] ||
    html.match(/(?:Published|Released)[\s\S]{0,60}?(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]
  return { version, releaseDate }
}

/**
 * Fetch the latest Intel graphics driver version for the given GPU.
 * Arc (Alchemist/Battlemage) uses a newer driver line than UHD/Iris Xe,
 * so we route to the appropriate download-center page.
 */
export async function fetchLatestIntel(gpuName: string): Promise<LatestAvailable | null> {
  const n = gpuName.toLowerCase()
  let page = INTEL_ARC_DRIVER_PAGE
  let downloadUrl = `https://${INTEL_ARC_DRIVER_PAGE.host}${INTEL_ARC_DRIVER_PAGE.path}`

  if (/uhd\s*graphics|hd\s*graphics|iris\s*(?:plus|pro)/.test(n)) {
    page = INTEL_UHD_DRIVER_PAGE
    downloadUrl = `https://${INTEL_UHD_DRIVER_PAGE.host}${INTEL_UHD_DRIVER_PAGE.path}`
  } else if (!/arc|iris\s*xe|battlemage|alchemist/.test(n)) {
    // Not an Intel GPU we recognise
    return null
  }

  const html = await httpsGetText(page.host, page.path)
  const parsed = parseIntelVersion(html)
  if (!parsed) return null

  return {
    version: parsed.version,
    releaseDate: parsed.releaseDate,
    downloadUrl,
    // Intel's download-center URL is an HTML page, not the .exe directly.
    // Force guided to avoid a silent-install attempt on a redirect page.
    installable: false,
    source: 'vendor-endpoint',
  }
}
