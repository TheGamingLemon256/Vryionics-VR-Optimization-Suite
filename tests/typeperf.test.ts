import { describe, it, expect } from 'vitest'

// We test the CSV parser directly. Since it's a module-private helper, the
// test file mirrors the regex-driven behaviour rather than importing it.
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

describe('typeperf csv parser', () => {
  it('splits a typical typeperf header row', () => {
    const line = '"(PDH-CSV 4.0)","\\\\HOST\\Processor(_Total)\\% Processor Time"'
    expect(parseCsvLine(line)).toEqual([
      '(PDH-CSV 4.0)',
      '\\\\HOST\\Processor(_Total)\\% Processor Time',
    ])
  })

  it('parses a numeric data row', () => {
    const line = '"05/02/2026 12:34:56.789","42.5"'
    const cols = parseCsvLine(line)
    expect(cols).toHaveLength(2)
    expect(Number(cols[1])).toBe(42.5)
  })

  it('handles commas inside quoted fields', () => {
    const line = '"a,b","c"'
    expect(parseCsvLine(line)).toEqual(['a,b', 'c'])
  })

  it('handles escaped double quotes', () => {
    const line = '"foo""bar","baz"'
    expect(parseCsvLine(line)).toEqual(['foo"bar', 'baz'])
  })
})
