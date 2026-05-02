import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import os from 'node:os'

export interface StateEntry {
  pid: number
  imageName: string
  originalPriority: number
  currentPriority: number
}

export const LOWERED_PRIORITY_CLASSES = new Set([
  os.constants.priority.PRIORITY_BELOW_NORMAL,
  os.constants.priority.PRIORITY_LOW,
])

const stateFile = (): string => join(app.getPath('userData'), 'live-optimizer-state.json')

export async function read(): Promise<StateEntry[]> {
  try {
    const text = await fs.readFile(stateFile(), 'utf-8')
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? (parsed as StateEntry[]) : []
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export async function write(entries: StateEntry[]): Promise<void> {
  await fs.writeFile(stateFile(), JSON.stringify(entries, null, 2), 'utf-8')
}

export async function clear(): Promise<void> {
  try {
    await fs.unlink(stateFile())
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}
