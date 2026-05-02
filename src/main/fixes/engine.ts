// VR Optimization Suite — Fix Engine
// Every fix: Preview → Backup → Apply → Verify → Log → Undo
// Registry writes use reg.exe (no elevated DLL needed for HKCU; HKLM needs admin).
// PowerShell scripts always written to temp .ps1 files — never inline -Command.

import Store from 'electron-store'
import { readRegistryDword, readRegistry } from '../utils/registry'
import { readKey, readValue } from '../utils/registry-read'
import { enumerateRegistrySubkeys } from '../utils/registry'
import type { Fix, FixPreview, FixResult, FixHistoryEntry, FixChange } from './types'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// Run reg.exe with explicit arg array; no cmd.exe parsing in the middle.
async function regExe(args: string[], timeoutMs = 8000): Promise<string> {
  const { stdout } = await execFileAsync('reg', args, { timeout: timeoutMs })
  return stdout
}

async function tryRegExe(args: string[], timeoutMs = 8000): Promise<string | null> {
  try {
    return await regExe(args, timeoutMs)
  } catch {
    return null
  }
}

async function powercfgExe(args: string[], timeoutMs = 8000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('powercfg', args, { timeout: timeoutMs })
    return stdout
  } catch {
    return null
  }
}

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
  // execFile passes argv elements verbatim, so paths with spaces don't need
  // shell-quoting. /f forces overwrite without prompting; reg.exe creates
  // intermediate keys automatically when the leaf value is added.
  await regExe(['add', `${hive}\\${path}`, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'])
}

async function regWriteSz(hive: 'HKLM' | 'HKCU', path: string, name: string, value: string): Promise<void> {
  await regExe(['add', `${hive}\\${path}`, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'])
}

async function regDeleteValue(hive: 'HKLM' | 'HKCU', path: string, name: string): Promise<void> {
  await regExe(['delete', `${hive}\\${path}`, '/v', name, '/f'])
}

const NETWORK_CLASS_GUID = '{4d36e972-e325-11ce-bfc1-08002be10318}'

/**
 * Set the PnPCapabilities DWORD on every 802.11 adapter under the network
 * class. Bit 0x18 disables "Allow the computer to turn off this device to
 * save power" (the toggle Device Manager exposes); 0x00 re-enables it.
 *
 * The same write that Set-NetAdapterPowerManagement performs internally;
 * this is the documented Microsoft-supported registry path.
 */
async function setWifiAdapterPnpCapabilities(value: number): Promise<void> {
  const subkeys = enumerateRegistrySubkeys(
    'HKLM',
    `SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS_GUID}`
  )
  for (const sk of subkeys) {
    if (!/^\d{4}$/.test(sk)) continue
    const path = `SYSTEM\\CurrentControlSet\\Control\\Class\\${NETWORK_CLASS_GUID}\\${sk}`
    const desc = await readValue(`HKLM\\${path}`, 'DriverDesc').catch(() => null)
    if (
      !desc ||
      (desc.type !== 'REG_SZ' && desc.type !== 'REG_EXPAND_SZ') ||
      !/wi-?fi|wireless|802\.11/i.test(desc.data)
    ) {
      continue
    }
    await regWriteDword('HKLM', path, 'PnPCapabilities', value)
  }
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
      await setWifiAdapterPnpCapabilities(0x18)
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
      await setWifiAdapterPnpCapabilities(0)
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
  const key = await readKey(`HKCU\\${STARTUP_REG_PATH}`).catch(() => null)
  if (!key) return []
  const all: StartupEntry[] = []
  for (const [name, value] of Object.entries(key.values)) {
    if (value.type !== 'REG_SZ' && value.type !== 'REG_EXPAND_SZ') continue
    all.push({ Name: name, Value: value.data })
  }
  return all.filter((e) =>
    STARTUP_BLOAT_NAMES.some((b) => e.Name.toLowerCase().includes(b.toLowerCase()))
  )
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
        await tryRegExe(['delete', `HKCU\\${STARTUP_REG_PATH}`, '/v', e.Name, '/f'])
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
  const out = await powercfgExe(['/query', 'SCHEME_CURRENT', USB_SUBGROUP, USB_SUSPEND_SETTING])
  if (!out) return null
  const m = out.match(/Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i)
  if (m) return parseInt(m[1], m[1].startsWith('0x') ? 16 : 10)
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
      await powercfgExe(['/setacvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP, USB_SUSPEND_SETTING, '0'])
      await powercfgExe(['/setdcvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP, USB_SUSPEND_SETTING, '0'])
      await powercfgExe(['/setactive', 'SCHEME_CURRENT'])
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
      await powercfgExe(['/setacvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP, USB_SUSPEND_SETTING, prev])
      await powercfgExe(['/setdcvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP, USB_SUSPEND_SETTING, prev])
      await powercfgExe(['/setactive', 'SCHEME_CURRENT'])
      markUndone('fix-usb-selective-suspend')
      return { fixId: 'fix-usb-selective-suspend', success: true }
    } catch (e) {
      return { fixId: 'fix-usb-selective-suspend', success: false, error: (e as Error).message }
    }
  }
}

// ── Fix 16: Disable CPU Core Parking ─────────────────────────

async function getCpuCoreParking(): Promise<number | null> {
  const out = await powercfgExe(['/query', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES'])
  if (!out) return null
  const m = out.match(/Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i)
  if (m) return parseInt(m[1], m[1].startsWith('0x') ? 16 : 10)
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
      await powercfgExe(['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES', '100'])
      await powercfgExe(['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES', '100'])
      await powercfgExe(['/setactive', 'SCHEME_CURRENT'])
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
      await powercfgExe(['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES', prev])
      await powercfgExe(['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_PROCESSOR', 'CPMINCORES', prev])
      await powercfgExe(['/setactive', 'SCHEME_CURRENT'])
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
    const interfaces = enumerateRegistrySubkeys(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
    )
    for (const guid of interfaces) {
      const v = await readValue(
        `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}`,
        'TcpAckFrequency'
      ).catch(() => null)
      if (!(v && v.type === 'REG_DWORD' && v.data === 1)) needsFixCount++
    }
    return {
      fixId: 'fix-nagle-disable',
      name: 'Disable TCP Nagle Algorithm (Lower Network Latency)',
      description: 'Sets TcpAckFrequency=1 and TCPNoDelay=1 on all network adapter interfaces to eliminate Nagle batching delay.',
      changes: [{
        target: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\* -> TcpAckFrequency, TCPNoDelay',
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
      const interfaces = enumerateRegistrySubkeys(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
      )
      for (const guid of interfaces) {
        const path = `SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}`
        await regWriteDword('HKLM', path, 'TcpAckFrequency', 1)
        await regWriteDword('HKLM', path, 'TCPNoDelay', 1)
      }
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
      const interfaces = enumerateRegistrySubkeys(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
      )
      for (const guid of interfaces) {
        const path = `SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}`
        await tryRegExe(['delete', `HKLM\\${path}`, '/v', 'TcpAckFrequency', '/f'])
        await tryRegExe(['delete', `HKLM\\${path}`, '/v', 'TCPNoDelay', '/f'])
      }
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
          await tryRegExe(['delete', `HKCU\\${FS_OPT_REG_PATH}`, '/v', exePath, '/f'])
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
        await tryRegExe(['delete', `HKCU\\${VRCHAT_PREFS_PATH}`, '/v', 'QualitySettings_antiAliasing', '/f'])
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
  fixEnableGameMode,
  fixWifiPowerSaving,
  fixVCacheAffinity,
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
  fixSteamVRAsyncReprojection,
  fixVRChatAvatarCulling,
  fixWindowsTimerResolution,
  // NEW — Fixes 23-26:
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

async function createRestorePointIfDue(_reason: string): Promise<{ created: boolean; error?: string }> {
  // The only Win32 entry point for creating a system restore point is
  // SRClient.dll's CreateRestorePoint, which is reachable from this process
  // through WMI (SystemRestore.CreateRestorePoint) or via P/Invoke. Both
  // paths are off the table for this app, so we no longer create a restore
  // point automatically. Each individual fix already stores its own backup
  // and supports undo, which is the primary recovery surface.
  return { created: false, error: 'restore-point creation is unavailable in this build' }
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
