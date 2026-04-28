// VR Optimization Suite — Processes Scan Module
// Enumerates running processes and classifies them into VR-relevant categories.

import { enumerateProcesses, classifyProcesses } from '../../utils/process'
import type { ScanModuleResult, ProcessesData } from '../types'

export async function scanProcesses(): Promise<ScanModuleResult<ProcessesData>> {
  try {
    console.log('[scan:processes] Enumerating processes...')

    const allProcesses = await enumerateProcesses()
    const classified = classifyProcesses(allProcesses)

    console.log(
      `[scan:processes] Done. ${allProcesses.length} total processes. ` +
      `VR critical: ${classified.vrCritical.length}, ` +
      `bloat: ${classified.bloat.length}, ` +
      `streaming: ${classified.streaming.length}, ` +
      `anti-cheat: ${classified.antiCheat.length}, ` +
      `peripheral: ${classified.peripheralSoftware.length}`
    )

    return {
      success: true,
      data: {
        vrCritical: classified.vrCritical,
        vrOverlay: classified.vrOverlay,
        vrTracking: classified.vrTracking,
        streaming: classified.streaming,
        bloat: classified.bloat,
        antiCheat: classified.antiCheat,
        peripheralSoftware: classified.peripheralSoftware,
        audio: classified.audio,
        all: allProcesses
      }
    }
  } catch (error) {
    console.error('[scan:processes] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
