import { describe, it, expect } from 'vitest'
import { applyDesktopChipsetOverride } from '../src/main/scanner/modules/compat'

// Regression: the battery-class heuristic flagged desktops with UPS units
// (or USB-attached accessory batteries) as laptops, which then poisoned
// the laptop-only rule paths. Fix: if a motherboard chipset is detected,
// the chipset database only contains desktop chipsets, so override
// isLaptop to false regardless of battery state.
describe('applyDesktopChipsetOverride', () => {
  it('forces isLaptop=false when a desktop chipset is detected', () => {
    expect(applyDesktopChipsetOverride(true, 'X870E / X870')).toBe(false)
  })

  it('preserves isLaptop=true when no chipset is detected', () => {
    expect(applyDesktopChipsetOverride(true, null)).toBe(true)
  })

  it('preserves isLaptop=false in either case', () => {
    expect(applyDesktopChipsetOverride(false, 'B650')).toBe(false)
    expect(applyDesktopChipsetOverride(false, null)).toBe(false)
  })
})
