import { describe, it, expect } from 'vitest'
import { isHttpsUrl } from '../src/main/utils/url-guard'

describe('isHttpsUrl', () => {
  it('accepts a normal https URL', () => {
    expect(isHttpsUrl('https://github.com/foo/bar')).toBe(true)
  })

  it('rejects http (no implicit upgrade)', () => {
    expect(isHttpsUrl('http://github.com/foo/bar')).toBe(false)
  })

  it('rejects file://', () => {
    expect(isHttpsUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
  })

  it('rejects javascript:', () => {
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects ms-cxh-full and other custom protocol handlers', () => {
    expect(isHttpsUrl('ms-cxh-full:foo')).toBe(false)
    expect(isHttpsUrl('search-ms:query=evil')).toBe(false)
  })

  it('rejects SMB UNC-style paths', () => {
    expect(isHttpsUrl('\\\\evil-share\\payload.exe')).toBe(false)
  })

  it('rejects garbage and empty input', () => {
    expect(isHttpsUrl('')).toBe(false)
    expect(isHttpsUrl('not a url')).toBe(false)
    expect(isHttpsUrl(null)).toBe(false)
    expect(isHttpsUrl(undefined)).toBe(false)
    expect(isHttpsUrl(42)).toBe(false)
  })

  it('rejects pathologically long input even if it parses', () => {
    const big = 'https://example.com/' + 'a'.repeat(5000)
    expect(isHttpsUrl(big)).toBe(false)
  })
})
