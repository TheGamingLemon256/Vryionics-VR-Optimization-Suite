// VR Optimization Suite — Headset-Profile-Driven Rules
//
// These rules pull directly from the user's selected headset profile
// (scanData.headsetProfile) and surface:
//   1. Profile-declared knownIssues (each issue → one finding)
//   2. Profile-declared optimizationTips filtered by active connection
//   3. Under-spec warnings when detected RAM/GPU falls below profile minimums
//   4. Deviation from the profile's recommended supersampling / reprojection
//
// The profile is loaded at scan time by scanner/engine.ts and attached to
// ScanData.headsetProfile as `unknown`. We cast here and null-check.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import type { HeadsetProfile, KnownIssue, OptimizationTip } from '../../headsets/types'


function getProfile(data: ScanData): HeadsetProfile | null {
  const p = data.headsetProfile as HeadsetProfile | null | undefined
  if (!p) return null
  // Basic shape check — avoid crashing if an old / malformed profile sneaks through
  if (typeof p.id !== 'string' || !Array.isArray(p.connections)) return null
  return p
}

/**
 * Map profile KnownIssue severity to rule Severity. Profile uses 'ok' too
 * but in rules we treat that as info-level (rule engine only shows findings
 * with issues, so 'ok' is effectively no-op).
 */
function mapSeverity(s: KnownIssue['severity']): RuleResult['severity'] {
  if (s === 'critical') return 'critical'
  if (s === 'warning') return 'warning'
  return 'info'
}

/**
 * Parse minimum GPU text from a profile (e.g. "GTX 1060 / RX 580") into a
 * rough tier score we can compare against detected GPU. Very approximate —
 * the goal is to catch obvious under-spec, not fine-grained gradations.
 *
 * Returns null when the GPU name is unrecognizable.
 */
function gpuTierScore(gpuName: string): number | null {
  const n = gpuName.toUpperCase()
  // NVIDIA
  if (n.includes('RTX 50') || /RTX\s?50\d{2}/.test(n)) return 12
  if (n.includes('RTX 4090') || n.includes('RTX 4080')) return 11
  if (n.includes('RTX 4070')) return 10
  if (n.includes('RTX 4060')) return 9
  if (n.includes('RTX 3090') || n.includes('RTX 3080')) return 10
  if (n.includes('RTX 3070')) return 9
  if (n.includes('RTX 3060')) return 8
  if (n.includes('RTX 2080')) return 8
  if (n.includes('RTX 2070')) return 7
  if (n.includes('RTX 2060')) return 6
  if (n.includes('GTX 1660')) return 5
  if (n.includes('GTX 1080')) return 6
  if (n.includes('GTX 1070')) return 5
  if (n.includes('GTX 1060')) return 4
  if (n.includes('GTX 1050')) return 3
  // AMD
  if (/RX\s?79/.test(n)) return 10
  if (/RX\s?78/.test(n)) return 9
  if (/RX\s?77/.test(n)) return 9
  if (/RX\s?76/.test(n)) return 8
  if (/RX\s?75/.test(n)) return 7
  if (/RX\s?69/.test(n) || /RX\s?68/.test(n)) return 8
  if (/RX\s?67/.test(n) || /RX\s?66/.test(n)) return 7
  if (/RX\s?65/.test(n) || /RX\s?64/.test(n)) return 6
  if (/RX\s?58\d/.test(n)) return 4
  if (/RX\s?57\d/.test(n)) return 4
  if (/RX\s?56\d/.test(n)) return 3
  return null
}


/**
 * Surface profile-declared knownIssues as findings — one per issue, scoped
 * to the connection archetype if the issue declares affectsConnectionTypes.
 *
 * Previously this data sat unused in every headset JSON. Now every user gets
 * per-headset warnings (Rift S 80 Hz lock, Crystal Super DSC chain, Vive Pro 2
 * wireless bandwidth caveats, etc.) the moment they complete setup.
 */
const headsetKnownIssuesRule: Rule = {
  id: 'headset-profile-known-issues',
  category: 'vr-runtime',
  name: 'Headset-Specific Known Issues',
  evaluate: (data: ScanData): RuleResult | null => {
    const profile = getProfile(data)
    if (!profile) return null
    const issues = profile.knownIssues ?? []
    if (issues.length === 0) return null

    // Filter to issues relevant to this user's connection archetype
    const archetype = data.connectionArchetype
    const relevant: KnownIssue[] = issues.filter((issue) => {
      if (!issue.affectsConnectionTypes || issue.affectsConnectionTypes.length === 0) return true
      if (!archetype) return true
      // `affectsConnectionTypes` uses connection IDs (e.g. "quest3-airlink"),
      // not archetypes — match by checking if any of the profile's matching
      // connections share that ID AND archetype.
      const connIdsForArchetype = profile.connections
        .filter((c) => c.archetype === archetype)
        .map((c) => c.id)
      return issue.affectsConnectionTypes.some((id) => connIdsForArchetype.includes(id))
    })

    if (relevant.length === 0) return null

    // Highest-severity issue drives the finding severity. All relevant issues
    // are packed into the advanced text so the user sees them all.
    const maxSeverity = relevant.reduce<RuleResult['severity']>((max, issue) => {
      const s = mapSeverity(issue.severity)
      if (s === 'critical') return 'critical'
      if (s === 'warning' && max !== 'critical') return 'warning'
      return max
    }, 'info')

    const simpleLines = [
      `${profile.brand} ${profile.model} has ${relevant.length} known ${relevant.length === 1 ? 'issue' : 'issues'} that may affect you:`,
      '',
    ]
    for (const issue of relevant) {
      simpleLines.push(`• ${issue.title}`)
      simpleLines.push(`    ${issue.description}`)
      if (issue.workaround) simpleLines.push(`    Workaround: ${issue.workaround}`)
      simpleLines.push('')
    }

    const advancedLines = [
      `Headset profile: ${profile.brand} ${profile.model} (${profile.id})`,
      `Active connection archetype: ${archetype ?? 'unspecified'}`,
      `Matched ${relevant.length}/${issues.length} known issue${issues.length !== 1 ? 's' : ''} for this archetype.`,
      '',
    ]
    for (const issue of relevant) {
      advancedLines.push(`━━ ${issue.title} [${issue.severity}] ━━`)
      advancedLines.push(issue.description)
      if (issue.workaround) {
        advancedLines.push('')
        advancedLines.push(`Workaround: ${issue.workaround}`)
      }
      if (issue.fix) {
        advancedLines.push(`Automated fix available: ${issue.fix}`)
      }
      advancedLines.push('')
    }

    return {
      ruleId: 'headset-profile-known-issues',
      severity: maxSeverity,
      category: 'vr-runtime',
      explanation: {
        simple: simpleLines.join('\n').trim(),
        advanced: advancedLines.join('\n').trim(),
      },
    }
  },
}

/**
 * Surface profile-declared optimizationTips filtered to this connection.
 * Only emits when at least one tip applies — doesn't nag for headsets with
 * no tips or when none match the active archetype.
 */
const headsetOptimizationTipsRule: Rule = {
  id: 'headset-profile-optimization-tips',
  category: 'vr-runtime',
  name: 'Headset-Specific Optimization Tips',
  evaluate: (data: ScanData): RuleResult | null => {
    const profile = getProfile(data)
    if (!profile) return null
    const tips = profile.optimizationTips ?? []
    if (tips.length === 0) return null

    // Filter tips to those applicable to the user's connection
    const archetype = data.connectionArchetype
    const connIdsForArchetype = archetype
      ? profile.connections.filter((c) => c.archetype === archetype).map((c) => c.id)
      : []

    const relevant: OptimizationTip[] = tips.filter((tip) => {
      if (!tip.applicableConnections || tip.applicableConnections.length === 0) return true
      if (!archetype) return true
      return tip.applicableConnections.some((id) => connIdsForArchetype.includes(id))
    })

    if (relevant.length === 0) return null

    const simpleLines = [
      `${relevant.length} optimization tip${relevant.length !== 1 ? 's' : ''} specific to the ${profile.brand} ${profile.model}:`,
      '',
    ]
    for (const tip of relevant) {
      simpleLines.push(`• [${tip.category}] ${tip.tip}`)
      simpleLines.push(`    ${tip.simpleExplanation}`)
      simpleLines.push('')
    }

    const advancedLines = [
      `Profile tips filtered to archetype=${archetype ?? 'any'}:`,
      '',
    ]
    for (const tip of relevant) {
      advancedLines.push(`━━ ${tip.tip} [${tip.category}] ━━`)
      advancedLines.push(tip.advancedExplanation)
      advancedLines.push('')
    }

    return {
      ruleId: 'headset-profile-optimization-tips',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple: simpleLines.join('\n').trim(),
        advanced: advancedLines.join('\n').trim(),
      },
    }
  },
}

/** Compare detected system RAM to profile's minRAM field. */
const headsetMinRamRule: Rule = {
  id: 'headset-profile-ram-below-min',
  category: 'ram',
  name: 'RAM Below Headset Minimum Spec',
  evaluate: (data: ScanData): RuleResult | null => {
    const profile = getProfile(data)
    if (!profile || !data.ram) return null
    const minRam = profile.requirements?.minRAM
    if (!minRam || typeof minRam !== 'number') return null
    if (data.ram.totalGB >= minRam) return null

    // Significantly below minimum is a critical issue; within 25% is warning.
    const deficit = minRam - data.ram.totalGB
    const severity: RuleResult['severity'] = deficit > minRam * 0.25 ? 'critical' : 'warning'

    return {
      ruleId: 'headset-profile-ram-below-min',
      severity,
      category: 'ram',
      explanation: {
        simple:
          `Your system has ${data.ram.totalGB} GB of RAM, but the ${profile.brand} ${profile.model} ` +
          `lists ${minRam} GB as the minimum recommended. You can run VR, but expect occasional ` +
          `stutters when the OS + VR runtime + game exhaust available memory. ` +
          `Doubling to ${minRam * 2} GB is the single most impactful upgrade if your motherboard has ` +
          `spare DIMM slots.`,
        advanced:
          `Detected RAM: ${data.ram.totalGB} GB (${data.ram.type}-${data.ram.speed})\n` +
          `Profile minimum: ${minRam} GB\n` +
          `Deficit: ${deficit.toFixed(1)} GB (${((deficit / minRam) * 100).toFixed(0)}% short)\n\n` +
          `At this RAM budget, VR apps that page to disk during world/avatar streaming will hitch ` +
          `noticeably. Standby list exhaustion (see Live Optimizer → "Periodic Standby List Flush") ` +
          `becomes a consistent problem rather than an occasional one. ` +
          `Minimum recommended upgrade: ${minRam * 2} GB dual-channel.`,
      },
    }
  },
}

/** Compare detected primary GPU tier to profile's minGPU. */
const headsetMinGpuRule: Rule = {
  id: 'headset-profile-gpu-below-min',
  category: 'gpu',
  name: 'GPU Below Headset Minimum Spec',
  evaluate: (data: ScanData): RuleResult | null => {
    const profile = getProfile(data)
    if (!profile || !data.gpu || data.gpu.devices.length === 0) return null
    const primary = data.gpu.devices[data.gpu.primaryGpuIndex] ?? data.gpu.devices[0]
    if (!primary || primary.isIntegrated) return null  // iGPU has a dedicated rule

    const detectedScore = gpuTierScore(primary.name)
    if (detectedScore === null) return null  // Unknown GPU — can't classify, stay silent

    const minGpuText = profile.requirements?.minGPU ?? ''
    const recGpuText = profile.requirements?.recommendedGPU ?? ''
    if (!minGpuText) return null

    // Score the profile's min GPU by checking each listed alternative
    // ("GTX 1060 / RX 580" → max of the two).
    const minScores = minGpuText
      .split(/[/,]/)
      .map((s) => gpuTierScore(s.trim()))
      .filter((s): s is number => s !== null)
    if (minScores.length === 0) return null
    const minScore = Math.max(...minScores)

    if (detectedScore >= minScore) return null  // meets minimum

    const severity: RuleResult['severity'] = detectedScore < minScore - 2 ? 'critical' : 'warning'

    return {
      ruleId: 'headset-profile-gpu-below-min',
      severity,
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} is below the minimum recommended GPU for the ` +
          `${profile.brand} ${profile.model} (${minGpuText}). You'll need to run at aggressive ` +
          `supersampling reductions and may need motion smoothing / ASW active just to maintain ` +
          `acceptable frame rates.` +
          (recGpuText ? ` The recommended GPU for this headset is ${recGpuText}.` : ''),
        advanced:
          `Detected primary GPU: ${primary.name} (tier ≈ ${detectedScore})\n` +
          `Profile minGPU: ${minGpuText} (tier ≈ ${minScore})\n` +
          `Profile recommendedGPU: ${recGpuText || '—'}\n\n` +
          `Immediate mitigations:\n` +
          `  • SteamVR render resolution ≤ 80%\n` +
          `  • Enable motion smoothing / ASW\n` +
          `  • OpenXR Toolkit FSR Performance mode\n` +
          `  • Lower in-game shadow/AA settings\n\n` +
          `At tier ${detectedScore} vs target ${minScore}, expect to sit at 60-75% of target ` +
          `frame time in most VR titles. Titles built for this headset's native resolution ` +
          `(as opposed to lower-res default settings) will be substantially harder to run.`,
      },
    }
  },
}


export const headsetProfileRules: Rule[] = [
  headsetKnownIssuesRule,
  headsetOptimizationTipsRule,
  headsetMinRamRule,
  headsetMinGpuRule,
]
