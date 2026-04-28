// Vryionics VR Optimization Suite — Driver Database Rules
//
// Compares detected GPU driver version against DRIVER_DATABASE and
// surfaces regression / avoid warnings, or confirms golden status.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { findDriverEntry, getRecommendedDriver, type DriverVendor } from '../../data/driver-database'

function vendorOf(gpuVendor: string): DriverVendor | null {
  const v = gpuVendor.toLowerCase()
  if (v.includes('nvidia')) return 'NVIDIA'
  if (v.includes('amd')) return 'AMD'
  if (v.includes('intel')) return 'Intel'
  return null
}

const driverStatusRule: Rule = {
  id: 'gpu-driver-database-status',
  category: 'gpu',
  name: 'GPU Driver Status (Known-Good / Regression Database)',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.gpu || data.gpu.devices.length === 0) return null
    const primary = data.gpu.devices[data.gpu.primaryGpuIndex] ?? data.gpu.devices[0]
    if (!primary) return null
    const vendor = vendorOf(primary.vendor)
    if (!vendor) return null

    const entry = findDriverEntry(vendor, primary.driverVersion ?? '')
    if (!entry) return null

    const severityMap: Record<typeof entry.status, RuleResult['severity']> = {
      golden: 'info',
      recommended: 'info',
      stable: 'info',
      regression: 'warning',
      avoid: 'critical',
    }
    const severity = severityMap[entry.status]
    const rec = entry.status === 'regression' || entry.status === 'avoid'
      ? getRecommendedDriver(vendor, primary.gpuGeneration ?? null)
      : null

    const simpleLines = [
      `GPU driver: ${primary.driverVersion} (${vendor}).`,
      `Status: ${entry.status.toUpperCase()} — ${entry.summary}`,
    ]
    if (rec) {
      simpleLines.push('')
      simpleLines.push(`Recommended upgrade: version ${rec.version} (${rec.releaseDate}) — ${rec.summary}`)
    }

    const advancedLines = [
      `Detected: ${primary.driverVersion} on ${primary.name} (${primary.gpuGeneration ?? 'unknown gen'})`,
      `Database match: ${entry.vendor} ${entry.version} (${entry.releaseDate})`,
      `Status: ${entry.status}`,
      `Applicable generations: ${entry.applicableGenerations?.join(', ') ?? 'all'}`,
      '',
      entry.summary,
      '',
      'Notes:',
      ...entry.notes.map((n) => `  • ${n}`),
    ]
    if (rec) {
      advancedLines.push('')
      advancedLines.push(`Recommended upgrade target:`)
      advancedLines.push(`  ${rec.vendor} ${rec.version} (released ${rec.releaseDate})`)
      advancedLines.push(`  ${rec.summary}`)
      advancedLines.push(...rec.notes.map((n) => `    • ${n}`))
    }

    return {
      ruleId: 'gpu-driver-database-status',
      severity,
      category: 'gpu',
      explanation: {
        simple: simpleLines.join('\n'),
        advanced: advancedLines.join('\n'),
      },
    }
  },
}

export const driverDatabaseRules: Rule[] = [driverStatusRule]
