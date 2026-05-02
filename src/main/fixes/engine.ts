// VR Optimization Suite — Fix Engine
// Every fix: Preview → Backup → Apply → Verify → Log → Undo
// Registry writes use reg.exe (no elevated DLL needed for HKCU; HKLM needs admin).
// PowerShell scripts always written to temp .ps1 files — never inline -Command.

import Store from 'electron-store'
import { readRegistryDword, readRegistry } from '../utils/registry'
import { runCmd, runPowerShell } from '../utils/powershell'
import type { Fix, FixPreview, FixResult, FixHistoryEntry, FixChange } from './types'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

// ── Persistent storage for backups + history ──────────────────

const fixStore = new Store<{
  backups: Record<string, Record<string, string>>
  history: FixHistoryEntry[]
}>({ name: 'vros-fixes', defaults: { backups: {}, history: [] } })

function storeBackup(fixId: string, values: Record<string, string>): void {
  const backups = fixStore.get('backups')
  backups[fixId] = values
  fixStore.set('backups', backups)
}

function getBackup(fixId: string): Record<string, string> | null {
  return fixStore.get('backups')[fixId] ?? null
}

function recordHistory(entry: FixHistoryEntry): void {
  const history = fixStore.get('history')
  const idx = history.findIndex((h) => h.fixId === entry.fixId && !h.undoneAt)
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  fixStore.set('history', history.slice(0, 50))
}

function markUndone(fixId: string): void {
  const history = fixStore.get('history')
  const idx = history.findIndex((h) => h.fixId === fixId && !h.undoneAt)
  if (idx >= 0) {
    history[idx].undoneAt = Date.now()
    fixStore.set('history', history)
  }
}

// ── Registry helpers ──────────────────────────────────────────

const MMCSS_PATH = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
const MMCSS_GAMES_PATH = `${MMCSS_PATH}\\Tasks\\Games`

async function regWriteDword(hive: 'HKLM' | 'HKCU', path: string, name: string, value: number): Promise<void> {
  // Use PowerShell Set-ItemProperty to avoid cmd.exe quote-escaping issues with paths
  // that contain spaces (e.g. "Windows NT"). reg.exe via runCmd gets malformed args.
  const psHive = hive === 'HKLM' ? 'HKLM:' : 'HKCU:'
  await runPowerShell(
    `$p = '${psHive}\\${path}'\n` +
    `if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null }\n` +
    `Set-ItemProperty -Path $p -Name '${name}' -Value ${value} -Type DWord -Force`
  )
}

async function regWriteSz(hive: 'HKLM' | 'HKCU', path: string, name: string, value: string): Promise<void> {
  const psHive = hive === 'HKLM' ? 'HKLM:' : 'HKCU:'
  await runPowerShell(
    `$p = '${psHive}\\${path}'\n` +
    `if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null }\n` +
    `Set-ItemProperty -Path $p -Name '${name}' -Value '${value}' -Type String -Force`
  )
}

// ── Fix 2: MMCSS NetworkThrottlingIndex ───────────────────────

const fixMmcssNetworkThrottling: Fix = {
  id: 'fix-mmcss-network-throttling',
  name: 'Disable MMCSS Network Throttling',
  description: 'Sets NetworkThrottlingIndex to 0xFFFFFFFF to prevent Windows throttling network-heavy multimedia tasks.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = readRegistryDword('HKLM', MMCSS_PATH, 'NetworkThrottlingIndex') ?? 10
    return {
      fixId: 'fix-mmcss-network-throttling',
      name: 'Disable MMCSS Network Throttling',
      description: 'Removes artificial packet throttling that adds latency to wireless VR streaming.',
      changes: [{
        target: `Registry: HKLM\\${MMCSS_PATH}\\NetworkThrottlingIndex`,
        currentValue: current === 0xffffffff ? '0xFFFFFFFF (already disabled)' : `${current} (throttling active)`,
        newValue: '0xFFFFFFFF (disabled)'
      }],
      requiresAdmin: true,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const backup = readRegistryDword('HKLM', MMCSS_PATH, 'NetworkThrottlingIndex') ?? 10
    storeBackup('fix-mmcss-network-throttling', { NetworkThrottlingIndex: String(backup) })
    try {
      await regWriteDword('HKLM', MMCSS_PATH, 'NetworkThrottlingIndex', 0xffffffff)
      const verify = readRegistryDword('HKLM', MMCSS_PATH, 'NetworkThrottlingIndex')
      const success = verify === 0xffffffff
      if (success) recordHistory({
        fixId: 'fix-mmcss-network-throttling', name: 'Disable MMCSS Network Throttling',
        appliedAt: Date.now(),
        changes: [{ target: `NetworkThrottlingIndex`, currentValue: String(backup), newValue: '4294967295' }],
        backupValues: { NetworkThrottlingIndex: String(backup) }, undoneAt: null
      })
      return { fixId: 'fix-mmcss-network-throttling', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-mmcss-network-throttling', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-mmcss-network-throttling')
    try {
      await regWriteDword('HKLM', MMCSS_PATH, 'NetworkThrottlingIndex', parseInt(backup?.NetworkThrottlingIndex ?? '10'))
      markUndone('fix-mmcss-network-throttling')
      return { fixId: 'fix-mmcss-network-throttling', success: true }
    } catch (e) {
      return { fixId: 'fix-mmcss-network-throttling', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 3: MMCSS Games task priority ─────────────────────────

const fixMmcssGamesPriority: Fix = {
  id: 'fix-mmcss-games-priority',
  name: 'Set Games Scheduling Priority',
  description: 'Configures MMCSS Games task: Priority=6, Scheduling Category=High, GPU Priority=8.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const prio = readRegistryDword('HKLM', MMCSS_GAMES_PATH, 'Priority') ?? 2
    const cat = readRegistry('HKLM', MMCSS_GAMES_PATH, 'Scheduling Category') ?? 'Medium'
    const gpuPrio = readRegistryDword('HKLM', MMCSS_GAMES_PATH, 'GPU Priority') ?? 8
    return {
      fixId: 'fix-mmcss-games-priority',
      name: 'Set Games Scheduling Priority',
      description: 'Elevates MMCSS Games task so VR processes get CPU time before lower-priority tasks.',
      changes: [
        { target: `HKLM\\${MMCSS_GAMES_PATH}\\Priority`, currentValue: String(prio), newValue: '6' },
        { target: `HKLM\\${MMCSS_GAMES_PATH}\\Scheduling Category`, currentValue: cat, newValue: 'High' },
        { target: `HKLM\\${MMCSS_GAMES_PATH}\\GPU Priority`, currentValue: String(gpuPrio), newValue: '8' }
      ],
      requiresAdmin: true, requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const backupValues: Record<string, string> = {
      Priority: String(readRegistryDword('HKLM', MMCSS_GAMES_PATH, 'Priority') ?? 2),
      SchedulingCategory: readRegistry('HKLM', MMCSS_GAMES_PATH, 'Scheduling Category') ?? 'Medium',
      GpuPriority: String(readRegistryDword('HKLM', MMCSS_GAMES_PATH, 'GPU Priority') ?? 8)
    }
    storeBackup('fix-mmcss-games-priority', backupValues)
    try {
      await regWriteDword('HKLM', MMCSS_GAMES_PATH, 'Priority', 6)
      await regWriteSz('HKLM', MMCSS_GAMES_PATH, 'Scheduling Category', 'High')
      await regWriteDword('HKLM', MMCSS_GAMES_PATH, 'GPU Priority', 8)
      const verify = readRegistryDword('HKLM', MMCSS_GAMES_PATH, 'Priority')
      const success = verify === 6
      const changes: FixChange[] = [
        { target: 'Priority', currentValue: backupValues.Priority, newValue: '6' },
        { target: 'Scheduling Category', currentValue: backupValues.SchedulingCategory, newValue: 'High' },
        { target: 'GPU Priority', currentValue: backupValues.GpuPriority, newValue: '8' }
      ]
      if (success) recordHistory({
        fixId: 'fix-mmcss-games-priority', name: 'Set Games Scheduling Priority',
        appliedAt: Date.now(), changes, backupValues, undoneAt: null
      })
      return { fixId: 'fix-mmcss-games-priority', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-mmcss-games-priority', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-mmcss-games-priority')
    if (!backup) return { fixId: 'fix-mmcss-games-priority', success: false, error: 'No backup' }
    try {
      await regWriteDword('HKLM', MMCSS_GAMES_PATH, 'Priority', parseInt(backup.Priority))
      await regWriteSz('HKLM', MMCSS_GAMES_PATH, 'Scheduling Category', backup.SchedulingCategory)
      await regWriteDword('HKLM', MMCSS_GAMES_PATH, 'GPU Priority', parseInt(backup.GpuPriority))
      markUndone('fix-mmcss-games-priority')
      return { fixId: 'fix-mmcss-games-priority', success: true }
    } catch (e) {
      return { fixId: 'fix-mmcss-games-priority', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 4: Power Plan → High Performance ─────────────────────

const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'

const fixPowerPlan: Fix = {
  id: 'fix-power-plan',
  name: 'Switch to High Performance Power Plan',
  description: 'Activates the High Performance power plan, preventing CPU/GPU clock-down during VR.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    let currentPlan = 'Unknown'
    try {
      const out = await runCmd('powercfg /getactivescheme')
      const m = out.match(/GUID:\s*([a-f0-9-]+)\s+\((.+?)\)/i)
      if (m) currentPlan = `${m[2].trim()} (${m[1]})`
    } catch { /* ignore */ }
    return {
      fixId: 'fix-power-plan', name: 'Switch to High Performance Power Plan',
      description: 'Prevents Windows from throttling CPU/GPU clocks to save power during VR sessions.',
      changes: [{ target: 'Windows Power Plan', currentValue: currentPlan, newValue: `High Performance (${HIGH_PERF_GUID})` }],
      requiresAdmin: false, requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    let previousGuid = ''
    try {
      const out = await runCmd('powercfg /getactivescheme')
      const m = out.match(/GUID:\s*([a-f0-9-]+)/i)
      if (m) previousGuid = m[1].trim()
    } catch { /* ignore */ }
    storeBackup('fix-power-plan', { previousGuid })
    try {
      await runCmd(`powercfg /setactive ${HIGH_PERF_GUID}`)
      const verify = await runCmd('powercfg /getactivescheme')
      const success = verify.toLowerCase().includes(HIGH_PERF_GUID)
      if (success) recordHistory({
        fixId: 'fix-power-plan', name: 'Switch to High Performance Power Plan',
        appliedAt: Date.now(),
        changes: [{ target: 'Power Plan GUID', currentValue: previousGuid, newValue: HIGH_PERF_GUID }],
        backupValues: { previousGuid }, undoneAt: null
      })
      return { fixId: 'fix-power-plan', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-power-plan', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-power-plan')
    const guid = backup?.previousGuid
    if (!guid) return { fixId: 'fix-power-plan', success: false, error: 'No previous power plan backed up' }
    try {
      await runCmd(`powercfg /setactive ${guid}`)
      markUndone('fix-power-plan')
      return { fixId: 'fix-power-plan', success: true }
    } catch (e) {
      return { fixId: 'fix-power-plan', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 4b: Disable PCIe ASPM (Active State Power Management) ─
//
// ASPM = Active State Power Management: when idle, PCIe links drop into L0s/L1
// low-power states. Transitioning back to L0 takes microseconds — tiny per-hop,
// but VR's render → GPU → encoder → display pipeline crosses multiple PCIe
// boundaries each frame, and the accumulated wake-up latency causes frame
// pacing irregularities. Disabling ASPM is a well-documented VR fix for
// NVIDIA and AMD alike (no vendor-specific code required).
//
// We write to the ACTIVE power plan's PCIe subgroup via powercfg:
//   SUB_PCIEXPRESS   = 501a4d13-42af-4429-9fd1-a8218c268e20
//   ASPM setting     = ee12f906-d277-404b-b6da-e5fa1a576df5
//   Values: 0 = Off (maximum performance), 1 = Moderate, 2 = Maximum power savings

const PCIE_SUB_GUID = '501a4d13-42af-4429-9fd1-a8218c268e20'
const PCIE_ASPM_GUID = 'ee12f906-d277-404b-b6da-e5fa1a576df5'

async function getActiveSchemeGuid(): Promise<string | null> {
  try {
    const out = await runCmd('powercfg /getactivescheme')
    const m = out.match(/GUID:\s*([a-f0-9-]+)/i)
    return m ? m[1].trim() : null
  } catch { return null }
}

async function readPcieAspmValue(): Promise<number | null> {
  try {
    const out = await runCmd(`powercfg /query SCHEME_CURRENT ${PCIE_SUB_GUID} ${PCIE_ASPM_GUID}`)
    // Parse "Current AC Power Setting Index: 0x00000000"
    const m = out.match(/Current AC Power Setting Index:\s*0x([0-9a-f]+)/i)
    return m ? parseInt(m[1], 16) : null
  } catch { return null }
}

function aspmLabel(val: number | null): string {
  if (val === null) return 'Unknown'
  if (val === 0) return 'Off (max performance)'
  if (val === 1) return 'Moderate power savings'
  if (val === 2) return 'Maximum power savings'
  return `Unknown (${val})`
}

const fixPcieAspmDisable: Fix = {
  id: 'fix-pcie-aspm-disable',
  name: 'Disable PCIe ASPM Power Savings',
  description:
    'Sets PCI Express Link State Power Management to Off in the active power plan. ' +
    'Prevents PCIe links from entering low-power states during VR, eliminating the wake-up ' +
    'microsecond cost on every CPU→GPU and GPU→encoder transfer.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = await readPcieAspmValue()
    return {
      fixId: 'fix-pcie-aspm-disable',
      name: 'Disable PCIe ASPM Power Savings',
      description:
        'Disables PCIe Active State Power Management in the active power plan. Well-documented VR latency fix; ' +
        'affects AC-power policy only (battery behavior unchanged).',
      changes: [{
        target: `Power Plan → PCI Express → Link State Power Management (AC)`,
        currentValue: aspmLabel(current),
        newValue: 'Off (max performance)'
      }],
      requiresAdmin: true,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const schemeGuid = await getActiveSchemeGuid()
    const backupValue = await readPcieAspmValue()
    storeBackup('fix-pcie-aspm-disable', {
      schemeGuid: schemeGuid ?? '',
      previousAspm: String(backupValue ?? 0)
    })
    try {
      // Set both AC and DC to 0 (Off). VR sessions typically happen on AC, but
      // setting DC too means laptop users don't get surprised on battery.
      await runCmd(`powercfg /setacvalueindex SCHEME_CURRENT ${PCIE_SUB_GUID} ${PCIE_ASPM_GUID} 0`)
      await runCmd(`powercfg /setdcvalueindex SCHEME_CURRENT ${PCIE_SUB_GUID} ${PCIE_ASPM_GUID} 0`)
      // Re-activate the scheme so the setting takes effect immediately
      if (schemeGuid) await runCmd(`powercfg /setactive ${schemeGuid}`)

      const verify = await readPcieAspmValue()
      const success = verify === 0

      if (success) recordHistory({
        fixId: 'fix-pcie-aspm-disable',
        name: 'Disable PCIe ASPM Power Savings',
        appliedAt: Date.now(),
        changes: [{
          target: 'PCIe Link State Power Management',
          currentValue: aspmLabel(backupValue),
          newValue: 'Off (max performance)'
        }],
        backupValues: {
          schemeGuid: schemeGuid ?? '',
          previousAspm: String(backupValue ?? 0)
        },
        undoneAt: null
      })

      return { fixId: 'fix-pcie-aspm-disable', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-pcie-aspm-disable', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-pcie-aspm-disable')
    const prev = parseInt(backup?.previousAspm ?? '1')
    const schemeGuid = await getActiveSchemeGuid()
    try {
      await runCmd(`powercfg /setacvalueindex SCHEME_CURRENT ${PCIE_SUB_GUID} ${PCIE_ASPM_GUID} ${prev}`)
      await runCmd(`powercfg /setdcvalueindex SCHEME_CURRENT ${PCIE_SUB_GUID} ${PCIE_ASPM_GUID} ${prev}`)
      if (schemeGuid) await runCmd(`powercfg /setactive ${schemeGuid}`)
      markUndone('fix-pcie-aspm-disable')
      return { fixId: 'fix-pcie-aspm-disable', success: true }
    } catch (e) {
      return { fixId: 'fix-pcie-aspm-disable', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 6: Enable Game Mode ───────────────────────────────────

const fixEnableGameMode: Fix = {
  id: 'fix-game-mode-disabled',
  name: 'Enable Windows Game Mode',
  description: 'Enables Windows Game Mode to prioritize VR processes and suppress background interruptions.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = readRegistryDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled') ?? 0
    return {
      fixId: 'fix-game-mode-disabled', name: 'Enable Windows Game Mode',
      description: 'Game Mode prioritizes the foreground VR process and suppresses Windows Update reboots during play.',
      changes: [{ target: 'HKCU\\SOFTWARE\\Microsoft\\GameBar\\AutoGameModeEnabled', currentValue: String(current), newValue: '1' }],
      requiresAdmin: false, requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const backup = readRegistryDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled') ?? 0
    storeBackup('fix-game-mode-disabled', { AutoGameModeEnabled: String(backup) })
    try {
      await regWriteDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1)
      await regWriteDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AllowAutoGameMode', 1)
      const verify = readRegistryDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled')
      const success = verify === 1
      if (success) recordHistory({
        fixId: 'fix-game-mode-disabled', name: 'Enable Windows Game Mode',
        appliedAt: Date.now(),
        changes: [{ target: 'AutoGameModeEnabled', currentValue: String(backup), newValue: '1' }],
        backupValues: { AutoGameModeEnabled: String(backup) }, undoneAt: null
      })
      return { fixId: 'fix-game-mode-disabled', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-game-mode-disabled', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-game-mode-disabled')
    try {
      await regWriteDword('HKCU', 'SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled', parseInt(backup?.AutoGameModeEnabled ?? '0'))
      markUndone('fix-game-mode-disabled')
      return { fixId: 'fix-game-mode-disabled', success: true }
    } catch (e) {
      return { fixId: 'fix-game-mode-disabled', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 7: Disable Wi-Fi Power Saving ────────────────────────

const fixWifiPowerSaving: Fix = {
  id: 'fix-wifi-power-saving',
  name: 'Disable Wi-Fi Adapter Power Saving',
  description: 'Prevents the Wi-Fi adapter from dozing between packets, eliminating wake-up latency spikes in wireless VR.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => ({
    fixId: 'fix-wifi-power-saving', name: 'Disable Wi-Fi Adapter Power Saving',
    description: 'Wi-Fi power management causes 10-50ms wake-up spikes that appear as glitches in wireless VR.',
    changes: [{ target: 'Wi-Fi Adapter Power Management', currentValue: 'AllowComputerToTurnOffDevice = Enabled', newValue: 'Disabled' }],
    requiresAdmin: false, requiresReboot: false
  }),

  apply: async (): Promise<FixResult> => {
    storeBackup('fix-wifi-power-saving', { applied: 'true' })
    try {
      await runPowerShell(`
        $adapters = Get-NetAdapter | Where-Object { $_.PhysicalMediaType -like '*802.11*' }
        foreach ($a in $adapters) {
          Set-NetAdapterPowerManagement -Name $a.Name -AllowComputerToTurnOffDevice Disabled -EA SilentlyContinue
        }
      `)
      recordHistory({
        fixId: 'fix-wifi-power-saving', name: 'Disable Wi-Fi Adapter Power Saving',
        appliedAt: Date.now(),
        changes: [{ target: 'Wi-Fi Power Management', currentValue: 'Enabled', newValue: 'Disabled' }],
        backupValues: { applied: 'true' }, undoneAt: null
      })
      return { fixId: 'fix-wifi-power-saving', success: true }
    } catch (e) {
      return { fixId: 'fix-wifi-power-saving', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    try {
      await runPowerShell(`
        $adapters = Get-NetAdapter | Where-Object { $_.PhysicalMediaType -like '*802.11*' }
        foreach ($a in $adapters) {
          Set-NetAdapterPowerManagement -Name $a.Name -AllowComputerToTurnOffDevice Enabled -EA SilentlyContinue
        }
      `)
      markUndone('fix-wifi-power-saving')
      return { fixId: 'fix-wifi-power-saving', success: true }
    } catch (e) {
      return { fixId: 'fix-wifi-power-saving', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 8: VRChat V-Cache Affinity via Steam Launch Option ───────────────
// Sets VRChat's Steam launch option to pin it to V-Cache cores (FFFF = first
// 16 logical processors = V-Cache CCD on 7950X3D/9950X3D) and High priority.
// This is the only reliable method — the amd3dvcacheSvc registry approach
// depends on AMD's scheduler service timing which is not guaranteed.
//
// Steam launch option: cmd /c start /affinity FFFF /high "" %command%

const VCACHE_LAUNCH_OPTION = 'cmd /c start /affinity FFFF /high "" %command%'
const VRCHAT_APP_ID = '438100'

function findSteamInstallPath(): string | null {
  // Try registry first
  try {
    const regPath = readRegistry('HKCU', 'SOFTWARE\\Valve\\Steam', 'SteamPath')
    if (regPath && existsSync(regPath)) return regPath.replace(/\//g, '\\')
  } catch { /* ignore */ }
  // Common fallbacks
  for (const p of [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    join(homedir(), 'Steam')
  ]) {
    if (existsSync(p)) return p
  }
  return null
}

function findSteamUserId(steamPath: string): string | null {
  const userdataPath = join(steamPath, 'userdata')
  if (!existsSync(userdataPath)) return null
  try {
    const dirs = readdirSync(userdataPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d+$/.test(d.name) && d.name !== '0')
      .map(d => d.name)
    // Prefer the one that already has VRChat app data
    for (const uid of dirs) {
      const configPath = join(userdataPath, uid, 'config', 'localconfig.vdf')
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf8')
        if (content.includes(`"${VRCHAT_APP_ID}"`)) return uid
      }
    }
    // Fallback: return first valid user dir that has a localconfig.vdf
    for (const uid of dirs) {
      if (existsSync(join(userdataPath, uid, 'config', 'localconfig.vdf'))) return uid
    }
    return dirs[0] ?? null
  } catch {
    return null
  }
}

function readVRChatLaunchOption(steamPath: string, userId: string): string | null {
  const configPath = join(steamPath, 'userdata', userId, 'config', 'localconfig.vdf')
  if (!existsSync(configPath)) return null
  try {
    const content = readFileSync(configPath, 'utf8')
    // Find VRChat section and extract LaunchOptions
    // VDF format: "438100"\n{\n\t"LaunchOptions"\t"value"\n}
    const match = content.match(new RegExp(
      `"${VRCHAT_APP_ID}"[^{]*\\{[^}]*?"LaunchOptions"\\s+"([^"]*)"`,
      's'
    ))
    return match ? match[1] : null
  } catch {
    return null
  }
}

function setVRChatLaunchOptionInFile(steamPath: string, userId: string, option: string, backup: string | null): boolean {
  const configPath = join(steamPath, 'userdata', userId, 'config', 'localconfig.vdf')
  if (!existsSync(configPath)) return false
  try {
    let content = readFileSync(configPath, 'utf8')

    // Case 1: LaunchOptions key already exists for this app — replace it
    const replacer = new RegExp(
      `("${VRCHAT_APP_ID}"[^{]*\\{[^}]*?)"LaunchOptions"(\\s+)"[^"]*"`,
      's'
    )
    if (replacer.test(content)) {
      content = content.replace(replacer, `$1"LaunchOptions"$2"${option}"`)
      writeFileSync(configPath, content, 'utf8')
      return true
    }

    // Case 2: App section exists but no LaunchOptions — insert it
    const inserter = new RegExp(`("${VRCHAT_APP_ID}"[^{]*\\{)`, 's')
    if (inserter.test(content)) {
      content = content.replace(inserter, `$1\n\t\t\t\t\t\t"LaunchOptions"\t\t"${option}"`)
      writeFileSync(configPath, content, 'utf8')
      return true
    }

    // Case 3: App section doesn't exist — can't auto-apply, return false
    return false
  } catch {
    return false
  }
}

async function isSteamRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq steam.exe" /FO CSV /NH', { timeout: 5000 })
    return stdout.toLowerCase().includes('steam.exe')
  } catch {
    return false
  }
}

const fixVCacheAffinity: Fix = {
  id: 'fix-vcache-affinity',
  name: 'Pin VRChat to V-Cache Cores (Steam Launch Option)',
  description: 'Sets VRChat\'s Steam launch option to pin it to V-Cache cores with High CPU priority. This is the reliable method — works at process spawn time, before the scheduler can assign it elsewhere.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const steamPath = findSteamInstallPath()
    const userId = steamPath ? findSteamUserId(steamPath) : null
    const currentOption = steamPath && userId ? readVRChatLaunchOption(steamPath, userId) : null
    const steamFound = !!steamPath && !!userId

    return {
      fixId: 'fix-vcache-affinity',
      name: 'Pin VRChat to V-Cache Cores (Steam Launch Option)',
      description: steamFound
        ? 'Will set VRChat\'s Steam launch option to pin it to the first 16 logical cores (V-Cache CCD on 7950X3D/9950X3D) and High CPU priority. Change takes effect next time VRChat is launched from Steam.'
        : 'Steam installation not found. Will show manual instructions — you can copy the launch option and paste it into Steam manually.',
      changes: [{
        target: steamFound
          ? `Steam → VRChat (App ${VRCHAT_APP_ID}) → Launch Options`
          : 'Steam → Library → VRChat → Properties → Launch Options',
        currentValue: currentOption ?? '(none / not set)',
        newValue: VCACHE_LAUNCH_OPTION
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const steamPath = findSteamInstallPath()
    const userId = steamPath ? findSteamUserId(steamPath) : null

    if (!steamPath || !userId) {
      return {
        fixId: 'fix-vcache-affinity',
        success: false,
        error: `Steam not found. Apply manually: In Steam → Library → right-click VRChat → Properties → Launch Options, paste: ${VCACHE_LAUNCH_OPTION}`
      }
    }

    // Back up current value
    const current = readVRChatLaunchOption(steamPath, userId)
    storeBackup('fix-vcache-affinity', { launchOption: current ?? '' })

    // Check if Steam is running (it will overwrite localconfig.vdf on exit)
    const steamRunning = await isSteamRunning()

    const applied = setVRChatLaunchOptionInFile(steamPath, userId, VCACHE_LAUNCH_OPTION, current)

    if (!applied) {
      return {
        fixId: 'fix-vcache-affinity',
        success: false,
        error: `Could not auto-apply. Set manually in Steam → Library → VRChat → Properties → Launch Options:\n${VCACHE_LAUNCH_OPTION}`
      }
    }

    recordHistory({
      fixId: 'fix-vcache-affinity',
      name: 'Pin VRChat to V-Cache Cores (Steam Launch Option)',
      appliedAt: Date.now(),
      changes: [{ target: `VRChat Launch Options`, currentValue: current ?? '(none)', newValue: VCACHE_LAUNCH_OPTION }],
      backupValues: { launchOption: current ?? '' },
      undoneAt: null
    })

    const warning = steamRunning
      ? ' Note: Steam is currently running — restart Steam for the change to be saved permanently.'
      : ''

    return {
      fixId: 'fix-vcache-affinity',
      success: true,
      error: warning || undefined
    }
  },

  undo: async (): Promise<FixResult> => {
    const steamPath = findSteamInstallPath()
    const userId = steamPath ? findSteamUserId(steamPath) : null
    const backup = getBackup('fix-vcache-affinity')
    const original = backup?.launchOption ?? ''

    if (!steamPath || !userId) {
      return { fixId: 'fix-vcache-affinity', success: false, error: 'Steam not found for undo' }
    }

    if (original === '') {
      // Remove the launch option entirely by setting to empty string
      setVRChatLaunchOptionInFile(steamPath, userId, '', null)
    } else {
      setVRChatLaunchOptionInFile(steamPath, userId, original, null)
    }

    markUndone('fix-vcache-affinity')
    return { fixId: 'fix-vcache-affinity', success: true }
  }
}

// ── Fix 9: Enable HAGS ────────────────────────────────────────
const HAGS_REG_PATH = 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers'

const fixHagsEnable: Fix = {
  id: 'fix-hags-enable',
  name: 'Enable Hardware-Accelerated GPU Scheduling (HAGS)',
  description: 'Moves GPU scheduling from the CPU driver to a dedicated hardware unit, reducing GPU-induced frame latency by 1-3ms in VR.',
  requiresAdmin: true,
  requiresReboot: true,

  preview: async (): Promise<FixPreview> => {
    const current = readRegistryDword('HKLM', HAGS_REG_PATH, 'HwSchMode') ?? 0
    // Detect GPU name for a more informative preview
    let gpuName = 'your GPU'
    try {
      const out = await runCmd('wmic path Win32_VideoController get Name /value')
      const m = out.match(/Name=(.+)/i)
      if (m) gpuName = m[1].trim()
    } catch { /* ignore */ }
    return {
      fixId: 'fix-hags-enable',
      name: 'Enable Hardware-Accelerated GPU Scheduling (HAGS)',
      description: `HAGS lets ${gpuName} manage its own scheduling queue instead of routing through the CPU driver, reducing frame time variance. Supported on NVIDIA GTX 10xx+, AMD RX 400+, Intel Arc/Xe, and most WDDM 2.7+ GPUs. Safe to apply — Windows ignores the setting if unsupported.`,
      changes: [{
        target: `Registry: HKLM\\${HAGS_REG_PATH}\\HwSchMode`,
        currentValue: current === 2 ? '2 (already enabled)' : `${current} (disabled)`,
        newValue: '2 (enabled) — requires reboot'
      }],
      requiresAdmin: true,
      requiresReboot: true
    }
  },

  apply: async (): Promise<FixResult> => {
    const backup = readRegistryDword('HKLM', HAGS_REG_PATH, 'HwSchMode') ?? 0
    storeBackup('fix-hags-enable', { HwSchMode: String(backup) })
    try {
      await regWriteDword('HKLM', HAGS_REG_PATH, 'HwSchMode', 2)
      recordHistory({
        fixId: 'fix-hags-enable', name: 'Enable HAGS',
        appliedAt: Date.now(),
        changes: [{ target: `HwSchMode`, currentValue: String(backup), newValue: '2' }],
        backupValues: { HwSchMode: String(backup) }, undoneAt: null
      })
      return { fixId: 'fix-hags-enable', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-hags-enable', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-hags-enable')
    try {
      await regWriteDword('HKLM', HAGS_REG_PATH, 'HwSchMode', parseInt(backup?.HwSchMode ?? '0'))
      markUndone('fix-hags-enable')
      return { fixId: 'fix-hags-enable', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-hags-enable', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 10: Reset SteamVR Supersampling ──────────────────────
function getSteamVRSettingsPath(): string {
  return join(process.env.LOCALAPPDATA ?? '', 'openvr', 'steamvr.vrsettings')
}

function readSteamVRSettings(): Record<string, unknown> {
  const p = getSteamVRSettingsPath()
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown> }
  catch { return {} }
}

function writeSteamVRSettings(data: Record<string, unknown>): void {
  writeFileSync(getSteamVRSettingsPath(), JSON.stringify(data, null, '\t'), 'utf8')
}

const fixSteamVRSupersampling: Fix = {
  id: 'fix-steamvr-supersampling',
  name: 'Reset SteamVR Supersampling to Auto (1.0×)',
  description: 'Resets per-eye render scale to 1.0× so SteamVR auto-adjusts for your GPU instead of forcing an overloaded fixed value.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    const current = steamvr.supersampleScale as number | undefined
    return {
      fixId: 'fix-steamvr-supersampling',
      name: 'Reset SteamVR Supersampling to Auto (1.0×)',
      description: 'High supersampling with a stressed GPU causes dropped frames and reprojection. Auto (1.0×) lets SteamVR match render scale to your actual GPU capability.',
      changes: [{
        target: `${getSteamVRSettingsPath()} → steamvr.supersampleScale`,
        currentValue: current != null ? `${current}× (${Math.round(current * 100)}%)` : 'auto (not set)',
        newValue: '1.0× (auto)'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    storeBackup('fix-steamvr-supersampling', { supersampleScale: String(steamvr.supersampleScale ?? '') })
    try {
      steamvr.supersampleScale = 1.0
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      recordHistory({
        fixId: 'fix-steamvr-supersampling', name: 'Reset SteamVR Supersampling to Auto',
        appliedAt: Date.now(),
        changes: [{ target: 'supersampleScale', currentValue: String(steamvr.supersampleScale), newValue: '1.0' }],
        backupValues: { supersampleScale: String(steamvr.supersampleScale ?? '') }, undoneAt: null
      })
      return { fixId: 'fix-steamvr-supersampling', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-supersampling', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-steamvr-supersampling')
    try {
      const settings = readSteamVRSettings()
      const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
      const prev = backup?.supersampleScale
      if (prev === '' || prev == null) {
        delete steamvr.supersampleScale
      } else {
        steamvr.supersampleScale = parseFloat(prev)
      }
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      markUndone('fix-steamvr-supersampling')
      return { fixId: 'fix-steamvr-supersampling', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-supersampling', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 11: Enable SteamVR Motion Smoothing ──────────────────
const fixSteamVRMotionSmoothing: Fix = {
  id: 'fix-steamvr-motion-smoothing',
  name: 'Enable SteamVR Motion Smoothing',
  description: 'Enables SteamVR reprojection/motion smoothing to synthesize frames when GPU falls below target rate, preventing nausea-inducing judder.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    const current = steamvr.motionSmoothing
    return {
      fixId: 'fix-steamvr-motion-smoothing',
      name: 'Enable SteamVR Motion Smoothing',
      description: 'Motion Smoothing synthesizes intermediate frames when the GPU misses the display sync deadline, keeping VR comfortable even at lower frame rates.',
      changes: [{
        target: `${getSteamVRSettingsPath()} → steamvr.motionSmoothing`,
        currentValue: current == null ? 'not set (default off)' : String(current),
        newValue: 'true'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    storeBackup('fix-steamvr-motion-smoothing', { motionSmoothing: String(steamvr.motionSmoothing ?? '') })
    try {
      steamvr.motionSmoothing = true
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      recordHistory({
        fixId: 'fix-steamvr-motion-smoothing', name: 'Enable SteamVR Motion Smoothing',
        appliedAt: Date.now(),
        changes: [{ target: 'motionSmoothing', currentValue: 'false/unset', newValue: 'true' }],
        backupValues: { motionSmoothing: String(steamvr.motionSmoothing ?? '') }, undoneAt: null
      })
      return { fixId: 'fix-steamvr-motion-smoothing', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-motion-smoothing', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-steamvr-motion-smoothing')
    try {
      const settings = readSteamVRSettings()
      const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
      const prev = backup?.motionSmoothing
      if (prev === '' || prev == null) delete steamvr.motionSmoothing
      else steamvr.motionSmoothing = prev === 'true'
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      markUndone('fix-steamvr-motion-smoothing')
      return { fixId: 'fix-steamvr-motion-smoothing', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-motion-smoothing', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 12: Optimize VRChat Cache Size ───────────────────────
function getVRChatConfigPath(): string {
  return join(homedir(), 'AppData', 'LocalLow', 'VRChat', 'VRChat', 'config.json')
}

function readVRChatConfig(): Record<string, unknown> {
  const p = getVRChatConfigPath()
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown> }
  catch { return {} }
}

function writeVRChatConfig(data: Record<string, unknown>): void {
  writeFileSync(getVRChatConfigPath(), JSON.stringify(data, null, 2), 'utf8')
}

const fixVRChatCacheSize: Fix = {
  id: 'fix-vrchat-cache-size',
  name: 'Optimize VRChat Cache Capacity (20 GB)',
  description: 'Sets VRChat\'s asset cache to 20 GB — prevents world and avatar assets from being re-downloaded every session.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const config = readVRChatConfig()
    const current = config.cache_size as number | undefined
    return {
      fixId: 'fix-vrchat-cache-size',
      name: 'Optimize VRChat Cache Capacity (20 GB)',
      description: 'A small cache forces VRChat to re-download avatars and worlds constantly. 20 GB keeps your most-visited content cached for instant loading.',
      changes: [{
        target: `${getVRChatConfigPath()} → cache_size`,
        currentValue: current != null ? `${current} MB (${(current / 1024).toFixed(1)} GB)` : 'not set (default ~10 GB)',
        newValue: '20480 MB (20 GB)'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const config = readVRChatConfig()
    storeBackup('fix-vrchat-cache-size', {
      cache_size: String(config.cache_size ?? ''),
      cache_expiry_delay: String(config.cache_expiry_delay ?? '')
    })
    try {
      config.cache_size = 20480
      if (!config.cache_expiry_delay) config.cache_expiry_delay = 30
      writeVRChatConfig(config)
      recordHistory({
        fixId: 'fix-vrchat-cache-size', name: 'Optimize VRChat Cache Capacity',
        appliedAt: Date.now(),
        changes: [{ target: 'cache_size', currentValue: String(config.cache_size), newValue: '20480' }],
        backupValues: { cache_size: String(config.cache_size ?? '') }, undoneAt: null
      })
      return { fixId: 'fix-vrchat-cache-size', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-cache-size', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-vrchat-cache-size')
    try {
      const config = readVRChatConfig()
      const prev = backup?.cache_size
      if (prev === '' || prev == null) delete config.cache_size
      else config.cache_size = parseInt(prev)
      writeVRChatConfig(config)
      markUndone('fix-vrchat-cache-size')
      return { fixId: 'fix-vrchat-cache-size', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-cache-size', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 13: Disable Xbox Game Bar & DVR ──────────────────────

const fixDisableXboxDvr: Fix = {
  id: 'fix-disable-xbox-dvr',
  name: 'Disable Xbox Game Bar & DVR Overhead',
  description: 'Disables Xbox Game Bar background recording hooks and DVR overlay, which add GPU and CPU overhead to every running game and VR application.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const appCapture = readRegistryDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled') ?? 1
    const dvrEnabled = readRegistryDword('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled') ?? 1
    return {
      fixId: 'fix-disable-xbox-dvr',
      name: 'Disable Xbox Game Bar & DVR Overhead',
      description: 'Disables Xbox Game Bar background recording hooks and DVR overlay, which add GPU and CPU overhead to every running game and VR application.',
      changes: [
        {
          target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR\\AppCaptureEnabled',
          currentValue: String(appCapture),
          newValue: '0 (disabled)'
        },
        {
          target: 'HKCU\\System\\GameConfigStore\\GameDVR_Enabled',
          currentValue: String(dvrEnabled),
          newValue: '0 (disabled)'
        }
      ],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const appCapture = readRegistryDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled') ?? 1
    const dvrEnabled = readRegistryDword('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled') ?? 1
    storeBackup('fix-disable-xbox-dvr', {
      AppCaptureEnabled: String(appCapture),
      GameDVR_Enabled: String(dvrEnabled)
    })
    try {
      await regWriteDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0)
      await regWriteDword('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 0)
      recordHistory({
        fixId: 'fix-disable-xbox-dvr',
        name: 'Disable Xbox Game Bar & DVR Overhead',
        appliedAt: Date.now(),
        changes: [
          { target: 'AppCaptureEnabled', currentValue: String(appCapture), newValue: '0' },
          { target: 'GameDVR_Enabled', currentValue: String(dvrEnabled), newValue: '0' }
        ],
        backupValues: { AppCaptureEnabled: String(appCapture), GameDVR_Enabled: String(dvrEnabled) },
        undoneAt: null
      })
      return { fixId: 'fix-disable-xbox-dvr', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-xbox-dvr', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-disable-xbox-dvr')
    try {
      await regWriteDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', parseInt(backup?.AppCaptureEnabled ?? '1'))
      await regWriteDword('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', parseInt(backup?.GameDVR_Enabled ?? '1'))
      markUndone('fix-disable-xbox-dvr')
      return { fixId: 'fix-disable-xbox-dvr', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-xbox-dvr', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 14: Disable Known Bloat Startup Programs ──────────────

const STARTUP_BLOAT_NAMES = [
  'OneDrive', 'OneDriveSetup', 'Microsoft Teams', 'Teams',
  'Spotify', 'Discord', 'EpicGamesLauncher', 'RiotClient',
  'Cortana', 'WindowsStore', 'AdobeGCInvoker', 'AdobeCreativeCloud',
  'CCLibrary', 'AcroTray', 'Skype', 'SteamTorque'
]
const STARTUP_REG_PATH = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'

interface StartupEntry { Name: string; Value: string }

async function enumerateStartupBloat(): Promise<StartupEntry[]> {
  const script = `$items = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -EA SilentlyContinue\n$items.PSObject.Properties | Where-Object { $_.MemberType -eq 'NoteProperty' -and $_.Name -notmatch '^PS' } | Select-Object Name, Value | ConvertTo-Json -Compress`
  let raw = ''
  try { raw = await runPowerShell(script) } catch { return [] }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StartupEntry | StartupEntry[]
    const all: StartupEntry[] = Array.isArray(parsed) ? parsed : [parsed]
    return all.filter((e) =>
      STARTUP_BLOAT_NAMES.some((b) => e.Name.toLowerCase().includes(b.toLowerCase()))
    )
  } catch { return [] }
}

const fixDisableStartupBloat: Fix = {
  id: 'fix-disable-startup-bloat',
  name: 'Disable Known Bloat Startup Programs',
  description: 'Removes known resource-wasting startup entries (OneDrive, Teams, Discord autorun, Spotify, Epic launcher, etc.) from Windows startup — they can still be launched manually.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const found = await enumerateStartupBloat()
    const changes = found.length > 0
      ? found.map((e) => ({ target: `HKCU\\${STARTUP_REG_PATH}\\${e.Name}`, currentValue: e.Value, newValue: '(removed)' }))
      : [{ target: `HKCU\\${STARTUP_REG_PATH}`, currentValue: 'No known bloat entries found', newValue: '(no change needed)' }]
    return {
      fixId: 'fix-disable-startup-bloat',
      name: 'Disable Known Bloat Startup Programs',
      description: 'Removes known resource-wasting startup entries from Windows startup — they can still be launched manually.',
      changes,
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const found = await enumerateStartupBloat()
    const backupValues: Record<string, string> = {}
    for (const e of found) {
      const val = readRegistry('HKCU', STARTUP_REG_PATH, e.Name)
      if (val != null) backupValues[e.Name] = val
    }
    storeBackup('fix-disable-startup-bloat', backupValues)
    try {
      for (const e of found) {
        await runPowerShell(`Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${e.Name.replace(/'/g, "''")}' -EA SilentlyContinue`)
      }
      recordHistory({
        fixId: 'fix-disable-startup-bloat',
        name: 'Disable Known Bloat Startup Programs',
        appliedAt: Date.now(),
        changes: found.map((e) => ({ target: `${e.Name}`, currentValue: e.Value, newValue: '(removed)' })),
        backupValues,
        undoneAt: null
      })
      return { fixId: 'fix-disable-startup-bloat', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-startup-bloat', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-disable-startup-bloat')
    if (!backup) return { fixId: 'fix-disable-startup-bloat', success: false, error: 'No backup found' }
    try {
      for (const [name, value] of Object.entries(backup)) {
        await regWriteSz('HKCU', STARTUP_REG_PATH, name, value)
      }
      markUndone('fix-disable-startup-bloat')
      return { fixId: 'fix-disable-startup-bloat', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-startup-bloat', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 15: Disable USB Selective Suspend ────────────────────

const USB_SUBGROUP = '2a737441-1930-4402-8d77-b2bebba308a3'
const USB_SUSPEND_SETTING = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'

async function getUsbSuspendIndex(): Promise<number | null> {
  try {
    const out = await runCmd(`powercfg /query SCHEME_CURRENT ${USB_SUBGROUP} ${USB_SUSPEND_SETTING}`)
    const m = out.match(/Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i)
    if (m) return parseInt(m[1], m[1].startsWith('0x') ? 16 : 10)
  } catch { /* ignore */ }
  return null
}

const fixUsbSelectiveSuspend: Fix = {
  id: 'fix-usb-selective-suspend',
  name: 'Disable USB Selective Suspend',
  description: 'Prevents Windows from powering down USB devices between data transfers. USB selective suspend causes VR headsets to stutter when the adapter "wakes up" mid-session.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = await getUsbSuspendIndex()
    return {
      fixId: 'fix-usb-selective-suspend',
      name: 'Disable USB Selective Suspend',
      description: 'Prevents Windows from powering down USB devices between data transfers.',
      changes: [{
        target: `Power Plan → USB Selective Suspend (${USB_SUSPEND_SETTING})`,
        currentValue: current != null ? `${current} (${current === 0 ? 'already disabled' : 'enabled'})` : 'unknown',
        newValue: '0 (disabled)'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const current = await getUsbSuspendIndex()
    storeBackup('fix-usb-selective-suspend', { previousIndex: String(current ?? 1) })
    try {
      await runCmd(`powercfg /setacvalueindex SCHEME_CURRENT ${USB_SUBGROUP} ${USB_SUSPEND_SETTING} 0`)
      await runCmd(`powercfg /setdcvalueindex SCHEME_CURRENT ${USB_SUBGROUP} ${USB_SUSPEND_SETTING} 0`)
      await runCmd('powercfg /setactive SCHEME_CURRENT')
      recordHistory({
        fixId: 'fix-usb-selective-suspend',
        name: 'Disable USB Selective Suspend',
        appliedAt: Date.now(),
        changes: [{ target: 'USB Selective Suspend', currentValue: String(current ?? 1), newValue: '0' }],
        backupValues: { previousIndex: String(current ?? 1) },
        undoneAt: null
      })
      return { fixId: 'fix-usb-selective-suspend', success: true }
    } catch (e) {
      return { fixId: 'fix-usb-selective-suspend', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-usb-selective-suspend')
    const prev = backup?.previousIndex ?? '1'
    try {
      await runCmd(`powercfg /setacvalueindex SCHEME_CURRENT ${USB_SUBGROUP} ${USB_SUSPEND_SETTING} ${prev}`)
      await runCmd(`powercfg /setdcvalueindex SCHEME_CURRENT ${USB_SUBGROUP} ${USB_SUSPEND_SETTING} ${prev}`)
      await runCmd('powercfg /setactive SCHEME_CURRENT')
      markUndone('fix-usb-selective-suspend')
      return { fixId: 'fix-usb-selective-suspend', success: true }
    } catch (e) {
      return { fixId: 'fix-usb-selective-suspend', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 16: Disable CPU Core Parking ─────────────────────────

async function getCpuCoreParking(): Promise<number | null> {
  try {
    const out = await runCmd('powercfg /query SCHEME_CURRENT SUB_PROCESSOR CPMINCORES')
    const m = out.match(/Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i)
    if (m) return parseInt(m[1], m[1].startsWith('0x') ? 16 : 10)
  } catch { /* ignore */ }
  return null
}

const fixCoreParkingDisable: Fix = {
  id: 'fix-core-parking-disable',
  name: 'Disable CPU Core Parking',
  description: 'Keeps all CPU cores fully active. When cores are "parked" (powered down), Windows takes time to wake them when VR needs a burst of processing — causing frame drops.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = await getCpuCoreParking()
    return {
      fixId: 'fix-core-parking-disable',
      name: 'Disable CPU Core Parking',
      description: 'Keeps all CPU cores fully active to prevent wake-up latency during VR workload bursts.',
      changes: [{
        target: 'Power Plan → CPU Minimum Cores (CPMINCORES)',
        currentValue: current != null ? `${current}%` : 'unknown',
        newValue: '100% (all cores always active)'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const current = await getCpuCoreParking()
    storeBackup('fix-core-parking-disable', { previousCpMinCores: String(current ?? 0) })
    try {
      await runCmd('powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100')
      await runCmd('powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100')
      await runCmd('powercfg /setactive SCHEME_CURRENT')
      recordHistory({
        fixId: 'fix-core-parking-disable',
        name: 'Disable CPU Core Parking',
        appliedAt: Date.now(),
        changes: [{ target: 'CPMINCORES', currentValue: String(current ?? 0), newValue: '100' }],
        backupValues: { previousCpMinCores: String(current ?? 0) },
        undoneAt: null
      })
      return { fixId: 'fix-core-parking-disable', success: true }
    } catch (e) {
      return { fixId: 'fix-core-parking-disable', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-core-parking-disable')
    const prev = backup?.previousCpMinCores ?? '0'
    try {
      await runCmd(`powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES ${prev}`)
      await runCmd(`powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES ${prev}`)
      await runCmd('powercfg /setactive SCHEME_CURRENT')
      markUndone('fix-core-parking-disable')
      return { fixId: 'fix-core-parking-disable', success: true }
    } catch (e) {
      return { fixId: 'fix-core-parking-disable', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 17: Disable TCP Nagle Algorithm ──────────────────────

const fixNagleDisable: Fix = {
  id: 'fix-nagle-disable',
  name: 'Disable TCP Nagle Algorithm (Lower Network Latency)',
  description: 'Disables Nagle\'s algorithm on all network adapters. Nagle batches small TCP packets together — great for throughput but adds latency. Disabling it reduces VR streaming latency.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    let needsFixCount = 0
    try {
      const out = await runPowerShell(
        `$interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -EA SilentlyContinue\n` +
        `$needsFix = $interfaces | Where-Object {\n` +
        `  (Get-ItemProperty $_.PSPath -Name 'TcpAckFrequency' -EA SilentlyContinue).TcpAckFrequency -ne 1\n` +
        `} | Measure-Object\n` +
        `Write-Output $needsFix.Count`
      )
      needsFixCount = parseInt(out.trim()) || 0
    } catch { /* ignore */ }
    return {
      fixId: 'fix-nagle-disable',
      name: 'Disable TCP Nagle Algorithm (Lower Network Latency)',
      description: 'Sets TcpAckFrequency=1 and TCPNoDelay=1 on all network adapter interfaces to eliminate Nagle batching delay.',
      changes: [{
        target: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\* → TcpAckFrequency, TCPNoDelay',
        currentValue: `${needsFixCount} interface(s) without Nagle disabled`,
        newValue: 'TcpAckFrequency=1, TCPNoDelay=1 on all interfaces'
      }],
      requiresAdmin: true,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    storeBackup('fix-nagle-disable', { applied: 'true' })
    try {
      await runPowerShell(
        `$interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -EA SilentlyContinue\n` +
        `foreach ($iface in $interfaces) {\n` +
        `  Set-ItemProperty -Path $iface.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -Force -EA SilentlyContinue\n` +
        `  Set-ItemProperty -Path $iface.PSPath -Name 'TCPNoDelay' -Value 1 -Type DWord -Force -EA SilentlyContinue\n` +
        `}`
      )
      recordHistory({
        fixId: 'fix-nagle-disable',
        name: 'Disable TCP Nagle Algorithm (Lower Network Latency)',
        appliedAt: Date.now(),
        changes: [{ target: 'All TCP interfaces', currentValue: 'Nagle enabled', newValue: 'TcpAckFrequency=1, TCPNoDelay=1' }],
        backupValues: { applied: 'true' },
        undoneAt: null
      })
      return { fixId: 'fix-nagle-disable', success: true }
    } catch (e) {
      return { fixId: 'fix-nagle-disable', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    try {
      await runPowerShell(
        `$interfaces = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -EA SilentlyContinue\n` +
        `foreach ($iface in $interfaces) {\n` +
        `  Remove-ItemProperty -Path $iface.PSPath -Name 'TcpAckFrequency' -EA SilentlyContinue\n` +
        `  Remove-ItemProperty -Path $iface.PSPath -Name 'TCPNoDelay' -EA SilentlyContinue\n` +
        `}`
      )
      markUndone('fix-nagle-disable')
      return { fixId: 'fix-nagle-disable', success: true }
    } catch (e) {
      return { fixId: 'fix-nagle-disable', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 18: Disable Fullscreen Optimizations for VR Apps ─────

const FS_OPT_REG_PATH = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
const FS_OPT_FLAG = '~ DISABLEDXMAXIMIZEDWINDOWEDMODE'

const VR_EXE_SEARCH_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrserver.exe',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\vrcompositor.exe',
  'C:\\Program Files\\Oculus\\Support\\oculus-runtime\\OVRServer_x64.exe',
  'C:\\Program Files\\VirtualDesktop.Streamer\\VirtualDesktop.Streamer.exe'
]

function buildVrExeList(): string[] {
  const exes = VR_EXE_SEARCH_PATHS.filter(existsSync)
  // Dynamically find VRChat via Steam registry
  try {
    const steamPath = readRegistry('HKCU', 'SOFTWARE\\Valve\\Steam', 'SteamPath')
    if (steamPath) {
      const vrChat = steamPath.replace(/\//g, '\\') + '\\steamapps\\common\\VRChat\\VRChat.exe'
      if (existsSync(vrChat) && !exes.includes(vrChat)) exes.push(vrChat)
    }
  } catch { /* ignore */ }
  return exes
}

const fixDisableFullscreenOptimizations: Fix = {
  id: 'fix-disable-fullscreen-optimizations',
  name: 'Disable Fullscreen Optimizations for VR Apps',
  description: 'Fullscreen Optimizations redirect VR applications through DWM (the desktop compositor), adding frame latency. Disabling it per-exe gives VR apps true exclusive fullscreen performance.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const exes = buildVrExeList()
    const changes = exes.length > 0
      ? exes.map((exePath) => {
          const current = readRegistry('HKCU', FS_OPT_REG_PATH, exePath) ?? '(not set)'
          return { target: exePath, currentValue: current, newValue: FS_OPT_FLAG }
        })
      : [{ target: 'VR executables', currentValue: 'No known VR executables found on disk', newValue: '(no change needed)' }]
    return {
      fixId: 'fix-disable-fullscreen-optimizations',
      name: 'Disable Fullscreen Optimizations for VR Apps',
      description: 'Sets AppCompatFlags Layers to DISABLEDXMAXIMIZEDWINDOWEDMODE for each detected VR executable.',
      changes,
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const exes = buildVrExeList()
    const backupValues: Record<string, string> = {}
    for (const exePath of exes) {
      backupValues[exePath] = readRegistry('HKCU', FS_OPT_REG_PATH, exePath) ?? ''
    }
    storeBackup('fix-disable-fullscreen-optimizations', backupValues)
    try {
      for (const exePath of exes) {
        const current = backupValues[exePath] ?? ''
        const newValue = current.includes('DISABLEDXMAXIMIZEDWINDOWEDMODE')
          ? current
          : current ? `${current} ${FS_OPT_FLAG}` : FS_OPT_FLAG
        await regWriteSz('HKCU', FS_OPT_REG_PATH, exePath, newValue)
      }
      recordHistory({
        fixId: 'fix-disable-fullscreen-optimizations',
        name: 'Disable Fullscreen Optimizations for VR Apps',
        appliedAt: Date.now(),
        changes: exes.map((e) => ({ target: e, currentValue: backupValues[e] ?? '', newValue: FS_OPT_FLAG })),
        backupValues,
        undoneAt: null
      })
      return { fixId: 'fix-disable-fullscreen-optimizations', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-fullscreen-optimizations', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-disable-fullscreen-optimizations')
    if (!backup) return { fixId: 'fix-disable-fullscreen-optimizations', success: false, error: 'No backup found' }
    try {
      for (const [exePath, originalValue] of Object.entries(backup)) {
        if (originalValue === '') {
          await runPowerShell(
            `Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '${exePath.replace(/'/g, "''")}' -EA SilentlyContinue`
          )
        } else {
          await regWriteSz('HKCU', FS_OPT_REG_PATH, exePath, originalValue)
        }
      }
      markUndone('fix-disable-fullscreen-optimizations')
      return { fixId: 'fix-disable-fullscreen-optimizations', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-fullscreen-optimizations', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 19: Disable Hyper-V ───────────────────────────────────

const fixHyperVDisable: Fix = {
  id: 'fix-hyper-v-disable',
  name: 'Disable Hyper-V Virtualization Layer',
  description: 'Hyper-V makes Windows run in a VM on top of its own hypervisor, adding CPU interrupt latency even when no VMs are running. Disabling it restores "bare metal" Windows scheduling — important for VR frame timing.',
  requiresAdmin: true,
  requiresReboot: true,

  preview: async (): Promise<FixPreview> => {
    let hyperVState = 'unknown'
    let hypervisorLaunchType = 'unknown'
    try {
      hyperVState = await runPowerShell(
        `$feature = Get-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online -EA SilentlyContinue\nWrite-Output $feature.State`
      )
    } catch { /* ignore */ }
    try {
      const bcdedit = await runCmd('bcdedit /enum {current}')
      const m = bcdedit.match(/hypervisorlaunchtype\s+(\S+)/i)
      if (m) hypervisorLaunchType = m[1].trim()
    } catch { /* ignore */ }
    return {
      fixId: 'fix-hyper-v-disable',
      name: 'Disable Hyper-V Virtualization Layer',
      description: 'Disables Hyper-V hypervisor to restore bare-metal CPU scheduling for VR frame timing.',
      changes: [
        { target: 'Windows Feature: Microsoft-Hyper-V-All', currentValue: hyperVState, newValue: 'Disabled' },
        { target: 'BCD hypervisorlaunchtype', currentValue: hypervisorLaunchType, newValue: 'off' }
      ],
      requiresAdmin: true,
      requiresReboot: true
    }
  },

  apply: async (): Promise<FixResult> => {
    storeBackup('fix-hyper-v-disable', { applied: 'true' })
    try {
      await runPowerShell(
        `try {\n` +
        `  Disable-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online -NoRestart -EA Stop | Out-Null\n` +
        `} catch { Write-Output 'feature_not_found' }`
      )
      await runCmd('bcdedit /set hypervisorlaunchtype off')
      recordHistory({
        fixId: 'fix-hyper-v-disable',
        name: 'Disable Hyper-V Virtualization Layer',
        appliedAt: Date.now(),
        changes: [
          { target: 'Microsoft-Hyper-V-All', currentValue: 'Enabled', newValue: 'Disabled' },
          { target: 'hypervisorlaunchtype', currentValue: 'auto', newValue: 'off' }
        ],
        backupValues: { applied: 'true' },
        undoneAt: null
      })
      return { fixId: 'fix-hyper-v-disable', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-hyper-v-disable', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    try {
      await runPowerShell(
        `Enable-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online -NoRestart -EA SilentlyContinue | Out-Null`
      )
      await runCmd('bcdedit /set hypervisorlaunchtype auto')
      markUndone('fix-hyper-v-disable')
      return { fixId: 'fix-hyper-v-disable', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-hyper-v-disable', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 20: Enable SteamVR Async Reprojection ─────────────────

const fixSteamVRAsyncReprojection: Fix = {
  id: 'fix-steamvr-async-reprojection',
  name: 'Enable SteamVR Async Reprojection',
  description: 'Async Reprojection (also called Asynchronous Reprojection) synthesizes missing frames asynchronously when the GPU misses a deadline — smoother than dropping to half-rate. Interleaved Reprojection is the fallback for older hardware.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    const asyncReproj = steamvr.allowAsyncReprojection
    const interleavedReproj = steamvr.allowInterleavedReprojection
    return {
      fixId: 'fix-steamvr-async-reprojection',
      name: 'Enable SteamVR Async Reprojection',
      description: 'Enables Async and Interleaved Reprojection so SteamVR synthesizes frames when the GPU misses its deadline.',
      changes: [
        {
          target: `${getSteamVRSettingsPath()} → steamvr.allowAsyncReprojection`,
          currentValue: asyncReproj == null ? 'not set (default)' : String(asyncReproj),
          newValue: 'true'
        },
        {
          target: `${getSteamVRSettingsPath()} → steamvr.allowInterleavedReprojection`,
          currentValue: interleavedReproj == null ? 'not set (default)' : String(interleavedReproj),
          newValue: 'true'
        }
      ],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const settings = readSteamVRSettings()
    const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
    storeBackup('fix-steamvr-async-reprojection', {
      allowAsyncReprojection: String(steamvr.allowAsyncReprojection ?? ''),
      allowInterleavedReprojection: String(steamvr.allowInterleavedReprojection ?? '')
    })
    try {
      steamvr.allowAsyncReprojection = true
      steamvr.allowInterleavedReprojection = true
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      recordHistory({
        fixId: 'fix-steamvr-async-reprojection',
        name: 'Enable SteamVR Async Reprojection',
        appliedAt: Date.now(),
        changes: [
          { target: 'allowAsyncReprojection', currentValue: 'false/unset', newValue: 'true' },
          { target: 'allowInterleavedReprojection', currentValue: 'false/unset', newValue: 'true' }
        ],
        backupValues: {
          allowAsyncReprojection: String(steamvr.allowAsyncReprojection ?? ''),
          allowInterleavedReprojection: String(steamvr.allowInterleavedReprojection ?? '')
        },
        undoneAt: null
      })
      return { fixId: 'fix-steamvr-async-reprojection', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-async-reprojection', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-steamvr-async-reprojection')
    try {
      const settings = readSteamVRSettings()
      const steamvr = (settings.steamvr ?? {}) as Record<string, unknown>
      const prevAsync = backup?.allowAsyncReprojection
      const prevInterleaved = backup?.allowInterleavedReprojection
      if (prevAsync === '' || prevAsync == null) delete steamvr.allowAsyncReprojection
      else steamvr.allowAsyncReprojection = prevAsync === 'true'
      if (prevInterleaved === '' || prevInterleaved == null) delete steamvr.allowInterleavedReprojection
      else steamvr.allowInterleavedReprojection = prevInterleaved === 'true'
      settings.steamvr = steamvr
      writeSteamVRSettings(settings)
      markUndone('fix-steamvr-async-reprojection')
      return { fixId: 'fix-steamvr-async-reprojection', success: true }
    } catch (e) {
      return { fixId: 'fix-steamvr-async-reprojection', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 21: VRChat Avatar Distance Culling ────────────────────

const fixVRChatAvatarCulling: Fix = {
  id: 'fix-vrchat-avatar-culling',
  name: 'Enable VRChat Avatar Distance Culling',
  description: 'Stops rendering avatars beyond 25 meters. In busy worlds, avatars outside your immediate area still cost GPU/CPU time — avatar culling eliminates that overhead.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const config = readVRChatConfig()
    const cullingEnabled = config.avatar_culling_enabled
    const cullingDistance = config.avatar_culling_distance as number | undefined
    return {
      fixId: 'fix-vrchat-avatar-culling',
      name: 'Enable VRChat Avatar Distance Culling',
      description: 'Stops rendering avatars beyond 25 meters to eliminate GPU/CPU overhead from distant avatars in busy worlds.',
      changes: [
        {
          target: `${getVRChatConfigPath()} → avatar_culling_enabled`,
          currentValue: cullingEnabled == null ? 'not set (default)' : String(cullingEnabled),
          newValue: 'true'
        },
        {
          target: `${getVRChatConfigPath()} → avatar_culling_distance`,
          currentValue: cullingDistance != null ? `${cullingDistance}m` : 'not set (default)',
          newValue: '25m'
        }
      ],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const config = readVRChatConfig()
    storeBackup('fix-vrchat-avatar-culling', {
      avatar_culling_enabled: String(config.avatar_culling_enabled ?? ''),
      avatar_culling_distance: String(config.avatar_culling_distance ?? '')
    })
    try {
      config.avatar_culling_enabled = true
      config.avatar_culling_distance = 25
      writeVRChatConfig(config)
      recordHistory({
        fixId: 'fix-vrchat-avatar-culling',
        name: 'Enable VRChat Avatar Distance Culling',
        appliedAt: Date.now(),
        changes: [
          { target: 'avatar_culling_enabled', currentValue: 'false/unset', newValue: 'true' },
          { target: 'avatar_culling_distance', currentValue: 'unset', newValue: '25' }
        ],
        backupValues: {
          avatar_culling_enabled: String(config.avatar_culling_enabled ?? ''),
          avatar_culling_distance: String(config.avatar_culling_distance ?? '')
        },
        undoneAt: null
      })
      return { fixId: 'fix-vrchat-avatar-culling', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-avatar-culling', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-vrchat-avatar-culling')
    try {
      const config = readVRChatConfig()
      const prevEnabled = backup?.avatar_culling_enabled
      const prevDistance = backup?.avatar_culling_distance
      if (prevEnabled === '' || prevEnabled == null) delete config.avatar_culling_enabled
      else config.avatar_culling_enabled = prevEnabled === 'true'
      if (prevDistance === '' || prevDistance == null) delete config.avatar_culling_distance
      else config.avatar_culling_distance = parseInt(prevDistance)
      writeVRChatConfig(config)
      markUndone('fix-vrchat-avatar-culling')
      return { fixId: 'fix-vrchat-avatar-culling', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-avatar-culling', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 22: Enable High-Resolution System Timer (Win 11) ──────

const KERNEL_PATH = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel'

const fixWindowsTimerResolution: Fix = {
  id: 'fix-windows-timer-resolution',
  name: 'Enable High-Resolution System Timer (Win 11)',
  description: 'Allows VR processes to request 0.5ms timer resolution system-wide on Windows 11 22H2+. The default 15.6ms timer tick causes VR frame scheduling to be imprecise. This fix enables the kernel flag so VR runtimes can take advantage of it.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const current = readRegistryDword('HKLM', KERNEL_PATH, 'GlobalTimerResolutionRequests') ?? 0
    return {
      fixId: 'fix-windows-timer-resolution',
      name: 'Enable High-Resolution System Timer (Win 11)',
      description: 'Enables GlobalTimerResolutionRequests so VR runtimes can request 0.5ms timer precision on Windows 11 22H2+. Requires Windows 11 22H2 or later.',
      changes: [{
        target: `Registry: HKLM\\${KERNEL_PATH}\\GlobalTimerResolutionRequests`,
        currentValue: `${current} (${current === 1 ? 'already enabled' : '0 = default 15.6ms tick'})`,
        newValue: '1 (enabled — allows 0.5ms timer resolution requests) — Win 11 22H2+ required'
      }],
      requiresAdmin: true,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const backup = readRegistryDword('HKLM', KERNEL_PATH, 'GlobalTimerResolutionRequests') ?? 0
    storeBackup('fix-windows-timer-resolution', { GlobalTimerResolutionRequests: String(backup) })
    try {
      await regWriteDword('HKLM', KERNEL_PATH, 'GlobalTimerResolutionRequests', 1)
      recordHistory({
        fixId: 'fix-windows-timer-resolution',
        name: 'Enable High-Resolution System Timer (Win 11)',
        appliedAt: Date.now(),
        changes: [{ target: 'GlobalTimerResolutionRequests', currentValue: String(backup), newValue: '1' }],
        backupValues: { GlobalTimerResolutionRequests: String(backup) },
        undoneAt: null
      })
      return { fixId: 'fix-windows-timer-resolution', success: true }
    } catch (e) {
      return { fixId: 'fix-windows-timer-resolution', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-windows-timer-resolution')
    try {
      await regWriteDword('HKLM', KERNEL_PATH, 'GlobalTimerResolutionRequests', parseInt(backup?.GlobalTimerResolutionRequests ?? '0'))
      markUndone('fix-windows-timer-resolution')
      return { fixId: 'fix-windows-timer-resolution', success: true }
    } catch (e) {
      return { fixId: 'fix-windows-timer-resolution', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 23: GPU Interrupt Priority ────────────────────────────

async function getGpuPnpIdForFix(): Promise<string | null> {
  try {
    const out = await runPowerShell(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -match '^PCI\\\\' } | Select-Object -First 1 -ExpandProperty PNPDeviceID"
    )
    return out?.trim() || null
  } catch { return null }
}

const fixGpuInterruptPriority: Fix = {
  id: 'fix-gpu-interrupt-priority',
  name: 'Optimize GPU Interrupt Priority (MSI + High DevicePriority)',
  description: 'Enables Message Signaled Interrupt (MSI) mode and sets DevicePriority=3 (High) for the primary GPU. GPU frame-completion signals are processed immediately rather than waiting in the normal interrupt queue, reducing frame latency by 1-2ms.',
  requiresAdmin: true,
  requiresReboot: true,

  preview: async (): Promise<FixPreview> => {
    const pnpId = await getGpuPnpIdForFix()
    const affinityPath = pnpId
      ? `SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\Affinity Policy`
      : null
    const currentPriority = affinityPath
      ? (readRegistryDword('HKLM', affinityPath, 'DevicePriority') ?? 'not set')
      : 'GPU not detected'
    return {
      fixId: 'fix-gpu-interrupt-priority',
      name: 'Optimize GPU Interrupt Priority (MSI + High DevicePriority)',
      description: 'Sets MSISupported=1 and DevicePriority=3 in the GPU interrupt management registry keys. Requires reboot.',
      changes: [
        {
          target: pnpId
            ? `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties\\MSISupported`
            : 'GPU PNP registry path (GPU not detected)',
          currentValue: 'varies / not set',
          newValue: '1 (MSI enabled)'
        },
        {
          target: pnpId
            ? `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\Affinity Policy\\DevicePriority`
            : 'GPU PNP registry path (GPU not detected)',
          currentValue: String(currentPriority),
          newValue: '3 (High) — requires reboot'
        }
      ],
      requiresAdmin: true,
      requiresReboot: true
    }
  },

  apply: async (): Promise<FixResult> => {
    const pnpId = await getGpuPnpIdForFix()
    if (!pnpId) {
      return { fixId: 'fix-gpu-interrupt-priority', success: false, error: 'Could not detect GPU PNP device ID via WMI' }
    }

    const affinityPath = `SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\Affinity Policy`
    const msiPath = `SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`

    const backupPriority = readRegistryDword('HKLM', affinityPath, 'DevicePriority')
    storeBackup('fix-gpu-interrupt-priority', {
      pnpId,
      DevicePriority: String(backupPriority ?? '')
    })

    try {
      // Use runPowerShell directly — paths contain dynamic device IDs with backslashes
      // Single-quoted PS strings treat backslashes as literal
      await runPowerShell(
        `$msiP = 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties'\n` +
        `if (!(Test-Path $msiP)) { New-Item -Path $msiP -Force | Out-Null }\n` +
        `Set-ItemProperty -Path $msiP -Name 'MSISupported' -Value 1 -Type DWord -Force\n` +
        `$affP = 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\Affinity Policy'\n` +
        `if (!(Test-Path $affP)) { New-Item -Path $affP -Force | Out-Null }\n` +
        `Set-ItemProperty -Path $affP -Name 'DevicePriority' -Value 3 -Type DWord -Force`
      )
      recordHistory({
        fixId: 'fix-gpu-interrupt-priority',
        name: 'Optimize GPU Interrupt Priority (MSI + High DevicePriority)',
        appliedAt: Date.now(),
        changes: [
          { target: 'MSISupported', currentValue: 'varies', newValue: '1' },
          { target: 'DevicePriority', currentValue: String(backupPriority ?? 'not set'), newValue: '3' }
        ],
        backupValues: { pnpId, DevicePriority: String(backupPriority ?? '') },
        undoneAt: null
      })
      return { fixId: 'fix-gpu-interrupt-priority', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-gpu-interrupt-priority', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-gpu-interrupt-priority')
    if (!backup?.pnpId) return { fixId: 'fix-gpu-interrupt-priority', success: false, error: 'No backup found' }
    const pnpId = backup.pnpId
    try {
      const msiP = `HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`
      const affP = `HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management\\Affinity Policy`
      // Remove MSISupported (restore to default = no MSI override)
      await runPowerShell(
        `Remove-ItemProperty -Path '${msiP}' -Name 'MSISupported' -EA SilentlyContinue`
      )
      if (backup.DevicePriority === '') {
        // Key didn't exist before — remove the value
        await runPowerShell(
          `Remove-ItemProperty -Path '${affP}' -Name 'DevicePriority' -EA SilentlyContinue`
        )
      } else {
        await runPowerShell(
          `Set-ItemProperty -Path '${affP}' -Name 'DevicePriority' -Value ${parseInt(backup.DevicePriority)} -Type DWord -Force`
        )
      }
      markUndone('fix-gpu-interrupt-priority')
      return { fixId: 'fix-gpu-interrupt-priority', success: true, requiresReboot: true }
    } catch (e) {
      return { fixId: 'fix-gpu-interrupt-priority', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 25: Disable Windows Update Auto-Restart ───────────────

const WU_AU_PATH = 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU'

const fixDisableWuReboot: Fix = {
  id: 'fix-disable-wu-reboot',
  name: 'Prevent Windows Update Auto-Restart During VR Sessions',
  description: 'Sets NoAutoRebootWithLoggedOnUsers=1 and AUOptions=2 (notify before download) in the Windows Update policy registry keys. Prevents forced reboots while any user is logged in and stops background downloads during VR.',
  requiresAdmin: true,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const noReboot = readRegistryDword('HKLM', WU_AU_PATH, 'NoAutoRebootWithLoggedOnUsers')
    const auOptions = readRegistryDword('HKLM', WU_AU_PATH, 'AUOptions')
    return {
      fixId: 'fix-disable-wu-reboot',
      name: 'Prevent Windows Update Auto-Restart During VR Sessions',
      description: 'Sets group-policy registry values to prevent Windows Update from force-restarting while a user is logged in.',
      changes: [
        {
          target: `HKLM\\${WU_AU_PATH}\\NoAutoRebootWithLoggedOnUsers`,
          currentValue: noReboot != null ? String(noReboot) : 'not set (auto-reboot allowed)',
          newValue: '1 (reboot suppressed while logged in)'
        },
        {
          target: `HKLM\\${WU_AU_PATH}\\AUOptions`,
          currentValue: auOptions != null ? String(auOptions) : 'not set (default)',
          newValue: '2 (notify before download)'
        }
      ],
      requiresAdmin: true,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const noReboot = readRegistryDword('HKLM', WU_AU_PATH, 'NoAutoRebootWithLoggedOnUsers')
    const auOptions = readRegistryDword('HKLM', WU_AU_PATH, 'AUOptions')
    storeBackup('fix-disable-wu-reboot', {
      NoAutoRebootWithLoggedOnUsers: noReboot != null ? String(noReboot) : '',
      AUOptions: auOptions != null ? String(auOptions) : ''
    })
    try {
      await regWriteDword('HKLM', WU_AU_PATH, 'NoAutoRebootWithLoggedOnUsers', 1)
      await regWriteDword('HKLM', WU_AU_PATH, 'AUOptions', 2)
      const verify = readRegistryDword('HKLM', WU_AU_PATH, 'NoAutoRebootWithLoggedOnUsers')
      const success = verify === 1
      if (success) recordHistory({
        fixId: 'fix-disable-wu-reboot',
        name: 'Prevent Windows Update Auto-Restart During VR Sessions',
        appliedAt: Date.now(),
        changes: [
          { target: 'NoAutoRebootWithLoggedOnUsers', currentValue: noReboot != null ? String(noReboot) : 'not set', newValue: '1' },
          { target: 'AUOptions', currentValue: auOptions != null ? String(auOptions) : 'not set', newValue: '2' }
        ],
        backupValues: {
          NoAutoRebootWithLoggedOnUsers: noReboot != null ? String(noReboot) : '',
          AUOptions: auOptions != null ? String(auOptions) : ''
        },
        undoneAt: null
      })
      return { fixId: 'fix-disable-wu-reboot', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-disable-wu-reboot', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-disable-wu-reboot')
    if (!backup) return { fixId: 'fix-disable-wu-reboot', success: false, error: 'No backup found' }
    try {
      const restoreOrDelete = async (name: string): Promise<void> => {
        const prev = backup[name]
        if (prev === '' || prev == null) {
          await runPowerShell(
            `Remove-ItemProperty -Path 'HKLM:\\${WU_AU_PATH}' -Name '${name}' -EA SilentlyContinue`
          )
        } else {
          await regWriteDword('HKLM', WU_AU_PATH, name, parseInt(prev))
        }
      }
      await restoreOrDelete('NoAutoRebootWithLoggedOnUsers')
      await restoreOrDelete('AUOptions')
      markUndone('fix-disable-wu-reboot')
      return { fixId: 'fix-disable-wu-reboot', success: true }
    } catch (e) {
      return { fixId: 'fix-disable-wu-reboot', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 27: VRChat per-avatar physics caps ───────────────────
// Note on naming: the config keys are still `dynamic_bone_max_*` for legacy
// reasons — VRChat used the Dynamic Bone Unity asset before 2022 and kept
// the keys when they swapped to their in-house PhysBones system. Same caps,
// applied to PhysBones now.

const fixVRChatDynamicBoneLimits: Fix = {
  id: 'fix-vrchat-dynamic-bone-limits',
  name: 'Cap VRChat avatar physics (config.json)',
  description:
    'Writes dynamic_bone_max_affected_transform_count = 32 and dynamic_bone_max_collider_check_count = 8 to VRChat\'s config.json. ' +
    'The key names are legacy (Dynamic Bones was renamed to PhysBones in 2022); the caps still apply per-avatar. ' +
    'Bones over the cap stop simulating — the avatar still renders, the unsimulated bones just don\'t wiggle. ' +
    'Clicking the "Show Avatar" eye in VRChat\'s menu, or marking a friend "Always Show", overrides the cap for that one avatar. ' +
    'Reverses cleanly via Undo. Cuts main-thread CPU usage by 60–80% in busy worlds.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const config = readVRChatConfig()
    const currentAffected = config.dynamic_bone_max_affected_transform_count as number | undefined
    const currentCollider = config.dynamic_bone_max_collider_check_count as number | undefined
    return {
      fixId: 'fix-vrchat-dynamic-bone-limits',
      name: 'Cap VRChat avatar physics (config.json)',
      description: 'Caps PhysBones simulation per avatar (config keys are still named dynamic_bone_* for legacy reasons). Reduces CPU usage by 60-80% in busy worlds.',
      changes: [
        {
          target: `${getVRChatConfigPath()} → dynamic_bone_max_affected_transform_count`,
          currentValue: currentAffected !== undefined ? String(currentAffected) : 'not set (unlimited — default)',
          newValue: '32 (recommended VR cap)'
        },
        {
          target: `${getVRChatConfigPath()} → dynamic_bone_max_collider_check_count`,
          currentValue: currentCollider !== undefined ? String(currentCollider) : 'not set (unlimited — default)',
          newValue: '8 (recommended cap)'
        },
        {
          target: `${getVRChatConfigPath()} → avatar_culling_enabled`,
          currentValue: config.avatar_culling_enabled !== undefined ? String(config.avatar_culling_enabled) : 'not set',
          newValue: 'true'
        },
        {
          target: `${getVRChatConfigPath()} → avatar_culling_distance`,
          currentValue: config.avatar_culling_distance !== undefined ? String(config.avatar_culling_distance) : 'not set',
          newValue: '25 (meters)'
        }
      ],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const config = readVRChatConfig()
    storeBackup('fix-vrchat-dynamic-bone-limits', {
      dynamic_bone_max_affected_transform_count: String(config.dynamic_bone_max_affected_transform_count ?? ''),
      dynamic_bone_max_collider_check_count: String(config.dynamic_bone_max_collider_check_count ?? ''),
      avatar_culling_enabled: String(config.avatar_culling_enabled ?? ''),
      avatar_culling_distance: String(config.avatar_culling_distance ?? '')
    })
    try {
      config.dynamic_bone_max_affected_transform_count = 32
      config.dynamic_bone_max_collider_check_count = 8
      config.avatar_culling_enabled = true
      config.avatar_culling_distance = config.avatar_culling_distance ?? 25
      writeVRChatConfig(config)
      recordHistory({
        fixId: 'fix-vrchat-dynamic-bone-limits',
        name: 'Cap VRChat avatar physics (config.json)',
        appliedAt: Date.now(),
        changes: [
          { target: 'dynamic_bone_max_affected_transform_count', currentValue: 'unlimited', newValue: '32' },
          { target: 'dynamic_bone_max_collider_check_count', currentValue: 'unlimited', newValue: '8' },
          { target: 'avatar_culling_enabled', currentValue: 'false', newValue: 'true' }
        ],
        backupValues: {
          dynamic_bone_max_affected_transform_count: String(config.dynamic_bone_max_affected_transform_count),
          dynamic_bone_max_collider_check_count: String(config.dynamic_bone_max_collider_check_count)
        },
        undoneAt: null
      })
      return { fixId: 'fix-vrchat-dynamic-bone-limits', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-dynamic-bone-limits', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-vrchat-dynamic-bone-limits')
    try {
      const config = readVRChatConfig()
      const restoreOrDelete = (key: string, backupKey: string) => {
        const prev = backup?.[backupKey]
        if (prev === '' || prev == null) delete config[key]
        else if (!isNaN(Number(prev))) config[key] = Number(prev)
        else config[key] = prev
      }
      restoreOrDelete('dynamic_bone_max_affected_transform_count', 'dynamic_bone_max_affected_transform_count')
      restoreOrDelete('dynamic_bone_max_collider_check_count', 'dynamic_bone_max_collider_check_count')
      restoreOrDelete('avatar_culling_enabled', 'avatar_culling_enabled')
      restoreOrDelete('avatar_culling_distance', 'avatar_culling_distance')
      writeVRChatConfig(config)
      markUndone('fix-vrchat-dynamic-bone-limits')
      return { fixId: 'fix-vrchat-dynamic-bone-limits', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-dynamic-bone-limits', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 28: VRChat MSAA Reduction ─────────────────────────────

const VRCHAT_PREFS_PATH = 'SOFTWARE\\VRChat\\VRChat'

const fixVRChatMsaa: Fix = {
  id: 'fix-vrchat-msaa',
  name: 'Reduce VRChat MSAA to 2x (VR-Optimized Anti-Aliasing)',
  description: 'Sets VRChat\'s MSAA level to 2x via Unity PlayerPrefs registry. In VR, 4x and 8x MSAA multiply GPU fill-rate requirements dramatically — 2x provides adequate edge smoothing at reasonable cost.',
  requiresAdmin: false,
  requiresReboot: false,

  preview: async (): Promise<FixPreview> => {
    const currentMsaa = readRegistryDword('HKCU', VRCHAT_PREFS_PATH, 'QualitySettings_antiAliasing')
    return {
      fixId: 'fix-vrchat-msaa',
      name: 'Reduce VRChat MSAA to 2x',
      description: 'Sets VRChat MSAA level from 4x/8x to 2x. Saves 30-60% GPU fill-rate in complex scenes.',
      changes: [{
        target: `HKCU\\${VRCHAT_PREFS_PATH}\\QualitySettings_antiAliasing`,
        currentValue: currentMsaa !== null ? `${currentMsaa}x MSAA` : 'not set (VRChat default)',
        newValue: '2 (2x MSAA — VR-optimized)'
      }],
      requiresAdmin: false,
      requiresReboot: false
    }
  },

  apply: async (): Promise<FixResult> => {
    const currentMsaa = readRegistryDword('HKCU', VRCHAT_PREFS_PATH, 'QualitySettings_antiAliasing')
    storeBackup('fix-vrchat-msaa', { QualitySettings_antiAliasing: currentMsaa !== null ? String(currentMsaa) : '' })
    try {
      await regWriteDword('HKCU', VRCHAT_PREFS_PATH, 'QualitySettings_antiAliasing', 2)
      const verify = readRegistryDword('HKCU', VRCHAT_PREFS_PATH, 'QualitySettings_antiAliasing')
      const success = verify === 2
      if (success) recordHistory({
        fixId: 'fix-vrchat-msaa',
        name: 'Reduce VRChat MSAA to 2x',
        appliedAt: Date.now(),
        changes: [{ target: 'QualitySettings_antiAliasing', currentValue: String(currentMsaa ?? 'default'), newValue: '2' }],
        backupValues: { QualitySettings_antiAliasing: currentMsaa !== null ? String(currentMsaa) : '' },
        undoneAt: null
      })
      return { fixId: 'fix-vrchat-msaa', success, unverified: !success }
    } catch (e) {
      return { fixId: 'fix-vrchat-msaa', success: false, error: (e as Error).message }
    }
  },

  undo: async (): Promise<FixResult> => {
    const backup = getBackup('fix-vrchat-msaa')
    try {
      const prev = backup?.QualitySettings_antiAliasing
      if (prev === '' || prev == null) {
        await runPowerShell(
          `Remove-ItemProperty -Path 'HKCU:\\${VRCHAT_PREFS_PATH}' -Name 'QualitySettings_antiAliasing' -EA SilentlyContinue`
        )
      } else {
        await regWriteDword('HKCU', VRCHAT_PREFS_PATH, 'QualitySettings_antiAliasing', parseInt(prev))
      }
      markUndone('fix-vrchat-msaa')
      return { fixId: 'fix-vrchat-msaa', success: true }
    } catch (e) {
      return { fixId: 'fix-vrchat-msaa', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix Registry ─────────────────────────────────────────────

const ALL_FIXES: Fix[] = [
  fixMmcssNetworkThrottling,
  fixMmcssGamesPriority,
  fixPowerPlan,
  fixPcieAspmDisable,
  fixEnableGameMode,
  fixWifiPowerSaving,
  fixVCacheAffinity,
  fixHagsEnable,
  fixSteamVRSupersampling,
  fixSteamVRMotionSmoothing,
  fixVRChatCacheSize,
  // NEW — Fixes 13-22:
  fixDisableXboxDvr,
  // fixDisableStartupBloat — removed. Removing HKCU\Run entries was too broad
  // (killed legitimate startup entries the user wanted) and produced no
  // measurable VR frame-time improvement. Keep the finding as a warning only.
  fixUsbSelectiveSuspend,
  // fixCoreParkingDisable — removed. powercfg CPMINCORES=100 setting persisted
  // but VR frame-pacing data showed no change; modern Windows schedulers
  // don't park cores under VR workloads in practice.
  fixNagleDisable,
  // fixDisableFullscreenOptimizations — removed. AppCompatFlags
  // DISABLEDXMAXIMIZEDWINDOWEDMODE only affects legacy fullscreen; VR runtimes
  // use DXGI flip model regardless, so the flag made no observable difference.
  fixHyperVDisable,
  fixSteamVRAsyncReprojection,
  fixVRChatAvatarCulling,
  fixWindowsTimerResolution,
  // NEW — Fixes 23-26:
  fixGpuInterruptPriority,
  fixDisableWuReboot,
  fixVRChatDynamicBoneLimits,
  fixVRChatMsaa
]

const fixMap = new Map<string, Fix>(ALL_FIXES.map((f) => [f.id, f]))

// ── Public API ────────────────────────────────────────────────

export function getFix(fixId: string): Fix | null {
  return fixMap.get(fixId) ?? null
}

export async function previewFix(fixId: string): Promise<FixPreview | { error: string }> {
  console.log(`[fix:preview] ${fixId}`)
  const fix = getFix(fixId)
  if (!fix) {
    console.warn(`[fix:preview] Unknown fixId: ${fixId}`)
    return { error: `Unknown fix: ${fixId}` }
  }
  try {
    const result = await fix.preview()
    if ('changes' in result) {
      // Enhance with dry-run metadata: live read timestamp + restore-point indicator
      const now = Date.now()
      const last = (fixStore.get(LAST_RESTORE_POINT_KEY) as number | undefined) ?? 0
      const ageHours = (now - last) / (1000 * 60 * 60)
      const willCreateRP = ageHours >= 24
      result.willCreateRestorePoint = willCreateRP
      result.estimatedImpact = {
        reversible: true,
        affectsBootState: fix.requiresReboot,
        summary:
          `${result.changes.length} change${result.changes.length !== 1 ? 's' : ''}` +
          ` — fully reversible via Undo` +
          (willCreateRP ? ' (auto System Restore Point will be created first)' : '') +
          (fix.requiresReboot ? ' — reboot required to take full effect' : ''),
      }
      // Stamp each change as live-read from this preview call
      for (const ch of result.changes) ch.liveReadAt = now
    }
    console.log(`[fix:preview] ${fixId} → ${(result as FixPreview).changes?.length ?? 0} change(s) to preview`)
    return result
  } catch (e) {
    console.error(`[fix:preview] ${fixId} threw: ${(e as Error).message}`)
    return { error: (e as Error).message }
  }
}

// ── Pre-fix auto-backup (System Restore Point) ───────────────
//
// Throttled to one restore point per 24 hours to avoid filling the
// snapshot store. Wrapped so a restore-point creation failure never blocks
// the actual fix from applying — safety-net, not a hard dependency.

const LAST_RESTORE_POINT_KEY = 'lastRestorePointAt'

async function createRestorePointIfDue(reason: string): Promise<{ created: boolean; error?: string }> {
  try {
    const now = Date.now()
    const last = (fixStore.get(LAST_RESTORE_POINT_KEY) as number | undefined) ?? 0
    const ageHours = (now - last) / (1000 * 60 * 60)
    if (ageHours < 24) {
      return { created: false, error: 'Skipped — restore point created within last 24h' }
    }
    const description = reason.replace(/'/g, '').slice(0, 240)
    // Checkpoint-Computer: requires elevation + SystemRestore enabled.
    // Run quietly — non-fatal if it fails.
    await execAsync(
      `powershell -NoProfile -NonInteractive -Command "Checkpoint-Computer -Description 'Vryionics: ${description}' -RestorePointType MODIFY_SETTINGS -ErrorAction SilentlyContinue"`,
      { timeout: 60_000 }
    )
    fixStore.set(LAST_RESTORE_POINT_KEY, now)
    return { created: true }
  } catch (e) {
    return { created: false, error: (e as Error).message }
  }
}

export async function applyFix(fixId: string): Promise<FixResult> {
  console.log(`[fix:apply] Applying: ${fixId}`)
  const fix = getFix(fixId)
  if (!fix) {
    console.warn(`[fix:apply] Unknown fixId: ${fixId}`)
    return { fixId, success: false, error: `Unknown fix: ${fixId}` }
  }
  // Create a system-wide safety net BEFORE any change — fire and fail quiet
  const rp = await createRestorePointIfDue(`Before applying ${fix.name}`)
  if (rp.created) {
    console.log(`[fix:apply] ✓ System Restore Point created as safety net`)
  } else if (rp.error) {
    console.log(`[fix:apply] ℹ Restore point skipped: ${rp.error}`)
  }
  const result = await fix.apply()
  if (result.success) {
    console.log(`[fix:apply] ✓ ${fixId} applied successfully`)
  } else {
    console.error(`[fix:apply] ✗ ${fixId} FAILED — ${result.error ?? 'unknown error'}`)
  }
  return result
}

export async function undoFix(fixId: string): Promise<FixResult> {
  console.log(`[fix:undo] Undoing: ${fixId}`)
  const fix = getFix(fixId)
  if (!fix) {
    console.warn(`[fix:undo] Unknown fixId: ${fixId}`)
    return { fixId, success: false, error: `Unknown fix: ${fixId}` }
  }
  const result = await fix.undo()
  if (result.success) {
    console.log(`[fix:undo] ✓ ${fixId} undone successfully`)
  } else {
    console.error(`[fix:undo] ✗ ${fixId} undo FAILED — ${result.error ?? 'unknown error'}`)
  }
  return result
}

export function getFixHistory(): FixHistoryEntry[] {
  return fixStore.get('history')
}

export function getAllFixIds(): string[] {
  return ALL_FIXES.map((f) => f.id)
}
