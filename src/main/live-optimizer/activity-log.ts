import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface RaisedEntry {
  pid: number
  name: string
  result: 'high' | 'above-normal' | 'failed'
}

export interface LoweredEntry {
  pid: number
  name: string
  originalPriority: number
}

export interface SessionRecord {
  activatedAt: number
  deactivatedAt: number | null
  triggerProcess: string
  raised: RaisedEntry[]
  lowered: LoweredEntry[]
  notes: string[]
}

const MAX_SESSIONS = 10
const logFile = (): string => join(app.getPath('userData'), 'live-optimizer-activity.json')

export async function appendSession(session: SessionRecord): Promise<void> {
  const existing = await loadRecent()
  const updated = [session, ...existing].slice(0, MAX_SESSIONS)
  await fs.writeFile(logFile(), JSON.stringify(updated, null, 2), 'utf-8')
}

export async function loadRecent(): Promise<SessionRecord[]> {
  try {
    const text = await fs.readFile(logFile(), 'utf-8')
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? (parsed as SessionRecord[]) : []
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }
}
