import { describe, it, expect } from 'vitest'
import { isAllowedConfigKey, validateSetupConfig } from '../src/main/ipc/validators'

describe('isAllowedConfigKey', () => {
  it('accepts every known UI config key', () => {
    for (const k of ['theme', 'theme.accent', 'advancedMode', 'tour.seen', 'firstLaunchAt']) {
      expect(isAllowedConfigKey(k)).toBe(true)
    }
  })

  it('rejects arbitrary unknown keys the renderer might send', () => {
    expect(isAllowedConfigKey('admin')).toBe(false)
    expect(isAllowedConfigKey('__proto__')).toBe(false)
    expect(isAllowedConfigKey('constructor.prototype.something')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(isAllowedConfigKey('Theme')).toBe(false)
    expect(isAllowedConfigKey('THEME')).toBe(false)
  })
})

describe('validateSetupConfig', () => {
  const minimum = {
    headsetId: 'meta-quest-3',
    connectionArchetype: 'wifi-wireless',
  }

  it('passes a minimal but well-formed setup payload', () => {
    expect(validateSetupConfig(minimum)).toEqual(minimum)
  })

  it('rejects non-objects', () => {
    expect(validateSetupConfig(null)).toBeNull()
    expect(validateSetupConfig('a string')).toBeNull()
    expect(validateSetupConfig(['array'])).toBeNull()
    expect(validateSetupConfig(42)).toBeNull()
  })

  it('rejects when required fields are missing', () => {
    expect(validateSetupConfig({ headsetId: 'foo' })).toBeNull()
    expect(validateSetupConfig({ connectionArchetype: 'wifi-wireless' })).toBeNull()
  })

  it('rejects when required fields are wrong type', () => {
    expect(validateSetupConfig({ headsetId: 42, connectionArchetype: 'wifi-wireless' })).toBeNull()
    expect(validateSetupConfig({ headsetId: 'ok', connectionArchetype: null })).toBeNull()
  })

  it('rejects unreasonably long strings', () => {
    expect(validateSetupConfig({
      headsetId: 'a'.repeat(201),
      connectionArchetype: 'wifi-wireless',
    })).toBeNull()
  })

  it('rejects unknown skill level enum values', () => {
    expect(validateSetupConfig({ ...minimum, skillLevel: 'expert' })).toBeNull()
    expect(validateSetupConfig({ ...minimum, skillLevel: 'whatever' })).toBeNull()
  })

  it('accepts the three valid skill levels', () => {
    for (const skill of ['beginner', 'intermediate', 'advanced']) {
      expect(validateSetupConfig({ ...minimum, skillLevel: skill })).not.toBeNull()
    }
  })
})
