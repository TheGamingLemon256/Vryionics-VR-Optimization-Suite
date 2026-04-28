// VR Optimization Suite — Rule Evaluation Engine
// Loads all rules, filters by headset/connection, evaluates against ScanData.

import { allRules } from './rules/index'
import type { Rule, RuleResult, Finding, RuleSummary, RuleCategory } from './types'
import type { ScanData, ConnectionArchetype } from '../scanner/types'

/**
 * Evaluate all applicable rules against scan data.
 * Returns findings sorted by severity (critical > warning > info > ok).
 */
export function evaluateRules(
  scanData: ScanData,
  headsetBrand?: string
): Finding[] {
  const findings: Finding[] = []
  const connectionArchetype = scanData.connectionArchetype ?? undefined

  for (const rule of allRules) {
    // Filter by connection archetype if the rule specifies one
    if (rule.appliesTo?.connectionArchetypes && connectionArchetype) {
      if (!rule.appliesTo.connectionArchetypes.includes(connectionArchetype)) {
        continue
      }
    }

    // Filter by headset brand if the rule specifies one
    if (rule.appliesTo?.headsetBrands && headsetBrand) {
      if (!rule.appliesTo.headsetBrands.includes(headsetBrand)) {
        continue
      }
    }

    // Evaluate the rule
    try {
      const result = rule.evaluate(scanData)
      if (!result) continue // Rule doesn't apply or conditions not met

      findings.push({
        id: `${rule.id}-${scanData.timestamp}`,
        result,
        fixAvailable: !!result.fixId,
        fixed: false
      })
    } catch (error) {
      console.error(`[rules:engine] Rule '${rule.id}' threw:`, (error as Error).message)
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2, ok: 3 }
  findings.sort((a, b) =>
    severityOrder[a.result.severity] - severityOrder[b.result.severity]
  )

  return findings
}

/**
 * Get summaries of all registered rules (for settings/debug display).
 */
export function getAllRuleSummaries(): RuleSummary[] {
  return allRules.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    appliesTo: r.appliesTo
  }))
}

/**
 * Group findings by category for health card display.
 */
export function groupFindingsByCategory(
  findings: Finding[]
): Record<RuleCategory, Finding[]> {
  const groups: Record<string, Finding[]> = {}

  for (const finding of findings) {
    const cat = finding.result.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(finding)
  }

  return groups as Record<RuleCategory, Finding[]>
}
