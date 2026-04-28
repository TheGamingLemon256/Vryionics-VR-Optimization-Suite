// VR Optimization Suite — User-Setup-Driven Rules
//
// Rules keyed off scanData.userSetup (populated by the setup wizard). These
// convert the user's self-reported context — primary VR activity, main
// complaint, PC type — into findings that show the user their answers are
// actually being used.

import type { Rule, RuleResult } from '../types'
import type { ScanData, UserScanSetup } from '../../scanner/types'

const COMPLAINT_LABELS: Record<NonNullable<UserScanSetup['mainComplaint']>, string> = {
  stutters: 'stutters / frame drops',
  blurry:   'blurry image / low resolution',
  latency:  'lag / input latency',
  drops:    'connection or tracking dropouts',
  crashes:  'VR software crashes',
  thermals: 'PC overheating',
  none:     'no complaint — general optimization',
}

const USE_CASE_LABELS: Record<NonNullable<UserScanSetup['primaryUseCase']>, string> = {
  'social-vr':    'Social VR (VRChat / Resonite)',
  'simulation':   'Simulators (MSFS / DCS / iRacing)',
  'fitness':      'Fitness / Rhythm VR',
  'action-games': 'Action / Adventure',
  'productivity': 'Productivity',
  'mixed':        'Mixed use',
}

/**
 * Summary rule that tells the user their wizard answers have been loaded
 * and which complaint/use-case is currently biasing their recommendations.
 * Only fires when at least one answer is set.
 */
const personalizationSummaryRule: Rule = {
  id: 'user-setup-personalization-summary',
  category: 'vr-runtime',
  name: 'Recommendations Personalized to Your Setup',
  evaluate: (data: ScanData): RuleResult | null => {
    const setup = data.userSetup
    if (!setup) return null
    // Only fire when we have meaningful non-default answers
    const hasAny = !!(setup.mainComplaint || setup.primaryUseCase || setup.pcType)
    if (!hasAny) return null

    const lines = [
      `Your wizard answers are active and biasing which findings appear first.`,
      '',
    ]
    if (setup.primaryUseCase) {
      lines.push(`Primary VR activity: ${USE_CASE_LABELS[setup.primaryUseCase]}`)
    }
    if (setup.mainComplaint && setup.mainComplaint !== 'none') {
      lines.push(`Main complaint: ${COMPLAINT_LABELS[setup.mainComplaint]} — related rules are prioritized.`)
    }
    if (setup.pcType === 'laptop') {
      lines.push(`PC type: Laptop — hybrid GPU, battery, and thermal rules are active.`)
    } else if (setup.pcType === 'desktop') {
      lines.push(`PC type: Desktop — laptop-specific rules are skipped.`)
    }
    if (setup.skillLevel) {
      lines.push(`Detail preference: ${setup.skillLevel} — affects Simple vs Advanced display defaults.`)
    }

    return {
      ruleId: 'user-setup-personalization-summary',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple: lines.join('\n'),
        advanced:
          lines.join('\n') + '\n\n' +
          `Change any of these in the sidebar → "Re-run Setup". Answers persist in\n` +
          `%AppData%\\Vryionics VR Optimization Suite\\vros-setup.json and are read every scan.`,
      },
    }
  },
}

/**
 * When the user declared they have no complaints ("just optimizing"),
 * demote critical-severity findings that aren't actionable right now —
 * they don't need urgency framing, they want a tidy workflow.
 *
 * Implemented as a soft hint rather than a filter — actual impact happens in
 * summary-engine's plan boosting. This rule just confirms the bias to the user.
 */
const optimizationModeRule: Rule = {
  id: 'user-setup-optimization-mode',
  category: 'vr-runtime',
  name: 'Optimization Mode — No Active Complaint',
  evaluate: (data: ScanData): RuleResult | null => {
    if (data.userSetup?.mainComplaint !== 'none') return null
    return {
      ruleId: 'user-setup-optimization-mode',
      severity: 'info',
      category: 'vr-runtime',
      explanation: {
        simple:
          `You indicated you have no active complaints. The suite is running in optimization ` +
          `mode — findings focus on tuning and future-proofing rather than fixing urgent issues.`,
        advanced:
          `user-setup mainComplaint=none → summary-engine skips the complaint-boost sort lane.\n` +
          `Plans surface in the default impact × effort order rather than complaint-first.\n\n` +
          `To switch back to issue-first prioritization, rerun the Setup Wizard and pick a\n` +
          `different mainComplaint value.`,
      },
    }
  },
}

export const userSetupRules: Rule[] = [
  personalizationSummaryRule,
  optimizationModeRule,
]
