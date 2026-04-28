// VR Optimization Suite — Rule Engine Types
// Rules evaluate ScanData and produce findings with dual-mode explanations.

import type { ScanData, ConnectionArchetype } from '../scanner/types'

export type Severity = 'critical' | 'warning' | 'info' | 'ok'

export type RuleCategory =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'network'
  | 'vr-runtime'
  | 'processes'
  | 'os-config'
  | 'streaming'
  | 'audio'
  | 'usb'

// ── Rule Definition ──────────────────────────────────────────

export interface Rule {
  /** Unique rule ID, kebab-case. e.g. 'mmcss-priority-low' */
  id: string
  /** Category for grouping in health cards */
  category: RuleCategory
  /** Human-readable name */
  name: string
  /** Optional filtering — rule only applies when these match */
  appliesTo?: {
    connectionArchetypes?: ConnectionArchetype[]
    headsetBrands?: string[]
  }
  /** Evaluate this rule against scan data. Return null if the rule doesn't apply. */
  evaluate: (data: ScanData) => RuleResult | null
}

// ── Rule Result ──────────────────────────────────────────────

export interface RuleResult {
  /** Rule that produced this result */
  ruleId: string
  /** Severity of the finding */
  severity: Severity
  /** Dual-mode explanations */
  explanation: {
    /** Plain English for Simple Mode — no jargon, no registry paths, no hex values */
    simple: string
    /** Technical detail for Advanced Mode — exact values, registry paths, expected vs actual */
    advanced: string
  }
  /** Reference to an automated fix (if available) */
  fixId?: string
  /** Category (copied from rule for convenience in UI) */
  category: RuleCategory
}

// ── Finding (Rule Result + metadata for UI) ──────────────────

export interface Finding {
  /** Unique finding ID (ruleId + scan timestamp) */
  id: string
  /** The rule result */
  result: RuleResult
  /** Whether a fix is available and ready */
  fixAvailable: boolean
  /** Whether this finding was fixed in this session */
  fixed: boolean
}

// ── Executive Summary / Action Plan ─────────────────────────

export type ActionImpact = 'critical' | 'high' | 'medium' | 'low'
export type ActionEffort = 'instant' | 'minutes' | 'hours' | 'research'

export interface ActionStep {
  text: string
  type?: 'do' | 'open' | 'setting' | 'install' | 'reboot' | 'info'
}

export interface ActionPlan {
  /** Unique identifier */
  id: string
  /** 1 = fix immediately, higher = optional/research */
  priority: number
  /** Display category label */
  category: string
  /** Short headline for the action */
  title: string
  /** One-sentence why this matters for VR performance */
  summary: string
  /** How much this fix will help */
  impact: ActionImpact
  /** How much effort the user needs to put in */
  effort: ActionEffort
  /** Human-readable estimate of gain */
  expectedGain: string
  /** Ordered, actionable steps */
  steps: ActionStep[]
  /** IDs of rules that contributed to this recommendation */
  relatedRuleIds: string[]
  /** Which headset / connection types this is relevant to */
  appliesToArchetypes?: string[]
  /** Optional fixId if a one-click fix is available */
  fixId?: string
}

// ── Rule Summary (for settings/debug display) ────────────────

export interface RuleSummary {
  id: string
  category: RuleCategory
  name: string
  appliesTo?: {
    connectionArchetypes?: ConnectionArchetype[]
    headsetBrands?: string[]
  }
}

// ── Health Card Aggregation ──────────────────────────────────

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'scanning' | 'unknown' | 'error'

export interface HealthCardData {
  category: RuleCategory
  label: string
  status: HealthStatus
  /** Number of findings by severity */
  counts: {
    critical: number
    warning: number
    info: number
    ok: number
  }
  /** All findings for this category */
  findings: Finding[]
  /** Summary line for the card (e.g. "NVIDIA RTX 4070 Ti") */
  summary: string
  /** Quick stats for collapsed view (e.g. "45C | 62% util") */
  quickStats: string
  /** Raw metric key-value pairs for the expanded "all data" view */
  rawData?: Array<{ label: string; value: string }>
}
