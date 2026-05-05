import { describe, it, expect } from 'vitest'
import { detectChannelMode } from '../src/main/scanner/modules/ram'

describe('detectChannelMode', () => {
  it('reports dual for two equal-size DIMMs', () => {
    const dimms = [{ slot: 0, sizeGB: 16 }, { slot: 1, sizeGB: 16 }]
    expect(detectChannelMode(dimms)).toBe('dual')
  })

  it('reports single for one DIMM', () => {
    expect(detectChannelMode([{ slot: 0, sizeGB: 16 }])).toBe('single')
  })

  it('reports dual for four DIMMs across two channels', () => {
    const dimms = [
      { slot: 0, sizeGB: 16 }, { slot: 1, sizeGB: 16 },
      { slot: 2, sizeGB: 16 }, { slot: 3, sizeGB: 16 },
    ]
    expect(detectChannelMode(dimms)).toBe('dual')
  })

  it('reports flex/single for two DIMMs of different sizes', () => {
    const dimms = [{ slot: 0, sizeGB: 8 }, { slot: 1, sizeGB: 16 }]
    expect(detectChannelMode(dimms)).toBe('single')
  })
})
