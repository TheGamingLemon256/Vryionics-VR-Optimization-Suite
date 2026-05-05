import { describe, it, expect } from 'vitest'
import { detectRamTierLevel } from '../src/main/rules/upgrade-engine'
import type { ScanData } from '../src/main/scanner/types'

// Regression: detectRamTierLevel returned tier 3 ("recommend 32GB") for a
// user with 63GB DDR5 because type/speed were Unknown and the function
// fell through to the slow-DDR4 branch. Fix: bail to null when capacity
// is already 32GB+ and we can't confirm DDR5 with a real speed reading.
function ramOnly(ram: { totalGB: number; speed: number; type: string }): ScanData {
  return { ram } as unknown as ScanData
}

describe('detectRamTierLevel', () => {
  it('returns null for 32GB+ with unknown type and speed', () => {
    expect(detectRamTierLevel(ramOnly({ totalGB: 64, speed: 0, type: 'Unknown' }))).toBeNull()
  })

  it('returns null for 32GB+ DDR4 (any speed) — no meaningful upgrade path', () => {
    expect(detectRamTierLevel(ramOnly({ totalGB: 32, speed: 3600, type: 'DDR4' }))).toBeNull()
  })

  it('returns null for 32GB+ DDR5 when speed is unknown', () => {
    expect(detectRamTierLevel(ramOnly({ totalGB: 32, speed: 0, type: 'DDR5' }))).toBeNull()
  })

  it('returns tier 1 for 8GB DDR4', () => {
    expect(detectRamTierLevel(ramOnly({ totalGB: 8, speed: 3200, type: 'DDR4' }))).toBe(1)
  })

  it('returns tier 8 for 64GB DDR5-6400', () => {
    expect(detectRamTierLevel(ramOnly({ totalGB: 64, speed: 6400, type: 'DDR5' }))).toBe(8)
  })
})
