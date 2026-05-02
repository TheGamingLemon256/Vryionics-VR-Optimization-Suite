// VR Optimization Suite — Event Log Scanner Module
// Reads Windows Event Log for GPU TDR events, WHEA hardware errors,
// and SteamVR crash events from the last 7 days.

import { runExe } from '../../utils/exec'
import type { ScanModuleResult, EventLogData } from '../types'

// wevtutil.exe is the stock Windows event log query tool. We use the
// /q (XPath) and /f:text format flags to get human-readable output and
// then count occurrences.
async function queryEvents(channel: string, xpath: string, max = 50, timeoutMs = 12000): Promise<string | null> {
  return runExe(
    'wevtutil',
    ['qe', channel, `/q:${xpath}`, `/c:${max}`, '/rd:true', '/f:text'],
    timeoutMs
  )
}

// Number of milliseconds in 7 days, used inside the XPath
// TimeCreated[timediff(@SystemTime) <= N] predicate.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function countEventBlocks(text: string): number {
  // Each event block starts with "Event[N]:" or "Log Name:". Counting
  // "Log Name:" lines is the most reliable signal in the /f:text output.
  const matches = text.match(/^Log Name:/gm)
  return matches ? matches.length : 0
}

function firstDate(text: string): string | null {
  const m = text.match(/^Date:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

function firstMessages(text: string, limit: number): string[] {
  const out: string[] = []
  // Description: \r\n  <message>
  const re = /^Description:\s*\r?\n([^\r\n]+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null && out.length < limit) {
    out.push(m[1].trim())
  }
  return out
}

export async function scanEventLog(): Promise<ScanModuleResult<EventLogData>> {
  console.log('[scan:event-log] Starting event log scan (last 7 days)...')
  let gpuTdrEvents = 0
  let wheaErrors = 0
  let steamvrCrashes = 0
  let lastGpuTdrTime: string | null = null
  const criticalErrors: string[] = []

  try {
    // Display TDR (Event ID 4101 in System log).
    const tdrXpath = `*[System[(EventID=4101) and TimeCreated[timediff(@SystemTime) <= ${SEVEN_DAYS_MS}]]]`
    const tdrOut = await queryEvents('System', tdrXpath, 50, 15000)
    if (tdrOut) {
      gpuTdrEvents = countEventBlocks(tdrOut)
      lastGpuTdrTime = firstDate(tdrOut)
      criticalErrors.push(...firstMessages(tdrOut, 2))
    }

    // Application log: ID 1001 fault entries that mention display/GPU/video.
    // wevtutil's XPath dialect doesn't support EventData substring matches
    // reliably across locales, so we filter the text dump after the fact.
    const tdr2Xpath = `*[System[(EventID=1001) and TimeCreated[timediff(@SystemTime) <= ${SEVEN_DAYS_MS}]]]`
    const tdr2Out = await queryEvents('Application', tdr2Xpath, 50, 12000)
    if (tdr2Out) {
      const blocks = tdr2Out.split(/^Log Name:/gm).slice(1)
      const matching = blocks.filter((b) => /display|gpu|video/i.test(b)).length
      gpuTdrEvents = Math.max(gpuTdrEvents, matching)
    }

    // WHEA-Logger Operational log — any event in the last week is a hardware
    // error worth reporting.
    const wheaXpath = `*[System[TimeCreated[timediff(@SystemTime) <= ${SEVEN_DAYS_MS}]]]`
    const wheaOut = await queryEvents('Microsoft-Windows-WHEA-Logger/Operational', wheaXpath, 50, 15000)
    if (wheaOut) {
      wheaErrors = countEventBlocks(wheaOut)
      for (const m of firstMessages(wheaOut, 2)) {
        criticalErrors.push('WHEA: ' + m)
      }
    }

    // SteamVR crashes in Application log: error/critical level events whose
    // text mentions vrserver/SteamVR/VRChat.
    const steamvrXpath = `*[System[(Level=1 or Level=2) and TimeCreated[timediff(@SystemTime) <= ${SEVEN_DAYS_MS}]]]`
    const steamvrOut = await queryEvents('Application', steamvrXpath, 100, 15000)
    if (steamvrOut) {
      const blocks = steamvrOut.split(/^Log Name:/gm).slice(1)
      steamvrCrashes = blocks.filter((b) => /vrserver|steamvr|vrchat/i.test(b)).length
    }

    console.log(
      `[scan:event-log] Complete. gpuTDR=${gpuTdrEvents} lastTDR=${lastGpuTdrTime ?? 'none'} ` +
      `wheaErrors=${wheaErrors} steamvrCrashes=${steamvrCrashes} ` +
      `criticalErrors=${criticalErrors.length}`
    )
    if (criticalErrors.length > 0) {
      console.warn(`[scan:event-log] Critical errors found:\n  ${criticalErrors.join('\n  ')}`)
    }
    return {
      success: true,
      data: { gpuTdrEvents, wheaErrors, steamvrCrashes, lastGpuTdrTime, criticalErrors },
    }
  } catch (error) {
    console.error(`[scan:event-log] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { gpuTdrEvents, wheaErrors, steamvrCrashes, lastGpuTdrTime, criticalErrors },
    }
  }
}
