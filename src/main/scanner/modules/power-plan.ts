// VR Optimization Suite — Power Plan Scan Module
// Detects active Windows power plan using powercfg.

import { tryRunCmd } from '../../utils/powershell'
import type { ScanModuleResult } from '../types'

// Map well-known GUIDs to friendly names
const POWER_PLAN_GUIDS: Record<string, string> = {
  '381b4222-f694-41f0-9685-ff5bb260df2e': 'Balanced',
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c': 'High performance',
  'a1841308-3541-4fab-bc81-f71556f20b4a': 'Power saver',
  'e9a42b02-d5df-448d-aa00-03f14749eb61': 'Ultimate Performance',
  'ded574b5-45a0-4f42-8737-46345c09c238': 'Balanced (AMD)',
  '4b168943-ee09-4768-9ce5-a65d32e73fc7': 'AMD Ryzen Balanced',
  '9897998c-92de-4669-853f-b7cd3ecb2790': 'AMD Performance'
}

export interface PowerPlanData {
  name: string
  guid: string
}

export async function scanPowerPlan(): Promise<ScanModuleResult<PowerPlanData>> {
  try {
    console.log('[scan:power-plan] Querying active power plan...')

    const output = await tryRunCmd('powercfg /getactivescheme', 10000)
    if (!output) {
      return { success: false, error: 'powercfg returned no output', partial: true }
    }

    // Output: "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)"
    const guidMatch = output.match(/([0-9a-f-]{36})/i)
    const nameMatch = output.match(/\(([^)]+)\)/)

    const guid = guidMatch?.[1]?.toLowerCase() ?? 'unknown'
    const name = nameMatch?.[1]?.trim()
      ?? POWER_PLAN_GUIDS[guid]
      ?? 'Unknown'

    console.log(`[scan:power-plan] Active plan: ${name} (${guid})`)

    return { success: true, data: { name, guid } }
  } catch (error) {
    console.error('[scan:power-plan] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
