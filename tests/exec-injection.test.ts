import { describe, it, expect } from 'vitest'
import { readRegistry, registryKeyExists } from '../src/main/utils/registry'

// These tests target the argv-array contract. If the registry helpers ever
// regress to template-literal execSync the inputs below will either hang on
// shell parsing, throw with a non-null result, or in the worst case execute
// the embedded `&` payload. With execFile the strings travel verbatim to
// reg.exe, which rejects them as invalid key names and returns null.

describe('registry helpers reject shell-metacharacter input', () => {
  it('readRegistry returns null for a path containing shell separators', () => {
    const malicious = 'Software\\NotARealKey" & calc.exe & echo "'
    const result = readRegistry('HKCU', malicious, 'whatever')
    expect(result).toBeNull()
  })

  it('readRegistry returns null for a value name containing shell separators', () => {
    const malicious = 'Foo" & echo pwned & echo "'
    const result = readRegistry('HKCU', 'Software\\Microsoft', malicious)
    expect(result).toBeNull()
  })

  it('registryKeyExists returns false for a path containing shell separators', () => {
    const malicious = 'Software\\X` ; echo pwned ; `'
    expect(registryKeyExists('HKCU', malicious)).toBe(false)
  })
})
