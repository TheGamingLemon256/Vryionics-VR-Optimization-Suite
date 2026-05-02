import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'

// state-store reads its target file off app.getPath('userData'). Hand it a
// scratch dir that lives only for this test file so each test starts clean
// and we don't pollute the real user data folder.
const tempRoot = mkdtempSync(join(tmpdir(), 'liveopt-state-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}))

import * as state from '../../src/main/live-optimizer/state-store'

const stateFile = join(tempRoot, 'live-optimizer-state.json')

afterEach(async () => {
  await fs.rm(stateFile, { force: true })
})

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('state-store', () => {
  it('returns an empty array when no state file exists', async () => {
    const result = await state.read()
    expect(result).toEqual([])
  })

  it('round-trips a write then a read', async () => {
    const entries: state.StateEntry[] = [
      { pid: 1234, imageName: 'chrome.exe', originalPriority: 0, currentPriority: 10 },
      { pid: 5678, imageName: 'discord.exe', originalPriority: 0, currentPriority: 10 },
    ]
    await state.write(entries)
    const read = await state.read()
    expect(read).toEqual(entries)
  })

  it('clear removes the file and is idempotent', async () => {
    await state.write([{ pid: 1, imageName: 'x.exe', originalPriority: 0, currentPriority: 10 }])
    await state.clear()
    expect(await state.read()).toEqual([])
    await expect(state.clear()).resolves.toBeUndefined()
  })

  it('treats a malformed (non-array) JSON payload as empty', async () => {
    await fs.writeFile(stateFile, JSON.stringify({ not: 'an array' }), 'utf-8')
    expect(await state.read()).toEqual([])
  })

  it('LOWERED_PRIORITY_CLASSES contains BELOW_NORMAL and LOW', async () => {
    const os = await import('node:os')
    expect(state.LOWERED_PRIORITY_CLASSES.has(os.constants.priority.PRIORITY_BELOW_NORMAL)).toBe(true)
    expect(state.LOWERED_PRIORITY_CLASSES.has(os.constants.priority.PRIORITY_LOW)).toBe(true)
    expect(state.LOWERED_PRIORITY_CLASSES.has(os.constants.priority.PRIORITY_NORMAL)).toBe(false)
  })
})
