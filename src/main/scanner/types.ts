// Contract between scan modules (producers) and rules (consumers).
// Each scan module populates one key of ScanData.


export interface ProcessInfo {
  name: string
  pid: number
  cpuPercent: number
  ramMB: number
  gpuIndex: number | null
  affinity: number // Bitmask
  priority: string
  handles: number
  gdiObjects: number | null
}


export interface ScanModuleResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /** If true, partial data was collected before the error */
  partial?: boolean
  /** If true, full data requires admin elevation */
  requiresAdmin?: boolean
  /** Duration of this module's scan in ms */
  durationMs?: number
}


export interface CpuData {
  model: string
  cores: number
  threads: number
  baseClock: number // MHz
  boostClock: number
  architecture: string // e.g. "Zen 4 3D V-Cache"
  hasVCache: boolean
  perCoreUsage: number[] // % per core, sampled over scan duration
  avgUsage: number
  temperature: number | null
  contextSwitchesPerSec: number
  vcacheDriverPresent: boolean
  vcacheAppEntries: Record<string, { endsWith: string; type: number }>
  boostClockMhz: number | null    // Current maximum boost frequency observed in MHz (null if undetectable)
  thermalThrottled: boolean        // True if CPU is running below base clock (thermal or power limit)
}


export interface GpuDevice {
  index: number
  name: string
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown'
  vramTotal: number // MB
  vramUsed: number
  utilization: number // %
  temperature: number
  powerDraw: number // W
  powerLimit: number
  encoderUtilization: number // % (critical for wireless/USB-link)
  decoderUtilization: number
  pcieGen: number
  pcieLinkWidth: number
  driverVersion: string
  rebarEnabled: boolean
  hagsEnabled: boolean
  isIntegrated: boolean       // true for Intel UHD/Iris Xe, AMD APU/Vega integrated (shares system RAM)
  samEnabled: boolean         // AMD Smart Access Memory (mirrors NVIDIA rebarEnabled but for AMD). Always false for non-AMD.
  driverDate: string | null   // 'YYYY-MM-DD' from WMI — for staleness detection. null if unknown.
  gpuGeneration: string | null // 'RDNA3' | 'RDNA2' | 'RDNA1' | 'GCN5' | 'Ada Lovelace' | 'Ampere' | 'Turing' | 'Pascal' | 'Arc Alchemist' | 'Arc Battlemage' | 'Xe' | etc.
  clockMhz: number            // Current GPU core clock speed in MHz (0 if unknown)
  memoryClock: number         // Current memory clock in MHz (0 if unknown)
  isThermalThrottled: boolean // True if current clock is significantly below boost clock due to heat
}

export interface GpuData {
  devices: GpuDevice[]
  primaryGpuIndex: number
  dpcPerCore: Record<number, number> // core -> DPC %
}


export interface RamData {
  totalGB: number
  usedGB: number
  availableGB: number
  usagePercent: number
  speed: number // MHz (actual)
  xmpSpeed: number | null // Expected speed from SPD
  type: 'DDR4' | 'DDR5' | 'Unknown'
  channels: number
  commitChargePercent: number
  pagefileUsagePercent: number
  nonpagedPoolMB: number
  modifiedPagesMB: number
  dualChannelConfirmed: boolean    // True if WMI reports 2+ memory channels active
}


export interface StorageDrive {
  letter: string
  type: 'SSD' | 'NVMe' | 'HDD'
  totalGB: number
  freeGB: number
  queueLength: number
  temperature: number | null
  wearPercent: number | null // NVMe wear indicator
  nvmePowerStateOptimal: boolean | null  // null = not NVMe or undetectable; false = power saving active
}

export interface StorageData {
  drives: StorageDrive[]
  vrInstallDrive: string | null // Drive letter where SteamVR/VRChat lives
  shaderCacheSizeMB: number
  tempFolderSizeMB: number
  vrchatCacheSizeGB: number
}


export interface NetworkAdapter {
  name: string
  type: 'Ethernet' | 'Wi-Fi' | 'Unknown'
  speed: number // Mbps
  connected: boolean
  // Wireless VR performance correlates strongly with adapter chipset vendor.
  // We classify what we can identify, leaving unknowns honest rather than guessing.
  chipsetVendor?: 'Intel' | 'Realtek' | 'MediaTek' | 'Qualcomm' | 'Broadcom' | 'Unknown'
  /**
   * Human-readable generation/family, e.g. "AX210 (Wi-Fi 6E)", "BE200 (Wi-Fi 7)",
   * "RTL8852 (Wi-Fi 6)", "MT7921 (Wi-Fi 6)". Extracted from adapter name/description.
   */
  chipsetFamily?: string
  /**
   * Per-chipset VR suitability rating. We grade based on documented driver
   * stability + typical VR streaming performance in the community:
   *   'excellent' — Intel AX200/AX210/BE200, Qualcomm FastConnect
   *   'good'      — MediaTek MT7921/MT7922, Intel AX201
   *   'mediocre'  — Realtek RTL8852/8822, older Broadcom
   *   'poor'      — very old Realtek (RTL8188/8192), Atheros, some OEM-branded
   *   'unknown'   — couldn't identify
   */
  vrSuitability?: 'excellent' | 'good' | 'mediocre' | 'poor' | 'unknown'
}

export interface WifiInfo {
  band: '2.4GHz' | '5GHz' | '6GHz' | null
  channel: number | null
  signalStrength: number | null // percentage 0-100
  linkSpeed: number | null // Mbps
  ssid: string | null
  bssid: string | null
  nearbyNetworks: Array<{ ssid: string; channel: number; signal: number }> | null
  routerVendor: string | null // Best-effort from MAC OUI lookup
  greenEthernetEnabled: boolean | null
  powerSavingEnabled: boolean | null
}

export interface NetworkData {
  adapters: NetworkAdapter[]
  wifi: WifiInfo | null
  latency: {
    gateway: number | null // ms to default gateway
    dns: number | null // ms to DNS resolver
  }
  tcpRetransmits: number
}


export interface VrRuntimeData {
  steamvrInstalled: boolean
  steamvrVersion: string | null
  steamvrSettings: Record<string, unknown> | null // Parsed steamvr.vrsettings
  oculusInstalled: boolean
  oculusVersion: string | null
  wmrInstalled: boolean
  activeRuntime: 'steamvr' | 'oculus' | 'wmr' | 'openxr' | null
  openxrRuntime: string | null // Which OpenXR runtime is active
  supersampling: number | null
  reprojectionMode: string | null
  motionSmoothingEnabled: boolean | null
  vrchatConfig: Record<string, unknown> | null // Parsed config.json; null if not found
  // VRChat-specific performance configuration
  dynamicBoneMaxAffected: number | null    // dynamic_bone_max_affected_transform_count (0 = unlimited = CPU killer)
  dynamicBoneMaxCollider: number | null    // dynamic_bone_max_collider_check_count (0 = unlimited)
  cacheExpiryDelay: number | null          // cache_expiry_delay in days (null = not set)
  vrchatMsaa: number | null                // MSAA level from Unity PlayerPrefs (1/2/4/8; 4+ is heavy)
  vrchatAvatarMaxPolygons: number | null   // avatarMaxPolyCount from config.json
  vrchatPhysicsFps: number | null          // Physics update rate from Unity prefs
  vrchatMirrorResolution: number | null    // Mirror resolution from config (256-2048)
  vrchatParticleLimitSelf: number | null   // particleLimitOther from config
  vrchatConfigPresent: boolean             // True if config.json file exists (false = user has never configured VRChat performance)
  /** Recent crashes parsed from SteamVR log files (vrserver / vrcompositor / vrdashboard). */
  crashEvents: VrCrashEvent[]
}


export interface VrCrashEvent {
  /** Which log file produced this entry. */
  source: 'vrserver' | 'vrcompositor' | 'vrdashboard' | 'vrmonitor'
  /** Unix timestamp (ms) of when the crash / error was logged, best-effort. */
  timestamp: number
  /** Classification of the error (known signature or 'unknown'). */
  signature: VrCrashSignature
  /** First ~160 chars of the matching log line, useful for display/diagnostics. */
  excerpt: string
}

export type VrCrashSignature =
  | 'access-violation'       // 0xc0000005 — usually a bad driver hook (Natural Locomotion etc.)
  | 'stack-overflow'         // 0xc0000409 — overlay / injector conflict
  | 'overlay-conflict'       // Error 306/307 — overlay hooking presentation path
  | 'init-failure'           // Error 108/109/300/301 — runtime failed to start
  | 'shared-ipc'             // Error 309 — shared IPC compositor connection failure
  | 'driver-mismatch'        // Generic driver load failure / API mismatch
  | 'gpu-crash'              // Nvlddmkm / DXGI_ERROR_DEVICE_REMOVED
  | 'unknown'


export interface ProcessesData {
  vrCritical: ProcessInfo[] // VRChat, vrcompositor, vrserver, etc.
  vrOverlay: ProcessInfo[] // XSOverlay, fpsVR, etc.
  vrTracking: ProcessInfo[] // Face tracking, SlimeVR, etc.
  streaming: ProcessInfo[] // OBS, Medal, etc.
  bloat: ProcessInfo[] // Identified resource-wasting processes
  antiCheat: ProcessInfo[]          // EAC, BattlEye, Vanguard, FaceIT kernel drivers & services
  peripheralSoftware: ProcessInfo[] // iCUE, GHub, Armoury Crate, Razer Synapse, SteelSeries GG, MSI Center
  audio: ProcessInfo[] // Voicemeeter, VoiceMod, etc.
  all: ProcessInfo[] // Full process list
}


export interface OsConfigData {
  windowsVersion: string
  windowsBuild: number
  gameModeEnabled: boolean
  hpetEnabled: boolean | null
  timerResolution: { current: number; minimum: number; maximum: number } | null // ms
  powerPlan: string
  startupItems: Array<{ name: string; enabled: boolean; impact: string }>
  services: Array<{ name: string; displayName: string; status: string; startType: string }>
  defenderExclusions: string[]
  virtualizationDrivers: string[] // Hyper-V, VirtualBox, WSL2, etc.
  xboxDvrEnabled: boolean                // Xbox Game Bar/DVR is active
  usbSelectiveSuspendEnabled: boolean    // USB selective suspend is on in current power plan
  coresMinParkedPercent: number          // Current CPMINCORES value (0-100); <100 means parking active
  nagleEnabled: boolean                  // Nagle algorithm not disabled on network interfaces
  hyperVRunning: boolean                 // Hyper-V vmms service is actively running (not just installed)
  globalTimerResolutionEnabled: boolean  // HKLM GlobalTimerResolutionRequests = 1 (Win 11+)
  steamVrAsyncReprojectionEnabled: boolean | null  // steamvr.allowAsyncReprojection from vrsettings; null if SteamVR not installed
  gpuInterruptPrioritySet: boolean       // DevicePriority = 3 in MSI interrupt affinity policy for primary GPU
  gpuPnpDeviceId: string | null          // PNP device ID of primary GPU (e.g. PCI\VEN_10DE&DEV_2684&...)
  vrProcessPrioritySet: boolean          // IFEO CpuPriorityClass = 3 for vrserver.exe
  fullscreenOptimizationsApplied: boolean // AppCompatFlags DISABLEDXMAXIMIZEDWINDOWEDMODE set on ≥1 VR exe
  wuAutoRebootEnabled: boolean           // NoAutoRebootWithLoggedOnUsers is absent or 0 (auto-reboot risk)
  deliveryOptimizationP2pEnabled: boolean // DODownloadMode is null or 1/2/3 (P2P seeding active)
  win11EcoQosRisk: boolean  // Win 11 22H2+ + non-High-Performance power plan = risk of VR process throttling
  pcieAspmActive: boolean | null         // PCIe Active State Power Management is set to anything other than Off on the active power plan; null if unreadable
  vpnActive: boolean                  // VPN adapter detected as connected
  thirdPartyAv: string | null         // Name of third-party AV product (null if only Defender)
  biosDate: string | null             // 'YYYY-MM-DD' format from Win32_BIOS
  biosVersion: string | null          // e.g. 'F14' or 'UEFI 3.0'
  isLaptop: boolean                   // True if battery device detected
  isOnBattery: boolean                // True if currently running on battery power
}


export interface SpeedTestData {
  downloadMbps: number | null   // Download from internet CDN
  uploadMbps: number | null     // Upload to internet CDN
  pingMs: number | null         // Cloudflare CDN latency
  jitterMs: number | null       // Latency variance (packet-by-packet)
  testServer: string | null     // Which endpoint was used
  skipped: boolean              // User or timeout caused skip
  note: string | null           // Context note (e.g. "relevant for cloud VR / content download only")
}


export type HeadsetConnectionMethod =
  | 'usb-link'         // Quest/Pico via USB tether (Oculus Link, Pico Connect USB)
  | 'airlink'          // Meta AirLink (built-in wireless streaming)
  | 'virtual-desktop'  // Virtual Desktop streamer
  | 'alvr'             // ALVR open-source wireless
  | 'steamvr-usb'      // SteamVR with wired headset (Index, Vive, etc.)
  | 'wmr'              // Windows Mixed Reality headset
  | 'psvr2-pc'         // Sony PSVR2 via PC adapter
  | 'steam-link-vr'    // Steam Link app on standalone headset
  | 'unknown-wireless' // Wireless runtime detected but specific app unknown
  | 'unknown-wired'    // Wired runtime detected but specific app unknown
  | 'none'             // No VR runtime active

export interface HeadsetConnectionData {
  detected: boolean
  method: HeadsetConnectionMethod
  runtimeActive: string | null     // 'steamvr' | 'oculus' | 'wmr' | null
  detectedDeviceName: string | null // Best-guess name from USB/registry
  usbControllerType: string | null  // e.g. 'ASMedia USB 3.1', 'Intel USB 3.2'
  usbGeneration: string | null      // '2.0' | '3.0' | '3.1' | '3.2'
  vrProcesses: string[]             // Running VR process names (streaming/runtime)
  streamingBitrateMbps: number | null // Detected from config files (VD / AirLink)
  encoderInUse: string | null       // 'NVENC' | 'AMF' | 'x264' | null
  headsetOsVersion: string | null   // For USB-connected Android headsets

  /** VR companion apps currently running (overlays, trackers, haptics). */
  companionApps: VrCompanionEntry[]
  /** Known SteamVR-conflicting apps running right now (RTSS, MSI Afterburner, etc). */
  activeConflicts: VrConflictEntry[]
}

export interface VrCompanionEntry {
  process: string
  label: string
  category: 'overlay' | 'dashboard' | 'tracking' | 'haptic' | 'utility'
}

export interface VrConflictEntry {
  process: string
  label: string
  severity: 'warning' | 'info'
  /** Why this is known to cause problems. */
  reason: string
  /** Actionable fix the user can apply. */
  solution: string
}


export interface DisplayMonitor {
  name: string            // e.g. "DELL U2722D" or device name
  isPrimary: boolean
  widthPx: number
  heightPx: number
  refreshRateHz: number   // 0 if unknown
  hdrEnabled: boolean
  adaptiveSyncEnabled: boolean | null  // null = unknown (Intel/unknown GPU)
}

export interface DisplayData {
  monitors: DisplayMonitor[]
  primaryRefreshRateHz: number  // convenience: primary monitor's Hz, 0 if unknown
  anyHdrEnabled: boolean
  anyAdaptiveSyncEnabled: boolean
}


export interface AudioData {
  defaultDevice: string | null        // Default audio output device name
  wasapiExclusiveModeInUse: boolean   // Any app holding WASAPI exclusive access
  spatialAudioEnabled: boolean        // Windows Sonic / Atmos / spatial audio active
  wasapiBufferMs: number | null       // Buffer size in ms (lower = less latency)
  exclusiveDevices: string[]          // App names detected using exclusive mode
  voipNoiseSuppression: boolean       // Windows voice focus / noise suppression active
}


export interface UsbData {
  controllers: Array<{
    name: string          // Full controller name
    vendor: string        // 'ASMedia' | 'Intel' | 'AMD' | 'Fresco Logic' | 'Unknown'
    generation: '2.0' | '3.0' | '3.1' | '3.2' | 'Unknown'
  }>
  headsetUsbGeneration: string | null // Detected USB generation for VR headset
  vrDevicesOnUsb: string[]            // Names of VR-related USB devices found
  genericControllerCount: number      // Number of unidentified USB controllers
}


export interface EventLogData {
  gpuTdrEvents: number          // GPU driver timeout events in last 7 days
  wheaErrors: number            // WHEA hardware error events in last 7 days
  steamvrCrashes: number        // VR runtime crash events in last 7 days
  lastGpuTdrTime: string | null // Timestamp of most recent TDR
  criticalErrors: string[]      // First lines of notable error messages
}


/** Mirrors UserSetupConfig fields that rules care about. */
export interface UserScanSetup {
  pcType: 'laptop' | 'desktop' | 'unknown' | null
  primaryUseCase:
    | 'social-vr' | 'simulation' | 'fitness'
    | 'action-games' | 'productivity' | 'mixed' | null
  mainComplaint:
    | 'stutters' | 'blurry' | 'latency'
    | 'drops' | 'crashes' | 'thermals' | 'none' | null
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | null
}

// Cross-cutting system flags that affect multiple VR workflows. Collected in
// a single scan module (compat.ts) so rules have one place to look rather
// than scraping half a dozen registry keys each.

export interface VrCompatibilityData {
  /** Whether a secondary (integrated) GPU is present — true on most laptops. */
  hasHybridGpu: boolean
  /** Laptop / desktop form factor — affects laptop-specific findings. */
  isLaptop: boolean
  /** Whether Windows HVCI (Memory Integrity) is enabled. True can interfere with older VR drivers (Vive Pro, WMR). */
  hvciEnabled: boolean | null
  /** Windows "Core Isolation" feature overall state. */
  coreIsolationEnabled: boolean | null
  /** Virtualization-Based Security running. Related to HVCI. */
  vbsRunning: boolean | null
  /** SteamVR branch — 'stable' | 'beta' | 'unknown'. */
  steamvrBranch: 'stable' | 'beta' | 'unknown'
  /** Installed VR streaming / companion apps (even when not running right now). */
  installedVrTools: Array<{
    id: string
    label: string
    /** Where the app's executable lives, for reference. */
    installPath: string
    /** Whether it's currently running (union with HeadsetConnectionData.vrProcesses). */
    running: boolean
  }>
  /**
   * Motherboard vendor / model / BIOS details. Used by motherboard-chipset
   * rules to surface per-chipset VR guidance (memory Gear mode, ReBAR, etc.).
   * Null when WMI couldn't read the baseboard (virtualized / heavily locked
   * systems). Chipset is best-effort parsed from the model string.
   */
  motherboard: {
    manufacturer: string
    model: string
    /** Parsed chipset identifier from the model (e.g. 'X670E', 'Z790'). */
    chipset: string | null
    biosVersion: string | null
    biosDate: string | null
  } | null
}


export type ConnectionArchetype = 'tethered-dp' | 'usb-encoded' | 'wifi-wireless' | 'wigig'

/**
 * 'idle'       — no VR-related processes detected at scan time; metrics reflect baseline system load
 * 'under-load' — SteamVR/VRChat/etc. were running during the scan; metrics and findings reflect
 *                the system as it actually behaves in a live VR session
 */
export type ScanCondition = 'idle' | 'under-load'

export interface ScanData {
  // Metadata
  timestamp: number
  scanDurationMs: number
  headsetProfileId: string | null
  connectionArchetype: ConnectionArchetype | null
  /**
   * User-reported setup context from the wizard — PC type, primary VR activity,
   * main complaint. Rules read this to bias recommendations toward the issues
   * the user actually cares about. Null when setup hasn't been completed yet.
   */
  userSetup: UserScanSetup | null
  /**
   * Full headset profile loaded from headsets/profiles/. Rules read this to
   * surface headset-specific knownIssues and optimizationTips, and to compare
   * detected hardware against requirements.minGPU / minCPU / minRAM.
   *
   * `null` when no setup has been completed yet, or when the scan was kicked
   * off without a headsetProfileId. Rules MUST null-check before reading.
   *
   * The field is intentionally typed as `unknown` here to avoid a circular
   * import between scanner types and headset types — consumers cast to
   * HeadsetProfile from '../headsets/types' when they use it.
   */
  headsetProfile: unknown
  /**
   * Set by the engine after process enumeration.
   * 'under-load' when any VR process (vrserver, VRChat, OVR, Virtual Desktop…) is active.
   */
  scanCondition: ScanCondition

  // Scan module outputs (each populated by its respective module)
  cpu: CpuData | null
  gpu: GpuData | null
  ram: RamData | null
  storage: StorageData | null
  network: NetworkData | null
  vrRuntime: VrRuntimeData | null
  processes: ProcessesData | null
  osConfig: OsConfigData | null
  speedTest: SpeedTestData | null
  eventLog: EventLogData | null
  headsetConnection: HeadsetConnectionData | null
  display: DisplayData | null
  audio: AudioData | null
  usb: UsbData | null
  compat: VrCompatibilityData | null

  // Module-level errors for partial scans
  errors: Record<string, string>
}


export interface ScanProgress {
  module: string
  moduleLabel: string
  percent: number
  totalModules: number
  completedModules: number
}


export type ScanModuleId =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'network'
  | 'vr-runtime'
  | 'processes'
  | 'os-config'
  | 'power-plan'
  | 'steamvr'
  | 'wireless-vr'
  | 'vcache'
  | 'dpc-latency'
  | 'gpu-affinity'
  | 'kernel-pool'
  | 'timer-resolution'
  | 'handle-leak'
  | 'services'
  | 'startup'
  | 'shader-cache'
  | 'temp-files'
  | 'audio'
  | 'usb'
  | 'display'

export interface ScanModule {
  id: ScanModuleId
  label: string
  /** Which ScanData key this module populates */
  targetKey: keyof Omit<ScanData, 'timestamp' | 'scanDurationMs' | 'headsetProfileId' | 'connectionArchetype' | 'scanCondition' | 'errors'>
  /** Run this module */
  run: () => Promise<ScanModuleResult>
}
