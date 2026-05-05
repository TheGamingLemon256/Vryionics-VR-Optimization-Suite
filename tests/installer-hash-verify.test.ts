import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { verifyInstallerHash } from '../src/main/updater'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

let tmpDir: string
let goodPath: string
let goodSha: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vros-hash-'))
  goodPath = join(tmpDir, 'fake-installer.bin')
  const payload = Buffer.from('this is a fake installer body for testing'.repeat(100))
  writeFileSync(goodPath, payload)
  goodSha = createHash('sha512').update(payload).digest('base64')
})

afterAll(() => {
  try { unlinkSync(goodPath) } catch { /* ignore */ }
})

describe('verifyInstallerHash', () => {
  it('returns ok when the file matches', () => {
    expect(verifyInstallerHash(goodPath, goodSha)).toBe('ok')
  })

  it('rejects when the expected hash is null', () => {
    const verdict = verifyInstallerHash(goodPath, null)
    expect(verdict).toMatch(/refusing to install unverified bytes/i)
  })

  it('rejects when the expected hash is empty', () => {
    expect(verifyInstallerHash(goodPath, '')).toMatch(/refusing/i)
  })

  it('rejects on hash mismatch', () => {
    const wrongSha = createHash('sha512').update('different content').digest('base64')
    const verdict = verifyInstallerHash(goodPath, wrongSha)
    expect(verdict).toMatch(/hash verification failed|tampering/i)
  })

  it('rejects gracefully when the file is missing', () => {
    const missing = join(tmpDir, 'does-not-exist.bin')
    const verdict = verifyInstallerHash(missing, goodSha)
    expect(verdict).toMatch(/could not read/i)
  })
})
