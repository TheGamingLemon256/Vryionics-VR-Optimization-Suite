// VR Optimization Suite — Steam VR Game Scanner
// Finds installed VR games in Steam libraries and checks their settings.

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { readRegistry } from '../../utils/registry'


export interface VRGameSetting {
  key: string
  label: string
  currentValue: string | number | boolean | null
  recommendedValue: string | number | boolean
  isOptimal: boolean
  fixDescription: string
  canAutoFix: boolean
  fixId?: string  // links to a fix in engine.ts if auto-fixable
}

export interface VRGameInfo {
  appId: string
  name: string
  installDir: string
  settingsFile: string | null
  settings: VRGameSetting[]
  hasIssues: boolean
}

export interface SteamGamesResult {
  steamInstalled: boolean
  steamPath: string | null
  libraryPaths: string[]
  vrGames: VRGameInfo[]
  scannedAt: number
}


const KNOWN_VR_GAME_IDS: Record<string, string> = {
  '438100': 'VRChat',
  '620980': 'Beat Saber',
  '450390': 'The Lab',
  '1059990': 'Boneworks',
  '1592190': 'Bonelab',
  '250820': 'SteamVR',
  '1386390': 'Phasmophobia',
  '1053750': 'Half-Life: Alyx',
  '552440': 'SUPERHOT VR',
  '457550': 'Moss',
  '546560': 'Lone Echo',
  '1874840': 'Lone Echo 2',
  '823500': 'Blade and Sorcery',
  '617830': 'Arizona Sunshine',
  '691440': "No Man's Sky",
  '1167630': 'Synth Riders',
  '1091380': 'Onward',
  '1128920': 'Audica',
  '1060710': 'Star Trek: Bridge Crew',
  '620': 'Portal 2 (VR via SteamVR)',
  '976730': 'Halo: The Master Chief Collection',
}


function findSteamPath(): string | null {
  try {
    const regPath = readRegistry('HKCU', 'SOFTWARE\\Valve\\Steam', 'SteamPath')
    if (regPath) {
      const normalized = regPath.replace(/\//g, '\\')
      if (existsSync(normalized)) return normalized
    }
  } catch { /* ignore */ }

  for (const p of [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    join(homedir(), 'Steam'),
  ]) {
    if (existsSync(p)) return p
  }
  return null
}


function getLibraryPaths(steamPath: string): string[] {
  const paths: string[] = [join(steamPath, 'steamapps')]

  const vdfPath = join(steamPath, 'config', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return paths

  try {
    const content = readFileSync(vdfPath, 'utf8')
    const pathRegex = /"path"\s+"([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = pathRegex.exec(content)) !== null) {
      const libPath = join(match[1].replace(/\\\\/g, '\\'), 'steamapps')
      if (existsSync(libPath) && !paths.includes(libPath)) {
        paths.push(libPath)
      }
    }
  } catch { /* ignore */ }

  return paths
}


interface AppManifest {
  appId: string
  name: string
  installDir: string
}

function parseACF(content: string): AppManifest | null {
  const appIdMatch = content.match(/"appid"\s+"(\d+)"/i)
  const nameMatch = content.match(/"name"\s+"([^"]+)"/i)
  const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/i)
  if (!appIdMatch || !nameMatch || !installDirMatch) return null
  return {
    appId: appIdMatch[1],
    name: nameMatch[1],
    installDir: installDirMatch[1],
  }
}


function checkVRChatSettings(_installDir: string): { settingsFile: string | null; settings: VRGameSetting[] } {
  const configPath = join(homedir(), 'AppData', 'LocalLow', 'VRChat', 'VRChat', 'config.json')
  const fileExists = existsSync(configPath)

  // Always return settings — even if config.json doesn't exist yet.
  // VRChat does NOT auto-create config.json; it only appears if the user has
  // manually configured settings. We still surface recommendations with null
  // current values so the Fix button can create the file from scratch.
  let config: Record<string, unknown> = {}
  if (fileExists) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    } catch { /* treat as empty config */ }
  }

  const cacheSize = config.cache_size as number | undefined
  const cacheExpiry = config.cache_expiry_delay as number | undefined

  return {
    settingsFile: fileExists ? configPath : null,
    settings: [
      {
        key: 'cache_size',
        label: 'Cache Size',
        currentValue: cacheSize ?? null,
        recommendedValue: 20480,
        isOptimal: cacheSize != null && cacheSize >= 20480,
        fixDescription: 'Set to 20 GB to prevent world & avatar re-downloads',
        canAutoFix: true,
        fixId: 'fix-vrchat-cache-size',
      },
      {
        key: 'cache_expiry_delay',
        label: 'Cache Expiry (days)',
        currentValue: cacheExpiry ?? null,
        recommendedValue: 30,
        isOptimal: cacheExpiry == null || cacheExpiry >= 14,
        fixDescription: 'Set to 30 days to keep cached content longer',
        canAutoFix: false,
      },
    ],
  }
}

function checkSteamVRSettings(_installDir: string): { settingsFile: string | null; settings: VRGameSetting[] } {
  const settingsPath = join(process.env.LOCALAPPDATA ?? '', 'openvr', 'steamvr.vrsettings')
  const fileExists = existsSync(settingsPath)

  // Always return settings even if the file is absent.
  // steamvr.vrsettings may not exist on fresh SteamVR installs or after
  // a clean re-install. We surface recommendations with null current values.
  let steamvr: Record<string, unknown> = {}
  if (fileExists) {
    try {
      const data = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
      steamvr = (data.steamvr ?? {}) as Record<string, unknown>
    } catch { /* treat as default steamvr settings */ }
  }

  const ss = steamvr.supersampleScale as number | undefined
  const ms = steamvr.motionSmoothing as boolean | undefined

  return {
    settingsFile: fileExists ? settingsPath : null,
    settings: [
      {
        key: 'supersampleScale',
        label: 'Supersampling Scale',
        currentValue: ss ?? null,
        recommendedValue: 1.0,
        // null means SteamVR auto-selects — that is already optimal
        isOptimal: ss == null || ss <= 1.3,
        fixDescription: 'Reset to auto (1.0×) to prevent GPU overload',
        canAutoFix: true,
        fixId: 'fix-steamvr-supersampling',
      },
      {
        key: 'motionSmoothing',
        label: 'Motion Smoothing',
        currentValue: ms ?? null,
        recommendedValue: true,
        // null/undefined = SteamVR default which is OFF; flag as suboptimal
        isOptimal: ms === true,
        fixDescription: 'Enable for smoother experience when frames drop',
        canAutoFix: true,
        fixId: 'fix-steamvr-motion-smoothing',
      },
    ],
  }
}

function checkBeatSaberSettings(installDir: string): { settingsFile: string | null; settings: VRGameSetting[] } {
  // Beat Saber stores settings in UserData — informational only
  const userDataPath = join(installDir, 'UserData')
  if (existsSync(userDataPath)) {
    return {
      settingsFile: userDataPath,
      settings: [{
        key: 'mods',
        label: 'Mod Data',
        currentValue: 'UserData folder found',
        recommendedValue: 'present',
        isOptimal: true,
        fixDescription: 'Mod data detected',
        canAutoFix: false,
      }],
    }
  }
  return { settingsFile: null, settings: [] }
}


function getGameSettings(
  appId: string,
  installDir: string
): { settingsFile: string | null; settings: VRGameSetting[] } {
  switch (appId) {
    case '438100': return checkVRChatSettings(installDir)
    case '250820': return checkSteamVRSettings(installDir)
    case '620980': return checkBeatSaberSettings(installDir)
    default: return { settingsFile: null, settings: [] }
  }
}


export async function scanSteamGames(): Promise<SteamGamesResult> {
  const steamPath = findSteamPath()

  if (!steamPath) {
    return { steamInstalled: false, steamPath: null, libraryPaths: [], vrGames: [], scannedAt: Date.now() }
  }

  const libraryPaths = getLibraryPaths(steamPath)
  const vrGames: VRGameInfo[] = []
  const seenAppIds = new Set<string>()

  for (const libPath of libraryPaths) {
    if (!existsSync(libPath)) continue

    let files: string[]
    try {
      files = readdirSync(libPath).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))
    } catch {
      continue
    }

    for (const acfFile of files) {
      try {
        const content = readFileSync(join(libPath, acfFile), 'utf8')
        const manifest = parseACF(content)
        if (!manifest) continue
        if (!KNOWN_VR_GAME_IDS[manifest.appId]) continue
        if (seenAppIds.has(manifest.appId)) continue
        seenAppIds.add(manifest.appId)

        const fullInstallDir = join(libPath, 'common', manifest.installDir)
        const { settingsFile, settings } = getGameSettings(manifest.appId, fullInstallDir)

        vrGames.push({
          appId: manifest.appId,
          name: KNOWN_VR_GAME_IDS[manifest.appId],
          installDir: fullInstallDir,
          settingsFile,
          settings,
          hasIssues: settings.some(s => !s.isOptimal),
        })
      } catch { /* skip bad manifest */ }
    }
  }

  // Sort: games with issues first
  vrGames.sort((a, b) => (b.hasIssues ? 1 : 0) - (a.hasIssues ? 1 : 0))

  return {
    steamInstalled: true,
    steamPath,
    libraryPaths,
    vrGames,
    scannedAt: Date.now(),
  }
}
