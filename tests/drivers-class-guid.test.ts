import { describe, it, expect } from 'vitest'
import { CLASS_GUID_TO_NAME } from '../src/main/drivers/scanner'

// Regression: modern Windows installs often write only ClassGUID (not the
// text Class value) on PCI device keys. The scanner used to drop every
// device whose Class was missing, surfacing zero driver rows. The fix
// added this GUID->name lookup as a fallback. These tests pin the
// well-known GUIDs so a typo can't silently re-break the scan.
describe('CLASS_GUID_TO_NAME', () => {
  it('maps the Display class GUID to DISPLAY', () => {
    expect(CLASS_GUID_TO_NAME['{4d36e968-e325-11ce-bfc1-08002be10318}']).toBe('DISPLAY')
  })

  it('maps the Net class GUID to NET', () => {
    expect(CLASS_GUID_TO_NAME['{4d36e972-e325-11ce-bfc1-08002be10318}']).toBe('NET')
  })

  it('maps the Media class GUID to MEDIA', () => {
    expect(CLASS_GUID_TO_NAME['{4d36e96c-e325-11ce-bfc1-08002be10318}']).toBe('MEDIA')
  })

  it('still resolves the USB GUID even though USB is no longer in KEPT_CLASSES', () => {
    // The scanner stopped enumerating USB but the lookup entry is kept
    // for forward-compat. Verify the entry is still present so a future
    // re-introduction of USB scanning doesn't silently fail.
    expect(CLASS_GUID_TO_NAME['{36fc9e60-c465-11cf-8056-444553540000}']).toBe('USB')
  })
})
