// Vryionics VR Optimization Suite — Game Profile Rules
//
// Detects running / installed VR titles from scanner process data and
// surfaces per-title optimization guidance from GAME_PROFILE_DATABASE.

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { GAME_PROFILE_DATABASE, findGameByProcess, type VrGameProfile } from '../../data/game-profile-database'

function detectRunningGames(data: ScanData): VrGameProfile[] {
  if (!data.processes) return []
  const allProcs = [
    ...data.processes.vrCritical,
    ...data.processes.all,
  ]
  const hits = new Map<string, VrGameProfile>()
  for (const p of allProcs) {
    const g = findGameByProcess(p.name)
    if (g) hits.set(g.id, g)
  }
  return [...hits.values()]
}

/**
 * Active VR title guidance — fires when a known game is running during the scan.
 * Per-game tips, known issues, and recommended SteamVR / reprojection config.
 */
const activeGameRule: Rule = {
  id: 'game-profile-active-title',
  category: 'vr-runtime',
  name: 'Active VR Title: Per-Game Optimization Guidance',
  evaluate: (data: ScanData): RuleResult | null => {
    const running = detectRunningGames(data)
    if (running.length === 0) return null

    const simpleLines = [
      `Detected VR ${running.length === 1 ? 'title' : 'titles'}: ${running.map((g) => g.name).join(', ')}.`,
      '',
    ]
    const advancedLines: string[] = []

    for (const g of running) {
      simpleLines.push(`━━ ${g.name} (${g.category}) ━━`)
      simpleLines.push(`Primary bottleneck: ${g.primaryBottleneck} — recommended SteamVR render res: ${Math.round(g.recommendedSteamvrResolution * 100)}%`)
      simpleLines.push(`Recommended reprojection: ${g.recommendedReprojection}`)
      if (g.inAppTips.length > 0) {
        simpleLines.push('')
        simpleLines.push('Top in-app tips:')
        for (const tip of g.inAppTips.slice(0, 3)) simpleLines.push(`  • ${tip}`)
      }
      simpleLines.push('')

      advancedLines.push(`━━ ${g.name} ━━`)
      advancedLines.push(`Category:               ${g.category}`)
      advancedLines.push(`Primary bottleneck:     ${g.primaryBottleneck}`)
      advancedLines.push(`Secondary bottlenecks:  ${g.secondaryBottlenecks.join(', ') || 'none'}`)
      advancedLines.push(`SteamVR render res:     ${Math.round(g.recommendedSteamvrResolution * 100)}%`)
      advancedLines.push(`Reprojection:           ${g.recommendedReprojection}`)
      advancedLines.push(`Min / rec GPU tier:     ${g.minGpuTier} / ${g.recommendedGpuTier} (from GPU_TIERS)`)
      advancedLines.push(`Min RAM:                ${g.minRamGB} GB`)
      if (g.inAppTips.length > 0) {
        advancedLines.push('')
        advancedLines.push('In-app tips:')
        for (const tip of g.inAppTips) advancedLines.push(`  • ${tip}`)
      }
      if (g.knownIssues.length > 0) {
        advancedLines.push('')
        advancedLines.push('Known issues:')
        for (const iss of g.knownIssues) advancedLines.push(`  • ${iss}`)
      }
      if (g.notes.length > 0) {
        advancedLines.push('')
        advancedLines.push('Notes:')
        for (const n of g.notes) advancedLines.push(`  • ${n}`)
      }
      advancedLines.push('')
    }

    return {
      ruleId: 'game-profile-active-title',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple: simpleLines.join('\n'),
        advanced: advancedLines.join('\n'),
      },
    }
  },
}

/**
 * User-setup-matched game suggestions. If the user picked a primary use
 * case in the wizard and no matching title is running, suggest the most
 * popular titles in that category they might want to tune for.
 */
const suggestedGamesRule: Rule = {
  id: 'game-profile-suggested-by-use-case',
  category: 'vr-runtime',
  name: 'Games Matching Your Primary Use Case',
  evaluate: (data: ScanData): RuleResult | null => {
    const useCase = data.userSetup?.primaryUseCase
    if (!useCase || useCase === 'mixed') return null
    // Don't show this if any relevant game is actually running — active rule handles that
    const running = detectRunningGames(data)
    if (running.length > 0) return null

    const categoryMap: Record<string, string> = {
      'social-vr':    'social-vr',
      'simulation':   'simulation',
      'fitness':      'fitness',
      'action-games': 'action-games',
      'productivity': 'productivity',
    }
    const cat = categoryMap[useCase]
    if (!cat) return null

    const matches = GAME_PROFILE_DATABASE.filter((g) => g.category === cat)
    if (matches.length === 0) return null

    return {
      ruleId: 'game-profile-suggested-by-use-case',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple:
          `Based on your primary-use-case selection, Vryionics has deep knowledge for ${matches.length} ` +
          `${cat} VR ${matches.length === 1 ? 'title' : 'titles'}: ` +
          matches.map((g) => g.name).join(', ') + '. ' +
          `Launch any of them before re-scanning and the action plan will include per-title tuning.`,
        advanced:
          `Primary use case: ${useCase}\n` +
          `Matching titles in GAME_PROFILE_DATABASE:\n` +
          matches.map((g) =>
            `  • ${g.name} (${g.steamAppId ? `Steam ${g.steamAppId}` : 'non-Steam'}) — bottleneck: ${g.primaryBottleneck}`
          ).join('\n'),
      },
    }
  },
}

export const gameProfileRules: Rule[] = [activeGameRule, suggestedGamesRule]
