// VR Optimization Suite — MMCSS Scan Module
// Reads Multimedia Class Scheduler Service registry settings.
// These settings directly affect VR frame scheduling and CPU priority.

import { readRegistryDword, readRegistry } from '../../utils/registry'
import { VR_REGISTRY_PATHS } from '../../utils/registry'
import type { ScanModuleResult, MmcssConfig } from '../types'

export async function scanMmcss(): Promise<ScanModuleResult<MmcssConfig>> {
  try {
    console.log('[scan:mmcss] Reading MMCSS registry settings...')

    const { systemProfile, gamesTask } = VR_REGISTRY_PATHS.mmcss

    // SystemProfile level
    const systemResponsiveness = readRegistryDword('HKLM', systemProfile, 'SystemResponsiveness') ?? 20
    const networkThrottlingIndex = readRegistryDword('HKLM', systemProfile, 'NetworkThrottlingIndex') ?? 10

    // Games task level
    const gamesTaskPriority = readRegistryDword('HKLM', gamesTask, 'Priority') ?? 2
    const gamesSchedulingCategory = readRegistry('HKLM', gamesTask, 'Scheduling Category') ?? 'Medium'

    console.log(
      `[scan:mmcss] Responsiveness: ${systemResponsiveness}, NetworkThrottling: ${networkThrottlingIndex}, ` +
      `GamesPriority: ${gamesTaskPriority}, GamesCategory: ${gamesSchedulingCategory}`
    )

    return {
      success: true,
      data: {
        systemResponsiveness,
        networkThrottlingIndex,
        gamesTaskPriority,
        gamesSchedulingCategory
      }
    }
  } catch (error) {
    console.error('[scan:mmcss] Error:', (error as Error).message)
    return { success: false, error: (error as Error).message, partial: true }
  }
}
