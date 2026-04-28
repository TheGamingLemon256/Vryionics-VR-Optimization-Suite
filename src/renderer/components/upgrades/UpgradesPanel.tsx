// VR Optimization Suite — Hardware Upgrade Recommendations Panel
// Glassmorphism UI displaying personalised upgrade paths based on scan data.
// Local type definitions mirror src/main/rules/upgrade-engine.ts (no main-process import).

import React, { useState } from 'react'

// ── Local Type Mirrors ────────────────────────────────────────
// These match the types in upgrade-engine.ts exactly.

export interface UpgradeProduct {
  name: string
  approxPriceUSD: string
  tier: 'budget' | 'mid' | 'high' | 'ultra'
  vrImpactSummary: string
  notes?: string
}

export interface UpgradeRecommendation {
  id: string
  component: 'gpu' | 'cpu' | 'ram' | 'storage' | 'network'
  currentDescription: string
  upgradeTitle: string
  urgency: 'now' | 'soon' | 'eventual'
  vrImpact: string
  products: UpgradeProduct[]
  reasoning: string
  estimatedPerformanceGain: string
}

// Minimal ScanData surface needed for the hardware summary row
interface ScanDataSummary {
  cpu?: { model: string } | null
  gpu?: { devices: Array<{ name: string }> } | null
  ram?: { totalGB: number; type: string } | null
}

// ── Props ─────────────────────────────────────────────────────

export interface UpgradesPanelProps {
  upgrades: UpgradeRecommendation[]
  scanData: ScanDataSummary | null
}

// ── Constants ─────────────────────────────────────────────────

type BudgetFilter = 'all' | 'under-100' | '100-250' | '250-500' | '500+'

const COMPONENT_ICONS: Record<UpgradeRecommendation['component'], string> = {
  gpu: '🖥',
  cpu: '🔲',
  ram: '💾',
  storage: '💿',
  network: '📡'
}

const COMPONENT_LABELS: Record<UpgradeRecommendation['component'], string> = {
  gpu: 'Graphics Card',
  cpu: 'Processor',
  ram: 'Memory',
  storage: 'Storage',
  network: 'Network / Wi-Fi'
}

const URGENCY_CONFIG = {
  now: {
    label: 'Upgrade Now',
    bg: 'bg-vr-critical/15',
    border: 'border-vr-critical/40',
    text: 'text-vr-critical',
    dot: 'bg-vr-critical',
    cardBorder: 'border-vr-critical/25'
  },
  soon: {
    label: 'Consider Soon',
    bg: 'bg-vr-warning/15',
    border: 'border-vr-warning/40',
    text: 'text-vr-warning',
    dot: 'bg-vr-warning',
    cardBorder: 'border-vr-warning/20'
  },
  eventual: {
    label: 'Eventually',
    bg: 'bg-white/5',
    border: 'border-white/15',
    text: 'text-gray-400',
    dot: 'bg-gray-400',
    cardBorder: 'border-white/10'
  }
} as const

const TIER_CONFIG: Record<UpgradeProduct['tier'], { label: string; color: string }> = {
  budget: { label: 'Budget', color: 'text-vr-healthy border-vr-healthy/30 bg-vr-healthy/10' },
  mid:    { label: 'Mid',    color: 'text-vr-scanning border-vr-scanning/30 bg-vr-scanning/10' },
  high:   { label: 'High',   color: 'text-accent-primary border-accent-primary/30 bg-accent-primary/10' },
  ultra:  { label: 'Ultra',  color: 'text-vr-warning border-vr-warning/30 bg-vr-warning/10' }
}

const BUDGET_FILTERS: { id: BudgetFilter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'under-100', label: 'Under $100' },
  { id: '100-250',   label: '$100–250' },
  { id: '250-500',   label: '$250–500' },
  { id: '500+',      label: '$500+' }
]

// ── Helpers ───────────────────────────────────────────────────

function parsePriceMin(priceStr: string): number {
  // Extract first number from e.g. "$230-280 used" → 230, "$99" → 99
  const match = priceStr.match(/\d[\d,]*/)
  return match ? parseInt(match[0].replace(',', ''), 10) : 0
}

function productMatchesBudget(product: UpgradeProduct, filter: BudgetFilter): boolean {
  if (filter === 'all') return true
  const min = parsePriceMin(product.approxPriceUSD)
  if (filter === 'under-100') return min < 100
  if (filter === '100-250')   return min >= 100 && min <= 250
  if (filter === '250-500')   return min > 250 && min <= 500
  if (filter === '500+')      return min > 500
  return true
}

// ── Sub-components ────────────────────────────────────────────

function ProductCard({ product }: { product: UpgradeProduct }): React.ReactElement {
  const tier = TIER_CONFIG[product.tier]
  return (
    <div className="glass-panel-sm p-3.5 rounded-xl border border-white/8 hover:border-white/15 transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 leading-tight">{product.name}</p>
          <p className="text-xs font-mono text-vr-healthy mt-0.5">{product.approxPriceUSD}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tier.color}`}>
          {tier.label}
        </span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{product.vrImpactSummary}</p>
      {product.notes && (
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{product.notes}</p>
      )}
    </div>
  )
}

function UpgradeCard({ rec, budgetFilter }: {
  rec: UpgradeRecommendation
  budgetFilter: BudgetFilter
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const urgency = URGENCY_CONFIG[rec.urgency]
  const icon = COMPONENT_ICONS[rec.component]
  const componentLabel = COMPONENT_LABELS[rec.component]

  const filteredProducts = rec.products.filter((p) => productMatchesBudget(p, budgetFilter))

  return (
    <div className={`glass-panel-sm border ${urgency.cardBorder} rounded-xl overflow-hidden transition-all duration-200`}>
      {/* ── Card Header ───────────────────────────────── */}
      <button
        className="w-full text-left p-4 hover:bg-white/3 transition-colors duration-150"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: icon + title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-xl mt-0.5 shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                  {componentLabel}
                </span>
                {/* Urgency badge */}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${urgency.bg} border ${urgency.border} ${urgency.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${urgency.dot}`} />
                  {urgency.label}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white/90 leading-snug">{rec.upgradeTitle}</h3>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rec.currentDescription}</p>
            </div>
          </div>
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0 mt-1 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* ── Expanded Detail ───────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/6 p-4 space-y-4">
          {/* VR Impact summary */}
          <div className="flex items-start gap-2.5">
            <span className="text-vr-healthy text-base shrink-0 mt-0.5">✦</span>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">What You Gain</p>
              <p className="text-sm text-gray-200 leading-relaxed">{rec.vrImpact}</p>
            </div>
          </div>

          {/* Performance gain estimate */}
          <div className="glass-panel-sm rounded-lg px-3.5 py-2.5 border border-white/6">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Est. Performance Gain</p>
            <p className="text-xs text-accent-primary font-medium">{rec.estimatedPerformanceGain}</p>
          </div>

          {/* Reasoning */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Why This Matters for VR</p>
            <p className="text-xs text-gray-400 leading-relaxed">{rec.reasoning}</p>
          </div>

          {/* Product recommendations */}
          {filteredProducts.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Recommended Options</p>
              <div className="grid grid-cols-1 gap-2.5">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.name} product={product} />
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-panel-sm rounded-lg px-3.5 py-3 border border-white/6 text-center">
              <p className="text-xs text-gray-500">No products match the selected budget filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HardwareSummaryRow({ scanData }: { scanData: ScanDataSummary | null }): React.ReactElement | null {
  if (!scanData) return null

  const gpuName = scanData.gpu?.devices?.[0]?.name ?? null
  const cpuName = scanData.cpu?.model ?? null
  const ramDesc = scanData.ram ? `${scanData.ram.totalGB}GB ${scanData.ram.type}` : null

  const items = [
    gpuName && { icon: '🖥', label: 'GPU', value: gpuName },
    cpuName && { icon: '🔲', label: 'CPU', value: cpuName },
    ramDesc  && { icon: '💾', label: 'RAM', value: ramDesc }
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>

  if (items.length === 0) return null

  return (
    <div className="glass-panel-sm border border-white/8 rounded-xl p-3.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2.5">Your Current Hardware</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">{item.icon}</span>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className="text-xs text-white/80 font-medium truncate max-w-[200px]">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ hasScanData }: { hasScanData: boolean }): React.ReactElement {
  if (!hasScanData) {
    return (
      <div className="flex flex-col items-center justify-center h-72 space-y-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center text-3xl">
          🔍
        </div>
        <div>
          <h2 className="text-base font-bold text-white mb-1.5">No Scan Data Yet</h2>
          <p className="text-sm text-gray-400 max-w-sm">
            Run a full system scan from the Dashboard to get personalised hardware upgrade
            recommendations based on your PC.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4 text-center px-4">
      <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center text-3xl">
        ✅
      </div>
      <div>
        <h2 className="text-base font-bold text-white mb-1.5">No Upgrades Needed</h2>
        <p className="text-sm text-gray-400 max-w-sm">
          Your hardware is well-configured for VR. No immediate upgrade recommendations to show.
        </p>
      </div>
    </div>
  )
}

// ── Budget Filter Bar ─────────────────────────────────────────

function BudgetFilterBar({ active, onChange }: {
  active: BudgetFilter
  onChange: (f: BudgetFilter) => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mr-1">Budget:</span>
      {BUDGET_FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border ${
            active === f.id
              ? 'bg-accent-primary/20 border-accent-primary/40 text-accent-primary'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white/70'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────

export default function UpgradesPanel({ upgrades, scanData }: UpgradesPanelProps): React.ReactElement {
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all')

  const urgencyGroups = {
    now:      upgrades.filter((u) => u.urgency === 'now'),
    soon:     upgrades.filter((u) => u.urgency === 'soon'),
    eventual: upgrades.filter((u) => u.urgency === 'eventual')
  }

  const hasScanData = scanData !== null
  const hasUpgrades = upgrades.length > 0

  return (
    <div className="page-enter flex flex-col gap-5">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Hardware Upgrade Path</h1>
          <p className="text-sm text-gray-400 mt-1">
            {hasScanData
              ? 'Cost-effective VR improvements — personalised to your current hardware'
              : 'Run a scan to get personalised upgrade recommendations'}
          </p>
        </div>

        {/* Urgency summary pills */}
        {hasUpgrades && (
          <div className="flex items-center gap-2 flex-wrap">
            {urgencyGroups.now.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-vr-critical/15 border border-vr-critical/35 text-vr-critical">
                <span className="w-1.5 h-1.5 rounded-full bg-vr-critical" />
                {urgencyGroups.now.length} Upgrade Now
              </span>
            )}
            {urgencyGroups.soon.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-vr-warning/15 border border-vr-warning/35 text-vr-warning">
                <span className="w-1.5 h-1.5 rounded-full bg-vr-warning" />
                {urgencyGroups.soon.length} Consider Soon
              </span>
            )}
            {urgencyGroups.eventual.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/8 border border-white/15 text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                {urgencyGroups.eventual.length} Eventually
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Hardware Summary Row ────────────────────── */}
      {hasScanData && <HardwareSummaryRow scanData={scanData} />}

      {/* ── Budget Filter ────────────────────────────── */}
      {hasUpgrades && (
        <BudgetFilterBar active={budgetFilter} onChange={setBudgetFilter} />
      )}

      {/* ── Main Content ─────────────────────────────── */}
      {!hasUpgrades ? (
        <EmptyState hasScanData={hasScanData} />
      ) : (
        <div className="flex flex-col gap-6">

          {/* Upgrade Now group */}
          {urgencyGroups.now.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-vr-critical" />
                <h2 className="text-sm font-bold text-vr-critical uppercase tracking-wider">
                  Upgrade Now
                </h2>
                <span className="text-xs text-gray-500">— Significant impact on VR quality</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {urgencyGroups.now.map((rec) => (
                  <UpgradeCard key={rec.id} rec={rec} budgetFilter={budgetFilter} />
                ))}
              </div>
            </section>
          )}

          {/* Consider Soon group */}
          {urgencyGroups.soon.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-vr-warning" />
                <h2 className="text-sm font-bold text-vr-warning uppercase tracking-wider">
                  Consider Soon
                </h2>
                <span className="text-xs text-gray-500">— Meaningful improvement when budget allows</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {urgencyGroups.soon.map((rec) => (
                  <UpgradeCard key={rec.id} rec={rec} budgetFilter={budgetFilter} />
                ))}
              </div>
            </section>
          )}

          {/* Eventually group */}
          {urgencyGroups.eventual.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                  Eventually
                </h2>
                <span className="text-xs text-gray-500">— Future-proofing and nice-to-have improvements</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {urgencyGroups.eventual.map((rec) => (
                  <UpgradeCard key={rec.id} rec={rec} budgetFilter={budgetFilter} />
                ))}
              </div>
            </section>
          )}

          {/* Disclaimer footer */}
          <div className="glass-panel-sm rounded-xl border border-white/6 px-4 py-3 text-center">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Prices are approximate USD as of 2024/2025. Check current market prices before purchasing.
              Used hardware prices vary significantly — verify seller reputation.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
