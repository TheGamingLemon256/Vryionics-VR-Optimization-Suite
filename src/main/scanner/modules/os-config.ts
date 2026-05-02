// VR Optimization Suite — OS Config Scan Module
// Collects Windows version, Game Mode, Defender exclusions, virtualization drivers.

import { readRegistryDword, readRegistry, registryKeyExists } from '../../utils/registry'
import { queryWindowsVersion, queryServices } from '../../utils/wmi'
import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ScanModuleResult, OsConfigData } from '../types'

interface StartupItem {
  name: string
  enabled: boolean
  impact: string
}

async function getStartupItems(): Promise<StartupItem[]> {
  const script = `
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location |
  ForEach-Object { @{ name = $_.Name; enabled = $true; impact = 'Unknown' } } |
  ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShellJson<StartupItem[]>(script)
    return Array.isArray(raw) ? raw : [raw]
  } catch {
    return []
  }
}

async function getDefenderExclusions(): Promise<string[]> {
  const script = `
try {
  $prefs = Get-MpPreference -ErrorAction Stop
  $paths = @()
  if ($prefs.ExclusionPath) { $paths += $prefs.ExclusionPath }
  if ($prefs.ExclusionProcess) { $paths += $prefs.ExclusionProcess }
  $paths | ConvertTo-Json -Compress
} catch {
  '[]'
}
`
  try {
    const raw = await tryRunPowerShell(script, 10000)
    if (!raw || raw === '[]') return []
    const parsed = JSON.parse(raw)
    // PowerShell's ConvertTo-Json emits a bare string when there's exactly one
    // element — not a 1-item array. Coerce so downstream .join()/.map() calls
    // never blow up.
    if (typeof parsed === 'string') return [parsed]
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === 'string')
    return []
  } catch {
    return []
  }
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

async function getUsbSelectiveSuspendEnabled(): Promise<boolean> {
  try {
    const out = await tryRunPowerShell(
      'powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
      8000
    )
    if (!out) return true  // assume enabled if can't read
    const match = out.match(/Current AC Power Setting Index:\s*(0x[0-9a-f]+|\d+)/i)
    if (match) {
      const val = parseInt(match[1])
      return val !== 0  // 0 = disabled (good), non-zero = enabled (bad)
    }
    return true
  } catch {
    return true
  }
}

async function getPcieAspmActive(): Promise<boolean | null> {
  // PCIE_LINK_STATE subgroup 501a4d13-42af-4429-9fd1-a8218c268e20,
  // ASPM setting ee12f906-d277-404b-b6da-e5fa1a576df5.
  // Value 0 = Off, 1 = Moderate power savings, 2 = Maximum power savings.
  try {
    const out = await tryRunPowerShell(
      'powercfg /query SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5',
      8000
    )
    if (!out) return null
    const match = out.match(/Current AC Power Setting Index:\s*(0x[0-9a-f]+|\d+)/i)
    if (!match) return null
    const val = parseInt(match[1])
    return val !== 0
  } catch {
    return null
  }
}

async function getCoresMinParkedPercent(): Promise<number> {
  try {
    const out = await tryRunPowerShell(
      'powercfg /query SCHEME_CURRENT SUB_PROCESSOR CPMINCORES',
      8000
    )
    if (!out) return 0  // assume 0% min (parking enabled) if can't read
    const match = out.match(/Current AC Power Setting Index:\s*(0x[0-9a-f]+|\d+)/i)
    if (match) return parseInt(match[1])
    return 0
  } catch {
    return 0
  }
}

async function getNagleEnabled(): Promise<boolean> {
  try {
    const out = await tryRunPowerShell(`
$ifaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -EA SilentlyContinue
$disabled = $ifaces | Where-Object {
  (Get-ItemProperty $_.PSPath -Name 'TcpAckFrequency' -EA SilentlyContinue).TcpAckFrequency -eq 1
} | Measure-Object
Write-Output $disabled.Count
`, 6000)
    if (!out) return true
    const count = parseInt(out.trim())
    return count === 0  // 0 interfaces have Nagle disabled = Nagle is still enabled everywhere
  } catch {
    return true
  }
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
  try {
    const out = await tryRunPowerShell(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -match '^PCI\\\\' } | Select-Object -First 1 -ExpandProperty PNPDeviceID",
      5000
    )
    return out?.trim() || null
  } catch { return null }
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
  const out = await tryRunPowerShell(`
Get-NetAdapter -EA SilentlyContinue |
  Where-Object {
    $_.InterfaceDescription -like '*VPN*' -or
    $_.InterfaceDescription -like '*TAP*' -or
    $_.InterfaceDescription -like '*Tunnel*' -or
    $_.InterfaceDescription -like '*WireGuard*' -or
    $_.InterfaceDescription -like '*OpenVPN*' -or
    $_.Name -like '*VPN*' -or
    $_.Name -like '*WireGuard*'
  } |
  Where-Object { $_.Status -eq 'Up' } |
  Select-Object -First 1 -ExpandProperty Name
`, 8000)
  return !!(out?.trim())
}

async function getThirdPartyAv(): Promise<string | null> {
  const out = await tryRunPowerShell(`
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -EA SilentlyContinue |
  Where-Object { $_.displayName -notlike '*Windows Defender*' -and $_.displayName -notlike '*Microsoft*' } |
  Select-Object -First 1 -ExpandProperty displayName
if ($av) { Write-Output $av }
`, 8000)
  return out?.trim() || null
}

async function getBiosInfo(): Promise<{ date: string | null; version: string | null }> {
  const out = await tryRunPowerShell(`
$bios = Get-CimInstance Win32_BIOS -EA SilentlyContinue | Select-Object ReleaseDate, SMBIOSBIOSVersion
if ($bios) {
  Write-Output "date:$($bios.ReleaseDate)"
  Write-Output "version:$($bios.SMBIOSBIOSVersion)"
}
`, 8000)
  if (!out) return { date: null, version: null }
  const dateMatch = out.match(/^date:(.+)/m)
  const versionMatch = out.match(/^version:(.+)/m)
  let date: string | null = null
  if (dateMatch) {
    // ReleaseDate is a CIM datetime: "20230515000000.000000+000" → "2023-05-15"
    const raw = dateMatch[1].trim()
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) date = `${m[1]}-${m[2]}-${m[3]}`
  }
  return {
    date,
    version: versionMatch ? versionMatch[1].trim() : null
  }
}

async function getLaptopStatus(): Promise<{ isLaptop: boolean; isOnBattery: boolean }> {
  const out = await tryRunPowerShell(`
$battery = Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1
if ($battery) {
  Write-Output "laptop:true"
  # BatteryStatus: 1=Discharging (on battery), 2=AC, 3=Fully Charged, 4=Low, 5=Critical, 6=Charging, 7=Charging+High, 8=Charging+Low, 9=Charging+Critical, 10=Undefined, 11=Partially Charged
  if ($battery.BatteryStatus -eq 1 -or $battery.BatteryStatus -eq 4 -or $battery.BatteryStatus -eq 5) {
    Write-Output "battery:true"
  } else {
    Write-Output "battery:false"
  }
} else {
  Write-Output "laptop:false"
  Write-Output "battery:false"
}
`, 8000)
  if (!out) return { isLaptop: false, isOnBattery: false }
  return {
    isLaptop: out.includes('laptop:true'),
    isOnBattery: out.includes('battery:true')
  }
}

export async function scanOsConfig(): Promise<ScanModuleResult<OsConfigData>> {
  try {
    console.log('[scan:os-config] Collecting OS configuration...')

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
      queryWindowsVersion(),
      getStartupItems(),
      getDefenderExclusions(),
      detectVirtualizationDrivers(),
      queryServices(),
      getUsbSelectiveSuspendEnabled(),
      getCoresMinParkedPercent(),
      getNagleEnabled(),
      getPcieAspmActive()
    ])

    // GPU PNP device ID must be fetched before the interrupt priority check (sequential)
    const gpuPnpDeviceId = await getGpuPnpDeviceId()
    const gpuInterruptPrioritySet = getGpuInterruptPrioritySet(gpuPnpDeviceId)

    const [vpnActive, thirdPartyAv, biosInfo, laptopStatus] = await Promise.all([
      getVpnActive().catch(() => false),
      getThirdPartyAv().catch(() => null),
      getBiosInfo().catch(() => ({ date: null, version: null })),
      getLaptopStatus().catch(() => ({ isLaptop: false, isOnBattery: false }))
    ])

    const build = winVersion ? parseInt(winVersion.buildNumber, 10) : 0
    const gameModeEnabled = getGameModeEnabled()

    // Filter services to only VR/gaming-relevant ones
    const relevantServices = services
      .filter((s) => {
        const name = s.Name.toLowerCase()
        const display = s.DisplayName.toLowerCase()
        return (
          name.includes('steamvr') || name.includes('oculus') ||
          name.includes('wmr') || name.includes('hyper-v') ||
          name.includes('vmms') || name.includes('docker') ||
          display.includes('gaming') || display.includes('xbox') ||
          display.includes('vr') || name.includes('vr')
        )
      })
      .slice(0, 20) // Limit to top 20 relevant services
      .map((s) => ({
        name: s.Name,
        displayName: s.DisplayName,
        status: s.State,
        startType: s.StartMode
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
