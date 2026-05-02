import { readValue } from './registry-read'

export async function readVramBytes(adapterIndex: number): Promise<number | null> {
  const path = `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\${String(adapterIndex).padStart(4, '0')}`
  const value = await readValue(path, 'HardwareInformation.qwMemorySize')
  if (!value || value.type !== 'REG_BINARY') return null
  if (value.data.length < 8) return null
  return Number(value.data.readBigUInt64LE(0))
}
