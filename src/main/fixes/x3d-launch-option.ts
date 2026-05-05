import { findCpuEntry } from '../data/cpu-database'

/**
 * Build the Steam launch-option string for VRChat based on the detected CPU.
 *
 * The /affinity portion is only emitted for single-CCD X3D parts whose mask
 * we can ship with confidence. Dual-CCD X3D chips get /high alone: the
 * V-Cache CCD index is not deterministic across BIOS revisions and shipping
 * the wrong mask would silently push VR threads onto the non-V-Cache die.
 * Runtime CCD detection lands in v0.3.
 *
 * Returns null for unknown CPUs and for Intel (this fix is AMD-specific).
 */
export function buildLaunchOption(cpu: { model: string }): string | null {
  const entry = findCpuEntry(cpu.model)
  if (!entry) return null
  if (entry.vendor !== 'AMD') return null

  if (entry.vcacheAffinityMask) {
    return `cmd /c start /affinity ${entry.vcacheAffinityMask} /high "" %command%`
  }
  return 'cmd /c start /high "" %command%'
}
