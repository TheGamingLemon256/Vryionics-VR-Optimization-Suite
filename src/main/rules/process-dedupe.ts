// VR Optimization Suite — Process list dedupe helper
//
// Background process scans often surface many instances of the same
// executable (e.g. 7× discord.exe, 11× msedgewebview2.exe for Teams/Edge
// tab isolation). Raw comma-joins look broken in the UI:
//   "discord, discord, discord, discord, discord, discord..."
// This helper aggregates by name (case-insensitive) and formats a compact,
// stable summary like:
//   "discord ×7, msedgewebview2 ×11, spotify ×4"
// Ordered by count descending so the worst offenders surface first.

import type { ProcessInfo } from '../scanner/types'

export interface DedupedProcess {
  name: string
  count: number
  totalCpuPercent: number
  totalRamMB: number
}

/** Aggregate a flat list of processes by name, case-insensitive. */
export function dedupeProcesses(list: ProcessInfo[]): DedupedProcess[] {
  const map = new Map<string, DedupedProcess>()
  for (const p of list) {
    const key = p.name.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      existing.totalCpuPercent += p.cpuPercent
      existing.totalRamMB += p.ramMB
    } else {
      map.set(key, {
        name: p.name, // preserve first-seen casing
        count: 1,
        totalCpuPercent: p.cpuPercent,
        totalRamMB: p.ramMB,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.totalRamMB - a.totalRamMB)
}

/**
 * Human-friendly join. Appends ×N suffix only when the process has multiple
 * instances, so single-instance items still read naturally:
 *   "discord ×7, lghub_agent, spotify ×4"
 */
export function formatDedupedNames(
  deduped: DedupedProcess[],
  limit = 6,
): string {
  const head = deduped.slice(0, limit)
  const tail = deduped.length - head.length
  const parts = head.map((d) => (d.count > 1 ? `${d.name} ×${d.count}` : d.name))
  if (tail > 0) parts.push(`+${tail} more`)
  return parts.join(', ')
}

/** One-step shortcut: input = raw process list, output = display string. */
export function summariseProcessList(list: ProcessInfo[], limit = 6): string {
  return formatDedupedNames(dedupeProcesses(list), limit)
}
