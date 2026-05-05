import React, { useState } from 'react'

interface VRGameSetting {
  key: string
  label: string
  currentValue: string | number | boolean | null
  recommendedValue: string | number | boolean
  isOptimal: boolean
  fixDescription: string
  canAutoFix: boolean
  fixId?: string
}

interface VRGameInfo {
  appId: string
  name: string
  installDir: string
  settingsFile: string | null
  settings: VRGameSetting[]
  hasIssues: boolean
}

interface SteamGamesResult {
  steamInstalled: boolean
  steamPath: string | null
  libraryPaths: string[]
  vrGames: VRGameInfo[]
  scannedAt: number
}

function formatValue(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return 'not set'
  if (typeof v === 'boolean') return v ? 'Enabled' : 'Disabled'
  if (typeof v === 'number') {
    if (v > 1000) return `${v.toLocaleString()} MB`
    return String(v)
  }
  return String(v)
}

function GameCard({ game, onApplyFix }: { game: VRGameInfo; onApplyFix: (fixId: string) => Promise<void> }): React.ReactElement {
  const [expanded, setExpanded] = useState(game.hasIssues)
  const [fixingId, setFixingId] = useState<string | null>(null)
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set())

  async function handleFix(fixId: string) {
    setFixingId(fixId)
    try {
      await onApplyFix(fixId)
      setFixedIds(s => new Set([...s, fixId]))
    } catch { /* show nothing */ }
    setFixingId(null)
  }

  return (
    <div className="glass-panel-sm rounded-xl border overflow-hidden" style={{ borderColor: game.hasIssues ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)' }}>
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/3 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{game.name}</span>
            {game.hasIssues ? (
              <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-full flex-shrink-0">
                ⚠ Settings Issues
              </span>
            ) : (
              <span className="text-[10px] bg-vr-healthy/15 text-vr-healthy border border-vr-healthy/25 px-1.5 py-0.5 rounded-full flex-shrink-0">
                ✓ Settings OK
              </span>
            )}
          </div>
          {game.settingsFile ? (
            <p className="text-[10px] text-gray-600 truncate mt-0.5">{game.settingsFile}</p>
          ) : game.settings.length > 0 ? (
            <p className="text-[10px] text-amber-700/80 mt-0.5">Config file not found — fix will create it</p>
          ) : null}
        </div>
        <span className="text-gray-600 text-xs flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && game.settings.length > 0 && (
        <div className="border-t border-white/5 px-3 pb-3 space-y-2 mt-1">
          {game.settings.map(s => {
            const alreadyFixed = fixedIds.has(s.fixId ?? '')
            return (
              <div key={s.key} className="flex items-start justify-between gap-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={s.isOptimal || alreadyFixed ? 'text-vr-healthy text-xs' : 'text-vr-warning text-xs'}>
                      {s.isOptimal || alreadyFixed ? '✓' : '⚠'}
                    </span>
                    <span className="text-xs font-medium text-white">{s.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 ml-4">
                    Current: <span className="text-gray-300">{formatValue(s.currentValue)}</span>
                    {!s.isOptimal && !alreadyFixed && (
                      <span className="text-gray-600"> — {s.fixDescription}</span>
                    )}
                  </p>
                </div>
                {s.canAutoFix && s.fixId && !s.isOptimal && !alreadyFixed && (
                  <button
                    className="glass-button btn-spring text-[11px] px-2.5 py-1 flex-shrink-0 disabled:opacity-40"
                    onClick={() => handleFix(s.fixId!)}
                    disabled={fixingId === s.fixId}
                  >
                    {fixingId === s.fixId ? '…' : '⚡ Fix'}
                  </button>
                )}
                {alreadyFixed && (
                  <span className="text-[11px] text-vr-healthy flex-shrink-0">Fixed ✓</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {expanded && game.settings.length === 0 && (
        <p className="text-[11px] text-gray-600 italic px-3 pb-3">No configurable settings available for this game.</p>
      )}
    </div>
  )
}

export default function VRGamesPanel(): React.ReactElement {
  const [result, setResult] = useState<SteamGamesResult | null>(null)
  const [scanning, setScanning] = useState(false)

  async function runScan() {
    setScanning(true)
    try {
      const data = await (window as any).api.steamGames.scan()
      setResult(data)
    } catch (e) {
      console.error('Steam scan failed:', e)
    }
    setScanning(false)
  }

  async function applyFix(fixId: string) {
    await (window as any).api.fix.apply(fixId)
  }

  const issueCount = result?.vrGames.filter(g => g.hasIssues).length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {result && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {result.vrGames.length} VR game{result.vrGames.length !== 1 ? 's' : ''} found
              {issueCount > 0 ? ` — ${issueCount} with settings issues` : ' — all settings OK'}
            </p>
          )}
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="glass-button btn-spring text-xs px-4 py-2 disabled:opacity-40"
        >
          {scanning ? '⏳ Scanning…' : result ? '↺ Re-scan' : '🔍 Scan VR Games'}
        </button>
      </div>

      {!result && !scanning && (
        <div className="text-center py-8 text-gray-600 text-sm">
          Click "Scan VR Games" to detect installed VR games and check their settings.
        </div>
      )}

      {scanning && (
        <div className="flex items-center justify-center py-8 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          <span className="text-sm text-gray-400">Scanning Steam libraries…</span>
        </div>
      )}

      {result && !result.steamInstalled && (
        <div className="text-center py-6 text-gray-500 text-sm">
          Steam not detected on this system.
        </div>
      )}

      {result && result.steamInstalled && result.vrGames.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          No recognized VR games found in your Steam libraries.
        </div>
      )}

      {result && result.vrGames.length > 0 && (
        <div className="space-y-2">
          {result.vrGames.map(game => (
            <GameCard key={game.appId} game={game} onApplyFix={applyFix} />
          ))}
        </div>
      )}
    </div>
  )
}
