import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function runExe(
  exe: string,
  args: string[],
  timeoutMs = 8000
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(exe, args, { timeout: timeoutMs })
    return stdout
  } catch {
    return null
  }
}
