// Vryionics VR Optimization Suite - Installed Driver Scanner
//
// Walks HKLM\SYSTEM\CurrentControlSet\Enum\{PCI,USB} to enumerate every
// hardware device, follows each device's Driver value into
// Control\Class\<classGUID>\<index>, and reads DriverDate/DriverVersion/
// ProviderName from there. The updater then checks each row against vendor
// endpoints.
//
// Why registry instead of CIM: Get-CimInstance Win32_PnPSignedDriver pulls
// the same data, but spawning PowerShell costs ~600 ms cold and ~150 ms
// warm before the query even starts. reg.exe queries take ~30 ms per key,
// and we only need a few hundred keys total.

import { readKey, type RegKey } from '../utils/registry-read'
import { enumerateRegistrySubkeys } from '../utils/registry'
import { log } from '../logger'
import type { DriverCategory, DriverVendor, InstalledDriver } from './types'

const CLASS_BASE = 'SYSTEM\\CurrentControlSet\\Control\\Class'

// Walking PCI is enough for the driver categories the updater pages
// surface (GPU / chipset / audio / network / Bluetooth). USB devices
// were enumerated previously, but USB driver recommendations were
// never load-bearing for VR users and surfaced confusing per-port
// hub entries. Skip the whole bus.
const ENUM_BUSES = ['PCI'] as const

// Mirror of the DeviceClass filter the old PowerShell pipeline applied.
// USB intentionally absent — see ENUM_BUSES.
const KEPT_CLASSES = new Set([
  'DISPLAY',
  'MEDIA',
  'NET',
  'HDC',
  'BLUETOOTH',
  'SYSTEM',
])

// Modern Windows installs frequently omit the text 'Class' value on
// Enum\PCI\<dev>\<instance> keys and only write 'ClassGUID'. Without this
// fallback every PCI / USB device key fails the KEPT_CLASSES check and
// the scanner reports zero rows. The GUIDs below are the standard
// Windows setup-class GUIDs and have been stable since XP.
const CLASS_GUID_TO_NAME: Record<string, string> = {
  '{4d36e968-e325-11ce-bfc1-08002be10318}': 'DISPLAY',
  '{36fc9e60-c465-11cf-8056-444553540000}': 'USB',
  '{4d36e96c-e325-11ce-bfc1-08002be10318}': 'MEDIA',
  '{4d36e972-e325-11ce-bfc1-08002be10318}': 'NET',
  '{4d36e96a-e325-11ce-bfc1-08002be10318}': 'HDC',
  '{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}': 'BLUETOOTH',
  '{4d36e97d-e325-11ce-bfc1-08002be10318}': 'SYSTEM',
}

interface DeviceRow {
  className: string
  name: string
  instanceId: string
  manufacturer: string | null
  driverRel: string | null
}

interface DriverMeta {
  version: string | null
  date: string | null
  provider: string | null
}

function readSz(key: RegKey, name: string): string | null {
  const v = key.values[name]
  if (!v) return null
  if (v.type === 'REG_SZ' || v.type === 'REG_EXPAND_SZ') return v.data.trim() || null
  return null
}

// DeviceDesc often carries an unresolved "@oem.inf,%key%;Resolved Value"
// pointer. Windows duplicates the resolved value after the semicolon, so
// we trust whatever follows the last ';' and fall back to the raw string.
function resolveDeviceDesc(raw: string | null): string | null {
  if (!raw) return null
  const semi = raw.lastIndexOf(';')
  return semi >= 0 ? raw.slice(semi + 1).trim() : raw.trim()
}

async function readDeviceRow(busPath: string, family: string, instance: string): Promise<DeviceRow | null> {
  const path = `HKLM\\${busPath}\\${family}\\${instance}`
  const key = await readKey(path).catch(() => null)
  if (!key) return null

  let className = (readSz(key, 'Class') ?? '').toUpperCase()
  if (!className) {
    const guid = (readSz(key, 'ClassGUID') ?? '').toLowerCase()
    if (guid) className = CLASS_GUID_TO_NAME[guid] ?? ''
  }
  if (!KEPT_CLASSES.has(className)) return null

  const friendly = readSz(key, 'FriendlyName')
  const desc = resolveDeviceDesc(readSz(key, 'DeviceDesc'))
  const name = friendly ?? desc
  if (!name) return null

  return {
    className,
    name,
    instanceId: `${busPath.split('\\').pop()}\\${family}\\${instance}`,
    manufacturer: readSz(key, 'Mfg') ?? readSz(key, 'Manufacturer'),
    driverRel: readSz(key, 'Driver'),
  }
}

async function readDriverMeta(driverRel: string): Promise<DriverMeta> {
  const path = `HKLM\\${CLASS_BASE}\\${driverRel}`
  const key = await readKey(path).catch(() => null)
  if (!key) return { version: null, date: null, provider: null }
  return {
    version: readSz(key, 'DriverVersion'),
    date: normalizeDriverDate(readSz(key, 'DriverDate')),
    provider: readSz(key, 'ProviderName'),
  }
}

// DriverDate in the registry is stored as REG_SZ "M-D-YYYY" (en-US, with
// no zero padding). Convert to ISO yyyy-MM-dd for parity with the old
// PowerShell output. Anything unparseable becomes null rather than a
// fabricated date.
function normalizeDriverDate(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
  if (!m) return null
  const month = m[1].padStart(2, '0')
  const day = m[2].padStart(2, '0')
  return `${m[3]}-${month}-${day}`
}

function categorize(row: DeviceRow): DriverCategory | null {
  const name = row.name.toLowerCase()
  const cls = row.className.toLowerCase()

  if (cls === 'display') {
    if (/microsoft basic|remote desktop|virtual/.test(name)) return null
    return 'gpu'
  }
  if (cls === 'media' && /audio|realtek|intel.*smart.*sound|high definition/i.test(row.name)) return 'audio'
  if (cls === 'net') {
    if (/wi-?fi|wireless|wlan|ax\d{3}|be\d{3}|8265|9260|ac\s*\d/i.test(row.name)) return 'wifi'
    if (/bluetooth/i.test(row.name)) return 'bluetooth'
    if (/ethernet|gigabit|realtek\s*pcie\s*gbe|i2\d{2}|i3\d{2}/i.test(row.name)) return 'ethernet'
    return 'ethernet'
  }
  if (cls === 'system' && /chipset|sm\s*bus|lpc|pci\s*express\s*root|platform/i.test(row.name)) return 'chipset'
  if (cls === 'bluetooth') return 'bluetooth'
  return null
}

function vendorFromManufacturer(manufacturer: string | null, hardwareName: string): DriverVendor {
  const m = (manufacturer ?? '').toLowerCase()
  const n = (hardwareName ?? '').toLowerCase()
  if (/nvidia/.test(m) || /nvidia|geforce|rtx|gtx/.test(n)) return 'NVIDIA'
  if (/advanced micro devices|\bamd\b/.test(m) || /\bamd\b|radeon|\brx\s/.test(n)) return 'AMD'
  if (/\bintel\b/.test(m) || /intel|arc\b|iris|uhd graphics/.test(n)) return 'Intel'
  if (/realtek/.test(m) || /realtek/.test(n)) return 'Realtek'
  if (/qualcomm|atheros/.test(m) || /qualcomm|atheros|qca/.test(n)) return 'Qualcomm'
  if (/mediatek/.test(m) || /mediatek|mtk/.test(n)) return 'MediaTek'
  if (/microsoft/.test(m)) return 'Microsoft'
  return 'Unknown'
}

function makeId(cat: DriverCategory, vendor: DriverVendor, name: string, instanceId: string): string {
  const suffix = instanceId.split('\\').pop()?.substring(0, 12) ?? ''
  const slug = `${cat}-${vendor}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug}-${suffix}`.substring(0, 96)
}

export async function scanInstalledDrivers(): Promise<InstalledDriver[]> {
  const startedAt = Date.now()
  log.info('drivers:scanner', 'Scanning installed drivers via registry...')

  const rows: DeviceRow[] = []
  for (const bus of ENUM_BUSES) {
    const busPath = `SYSTEM\\CurrentControlSet\\Enum\\${bus}`
    const families = enumerateRegistrySubkeys('HKLM', busPath)
    for (const family of families) {
      const instances = enumerateRegistrySubkeys('HKLM', `${busPath}\\${family}`)
      for (const instance of instances) {
        const row = await readDeviceRow(busPath, family, instance)
        if (row) rows.push(row)
      }
    }
  }

  const drivers: InstalledDriver[] = []
  const seenIds = new Set<string>()

  // Cache per driverRel: many devices share the same class subkey when a
  // single driver package binds multiple devices (e.g. all USB hubs under
  // one xHCI driver), and we'd otherwise re-read the same key 5–10 times.
  const metaCache = new Map<string, DriverMeta>()

  for (const row of rows) {
    const category = categorize(row)
    if (!category) continue
    if (!row.driverRel) continue

    let meta = metaCache.get(row.driverRel)
    if (!meta) {
      meta = await readDriverMeta(row.driverRel)
      metaCache.set(row.driverRel, meta)
    }
    if (!meta.version) continue

    // ProviderName is more authoritative than the device's Mfg key for
    // vendor classification: Mfg often reads "(Standard system devices)"
    // even when ProviderName is "Intel Corporation".
    const vendor = vendorFromManufacturer(meta.provider ?? row.manufacturer, row.name)
    const id = makeId(category, vendor, row.name, row.instanceId)
    if (seenIds.has(id)) continue
    seenIds.add(id)

    drivers.push({
      id,
      vendor,
      category,
      hardwareName: row.name,
      installedVersion: meta.version,
      installedDate: meta.date ?? undefined,
    })
  }

  log.info(
    'drivers:scanner',
    `Detected ${drivers.length} driver rows across ${new Set(drivers.map((d) => d.category)).size} categories in ${Date.now() - startedAt}ms`,
  )
  return drivers
}
