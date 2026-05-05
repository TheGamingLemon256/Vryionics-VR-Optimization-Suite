import { describe, it, expect } from 'vitest'
import { parseRegQueryOutput } from '../src/main/utils/registry-read'

describe('parseRegQueryOutput', () => {
  it('parses a single REG_SZ value', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\r\n    ProcessorNameString    REG_SZ    AMD Ryzen 7 7800X3D\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed).toEqual({
      key: 'HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0',
      values: { ProcessorNameString: { type: 'REG_SZ', data: 'AMD Ryzen 7 7800X3D' } },
    })
  })

  it('parses a REG_DWORD value as a number', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\r\n    ~MHz    REG_DWORD    0x00001068\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed?.values['~MHz']).toEqual({ type: 'REG_DWORD', data: 0x1068 })
  })

  it('parses a REG_BINARY value as a Buffer', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\r\n    HardwareInformation.qwMemorySize    REG_BINARY    0000000200000000\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed?.values['HardwareInformation.qwMemorySize'].type).toBe('REG_BINARY')
    expect(Buffer.isBuffer(parsed?.values['HardwareInformation.qwMemorySize'].data)).toBe(true)
  })

  it('returns null for "not found" output', () => {
    const out = `\r\nERROR: The system was unable to find the specified registry key or value.\r\n`
    expect(parseRegQueryOutput(out)).toBeNull()
  })
})
