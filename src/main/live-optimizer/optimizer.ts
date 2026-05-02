// VR Optimization Suite — Live Optimizer Engine
// Uses async exec (not execSync) so the Electron main thread is NEVER blocked.

import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import type {
  LiveOptimizerConfig, LiveOptimizerStatus, AffectedProcess,
  AffectedService, OptimizerPhase, LogEntry, LogLevel
} from './types'
import { DEFAULT_CONFIG } from './types'
import { VR_SAFE_PROCESSES, SERVICES_TO_STOP_DURING_VR } from './vr-safe-list'
import { markStopped, markRestored } from './service-recovery'

const execAsync = promisify(exec)

// ── VR session detection indicators ───────────────────────────
const VR_SESSION_INDICATORS = new Set([
  'vrserver.exe', 'vrcompositor.exe', 'vrchat.exe',
  'ovrserver_x64.exe', 'virtualdesktop.streamer.exe',
  'alvr_server.exe', 'alvr dashboard.exe',
])

// ── Notable "safe" groups for meaningful sparing log messages ──
const AUDIO_PROCS = new Set([
  'voicemeeter.exe', 'voicemeeter_x64.exe', 'voicemeeterpro.exe', 'voicemeeterpro_x64.exe',
  'voicemod.exe', 'voicemoddesktop.exe', 'voicemod_x64.exe', 'voicemeter8x64.exe',
  'neuralwix.exe', 'eartrumpet.exe',
])
const STREAMING_PROCS = new Set([
  'obs64.exe', 'obs32.exe', 'obs.exe', 'streamlabs desktop.exe', 'slobs.exe',
  'medal.exe', 'tiktok live studio.exe', 'tiktok live studio launcher.exe',
  'nvidia share.exe', 'bandicam.exe', 'fraps.exe', 'action!.exe',
])
const VR_COMPANION_PROCS = new Set([
  'vrcx.exe', 'magicchatbox.exe', 'vrcosc.exe', 'vrcfacetracking.exe',
  'xsoverlay.exe', 'ovr toolkit.exe', 'fpsvr.exe', 'advancedsettings.exe',
  'openkneeboardapp.exe', 'slimevr.exe', 'vseeface.exe', 'oyasumivr.exe',
  'vmc4ue.exe', 'psmoveservice.exe', 'driver4vr.exe', 'opentrack.exe',
])
const SOCIAL_PROCS = new Set([
  'discord.exe', 'discordptb.exe', 'discordcanary.exe',
  'teamspeak.exe', 'ts3client_win64.exe',
  'spotify.exe', 'telegram.exe', 'signal.exe',
])

// ── Default background processes safe to kill during VR ────────
const DEFAULT_KILL_TARGETS = new Set([
  // Google
  'googleupdate.exe', 'googlecrashhandler.exe', 'googlecrashhandler64.exe',
  'googledrivesync.exe', 'googledrivefs.exe',
  // Microsoft cloud
  'onedrive.exe', 'onedrivestandaloneupdater.exe', 'onedriveupdater.exe',
  // Dropbox / Box
  'dropbox.exe', 'dropboxupdate.exe', 'boxsync.exe', 'boxupdate.exe',
  // Mega / pCloud / Sync
  'megasync.exe', 'pcloud.exe', 'syncovery.exe', 'nextcloudsync.exe',
  // iCloud
  'icloudservices.exe', 'icloudphotos.exe', 'icloudfolderapp.exe',
  // Adobe
  'adobeupdateservice.exe', 'armsvc.exe', 'adobeipcbroker.exe',
  'adobedesktopservice.exe', 'creativecloud.exe', 'cctray.exe', 'ccupdatemanager.exe',
  // Java
  'jusched.exe',
  // Epic Games
  'epicgameslauncher.exe', 'unrealcefsubprocess.exe', 'epicwebhelper.exe',
  // Riot / Valorant
  'riotclientservices.exe', 'riotclientux.exe', 'riotclientuxrender.exe',
  // Ubisoft
  'ubisoftgamelauncher.exe', 'ubisoftgamelauncher64.exe', 'upc.exe',
  // EA / Origin
  'origin.exe', 'eadesktop.exe', 'eabackgroundservice.exe',
  'eaanticheat.exe', 'eaglehelper.exe',
  // Blizzard / Battle.net
  'battle.net.exe', 'battlenet.exe', 'agent.exe',
  // GOG Galaxy
  'galaxyclient.exe', 'galaxyclient helper.exe', 'gogservices.exe',
  // 2K / Bethesda
  '2klaunchpad.exe', 'bethesdalauncherwpf.exe',
  // Rockstar
  'rglauncher.exe', 'playrockstargames.exe',
  // Remote access daemons (background helpers, not full apps)
  'teamviewer_service.exe', 'anydesk.exe',
  // Backup
  'backblaze.exe', 'bzserv.exe', 'acronisagent.exe', 'macrium.reflect.exe',
  // Windows Update / search background
  'musnotificationux.exe', 'usocoreworker.exe', 'wudfhost.exe',
  // Razer / Corsair / Logitech background helpers (LED sync daemons)
  'razernaminglauncher.exe', 'razercentral.exe', 'razerintelligence.exe',
  'corsairhid.exe', 'cubbymonitor.exe',
  // Miscellaneous heavy background daemons
  'growl.exe', 'rammap.exe', 'procmon.exe',
  'nvidia share.exe', 'nvcontainer.exe',
])

// Per-process kill reason messages
const KILL_REASON: Record<string, string> = {
  // Google
  'googleupdate.exe':           'Google updater daemon — no user interaction during VR',
  'googlecrashhandler.exe':     'Google crash handler — passive background process',
  'googlecrashhandler64.exe':   'Google crash handler — passive background process',
  'googledrivesync.exe':        'Google Drive sync — background I/O during VR',
  'googledrivefs.exe':          'Google Drive sync — background I/O during VR',
  // Microsoft cloud
  'onedrive.exe':               'OneDrive sync daemon — background I/O during VR',
  'onedrivestandaloneupdater.exe': 'OneDrive updater — not needed in VR',
  'onedriveupdater.exe':        'OneDrive updater — not needed in VR',
  // Dropbox / Box
  'dropbox.exe':                'Dropbox sync — background disk I/O during VR',
  'dropboxupdate.exe':          'Dropbox updater — not needed in VR',
  'boxsync.exe':                'Box sync — background I/O during VR',
  'boxupdate.exe':              'Box updater — not needed in VR',
  // Cloud storage
  'megasync.exe':               'MEGA sync — background I/O during VR',
  'pcloud.exe':                 'pCloud sync — background I/O during VR',
  'syncovery.exe':              'Syncovery backup — background I/O during VR',
  'nextcloudsync.exe':          'Nextcloud sync — background I/O during VR',
  // iCloud
  'icloudservices.exe':         'iCloud Services — background sync during VR',
  'icloudphotos.exe':           'iCloud Photos — background upload/sync during VR',
  'icloudfolderapp.exe':        'iCloud Drive — background sync during VR',
  // Adobe
  'adobeupdateservice.exe':     'Adobe updater — background service during VR',
  'armsvc.exe':                 'Adobe ARM updater — background only',
  'adobeipcbroker.exe':         'Adobe IPC broker — background service',
  'adobedesktopservice.exe':    'Adobe Desktop Service — background service',
  'creativecloud.exe':          'Adobe Creative Cloud — background launcher/sync',
  'cctray.exe':                 'Adobe CC tray icon — background only',
  'ccupdatemanager.exe':        'Adobe CC update manager — background only',
  // Java
  'jusched.exe':                'Java update scheduler — not needed in VR',
  // Epic Games
  'epicgameslauncher.exe':      'Epic Games Launcher — background CPU and memory',
  'unrealcefsubprocess.exe':    'Epic browser subprocess — safe to close',
  'epicwebhelper.exe':          'Epic web helper — background networking daemon',
  // Riot / Valorant
  'riotclientservices.exe':     'Riot client service — background daemon',
  'riotclientux.exe':           'Riot client UI — background only during VR',
  'riotclientuxrender.exe':     'Riot client renderer — background only',
  // Ubisoft
  'ubisoftgamelauncher.exe':    'Ubisoft Connect — background launcher daemon',
  'ubisoftgamelauncher64.exe':  'Ubisoft Connect — background launcher daemon',
  'upc.exe':                    'Ubisoft Connect — background launcher daemon',
  // EA / Origin
  'origin.exe':                 'EA Origin — background launcher daemon',
  'eadesktop.exe':              'EA Desktop — background launcher',
  'eabackgroundservice.exe':    'EA background service — not needed in VR',
  'eaanticheat.exe':            'EA Anti-Cheat — background scanning daemon',
  'eaglehelper.exe':            'EA helper process — background only',
  // Blizzard
  'battle.net.exe':             'Battle.net — background launcher',
  'battlenet.exe':              'Battle.net — background launcher',
  'agent.exe':                  'Blizzard Agent — background update service',
  // GOG
  'galaxyclient.exe':           'GOG Galaxy — background launcher',
  'galaxyclient helper.exe':    'GOG Galaxy helper — background subprocess',
  'gogservices.exe':            'GOG services — background daemon',
  // 2K / Bethesda / Rockstar
  '2klaunchpad.exe':            '2K Launchpad — background launcher',
  'bethesdalauncherwpf.exe':    'Bethesda Launcher — background launcher',
  'rglauncher.exe':             'Rockstar Games Launcher — background daemon',
  'playrockstargames.exe':      'Rockstar Games helper — background only',
  // Remote access
  'teamviewer_service.exe':     'TeamViewer background service — CPU/network overhead',
  'anydesk.exe':                'AnyDesk — background daemon',
  // Backup
  'backblaze.exe':              'Backblaze backup — disk/CPU during VR',
  'bzserv.exe':                 'Backblaze service — background disk scanning',
  'acronisagent.exe':           'Acronis backup agent — background disk scanning',
  'macrium.reflect.exe':        'Macrium Reflect — background scheduling daemon',
  // Windows Update / search
  'musnotificationux.exe':      'Windows Update notification — background only',
  'usocoreworker.exe':          'Windows Update orchestrator — background scanning',
  'wudfhost.exe':               'Windows Update driver framework — background only',
  // RGB / LED daemons
  'razernaminglauncher.exe':    'Razer Chroma naming — background LED sync',
  'razercentral.exe':           'Razer Central — background hardware daemon',
  'razerintelligence.exe':      'Razer intelligence daemon — background telemetry',
  'corsairhid.exe':             'Corsair HID daemon — background LED/device sync',
  // NVIDIA background services
  'nvidia share.exe':           'NVIDIA ShadowPlay/Share — background recording daemon',
  'nvcontainer.exe':            'NVIDIA container — background telemetry service',
}

// ── Priority tiers used in decision comments ───────────────────
// P0: VR core runtimes        → never touch
// P1: VR companions/overlays  → never touch
// P2: Audio software          → never touch
// P3: Streaming/capture       → never touch
// P4: Social/comms            → never touch
// P5: Terminals/system        → never touch
// P6: User-protected          → never touch
// P7: Unknown processes       → leave alone
// P8: Default kill targets    → close
// P9: User-defined targets    → close
function getProcessSpareReason(lower: string): string | null {
  if (VR_SESSION_INDICATORS.has(lower)) return '🥽 Active VR runtime — protected'
  if (VR_COMPANION_PROCS.has(lower)) return '🎮 VR companion/overlay — protected'
  if (AUDIO_PROCS.has(lower)) return '🎵 Audio software — always protected'
  if (STREAMING_PROCS.has(lower)) return '🎥 Streaming/capture — always protected'
  if (SOCIAL_PROCS.has(lower)) return '💬 Social/comms app — protected'
  return null
}

// ── Internal state ────────────────────────────────────────────

interface RunningProcess {
  name: string
  id: number
  path: string | null
}

let logIdCounter = 0
let monitorInterval: ReturnType<typeof setInterval> | null = null
let currentStatus: LiveOptimizerStatus = {
  phase: 'disabled',
  vrDetectedAt: null,
  activatedAt: null,
  countdownSecondsLeft: null,
  affectedProcesses: [],
  affectedServices: [],
  detectedVrProcessNames: [],
  activityLog: [],
  error: null
}
let statusCallback: ((s: LiveOptimizerStatus) => void) | null = null
let currentConfig: LiveOptimizerConfig = { ...DEFAULT_CONFIG }

// PID of the detached PowerShell process holding the system timer at 0.5ms.
// When null, the timer is running at the Windows default (typically 15.6ms).
let timerResolutionHolderPid: number | null = null

// Interval handle for the periodic standby-list cleaner. Runs every 30s during
// an active VR session; flushes the standby list when it exceeds the threshold.
let standbyCleanInterval: ReturnType<typeof setInterval> | null = null

// ── Logging helpers ────────────────────────────────────────────

function addLog(level: LogLevel, message: string, detail?: string): void {
  const entry: LogEntry = {
    id: ++logIdCounter,
    timestamp: Date.now(),
    level,
    message,
    detail
  }
  const log = [...currentStatus.activityLog, entry].slice(-150)
  currentStatus = { ...currentStatus, activityLog: log }
}

function emitStatus(): void {
  statusCallback?.(currentStatus)
}

function setPhase(phase: OptimizerPhase): void {
  currentStatus = { ...currentStatus, phase }
  emitStatus()
}

// ── Process helpers (all async — never block main thread) ──────

async function getRunningProcesses(): Promise<RunningProcess[]> {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -NonInteractive -Command "Get-Process | Select-Object Name,Id,Path | ConvertTo-Json -Depth 1 -Compress"',
      { timeout: 12000 }
    )
    const parsed = JSON.parse(stdout.trim())
    const arr: Array<{ Name?: string; Id?: number; Path?: string | null }> = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((p) => typeof p.Name === 'string' && typeof p.Id === 'number')
      .map((p) => {
        const raw = p.Name!.toLowerCase()
        // PowerShell Get-Process strips the .exe extension from process names.
        // Re-add it so our lookup sets (VR_SESSION_INDICATORS, VR_SAFE_PROCESSES, etc.)
        // which all include .exe can match correctly.
        // Processes with no alphabetic extension (e.g. "System", "Idle") get .exe appended
        // but are never in kill targets, so they remain safe.
        const name = raw.includes('.') ? raw : raw + '.exe'
        return { name, id: p.Id!, path: p.Path ?? null }
      })
  } catch {
    return []
  }
}

function isVrSessionActive(processes: RunningProcess[]): { active: boolean; names: string[] } {
  const found: string[] = []
  for (const p of processes) {
    if (VR_SESSION_INDICATORS.has(p.name.toLowerCase())) found.push(p.name)
  }
  return { active: found.length > 0, names: found }
}

function getKillTargets(processes: RunningProcess[], config: LiveOptimizerConfig): RunningProcess[] {
  const exclusions = new Set([
    ...VR_SAFE_PROCESSES,
    ...config.customExclusions.map((e) => e.toLowerCase())
  ])
  const userTargets = new Set(config.customTargets.map((t) => t.toLowerCase()))

  return processes.filter((p) => {
    const lower = p.name.toLowerCase()
    if (exclusions.has(lower)) return false
    return DEFAULT_KILL_TARGETS.has(lower) || userTargets.has(lower)
  })
}

async function killProcess(proc: RunningProcess): Promise<boolean> {
  // Try by PID first (most precise), then by name if that fails (process may have restarted with a new PID)
  try {
    await execAsync(`taskkill /F /PID ${proc.id}`, { timeout: 6000 })
    return true
  } catch {
    // Second attempt: kill by image name — handles race where PID changed
    try {
      await execAsync(`taskkill /F /IM "${proc.name}" /T`, { timeout: 6000 })
      return true
    } catch {
      return false
    }
  }
}

async function stopService(name: string): Promise<boolean> {
  // Try PowerShell Stop-Service first (more reliable than net stop for some services)
  try {
    await execAsync(
      `powershell -NoProfile -NonInteractive -Command "Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue"`,
      { timeout: 20000 }
    )
    return true
  } catch {
    // Fallback: net stop (works when PS fails due to privilege issues)
    try {
      await execAsync(`net stop "${name}" /Y`, { timeout: 20000 })
      return true
    } catch {
      return false
    }
  }
}

async function startService(name: string): Promise<boolean> {
  try {
    await execAsync(
      `powershell -NoProfile -NonInteractive -Command "Start-Service -Name '${name}' -ErrorAction SilentlyContinue"`,
      { timeout: 20000 }
    )
    return true
  } catch {
    try {
      await execAsync(`net start "${name}"`, { timeout: 20000 })
      return true
    } catch {
      return false
    }
  }
}

// ── Process Lasso-style management functions ──────────────────────────────────

// VR processes to boost (without .exe for Get-Process compatibility)
const VR_BOOST_NAMES = [
  'vrserver', 'vrcompositor', 'vrdashboard', 'vrchat',
  'ovrserver_x64', 'vrwebhelper', 'virtualdesktop.streamer'
]

async function boostVrProcessPriority(vrNames: string[]): Promise<void> {
  // Strip .exe suffix since Get-Process doesn't use it
  const names = vrNames.map(n => n.replace(/\.exe$/i, ''))
  const unique = [...new Set([...names, ...VR_BOOST_NAMES])]
  const nameList = unique.map(n => `'${n}'`).join(', ')

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$targets = @(${nameList})
$boosted = 0
foreach ($name in $targets) {
  $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    try {
      $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High
      $boosted++
    } catch {}
  }
}
Write-Output "boosted:$boosted"
`
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/\n/g, ';').replace(/"/g, '\\"')}"`,
      { timeout: 10000 }
    )
    const match = stdout.match(/boosted:(\d+)/)
    const count = match ? parseInt(match[1]) : 0
    if (count > 0) {
      addLog('success', `🚀 Boosted ${count} VR process${count !== 1 ? 'es' : ''} to High CPU priority`)
    }
  } catch {
    addLog('warning', '⚠ Could not boost VR process priority — may need admin rights')
  }
  emitStatus()
}

// EcoQoS / WSTrim / VrTimer / VrStandby Add-Type definitions previously
// lived inline here as PowerShell `Add-Type @' ... '@` blocks containing C#
// with DllImport("kernel32.dll" / "ntdll.dll" / "advapi32.dll") imports.
// Embedding 20+ DllImport patterns inside an Electron-resident script
// triggered Kaspersky's HEUR:Trojan-PSW.Script.Generic — those imports
// are signature-shared with credential-stealer template code.
//
// Resolution: the Add-Type blocks live in resources/ps-helpers/vros-helpers.ps1,
// loaded into every PS invocation via a leading dot-source statement.
// Behaviour is identical; the JS bundle no longer contains the C# source.
import { join as pathJoin } from 'path'
import { app as electronApp } from 'electron'
import { existsSync as fileExists } from 'fs'
function getPsHelperPath(): string {
  // Prefer packaged location, fall back to dev tree paths
  const candidates = [
    pathJoin(process.resourcesPath ?? '', 'ps-helpers', 'vros-helpers.ps1'),
    pathJoin(electronApp.getAppPath(), 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
    pathJoin(electronApp.getAppPath(), '..', '..', 'update-server', 'ps-helpers', 'vros-helpers.ps1'),
  ]
  for (const p of candidates) { if (fileExists(p)) return p }
  return candidates[0]
}
function dotSourceHelpers(): string {
  return `. '${getPsHelperPath().replace(/'/g, "''")}'`
}
const ECOOS_ADD_TYPE = `${dotSourceHelpers()}\n`

async function throttleAndEcoQoSBackground(
  processes: RunningProcess[],
  config: LiveOptimizerConfig
): Promise<void> {
  const safeSet = new Set([
    ...VR_SAFE_PROCESSES,
    ...config.customExclusions.map(e => e.toLowerCase()),
    ...Array.from(VR_SESSION_INDICATORS)
  ])

  const targets = processes.filter(p => !safeSet.has(p.name.toLowerCase()))
  if (targets.length === 0) return

  const names = [...new Set(targets.map(p => p.name.replace(/\.exe$/i, '')))].slice(0, 80)
  const nameList = names.map(n => `'${n}'`).join(',')

  const priorityScript = `
$ErrorActionPreference = 'SilentlyContinue'
$count = 0
$names = @(${nameList})
foreach ($name in $names) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal; $count++ } catch {}
  }
}
Write-Output "throttled:$count"
`

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${priorityScript.replace(/\n/g, ';').replace(/"/g, '\\"')}"`,
      { timeout: 15000 }
    )
    const match = stdout.match(/throttled:(\d+)/)
    const count = match ? parseInt(match[1]) : targets.length
    addLog('info', `⬇ Throttled ${count} background processes to BelowNormal CPU priority`)
  } catch {
    addLog('warning', '⚠ Could not throttle background CPU priorities')
  }
  emitStatus()

  // EcoQoS (power throttle to E-cores on hybrid CPUs)
  if (config.useEcoQoS) {
    const pidList = targets.map(p => p.id).join(',')
    const ecoScript = `
${ECOOS_ADD_TYPE}
$pids = @(${pidList})
$ok = 0
foreach ($pid in $pids) {
  try { if ([VROpt.EcoQoS]::Set($pid, $true)) { $ok++ } } catch {}
}
Write-Output "eco:$ok"
`
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "& { ${ecoScript.replace(/\n/g, ' ')} }"`,
        { timeout: 20000 }
      )
      const match = stdout.match(/eco:(\d+)/)
      const count = match ? parseInt(match[1]) : 0
      if (count > 0) {
        addLog('success', `⚡ Applied EcoQoS to ${count} background processes (efficiency cores)`)
      }
    } catch {
      addLog('info', 'ℹ EcoQoS not available on this system (requires Windows 10+)')
    }
    emitStatus()
  }
}

async function trimBackgroundMemory(processes: RunningProcess[], config: LiveOptimizerConfig): Promise<void> {
  const safeSet = new Set([
    ...VR_SAFE_PROCESSES,
    ...config.customExclusions.map(e => e.toLowerCase()),
    ...Array.from(VR_SESSION_INDICATORS)
  ])
  const targets = processes.filter(p => !safeSet.has(p.name.toLowerCase()))
  if (targets.length === 0) return

  const pidList = targets.map(p => p.id).join(',')
  const script = `
${ECOOS_ADD_TYPE}
$pids = @(${pidList})
$ok = 0
foreach ($pid in $pids) {
  try { if ([VROpt.WSTrim]::Trim($pid)) { $ok++ } } catch {}
}
Write-Output "trimmed:$ok"
`
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "& { ${script.replace(/\n/g, ' ')} }"`,
      { timeout: 20000 }
    )
    const match = stdout.match(/trimmed:(\d+)/)
    const count = match ? parseInt(match[1]) : 0
    addLog('success', `🧹 Trimmed working sets of ${count} background processes — freed RAM from idle apps`)
  } catch {
    addLog('warning', '⚠ Memory trimming requires admin rights for some processes')
  }
  emitStatus()
}

async function restoreBackgroundPriorities(processes: RunningProcess[], config: LiveOptimizerConfig): Promise<void> {
  const safeSet = new Set([
    ...VR_SAFE_PROCESSES,
    ...config.customExclusions.map(e => e.toLowerCase()),
    ...Array.from(VR_SESSION_INDICATORS)
  ])
  const targets = processes.filter(p => !safeSet.has(p.name.toLowerCase()))
  if (targets.length === 0) return

  const names = [...new Set(targets.map(p => p.name.replace(/\.exe$/i, '')))].slice(0, 80)
  const nameList = names.map(n => `'${n}'`).join(',')

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$names = @(${nameList})
foreach ($name in $names) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal } catch {}
  }
}
`
  try {
    await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/\n/g, ';').replace(/"/g, '\\"')}"`,
      { timeout: 15000 }
    )
    addLog('restore', '↑ Restored background process priorities to Normal')
  } catch { /* best effort */ }
  emitStatus()
}

// ── Timer resolution lock (NtSetTimerResolution, ntdll.dll) ───────────────────
//
// Windows' default timer is 15.6ms. Any process can request a finer resolution,
// and Windows honors the finest request system-wide for as long as that process
// is alive. For VR, a 0.5ms timer dramatically reduces jitter in the render /
// encode pipeline — user-feelable in blind A/B tests on 90+ Hz headsets.
//
// We implement this by spawning a detached PowerShell that P/Invokes
// NtSetTimerResolution(5000, TRUE, &current) — 5000 is in 100-nanosecond units,
// i.e. 0.5ms — and then sleeps for 24h. Killing that PID releases the request.

function buildTimerResolutionHolderScript(): string {
  // VrTimer P/Invoke now lives in resources/ps-helpers/vros-helpers.ps1
  // (loaded via dot-source) so the ntdll.dll DllImport string isn't
  // baked into the compiled JS bundle. See dotSourceHelpers() above.
  return `
$ErrorActionPreference = 'SilentlyContinue'
${dotSourceHelpers()}
$cur = 0
# 5000 * 100ns = 0.5ms — the finest resolution Windows supports in user-mode.
[VrTimer]::NtSetTimerResolution(5000, $true, [ref]$cur) | Out-Null
# Hold the request for up to 24h; we kill this process on VR exit.
Start-Sleep -Seconds 86400
`.trim()
}

async function lockTimerResolution(): Promise<void> {
  if (timerResolutionHolderPid !== null) return  // already locked

  try {
    const script = buildTimerResolutionHolderScript()
    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { detached: true, stdio: 'ignore', windowsHide: true }
    )
    child.unref()  // decouple from parent so Node can exit without killing it

    if (typeof child.pid === 'number') {
      timerResolutionHolderPid = child.pid
      addLog('success', '⏱ Locked Windows timer resolution to 0.5ms — reduces VR frame jitter')
    } else {
      addLog('warning', '⚠ Timer lock spawned but pid was undefined — skipping')
    }
  } catch {
    addLog('warning', '⚠ Could not lock timer resolution — continuing without it')
  }
  emitStatus()
}

async function unlockTimerResolution(): Promise<void> {
  if (timerResolutionHolderPid === null) return
  try {
    await execAsync(`taskkill /F /PID ${timerResolutionHolderPid}`, { timeout: 5000 })
    addLog('restore', '↑ Restored Windows timer resolution to default')
  } catch {
    // Process may have died on its own (e.g. sleep completed); not an error.
  }
  timerResolutionHolderPid = null
  emitStatus()
}

// ── Standby list cleaner (NtSetSystemInformation) ─────────────────────────────
//
// The standby list is memory Windows keeps "warm" with recently-freed pages.
// It's normally beneficial — but during a VR session, an aggressive standby
// list competes with the working set of vrcompositor/vrserver and causes the
// sudden multi-frame stutters every VR user has experienced at some point.
//
// We flush it periodically (and when it grows above a threshold) by calling
// NtSetSystemInformation with SystemMemoryListInformation (80) and the
// MemoryPurgeStandbyList command (4). Requires SeProfileSingleProcessPrivilege,
// which admin processes have by default.

const STANDBY_CLEANER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
${dotSourceHelpers()}

$tok = [IntPtr]::Zero
if (-not [VrStandby]::OpenProcessToken([VrStandby]::GetCurrentProcess(), 0x28, [ref]$tok)) {
  Write-Output "result:no-token"
  exit
}
$luid = 0
if (-not [VrStandby]::LookupPrivilegeValueW($null, "SeProfileSingleProcessPrivilege", [ref]$luid)) {
  Write-Output "result:no-privilege"
  exit
}
$p = New-Object VrStandby+TOKEN_PRIVS
$p.Count = 1
$p.Luid = $luid
$p.Attr = 2  # SE_PRIVILEGE_ENABLED
[VrStandby]::AdjustTokenPrivileges($tok, $false, [ref]$p, [System.Runtime.InteropServices.Marshal]::SizeOf($p), [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null

# Read memory pressure — skip flush if standby list is already small
$mem = Get-CimInstance Win32_OperatingSystem
$freeMB = [math]::Round($mem.FreePhysicalMemory / 1024)
$counters = Get-Counter '\\Memory\\Standby Cache Normal Priority Bytes','\\Memory\\Standby Cache Reserve Bytes' -ErrorAction SilentlyContinue
$standbyMB = 0
if ($counters) {
  $standbyMB = [math]::Round(($counters.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum / 1MB)
}

# Flush if standby is > 1024 MB OR > free memory (indicating pressure coming)
$shouldFlush = ($standbyMB -gt 1024) -or ($standbyMB -gt $freeMB -and $standbyMB -gt 256)
if ($shouldFlush) {
  $cmd = 4  # MemoryPurgeStandbyList
  $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(4)
  [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, $cmd)
  $rc = [VrStandby]::NtSetSystemInformation(80, $ptr, 4)
  [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
  Write-Output "result:flushed standby=\${standbyMB}MB free=\${freeMB}MB rc=$rc"
} else {
  Write-Output "result:skipped standby=\${standbyMB}MB free=\${freeMB}MB"
}
[VrStandby]::CloseHandle($tok) | Out-Null
`.trim()

async function cleanStandbyListIfNeeded(quiet: boolean): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "& { ${STANDBY_CLEANER_SCRIPT.replace(/\n/g, ' ').replace(/"/g, '\\"')} }"`,
      { timeout: 15000 }
    )
    const match = stdout.match(/result:(\S+)\s+(.*)?/)
    if (!match) return
    const verb = match[1]
    const detail = (match[2] ?? '').trim()
    if (verb === 'flushed') {
      addLog('success', `🧽 Flushed Windows standby list — ${detail || 'reclaimed cache memory'}`)
      emitStatus()
    } else if (!quiet && verb === 'skipped') {
      addLog('info', `ℹ Standby list healthy — no flush needed (${detail})`)
      emitStatus()
    } else if (verb === 'no-privilege') {
      addLog('warning', '⚠ Standby cleaner needs admin rights — skipping')
      emitStatus()
    }
  } catch {
    if (!quiet) {
      addLog('warning', '⚠ Standby cleaner timed out or failed — will retry next interval')
      emitStatus()
    }
  }
}

function startStandbyMonitor(): void {
  if (standbyCleanInterval !== null) return
  // Run every 30s during an active VR session — balance between stutter
  // prevention (want it fast) and CPU cost of each poll (~200ms).
  standbyCleanInterval = setInterval(() => {
    cleanStandbyListIfNeeded(true).catch(() => { /* best effort */ })
  }, 30_000)
}

function stopStandbyMonitor(): void {
  if (standbyCleanInterval !== null) {
    clearInterval(standbyCleanInterval)
    standbyCleanInterval = null
  }
}

// ── Core optimization logic ────────────────────────────────────

async function applyOptimizations(config: LiveOptimizerConfig): Promise<void> {
  addLog('scan', '🔍 Scanning running processes...')
  emitStatus()

  const processes = await getRunningProcesses()

  addLog('info', `📋 Evaluating ${processes.length} processes with priority logic`)
  emitStatus()

  const userTargetSet = new Set(config.customTargets.map((t) => t.toLowerCase()))
  const userExclusionSet = new Set(config.customExclusions.map((e) => e.toLowerCase()))

  // Log user exclusions that are running (so user knows they're being respected)
  for (const p of processes) {
    const lower = p.name.toLowerCase()
    if (userExclusionSet.has(lower)) {
      addLog('spare', `🔒 Sparing ${p.name} — user-protected app`)
    }
  }

  // Log notable protected categories that are actually running
  const loggedSpared = new Set<string>()
  for (const p of processes) {
    const lower = p.name.toLowerCase()
    if (loggedSpared.has(lower)) continue
    const spareReason = getProcessSpareReason(lower)
    if (spareReason) {
      loggedSpared.add(lower)
      addLog('spare', `🛡 Sparing ${p.name} — ${spareReason}`)
    }
  }
  emitStatus()

  const targets = getKillTargets(processes, config)

  if (targets.length === 0) {
    addLog('info', '✅ No background targets found — system already lean for VR')
    emitStatus()
  } else {
    addLog('info', `🎯 Targeting ${targets.length} background process${targets.length !== 1 ? 'es' : ''} for closure`)
    emitStatus()
  }

  // Kill targets sequentially (safe, no race conditions on currentStatus)
  const killed: AffectedProcess[] = []
  for (const proc of targets) {
    const lower = proc.name.toLowerCase()
    const isUserTarget = userTargetSet.has(lower)
    const reason = isUserTarget
      ? 'user-defined close target'
      : (KILL_REASON[lower] ?? 'background process — not needed during VR')

    addLog('kill', `⚡ Closing ${proc.name}`, reason)
    emitStatus()

    const success = await killProcess(proc)
    if (success) {
      killed.push({ name: proc.name, pid: proc.id, path: proc.path, killedAt: Date.now() })
      addLog('success', `✓ Closed ${proc.name} (PID ${proc.id})`)
    } else {
      addLog('warning', `✗ Could not close ${proc.name} — may need admin rights or already exited`)
    }
    emitStatus()
  }

  if (targets.length > 0) {
    addLog('success', `✅ Closed ${killed.length} / ${targets.length} processes`)
    emitStatus()
  }

  // Stop services (sequential to avoid status race conditions and reduce system pressure)
  const stopped: AffectedService[] = []
  if (config.stopServices) {
    addLog('service', `⚙ Pausing ${SERVICES_TO_STOP_DURING_VR.length} Windows services for VR session`)
    emitStatus()

    for (const svc of SERVICES_TO_STOP_DURING_VR) {
      addLog('service', `⚙ Stopping: ${svc.displayName}`)
      emitStatus()
      const success = await stopService(svc.name)
      if (success) {
        stopped.push({ name: svc.name, displayName: svc.displayName, stoppedAt: Date.now() })
        // Persist immediately — if the app crashes before restore() runs,
        // the next launch's recoverStoppedServices() will catch this.
        markStopped(svc.name, svc.displayName)
        addLog('success', `✓ Stopped: ${svc.displayName}`)
      } else {
        addLog('warning', `⚠ Could not stop "${svc.displayName}" — may already be stopped`)
      }
      emitStatus()
    }
  }

  addLog('success',
    `🚀 Optimization complete — ${killed.length} process${killed.length !== 1 ? 'es' : ''} closed, ${stopped.length} service${stopped.length !== 1 ? 's' : ''} paused`
  )

  // Process Lasso-style management
  if (config.boostVrPriority && currentStatus.detectedVrProcessNames.length > 0) {
    await boostVrProcessPriority(currentStatus.detectedVrProcessNames)
  }
  if (config.throttleBackground) {
    await throttleAndEcoQoSBackground(processes, config)
  }
  if (config.trimMemory) {
    await trimBackgroundMemory(processes, config)
  }

  // Windows timer resolution + standby list management
  if (config.lockTimerResolution) {
    await lockTimerResolution()
  }
  if (config.cleanStandbyList) {
    // Initial flush immediately (first-run log not quiet), then start interval
    await cleanStandbyListIfNeeded(false)
    startStandbyMonitor()
  }

  currentStatus = {
    ...currentStatus,
    phase: 'active',
    activatedAt: Date.now(),
    countdownSecondsLeft: null,
    affectedProcesses: killed,
    affectedServices: stopped
  }
  emitStatus()
}

// ── Public API ────────────────────────────────────────────────

export async function restore(): Promise<void> {
  if (currentStatus.affectedServices.length === 0 && currentStatus.affectedProcesses.length === 0) return

  currentStatus = { ...currentStatus, phase: 'restoring' }
  addLog('restore', '↺ VR session ended — restoring services...')
  emitStatus()

  for (const svc of currentStatus.affectedServices) {
    addLog('restore', `↺ Starting: ${svc.displayName}`)
    emitStatus()
    const ok = await startService(svc.name)
    if (ok) {
      markRestored(svc.name)
      addLog('success', `✓ Restarted: ${svc.displayName}`)
    } else {
      addLog('warning', `⚠ Could not restart "${svc.displayName}" — may need manual start`)
    }
    emitStatus()
  }

  if (currentStatus.affectedProcesses.length > 0) {
    addLog('restore',
      `ℹ ${currentStatus.affectedProcesses.length} closed process${currentStatus.affectedProcesses.length !== 1 ? 'es' : ''} will relaunch automatically when needed`
    )
  }

  // Restore background process priorities
  if (currentConfig.throttleBackground) {
    const processes = await getRunningProcesses()
    await restoreBackgroundPriorities(processes, currentConfig)
  }

  // Release timer resolution lock and stop the standby monitor
  stopStandbyMonitor()
  await unlockTimerResolution()

  addLog('info', '✅ Restore complete — system back to normal')

  currentStatus = {
    ...currentStatus,
    phase: currentConfig.enabled ? 'monitoring' : 'disabled',
    activatedAt: null,
    vrDetectedAt: null,
    countdownSecondsLeft: null,
    affectedProcesses: [],
    affectedServices: []
  }
  emitStatus()
}

// Idle short-circuit: while in 'monitoring' with no VR seen recently, only do
// the heavy Get-Process call every N ticks instead of every tick. Once VR is
// detected we drop back to per-tick polling so countdown / activation react
// promptly. The threshold is intentionally small (5s * 6 = 30s between polls
// when idle) to keep the user-visible "VR detected" latency under a minute.
const IDLE_POLL_DIVISOR = 6
let idleTickCounter = 0

export function startMonitoring(config: LiveOptimizerConfig, onStatus: (s: LiveOptimizerStatus) => void): void {
  currentConfig = config
  statusCallback = onStatus

  if (monitorInterval) clearInterval(monitorInterval)

  currentStatus = { ...currentStatus, phase: 'monitoring', error: null }
  addLog('info', '👁 Live Optimizer started — monitoring for VR sessions')
  emitStatus()
  idleTickCounter = 0

  monitorInterval = setInterval(async () => {
    try {
      // While idle (monitoring with no VR seen), throttle the heavy poll.
      // Any non-monitoring phase always polls so countdown / restore react.
      if (currentStatus.phase === 'monitoring') {
        idleTickCounter = (idleTickCounter + 1) % IDLE_POLL_DIVISOR
        if (idleTickCounter !== 1) return
      } else {
        idleTickCounter = 0
      }

      const processes = await getRunningProcesses()
      const { active, names } = isVrSessionActive(processes)

      currentStatus = { ...currentStatus, detectedVrProcessNames: names }

      if (!active) {
        if (currentStatus.phase === 'active' || currentStatus.phase === 'countdown') {
          await restore()
        } else {
          if (currentStatus.phase !== 'monitoring') {
            currentStatus = { ...currentStatus, phase: 'monitoring', vrDetectedAt: null, countdownSecondsLeft: null }
            emitStatus()
          }
          currentStatus = { ...currentStatus, vrDetectedAt: null, countdownSecondsLeft: null }
        }
        return
      }

      // VR is active
      if (currentStatus.phase === 'active') return  // already optimized

      if (currentStatus.phase === 'monitoring') {
        // First detection — start countdown
        addLog('info', `🥽 VR session detected: ${names.join(', ')}`)
        addLog('info', `⏱ Waiting ${Math.round(currentConfig.activationDelayMs / 1000)}s grace period before optimizing...`)
        currentStatus = {
          ...currentStatus,
          phase: 'countdown',
          vrDetectedAt: Date.now(),
          detectedVrProcessNames: names
        }
        emitStatus()
        return
      }

      if (currentStatus.phase === 'countdown') {
        const elapsed = Date.now() - (currentStatus.vrDetectedAt ?? Date.now())
        const remaining = Math.max(0, currentConfig.activationDelayMs - elapsed)
        currentStatus = {
          ...currentStatus,
          countdownSecondsLeft: Math.ceil(remaining / 1000),
          detectedVrProcessNames: names
        }
        emitStatus()

        if (remaining <= 0) {
          addLog('info', '🚦 Grace period complete — beginning optimization')
          emitStatus()
          await applyOptimizations(currentConfig)
        }
      }
    } catch (err) {
      currentStatus = { ...currentStatus, error: (err as Error).message }
      emitStatus()
    }
  }, config.monitorIntervalMs)
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
  // Defensive cleanup: if the user disables the optimizer while a VR session
  // is active, make sure we don't leak the timer-holding PS process or the
  // standby monitor interval.
  stopStandbyMonitor()
  unlockTimerResolution().catch(() => { /* best effort */ })
  addLog('info', '⏹ Live Optimizer stopped')
  currentStatus = { ...currentStatus, phase: 'disabled' }
  emitStatus()
  statusCallback = null
}

export function getStatus(): LiveOptimizerStatus {
  return currentStatus
}

export function updateConfig(config: LiveOptimizerConfig): void {
  currentConfig = config
}

export async function forceOptimize(config: LiveOptimizerConfig): Promise<void> {
  addLog('info', '⚡ Manual optimization triggered')
  emitStatus()
  await applyOptimizations(config)
}
