import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { NEVER_TOUCH_PROCESSES } from './never-touch'
import { log } from '../logger'

// extraResources lands files at process.resourcesPath/resources/ in production.
// In dev the same files sit at the project root under resources/.
const RESOURCE_DIR = process.env.NODE_ENV === 'development'
  ? join(process.cwd(), 'resources')
  : join(process.resourcesPath, 'resources')

async function readJsonList(filename: string): Promise<string[]> {
  const path = join(RESOURCE_DIR, filename)
  const text = await fs.readFile(path, 'utf-8')
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((x): x is string => typeof x === 'string')
}

export async function loadTriggers(): Promise<Set<string>> {
  return new Set(await readJsonList('live-optimizer-triggers.json'))
}

export async function loadAllowlist(): Promise<string[]> {
  const raw = await readJsonList('live-optimizer-allowlist.json')
  const filtered: string[] = []
  for (const name of raw) {
    if (NEVER_TOUCH_PROCESSES.has(name)) {
      log.warn('live-optimizer', `ignoring ${name} from allowlist; it is on the never-touch list`)
      continue
    }
    filtered.push(name)
  }
  return filtered
}
