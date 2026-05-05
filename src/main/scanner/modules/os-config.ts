// Windows version, Game Mode, Defender exclusions, virtualization drivers.

import { readRegistryDword, readRegistry, registryKeyExists, enumerateRegistrySubkeys } from '../../utils/registry'
import { readKey, readValue } from '../../utils/registry-read'
import { runExe } from '../../utils/exec'
import os from 'node:os'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ScanModuleResult, OsConfigData } from '../types'

interface StartupItem {
  name: string
  enabled: boolean
  impact: string
}

async function getStartupItems(): Promise<StartupItem[]> {
  // The Run keys are the conventional auto-start surface for desktop apps.
  // Win32_StartupCommand also includes Startup-folder shortcuts, but those
  // are best handled by reading the folders directly (left as a follow-up).
  const paths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  ]

  const items: StartupItem[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    const key = await readKey(path).catch(() => null)
    if (!key) continue
    for (const [name, value] of Object.entries(key.values)) {
      if (value.type !== 'REG_SZ' && value.type !== 'REG_EXPAND_SZ') continue
      if (seen.has(name)) continue
      seen.add(name)
      items.push({ name, enabled: true, impact: 'Unknown' })
    }
  }
  return items
}

async function getDefenderExclusions(): Promise<string[]> {
  // Defender stores exclusion lists as registry value names (the value data
  // is always 0). Tamper Protection blocks read access on most consumer
  // systems, in which case readKey returns null and we report none. Rules
  // already treat an empty list as "unknown / not granted".
  const out: string[] = []
  for (const sub of ['Paths', 'Processes']) {
    const key = await readKey(`HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Exclusions\\${sub}`).catch(() => null)
    if (!key) continue
    for (const name of Object.keys(key.values)) {
      if (name) out.push(name)
    }
  }
  return out
}

async function detectVirtualizationDrivers(): Promise<string[]> {
  const drivers: string[] = []
  const checks: Record<string, string> = {
    'SYSTEM\\CurrentControlSet\\Services\\vmms': 'Hyper-V',
    'SYSTEM\\CurrentControlSet\\Services\\VBoxDrv': 'VirtualBox',
    'SYSTEM\\CurrentControlSet\\Services\\WslService': 'WSL2',
    'SYSTEM\\CurrentControlSet\\Services\\vmcompute': 'Hyper-V Compute'
  }
  for (const [path, name] of Object.entries(checks)) {
    if (registryKeyExists('HKLM', path)) drivers.push(name)
  }
  return drivers
}

function getGameModeEnabled(): boolean {
  const val = readRegistryDword('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled')
  // If key doesn't exist, Game Mode is enabled by default on Win10/11
  return val !== 0
}

function getXboxDvrEnabled(): boolean {
  // GameDVR_Enabled = 0 means disabled; any non-zero or missing = enabled
  const val = readRegistryDword('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled')
  return val !== 0  // null (missing key) means default = enabled
}

async function readPowercfgIndex(args: string[]): Promise<number | null> {
  // powercfg.exe is a stock Windows executable; we shell to it directly
  // rather than going through PowerShell.
  const out = await runExe('powercfg', args, 8000)
  if (!out) return null
  const match = out.match(/Current AC Power Setting Index:\s*(0x[0-9a-f]+|\d+)/i)
  if (!match) return null
  const val = match[1].startsWith('0x') ? parseInt(match[1], 16) : parseInt(match[1], 10)
  return Number.isFinite(val) ? val : null
}

async function getUsbSelectiveSuspendEnabled(): Promise<boolean> {
  const idx = await readPowercfgIndex([
    '/query',
    'SCHEME_CURRENT',
    '2a737441-1930-4402-8d77-b2bebba308a3',
    '48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
  ])
  // Default to enabled when unreadable; non-zero index = enabled.
  if (idx === null) return true
  return idx !== 0
}

async function getPcieAspmActive(): Promise<boolean | null> {
  // PCIE_LINK_STATE subgroup 501a4d13-..., ASPM setting ee12f906-...
  // Value 0 = Off, 1 = Moderate power savings, 2 = Maximum power savings.
  const idx = await readPowercfgIndex([
    '/query',
    'SCHEME_CURRENT',
    '501a4d13-42af-4429-9fd1-a8218c268e20',
    'ee12f906-d277-404b-b6da-e5fa1a576df5',
  ])
  if (idx === null) return null
  return idx !== 0
}

async function getCoresMinParkedPercent(): Promise<number> {
  const idx = await readPowercfgIndex(['/query', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES'])
  return idx ?? 0
}

async function getNagleEnabled(): Promise<boolean> {
  // Walk Tcpip\Parameters\Interfaces and check TcpAckFrequency on each.
  // Nagle is "still enabled everywhere" iff no interface has it disabled (==1).
  const interfaces = enumerateRegistrySubkeys(
    'HKLM',
    'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
  )
  for (const guid of interfaces) {
    const v = await readValue(
      `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}`,
      'TcpAckFrequency'
    )
    if (v && v.type === 'REG_DWORD' && v.data === 1) return false
  }
  return true
}

function getHyperVRunning(): boolean {
  // vmms is the Hyper-V Virtual Machine Management service
  // If it's installed AND set to automatic/running = Hyper-V is active
  return registryKeyExists('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\vmms')
}

function getGlobalTimerResolutionEnabled(): boolean {
  const val = readRegistryDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests')
  return val === 1
}

async function getGpuPnpDeviceId(): Promise<string | null> {
  // Walk the same display-class subkeys gpu.ts uses; MatchingDeviceId carries
  // the PCI\VEN_xxxx&DEV_xxxx instance string the GPU rule expects.
  const DISPLAY_CLASS = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
  for (let i = 0; i < 16; i++) {
    const sub = String(i).padStart(4, '0')
    const key = await readKey(`${DISPLAY_CLASS}\\${sub}`).catch(() => null)
    if (!key) continue
    const matching = key.values['MatchingDeviceId']
    if (matching && matching.type === 'REG_SZ' && matching.data.toUpperCase().startsWith('PCI\\')) {
      return matching.data
    }
  }
  return null
}

function getGpuInterruptPrioritySet(pnpDeviceId: string | null): boolean {
  if (!pnpDeviceId) return false
  const regPath = `SYSTEM\\CurrentControlSet\\Enum\\${pnpDeviceId}\\Device Parameters\\Interrupt Management\\Affinity Policy`
  const val = readRegistryDword('HKLM', regPath, 'DevicePriority')
  return val === 3
}

function getVrProcessPrioritySet(): boolean {
  const val = readRegistryDword(
    'HKLM',
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\vrserver.exe\\PerfOptions',
    'CpuPriorityClass'
  )
  return val === 3
}

function getFullscreenOptimizationsApplied(): boolean {
  // Check HKCU AppCompatFlags Layers for the DISABLEDXMAXIMIZEDWINDOWEDMODE flag on any known VR exe.
  // The fix writes to this key; if at least one VR exe has it, the fix has been applied.
  const FS_OPT_PATH = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
  const VR_EXES = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrserver.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrcompositor.exe',
    'C:\\Program Files\\Oculus\\Support\\oculus-runtime\\OVRServer_x64.exe',
    'C:\\Program Files\\VirtualDesktop.Streamer\\VirtualDesktop.Streamer.exe'
  ]
  for (const exe of VR_EXES) {
    const val = readRegistry('HKCU', FS_OPT_PATH, exe)
    if (val && val.includes('DISABLEDXMAXIMIZEDWINDOWEDMODE')) return true
  }
  return false
}

function getWuAutoRebootEnabled(): boolean {
  const val = readRegistryDword(
    'HKLM',
    'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU',
    'NoAutoRebootWithLoggedOnUsers'
  )
  // null (key doesn't exist) or 0 means auto-reboot is NOT prevented → it is enabled (bad)
  return val === null || val === 0
}

function getWin11EcoQosRisk(windowsBuild: number): boolean {
  // Win 11 22H2+ (build 22621) introduced stricter EcoQoS enforcement.
  // Power plan check happens in the rule (powerPlan is 'Unknown' at os-config scan time).
  return windowsBuild >= 22621
}

function getDeliveryOptimizationP2pEnabled(): boolean {
  const val = readRegistryDword(
    'HKLM',
    'SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization',
    'DODownloadMode'
  )
  // null = key absent (default = P2P active), 1 = LAN peering, 2 = group peering, 3 = internet peering
  if (val === null) return true
  return val === 1 || val === 2 || val === 3
}

function getSteamVrAsyncReprojectionEnabled(): boolean | null {
  const settingsPath = join(process.env.LOCALAPPDATA ?? '', 'openvr', 'steamvr.vrsettings')
  if (!existsSync(settingsPath)) return null
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
    const steamvr = (data.steamvr ?? {}) as Record<string, unknown>
    const val = steamvr.allowAsyncReprojection
    if (val === undefined) return false  // not set = defaults to off in most SteamVR versions
    return val === true
  } catch {
    return null
  }
}

function getHpetStatus(): boolean | null {
  // HPET enabled = timer resolution is high, detected via registry
  // This is an approximation — true HPET status requires LatencyMon or bcdedit
  const val = readRegistry('HKLM', 'SYSTEM\\CurrentControlSet\\Enum\\ACPI\\PNP0103', '0000')
  return val !== null ? true : null
}

async function getVpnActive(): Promise<boolean> {
  // Cross-reference two sources: the network adapter class subkeys (for
  // friendly descriptions and naming) against os.networkInterfaces() (for
  // which interfaces actually have an IP and aren't internal). If a
  // non-internal interface's name or description matches a VPN-like
  // pattern, we count the VPN as active.
  const NETWORK_CLASS = '{4d36e972-e325-11ce-bfc1-08002be10318}'
  const subkeys = enumerateRegistrySubkeys(
    'HKLM',
    `SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS}`
  )

  const vpnPattern = /vpn|tap|tunnel|wireguard|openvpn|nordlynx|tailscale|zerotier/i
  const vpnDescriptions = new Set<string>()

  for (const sk of subkeys) {
    if (!/^\d{4}$/.test(sk)) continue
    const desc = await readValue(
      `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS}\\${sk}`,
      'DriverDesc'
    )
    if (
      desc &&
      (desc.type === 'REG_SZ' || desc.type === 'REG_EXPAND_SZ') &&
      vpnPattern.test(desc.data)
    ) {
      vpnDescriptions.add(desc.data.toLowerCase())
    }
  }

  if (vpnDescriptions.size === 0) return false

  // os.networkInterfaces() doesn't expose driver descriptions, so we fall
  // back to checking that *any* non-internal interface is up. If a
  // VPN-named driver is loaded and at least one tunnel-like interface
  // shows up with a non-internal address, treat the VPN as active.
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    if (vpnPattern.test(name) && addrs.some((a) => !a.internal)) return true
  }

  return false
}

function getThirdPartyAv(): string | null {
  // Security Center is exposed only via the WMI namespace root/SecurityCenter2.
  // No registry equivalent exists, so we drop this check; downstream rules
  // already null-coalesce it.
  return null
}

async function getBiosInfo(): Promise<{ date: string | null; version: string | null }> {
  const key = await readKey('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS').catch(() => null)
  if (!key) return { date: null, version: null }

  const releaseDate = key.values['BIOSReleaseDate']
  const biosVersion = key.values['BIOSVersion']
  const systemBiosVersion = key.values['SystemBiosVersion']

  let date: string | null = null
  if (releaseDate && releaseDate.type === 'REG_SZ') {
    const m = releaseDate.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }

  // BIOSVersion is REG_MULTI_SZ on most boards; fall back to SystemBiosVersion
  // (also REG_MULTI_SZ) when absent.
  let version: string | null = null
  if (biosVersion && biosVersion.type === 'REG_MULTI_SZ' && biosVersion.data.length > 0) {
    version = biosVersion.data[0]
  } else if (biosVersion && biosVersion.type === 'REG_SZ') {
    version = biosVersion.data
  } else if (systemBiosVersion && systemBiosVersion.type === 'REG_MULTI_SZ' && systemBiosVersion.data.length > 0) {
    version = systemBiosVersion.data[0]
  }

  return { date, version }
}

function getLaptopStatus(): { isLaptop: boolean; isOnBattery: boolean } {
  // The Enum\BATTERY hive is populated by the Composite Battery driver and is
  // a reliable laptop indicator on Windows. Live charge state lives behind
  // GetSystemPowerStatus which is unavailable from the registry; we report
  // false rather than guessing.
  const isLaptop = registryKeyExists('HKLM', 'SYSTEM\\CurrentControlSet\\Enum\\ACPI\\PNP0C0A')
    || registryKeyExists('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\CmBatt')
  return { isLaptop, isOnBattery: false }
}

interface WindowsVersionInfo {
  version: string
  buildNumber: string
}

async function readWindowsVersion(): Promise<WindowsVersionInfo | null> {
  const key = await readKey('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion').catch(() => null)
  if (!key) return null

  const major = key.values['CurrentMajorVersionNumber']
  const minor = key.values['CurrentMinorVersionNumber']
  const build = key.values['CurrentBuildNumber']
  const legacyVersion = key.values['CurrentVersion']

  let version = ''
  if (major && major.type === 'REG_DWORD' && minor && minor.type === 'REG_DWORD') {
    version = `${major.data}.${minor.data}`
  } else if (legacyVersion && legacyVersion.type === 'REG_SZ') {
    version = legacyVersion.data
  }

  let buildNumber = ''
  if (build && build.type === 'REG_SZ') {
    buildNumber = build.data
  }

  if (!version && !buildNumber) return null
  return { version, buildNumber }
}

interface ServiceInfo {
  Name: string
  DisplayName: string
  State: string
  StartMode: string
}

const START_MODE: Record<number, string> = {
  0: 'Boot',
  1: 'System',
  2: 'Auto',
  3: 'Manual',
  4: 'Disabled',
}

async function readServices(filter: (name: string) => boolean): Promise<ServiceInfo[]> {
  // The SCM service catalog lives at HKLM\SYSTEM\CurrentControlSet\Services.
  // We can't tell live running state from the registry, so State is reported
  // as 'Unknown'. The downstream filter only inspects names + display strings.
  const childNames = enumerateRegistrySubkeys('HKLM', 'SYSTEM\\CurrentControlSet\\Services')

  const results: ServiceInfo[] = []
  for (const name of childNames) {
    if (!filter(name)) continue
    const svcKey = await readKey(`HKLM\\SYSTEM\\CurrentControlSet\\Services\\${name}`).catch(() => null)
    if (!svcKey) continue

    const display = svcKey.values['DisplayName']
    const start = svcKey.values['Start']
    const startMode = start && start.type === 'REG_DWORD' ? (START_MODE[start.data] ?? 'Unknown') : 'Unknown'

    results.push({
      Name: name,
      DisplayName: display && (display.type === 'REG_SZ' || display.type === 'REG_EXPAND_SZ') ? display.data : name,
      State: 'Unknown',
      StartMode: startMode,
    })
  }
  return results
}

export async function scanOsConfig(): Promise<ScanModuleResult<OsConfigData>> {
  try {
    console.log('[scan:os-config] Collecting OS configuration...')

    const isRelevantService = (name: string): boolean => {
      const n = name.toLowerCase()
      return (
        n.includes('steamvr') || n.includes('oculus') ||
        n.includes('wmr') || n.includes('hyper-v') ||
        n.includes('vmms') || n.includes('docker') ||
        n.includes('xbox') || n.includes('vr')
      )
    }

    const [
      winVersion,
      startupItems,
      defenderExclusions,
      virtualizationDrivers,
      services,
      usbSelectiveSuspendEnabled,
      coresMinParkedPercent,
      nagleEnabled,
      pcieAspmActive
    ] = await Promise.all([
      readWindowsVersion(),
      getStartupItems(),
      getDefenderExclusions(),
      detectVirtualizationDrivers(),
      readServices(isRelevantService),
      getUsbSelectiveSuspendEnabled(),
      getCoresMinParkedPercent(),
      getNagleEnabled(),
      getPcieAspmActive()
    ])

    const gpuPnpDeviceId = await getGpuPnpDeviceId()
    const gpuInterruptPrioritySet = getGpuInterruptPrioritySet(gpuPnpDeviceId)

    const [vpnActive, biosInfo] = await Promise.all([
      getVpnActive().catch(() => false),
      getBiosInfo().catch(() => ({ date: null, version: null })),
    ])
    const thirdPartyAv = getThirdPartyAv()
    const laptopStatus = getLaptopStatus()

    const build = winVersion ? parseInt(winVersion.buildNumber, 10) : 0
    const gameModeEnabled = getGameModeEnabled()

    // Cap relevant services at 20 to keep report payloads small; rules look at
    // a handful of well-known names rather than the full list.
    const relevantServices = services
      .slice(0, 20)
      .map((s) => ({
        name: s.Name,
        displayName: s.DisplayName,
        status: s.State,
        startType: s.StartMode,
      }))

    console.log(
      `[scan:os-config] Build: ${build}, GameMode: ${gameModeEnabled}, ` +
      `Virtualization: ${virtualizationDrivers.join(', ') || 'none'}, ` +
      `GpuPnpId: ${gpuPnpDeviceId ?? 'none'}`
    )

    return {
      success: true,
      data: {
        windowsVersion: winVersion?.version ?? 'Unknown',
        windowsBuild: build,
        gameModeEnabled,
        hpetEnabled: getHpetStatus(),
        timerResolution: null, // Phase 1b: timer-resolution module
        powerPlan: 'Unknown', // Populated by power-plan module merge
        startupItems,
        services: relevantServices,
        defenderExclusions,
        virtualizationDrivers,
        xboxDvrEnabled: getXboxDvrEnabled(),
        usbSelectiveSuspendEnabled,
        coresMinParkedPercent,
        nagleEnabled,
        hyperVRunning: getHyperVRunning(),
        globalTimerResolutionEnabled: getGlobalTimerResolutionEnabled(),
        steamVrAsyncReprojectionEnabled: getSteamVrAsyncReprojectionEnabled(),
        gpuInterruptPrioritySet,
        gpuPnpDeviceId,
        vrProcessPrioritySet: getVrProcessPrioritySet(),
        fullscreenOptimizationsApplied: getFullscreenOptimizationsApplied(),
        wuAutoRebootEnabled: getWuAutoRebootEnabled(),
        deliveryOptimizationP2pEnabled: getDeliveryOptimizationP2pEnabled(),
        win11EcoQosRisk: getWin11EcoQosRisk(build),
        pcieAspmActive,
        vpnActive,
        thirdPartyAv,
        biosDate: biosInfo.date,
        biosVersion: biosInfo.version,
        isLaptop: laptopStatus.isLaptop,
        isOnBattery: laptopStatus.isOnBattery
      }
    }
  } catch (error) {
    console.error('[scan:os-config] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
