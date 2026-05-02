import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface TypeperfSample {
  counter: string
  value: number
}

// typeperf prints a CSV: a header row whose columns are the counter paths
// (the first column header is the timestamp marker), followed by one or more
// data rows. Sample collection adds a trailing summary line we discard.
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

export async function readCounters(
  counters: string[],
  samples = 1,
  timeoutMs = 8000
): Promise<TypeperfSample[] | null> {
  if (counters.length === 0) return []

  const args = [...counters, '-sc', String(samples)]
  try {
    const { stdout } = await execFileAsync('typeperf', args, { timeout: timeoutMs })
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) return null

    const header = parseCsvLine(lines[0])
    const data = parseCsvLine(lines[lines.length - 1].includes('command ended') ? lines[lines.length - 2] : lines[1])

    const out: TypeperfSample[] = []
    // Column 0 is the timestamp; counter values start at index 1.
    for (let i = 1; i < header.length && i < data.length; i++) {
      const num = Number(data[i])
      if (Number.isFinite(num)) {
        out.push({ counter: header[i], value: num })
      }
    }
    return out
  } catch {
    return null
  }
}

export async function readSingleCounter(
  counter: string,
  timeoutMs = 8000
): Promise<number | null> {
  const samples = await readCounters([counter], 1, timeoutMs)
  if (!samples || samples.length === 0) return null
  return samples[0].value
}

export async function readCounterMulti(
  counter: string,
  timeoutMs = 8000
): Promise<TypeperfSample[] | null> {
  // For wildcard counters like '\Processor(*)\% Processor Time', typeperf
  // expands instances at runtime; the header lists every matched instance
  // as a separate column.
  return readCounters([counter], 1, timeoutMs)
}
