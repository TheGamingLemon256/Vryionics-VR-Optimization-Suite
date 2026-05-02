import { describe, it, expect } from 'vitest'
import { buildLaunchOption } from '../src/main/fixes/x3d-launch-option'

describe('buildLaunchOption', () => {
  it('emits affinity for 7800X3D', () => {
    expect(buildLaunchOption({ model: 'AMD Ryzen 7 7800X3D' })).toBe(
      'cmd /c start /affinity FF /high "" %command%'
    )
  })

  it('omits affinity for dual-CCD X3D in v0.2.9', () => {
    expect(buildLaunchOption({ model: 'AMD Ryzen 9 7950X3D' })).toBe(
      'cmd /c start /high "" %command%'
    )
  })

  it('omits affinity for non-X3D AMD CPUs', () => {
    expect(buildLaunchOption({ model: 'AMD Ryzen 7 7700X' })).toBe(
      'cmd /c start /high "" %command%'
    )
  })

  it('returns null for unknown CPUs', () => {
    expect(buildLaunchOption({ model: 'Unknown CPU' })).toBeNull()
  })
})
