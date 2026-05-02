// Vryionics VR Optimization Suite — Hardware Deep-Knowledge Rules
//
// Phase-7 rules that consume the three new databases:
//   • WIFI_CHIPSET_DATABASE (per-chipset VR quirks & driver notes)
//   • RAM_KIT_DATABASE       (known-good / known-bad kits for VR)
//   • MOTHERBOARD_CHIPSET_DATABASE (per-chipset BIOS / PCIe guidance)

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { findWifiChipset } from '../../data/wifi-chipset-database'
import { findRamKitCandidates } from '../../data/ram-kit-database'
import { findMotherboardChipset } from '../../data/motherboard-chipset-database'

// Wi-Fi CHIPSET RULES

/**
 * Emit chipset-specific guidance when the user's Wi-Fi adapter is
 * recognized in the deep-knowledge database. Fires for ALL chipsets
 * (informational when excellent, warning when poor) — so a user on an
 * AX210 sees confirmation, a user on RTL8822 sees upgrade advice.
 */
const wifiChipsetGuidance: Rule = {
  id: 'wifi-chipset-deep-knowledge',
  category: 'network',
  name: 'Wi-Fi Chipset Deep Knowledge',
  appliesTo: { connectionArchetypes: ['wifi-wireless'] },
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.network) return null
    const wifi = data.network.adapters.find((a) => a.type === 'Wi-Fi' && a.connected)
    if (!wifi) return null
    // InterfaceDescription lives on the adapter's name in our schema post-classification.
    // We already populated chipsetFamily so we can try to match that first,
    // then fall back to the raw name if chipsetFamily is missing.
    const desc = wifi.chipsetFamily ?? wifi.name ?? ''
    const entry = findWifiChipset(desc)
    if (!entry) return null

    // Severity maps from the chipset's vrSuitability rating
    const severityMap: Record<typeof entry.vrSuitability, RuleResult['severity']> = {
      excellent: 'info',
      good:      'info',
      mediocre:  'warning',
      poor:      'warning',
      unknown:   'info',
    }
    const severity = severityMap[entry.vrSuitability]

    const simpleLines = [
      `Wi-Fi adapter: ${entry.family} (${entry.standard}).`,
      `VR suitability: ${entry.vrSuitability}. ${entry.oneLiner}`,
    ]
    if (entry.driverNotes.vrQuirk) {
      simpleLines.push('')
      simpleLines.push(`VR-specific note: ${entry.driverNotes.vrQuirk}`)
    }
    if (entry.driverNotes.recommendedVersion) {
      simpleLines.push('')
      simpleLines.push(`Recommended driver: ${entry.driverNotes.recommendedVersion}`)
    }

    const advancedLines = [
      `Wi-Fi chipset: ${entry.family}`,
      `Vendor: ${entry.vendor} | Release year: ${entry.releaseYear}`,
      `Standard: ${entry.standard} | Max channel width: ${entry.maxChannelWidthMHz} MHz`,
      `6 GHz support: ${entry.supports6GHz ? 'yes' : 'no'} | MLO: ${entry.supportsMLO ? 'yes' : 'no'}`,
      `VR suitability: ${entry.vrSuitability}`,
      '',
      `Driver source preference: ${entry.driverNotes.preferredSource}`,
    ]
    if (entry.driverNotes.recommendedVersion) {
      advancedLines.push(`Recommended version: ${entry.driverNotes.recommendedVersion}`)
    }
    if (entry.driverNotes.knownBadVersions?.length) {
      advancedLines.push(`Avoid: ${entry.driverNotes.knownBadVersions.join(', ')}`)
    }
    advancedLines.push('')
    advancedLines.push('Chipset-specific VR quirks:')
    for (const q of entry.quirks) advancedLines.push(`  • ${q}`)

    return {
      ruleId: 'wifi-chipset-deep-knowledge',
      severity,
      category: 'network',
      explanation: {
        simple: simpleLines.join('\n'),
        advanced: advancedLines.join('\n'),
      },
    }
  },
}

// RAM KIT RULES

/**
 * Identify the user's RAM kit from Manufacturer + speed + type, then
 * surface per-kit VR guidance. Primary value is flagging "you have a
 * premium kit — use its full capability" vs "you have a budget kit —
 * here's what you lose vs premium".
 */
const ramKitIdentification: Rule = {
  id: 'ram-kit-deep-knowledge',
  category: 'ram',
  name: 'RAM Kit Deep Knowledge',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.ram) return null
    // WMI RAM manufacturer comes from the scanner — we read it through the
    // ram module's raw data. For now we rely on data.ram's optional fields.
    // The `manufacturer` field isn't exposed directly on RamData, so we use
    // whatever the OS reports via cached upgrade-engine context if available.
    // Best-effort: many boards report manufacturer via SPD, but this is spotty.
    // We'll accept that this rule only fires when we have a clear match.
    const manufacturer = (data.ram as any).manufacturer ?? ''
    if (!manufacturer || manufacturer.length < 2) return null
    const speed = data.ram.speed
    const type = data.ram.type
    if (!speed || !type || type === 'Unknown') return null

    const candidates = findRamKitCandidates(manufacturer, speed, type as 'DDR4' | 'DDR5')
    if (candidates.length === 0) return null
    const match = candidates[0]  // best speed match

    const severityMap: Record<typeof match.vrSuitability, RuleResult['severity']> = {
      excellent: 'info',
      good:      'info',
      mediocre:  'info',
      poor:      'warning',
    }
    const severity = severityMap[match.vrSuitability]

    const simpleLines = [
      `RAM kit: likely ${match.vendor} ${match.lineName}.`,
      `VR suitability: ${match.vrSuitability}. ${match.oneLiner}`,
    ]

    const advancedLines = [
      `RAM kit match (inferred from manufacturer + speed):`,
      `  Manufacturer (WMI): ${manufacturer}`,
      `  Matched kit:        ${match.vendor} ${match.lineName}`,
      `  Rated: ${match.speedMHz} MHz CL${match.casLatency} ${match.type}`,
      `  Platform profiles:  ${match.platforms.join(', ')}`,
      `  VR suitability:     ${match.vrSuitability}`,
      '',
      'Kit-specific quirks:',
    ]
    for (const q of match.quirks) advancedLines.push(`  • ${q}`)

    if (candidates.length > 1) {
      advancedLines.push('')
      advancedLines.push(`Other possible matches for this manufacturer + speed:`)
      for (const c of candidates.slice(1, 3)) {
        advancedLines.push(`  • ${c.vendor} ${c.lineName} (CL${c.casLatency})`)
      }
    }

    return {
      ruleId: 'ram-kit-deep-knowledge',
      severity,
      category: 'ram',
      explanation: {
        simple: simpleLines.join('\n'),
        advanced: advancedLines.join('\n'),
      },
    }
  },
}

// MOTHERBOARD CHIPSET RULES

/**
 * Surface per-chipset VR guidance. Fires whenever the user's motherboard
 * chipset is recognized — info level for all tiers, because the
 * information is useful context even on flagships.
 */
const motherboardChipsetGuidance: Rule = {
  id: 'motherboard-chipset-deep-knowledge',
  category: 'os-config',
  name: 'Motherboard Chipset Deep Knowledge',
  evaluate: (data: ScanData): RuleResult | null => {
    const mb = data.compat?.motherboard
    if (!mb || !mb.model) return null
    const entry = findMotherboardChipset(mb.model)
    if (!entry) return null

    const simpleLines = [
      `Motherboard chipset: ${entry.name} (${entry.vendor} ${entry.socket}).`,
      entry.oneLiner,
    ]
    // BIOS age warning — more than 18 months old + Intel 13/14th gen should
    // definitely update for 0x12B microcode
    if (mb.biosDate) {
      const biosDate = new Date(mb.biosDate)
      const ageMonths = (Date.now() - biosDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (ageMonths > 18) {
        simpleLines.push('')
        simpleLines.push(
          `Your BIOS is from ${mb.biosDate} (${Math.round(ageMonths)} months old). ` +
          `Check your motherboard vendor's site for a newer BIOS — VR-relevant AGESA / microcode updates are common.`
        )
      }
    }

    const advancedLines = [
      `Motherboard: ${mb.manufacturer} ${mb.model}`,
      `Chipset: ${entry.name} (${entry.vendor} ${entry.socket}, ${entry.releaseYear}, ${entry.tier})`,
      mb.biosVersion ? `BIOS version: ${mb.biosVersion}` : '',
      mb.biosDate    ? `BIOS date:    ${mb.biosDate}`    : '',
      '',
      `Platform capability:`,
      `  PCIe GPU lane gen:      ${entry.pcieGpuGen}.0`,
      `  Max memory speed:       ${entry.maxMemorySpeedMHz} MHz (rated)`,
      `  ReBAR supported:        ${entry.reBarSupported ? 'yes' : 'no'}`,
      `  PCIe bifurcation:       ${entry.bifurcationSupported ? 'yes' : 'no'}`,
      '',
      `BIOS features:`,
      `  Memory Gear 1 (Intel):  ${entry.biosFeatures.memoryGear1Available ? 'available' : 'n/a'}`,
      `  Fan curve controls:     ${entry.biosFeatures.fanCurveControls ? 'available' : 'limited'}`,
      `  BCLK overclocking:      ${entry.biosFeatures.bclkOverclocking ? 'available' : 'no'}`,
      '',
      'Chipset-specific VR quirks:',
    ].filter(Boolean)
    for (const q of entry.quirks) advancedLines.push(`  • ${q}`)

    return {
      ruleId: 'motherboard-chipset-deep-knowledge',
      severity: 'info',
      category: 'os-config',
      explanation: {
        simple: simpleLines.join('\n'),
        advanced: advancedLines.join('\n'),
      },
    }
  },
}

/**
 * Budget-chipset warning: H610 / A620 significantly limit VR memory
 * performance. Fires only for those two chipsets since they're the only
 * ones where the limitation is substantial enough to flag proactively.
 */
const budgetChipsetLimitation: Rule = {
  id: 'motherboard-chipset-budget-limits',
  category: 'os-config',
  name: 'Budget Chipset: Memory Speed Limited for VR',
  evaluate: (data: ScanData): RuleResult | null => {
    const mb = data.compat?.motherboard
    if (!mb || !mb.model) return null
    const entry = findMotherboardChipset(mb.model)
    if (!entry) return null
    if (entry.tier !== 'budget' && entry.tier !== 'entry') return null

    return {
      ruleId: 'motherboard-chipset-budget-limits',
      severity: 'info',
      category: 'os-config',
      explanation: {
        simple:
          `Your ${entry.name} chipset is a budget tier — it caps memory speed at ~${entry.maxMemorySpeedMHz} MHz. ` +
          `VR benefits significantly from faster memory (DDR5-6000 CL30 on modern platforms). ` +
          `If you're building for VR, stepping up to a ${entry.vendor === 'AMD' ? 'B650' : 'B760'}-class board ` +
          `(+$30-60) unlocks meaningfully better VR memory performance — often more impactful than a CPU upgrade at the same budget.`,
        advanced:
          `Chipset: ${entry.name} (${entry.tier})\n` +
          `Max memory speed: ${entry.maxMemorySpeedMHz} MHz (rated)\n` +
          `VR-ideal memory speed: DDR5-6000 CL30 (AM5) or DDR5-6000 CL30 / DDR4-3600 CL16 (Intel)\n\n` +
          `Why memory speed matters in VR:\n` +
          `  CPU-heavy VR titles (VRChat populated worlds, MSFS, DCS) are bottlenecked by memory latency,\n` +
          `  not CPU clocks. A 5800X3D or 7800X3D on a budget chipset with JEDEC-baseline RAM (DDR5-4800)\n` +
          `  loses 10-20% of the V-Cache / fast-CPU benefit vs the same CPU on a proper enthusiast board.\n\n` +
          `Specific path:\n` +
          `  AM5: A620 → B650 (PCIe 5.0 + DDR5-6000 EXPO support) is the main upgrade path.\n` +
          `  Intel LGA1700: H610 → B760 (XMP support + Gear 1 access) is the main upgrade.\n` +
          `  Intel LGA1851: H810 → B860 (Core Ultra 2 memory OC + PCIe 5.0).\n\n` +
          `Additional quirks on this chipset:\n${entry.quirks.map((q) => `  • ${q}`).join('\n')}`,
      },
    }
  },
}

// EXPORT

export const hardwareDatabaseRules: Rule[] = [
  wifiChipsetGuidance,
  ramKitIdentification,
  motherboardChipsetGuidance,
  budgetChipsetLimitation,
]
