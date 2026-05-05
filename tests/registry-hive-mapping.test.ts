import { describe, it, expect } from 'vitest'
import { HIVE_LONG_FORM } from '../src/main/utils/registry'

// Regression: enumerateRegistrySubkeys was building "HKLM\..." prefixes and
// matching them against `reg query` output, which always echoes the long
// form (HKEY_LOCAL_MACHINE\...). The comparison silently produced zero
// subkeys. The fix added HIVE_LONG_FORM and uses it for output matching;
// these assertions lock that mapping in place.
describe('HIVE_LONG_FORM', () => {
  it('maps HKLM to HKEY_LOCAL_MACHINE', () => {
    expect(HIVE_LONG_FORM.HKLM).toBe('HKEY_LOCAL_MACHINE')
  })

  it('maps HKCU to HKEY_CURRENT_USER', () => {
    expect(HIVE_LONG_FORM.HKCU).toBe('HKEY_CURRENT_USER')
  })

  it('maps the remaining hives to their reg.exe long forms', () => {
    expect(HIVE_LONG_FORM.HKCR).toBe('HKEY_CLASSES_ROOT')
    expect(HIVE_LONG_FORM.HKU).toBe('HKEY_USERS')
    expect(HIVE_LONG_FORM.HKCC).toBe('HKEY_CURRENT_CONFIG')
  })
})
