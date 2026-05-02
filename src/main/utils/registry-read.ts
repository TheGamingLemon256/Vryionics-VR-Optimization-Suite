import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type RegValue =
  | { type: 'REG_SZ'; data: string }
  | { type: 'REG_DWORD'; data: number }
  | { type: 'REG_QWORD'; data: bigint }
  | { type: 'REG_BINARY'; data: Buffer }
  | { type: 'REG_MULTI_SZ'; data: string[] }
  | { type: 'REG_EXPAND_SZ'; data: string }

export interface RegKey {
  key: string
  values: Record<string, RegValue>
}

const TYPE_TOKENS = [
  'REG_SZ',
  'REG_EXPAND_SZ',
  'REG_DWORD',
  'REG_QWORD',
  'REG_BINARY',
  'REG_MULTI_SZ',
] as const

type TypeToken = (typeof TYPE_TOKENS)[number]

function parseValueLine(line: string): { name: string; value: RegValue } | null {
  // Format: <indent><name><ws><TYPE><ws><data>. Name may contain spaces, so we
  // anchor on the type token rather than splitting greedily.
  const trimmed = line.replace(/^[\t ]+/, '')
  if (!trimmed) return null

  let typeIdx = -1
  let typeToken: TypeToken | null = null
  for (const t of TYPE_TOKENS) {
    const idx = trimmed.indexOf(`    ${t}    `)
    if (idx !== -1) {
      typeIdx = idx
      typeToken = t
      break
    }
    const tabIdx = trimmed.indexOf(`\t${t}\t`)
    if (tabIdx !== -1) {
      typeIdx = tabIdx
      typeToken = t
      break
    }
  }
  if (typeIdx === -1 || typeToken === null) return null

  const name = trimmed.slice(0, typeIdx).replace(/[\t ]+$/, '')
  const afterType = trimmed.slice(typeIdx).replace(/^[\t ]+/, '').slice(typeToken.length).replace(/^[\t ]+/, '')

  return { name, value: coerceValue(typeToken, afterType) }
}

function coerceValue(type: TypeToken, raw: string): RegValue {
  switch (type) {
    case 'REG_SZ':
      return { type: 'REG_SZ', data: raw }
    case 'REG_EXPAND_SZ':
      return { type: 'REG_EXPAND_SZ', data: raw }
    case 'REG_DWORD':
      return { type: 'REG_DWORD', data: parseInt(raw, 16) }
    case 'REG_QWORD':
      return { type: 'REG_QWORD', data: BigInt(raw) }
    case 'REG_BINARY': {
      const hex = raw.replace(/[^0-9A-Fa-f]/g, '')
      return { type: 'REG_BINARY', data: Buffer.from(hex, 'hex') }
    }
    case 'REG_MULTI_SZ': {
      const parts = raw.split('\\0')
      while (parts.length && parts[parts.length - 1] === '') parts.pop()
      return { type: 'REG_MULTI_SZ', data: parts }
    }
  }
}

export function parseRegQueryOutput(out: string): RegKey | null {
  if (/^ERROR:/m.test(out)) return null

  const lines = out.split(/\r?\n/)
  let key: string | null = null
  const values: Record<string, RegValue> = {}

  for (const line of lines) {
    if (!line.trim()) continue
    if (!/^[\t ]/.test(line)) {
      // First unindented non-empty line is the key path. Subsequent unindented
      // lines (subkeys listed after the values) are ignored.
      if (key === null) key = line.trim()
      continue
    }
    const parsed = parseValueLine(line)
    if (parsed) values[parsed.name] = parsed.value
  }

  if (key === null) return null
  return { key, values }
}

export async function readKey(path: string): Promise<RegKey | null> {
  const { stdout } = await execFileAsync('reg', ['query', path, '/reg:64'])
  return parseRegQueryOutput(stdout)
}

export async function readValue(path: string, name: string): Promise<RegValue | null> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', path, '/v', name, '/reg:64'])
    const parsed = parseRegQueryOutput(stdout)
    return parsed?.values[name] ?? null
  } catch {
    return null
  }
}
