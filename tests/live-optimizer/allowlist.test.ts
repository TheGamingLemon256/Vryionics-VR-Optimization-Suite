import { describe, it, expect, beforeEach, vi } from 'vitest'

// Force the dev-tree resource path before allowlist.ts loads. In production
// the module reads process.resourcesPath, which isn't defined under vitest.
process.env.NODE_ENV = 'development'

const warnCalls: string[] = []
vi.mock('../../src/main/logger', () => ({
  log: {
    debug: () => {},
    info: () => {},
    warn: (_ns: string, msg: string) => { warnCalls.push(msg) },
    error: () => {},
  },
}))

// Stub electron. allowlist.ts doesn't touch it directly, but logger.ts
// (now mocked) used to; belt-and-braces in case import order shifts.
vi.mock('electron', () => ({
  app: { getPath: () => '.' },
}))

// Replace fs.readFile with a routing stub: when allowlist.ts asks for one of
// the two resource JSON files we hand back the content the current test set.
let triggersJson = '[]'
let allowlistJson = '[]'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: async (path: string): Promise<string> => {
        const p = String(path)
        if (p.endsWith('live-optimizer-triggers.json')) return triggersJson
        if (p.endsWith('live-optimizer-allowlist.json')) return allowlistJson
        return actual.promises.readFile(path, 'utf-8')
      },
    },
  }
})

beforeEach(() => {
  warnCalls.length = 0
  vi.resetModules()
})

describe('allowlist loader', () => {
  it('loadTriggers returns a Set of trigger image names', async () => {
    triggersJson = JSON.stringify(['vrchat.exe', 'vrcompositor.exe'])
    const { loadTriggers } = await import('../../src/main/live-optimizer/allowlist')
    const triggers = await loadTriggers()
    expect(triggers.has('vrchat.exe')).toBe(true)
    expect(triggers.has('vrcompositor.exe')).toBe(true)
    expect(triggers.size).toBe(2)
  })

  it('loadAllowlist filters out never-touch entries and warns on each', async () => {
    allowlistJson = JSON.stringify(['Discord.exe', 'svchost.exe', 'Spotify.exe', 'lsass.exe'])
    const { loadAllowlist } = await import('../../src/main/live-optimizer/allowlist')
    const allowed = await loadAllowlist()
    expect(allowed).toEqual(['Discord.exe', 'Spotify.exe'])
    expect(warnCalls.some(m => m.includes('svchost.exe'))).toBe(true)
    expect(warnCalls.some(m => m.includes('lsass.exe'))).toBe(true)
  })

  it('skips non-string entries silently', async () => {
    allowlistJson = JSON.stringify(['Discord.exe', 42, null, 'Spotify.exe'])
    const { loadAllowlist } = await import('../../src/main/live-optimizer/allowlist')
    const allowed = await loadAllowlist()
    expect(allowed).toEqual(['Discord.exe', 'Spotify.exe'])
  })

  it('returns an empty array when the JSON payload is not an array', async () => {
    allowlistJson = JSON.stringify({ not: 'an array' })
    const { loadAllowlist } = await import('../../src/main/live-optimizer/allowlist')
    const allowed = await loadAllowlist()
    expect(allowed).toEqual([])
  })
})
