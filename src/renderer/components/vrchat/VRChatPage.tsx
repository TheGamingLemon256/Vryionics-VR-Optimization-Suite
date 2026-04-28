// Vryionics VR Optimization Suite — VRChat Tuning Page
//
// Focused surface for VRChat-specific optimisations. Pulls together fixes,
// info, and reference material that were previously scattered across the
// general action plan + report views.

import React, { useEffect, useState, useMemo } from 'react'
import { useScanStore } from '../../stores/scan-store'

interface FixPreview {
  fixId: string
  name: string
  description: string
  changes: Array<{ target: string; currentValue: string; newValue: string }>
  requiresAdmin: boolean
  requiresReboot: boolean
  error?: string
}

const VRCHAT_FIX_IDS = [
  'fix-vrchat-pin-vcache',                  // V-Cache CCD pin via Steam launch option
  'fix-vrchat-avatar-culling',              // Distance/visibility tuning
  'fix-vrchat-particle-limit',              // Particle/avatar safety
  'fix-vrchat-cache-size',                  // Disk cache cap tuning
  'fix-vrchat-msaa',                        // MSAA quality vs perf
  'fix-vrchat-osc',                         // OSC port + setup
]

interface FixCard {
  preview: FixPreview | null
  applied: boolean
  applying: boolean
  error?: string
}

export default function VRChatPage(): React.ReactElement {
  const lastScanData = useScanStore((s) => s.lastScanData)
  const [cards, setCards] = useState<Record<string, FixCard>>({})

  const cpuModel = (lastScanData as { cpu?: { model?: string } } | null)?.cpu?.model ?? null
  const isX3D = cpuModel ? /x3d/i.test(cpuModel) : false

  // CPU/world relevant detail — VRChat is overwhelmingly CPU-bound on populated worlds
  const cpuLine = useMemo(() => {
    if (!lastScanData) return null
    const cpu = (lastScanData as { cpu?: { model?: string; cores?: number; threads?: number } }).cpu
    if (!cpu?.model) return null
    return `${cpu.model} · ${cpu.cores} core${cpu.cores === 1 ? '' : 's'} / ${cpu.threads} thread${cpu.threads === 1 ? '' : 's'}`
  }, [lastScanData])

  // Load previews for known VRChat fixes
  useEffect(() => {
    const api = (window as any).api?.fix
    if (!api) return
    let cancelled = false
    ;(async () => {
      const next: Record<string, FixCard> = {}
      const previews: FixPreview[] = (await api.previewAll(VRCHAT_FIX_IDS).catch(() => [])) ?? []
      for (const id of VRCHAT_FIX_IDS) {
        const p = previews.find((pp) => pp.fixId === id) ?? null
        next[id] = { preview: p, applied: false, applying: false }
      }
      if (!cancelled) setCards(next)
    })()
    return () => { cancelled = true }
  }, [])

  const applyFix = async (id: string): Promise<void> => {
    const api = (window as any).api?.fix
    if (!api) return
    setCards((s) => ({ ...s, [id]: { ...s[id], applying: true, error: undefined } }))
    try {
      const result = await api.apply(id)
      setCards((s) => ({
        ...s,
        [id]: { ...s[id], applying: false, applied: !!result.success, error: result.error },
      }))
    } catch (err) {
      setCards((s) => ({
        ...s,
        [id]: { ...s[id], applying: false, error: (err as Error).message },
      }))
    }
  }

  return (
    <div className="page-enter flex flex-col gap-6 max-w-3xl">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">VRChat Tuning</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary border border-accent-primary/30 font-semibold uppercase tracking-widest">Focused</span>
        </div>
        <p className="text-sm text-gray-400">
          VRChat is overwhelmingly CPU-bound on populated worlds — these tweaks target the bottlenecks specific to it.
        </p>
        {cpuLine && (
          <p className="text-[11px] text-gray-500 font-mono mt-1">{cpuLine}{isX3D ? ' · 3D V-Cache detected' : ''}</p>
        )}
      </div>

      {/* X3D V-Cache callout */}
      {isX3D && (
        <div className="glass-panel-sm rounded-xl p-4 border border-vr-healthy/30">
          <p className="text-xs font-semibold text-vr-healthy uppercase tracking-widest mb-1">3D V-Cache CPU Detected</p>
          <p className="text-sm text-white mb-2">
            Your CPU has the L3-cache hardware that VRChat benefits from most. Pin VRChat to the V-Cache CCD via Steam launch option for the largest single per-frame improvement available on your system.
          </p>
          <FixCardView
            id="fix-vrchat-pin-vcache"
            card={cards['fix-vrchat-pin-vcache']}
            onApply={() => applyFix('fix-vrchat-pin-vcache')}
            featured
          />
        </div>
      )}

      {/* Other VRChat fixes — render any with a successful preview */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">VRChat-specific tweaks</h2>
        {VRCHAT_FIX_IDS.filter((id) => id !== 'fix-vrchat-pin-vcache').map((id) => (
          <FixCardView
            key={id}
            id={id}
            card={cards[id]}
            onApply={() => applyFix(id)}
          />
        ))}
      </div>

      {/* Reference */}
      <div className="glass-panel-sm rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Reference</h2>
        <ReferenceLink
          title="Avatar Performance Ranking"
          description="VRChat ranks avatars Excellent / Good / Medium / Poor / Very Poor based on bone count, particles, materials. Hide ranks below Good in populated worlds."
          url="https://docs.vrchat.com/docs/avatar-performance-ranking-system"
        />
        <ReferenceLink
          title="OSC Setup"
          description="OSC port 9000 (in) / 9001 (out) by default. Used by face-tracking, prop tools, and external avatar parameter controllers."
          url="https://docs.vrchat.com/docs/osc-overview"
        />
        <ReferenceLink
          title="Worlds with high impact"
          description="Black Cat, Murder 4, public Avatar Worlds → CPU-bound. Empty private instances → GPU-bound. Tune accordingly."
          url="https://docs.vrchat.com/docs/quality-settings"
        />
      </div>
    </div>
  )
}

function FixCardView({
  id, card, onApply, featured,
}: { id: string; card: FixCard | undefined; onApply: () => void; featured?: boolean }): React.ReactElement {
  if (!card) {
    return (
      <div className="glass-panel-sm rounded-lg p-4 text-xs text-gray-500">Loading {id}…</div>
    )
  }
  if (!card.preview || card.preview.error) {
    return (
      <div className="glass-panel-sm rounded-lg p-4">
        <p className="text-xs text-gray-500">{prettyName(id)}</p>
        <p className="text-[11px] text-gray-600 mt-1">
          Not applicable to your system{card.preview?.error ? ` — ${card.preview.error}` : ''}
        </p>
      </div>
    )
  }
  const p = card.preview
  return (
    <div className={`glass-panel-sm rounded-lg p-4 ${featured ? 'border border-accent-primary/30' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-white">{p.name}</p>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-1">{p.description}</p>
          {p.requiresAdmin && (
            <p className="text-[10px] text-vr-warning mt-1">Requires administrator</p>
          )}
          {card.error && (
            <p className="text-[10px] text-vr-critical mt-1">{card.error}</p>
          )}
          {card.applied && (
            <p className="text-[10px] text-vr-healthy mt-1">✓ Applied</p>
          )}
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={onApply}
            disabled={card.applying || card.applied}
            className="text-xs px-4 py-2 rounded-md font-medium bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 border border-accent-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {card.applying ? 'Applying…' : card.applied ? 'Applied' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReferenceLink({ title, description, url }: { title: string; description: string; url: string }): React.ReactElement {
  return (
    <div>
      <button
        onClick={() => (window as any).api?.shell?.openExternal?.(url)}
        className="text-sm font-semibold text-accent-primary hover:underline"
      >
        {title} ↗
      </button>
      <p className="text-[11px] text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}

function prettyName(id: string): string {
  return id.replace(/^fix-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
