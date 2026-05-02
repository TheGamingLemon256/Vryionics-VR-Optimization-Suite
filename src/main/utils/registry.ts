import { execFileSync } from 'child_process'

export type RegistryHive = 'HKLM' | 'HKCU' | 'HKCR' | 'HKU' | 'HKCC'
export type RegistryType = 'REG_SZ' | 'REG_DWORD' | 'REG_QWORD' | 'REG_EXPAND_SZ' | 'REG_MULTI_SZ' | 'REG_BINARY'

export interface RegistryValue {
  name: string
  type: RegistryType
  data: string
}

// reg.exe receives each token as a separate argv element, so cmd.exe is never
// involved in parsing the path or value name. Quoting and shell metacharacters
// in user-derived input become inert.
const REG_EXEC_OPTS = { encoding: 'utf8' as const, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] as const }

/**
 * Read a single registry value.
 * Returns null if the key/value doesn't exist or access is denied.
 */
export function readRegistry(hive: RegistryHive, path: string, name: string): string | null {
  try {
    const output = execFileSync('reg', ['query', `${hive}\\${path}`, '/v', name], REG_EXEC_OPTS)
    const match = output.match(/REG_(SZ|DWORD|QWORD|EXPAND_SZ|MULTI_SZ|BINARY)\s+(.+)/i)
    return match ? match[2].trim() : null
  } catch {
    return null
  }
}

/**
 * Read a DWORD value and parse it as a number.
 * REG_DWORD values may be returned as hex (0x14) — handles both formats.
 */
export function readRegistryDword(hive: RegistryHive, path: string, name: string): number | null {
  const raw = readRegistry(hive, path, name)
  if (raw === null) return null
  const num = raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10)
  return isNaN(num) ? null : num
}

/**
 * Enumerate all values under a registry key.
 * Returns an array of {name, type, data} objects.
 */
export function enumerateRegistryValues(hive: RegistryHive, path: string): RegistryValue[] {
  try {
    const output = execFileSync('reg', ['query', `${hive}\\${path}`], REG_EXEC_OPTS)
    const results: RegistryValue[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Lines look like: "    ValueName    REG_DWORD    0x14"
      const match = line.match(/^\s+(.+?)\s+(REG_\w+)\s+(.+)/i)
      if (match) {
        results.push({
          name: match[1].trim(),
          type: match[2].trim() as RegistryType,
          data: match[3].trim()
        })
      }
    }

    return results
  } catch {
    return []
  }
}

/**
 * Enumerate subkey names under a registry key.
 */
export function enumerateRegistrySubkeys(hive: RegistryHive, path: string): string[] {
  try {
    const output = execFileSync('reg', ['query', `${hive}\\${path}`], REG_EXEC_OPTS)
    const fullPath = `${hive}\\${path}\\`
    const subkeys: string[] = []

    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith(fullPath)) {
        const subkeyName = trimmed.slice(fullPath.length)
        if (subkeyName && !subkeyName.includes('\\')) {
          subkeys.push(subkeyName)
        }
      }
    }

    return subkeys
  } catch {
    return []
  }
}

/**
 * Check if a registry key exists.
 */
export function registryKeyExists(hive: RegistryHive, path: string): boolean {
  try {
    execFileSync('reg', ['query', `${hive}\\${path}`], REG_EXEC_OPTS)
    return true
  } catch {
    return false
  }
}

// Common VR registry paths consumed by the scanner and fix modules.

export const VR_REGISTRY_PATHS = {
  mmcss: {
    systemProfile: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    gamesTask: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
  },
  vcache: {
    base: 'SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App'
  },
  gpuAffinity: {
    base: 'SYSTEM\\CurrentControlSet\\Enum\\PCI'
  },
  gameMode: {
    gameBar: 'Software\\Microsoft\\GameBar'
  },
  networkThrottling: {
    systemProfile: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
  },
  hags: {
    graphicsDrivers: 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers'
  }
} as const
