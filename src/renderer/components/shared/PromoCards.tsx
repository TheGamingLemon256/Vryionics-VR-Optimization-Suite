// Vryionics VR Optimization Suite — Promo Cards
//
// Reusable advertising cards for the Vryionics ecosystem. Placed in Dashboard
// footer, Executive Summary footer, and Settings ("Support the project" section).
//
// Design philosophy: visible but not intrusive. Accent glow, small footprint,
// opens links in the system browser via api.app.openExternal so the Electron
// window stays focused on the app.

import React from 'react'

const VMSC_URL = 'https://vmsc.vryionic.com'
const PATREON_URL = 'https://www.patreon.com/c/Vryionic'

function openExternal(url: string): void {
  try {
    const api = (window as any).api
    api?.app?.openExternal?.(url)
  } catch {
    // Swallow — the link can't open, but the app shouldn't crash over a promo click
  }
}


export function VmscPromoCard({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <button
      onClick={() => openExternal(VMSC_URL)}
      className={`group w-full text-left glass-panel-sm rounded-xl transition-all duration-200 hover:scale-[1.015] hover:border-accent-primary/40 ${
        compact ? 'p-3' : 'p-4'
      }`}
      style={{
        border: '1px solid rgba(var(--accent-rgb), 0.2)',
        background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.08) 0%, rgba(var(--accent-rgb), 0.02) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon — stylized headset/stream glyph */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(var(--accent-rgb), 0.15)',
            border: '1px solid rgba(var(--accent-rgb), 0.3)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
               style={{ color: 'var(--accent-primary)' }}>
            <path d="M3 8h18v8H3z" />
            <path d="M7 12h2" />
            <path d="M15 12h2" />
            <path d="M12 3v5" />
            <path d="M12 16v5" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">VMSC Universal</p>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{
                background: 'rgba(var(--accent-rgb), 0.18)',
                color: 'var(--accent-text)',
                border: '1px solid rgba(var(--accent-rgb), 0.3)',
              }}
            >
              Our main project
            </span>
          </div>
          {!compact && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Multi-platform stream integration hub — chat, alerts, rules, and automation for Twitch, YouTube, Kick, TikTok and more. Built by the same team as this app.
            </p>
          )}
          {compact && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              Multi-platform stream integration &amp; automation
            </p>
          )}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs font-medium" style={{ color: 'var(--accent-text)' }}>
              Visit vmsc.vryionic.com
            </span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.5" className="group-hover:translate-x-0.5 transition-transform"
              style={{ color: 'var(--accent-text)' }}
            >
              <path d="M2 6h8M7 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  )
}

export function PatreonPromoCard({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <button
      onClick={() => openExternal(PATREON_URL)}
      className={`group w-full text-left glass-panel-sm rounded-xl transition-all duration-200 hover:scale-[1.015] ${
        compact ? 'p-3' : 'p-4'
      }`}
      style={{
        // Patreon-ish warm coral tint so it's visually distinct from the VMSC card
        // without overriding the user's chosen accent elsewhere in the app.
        border: '1px solid rgba(244, 102, 102, 0.25)',
        background: 'linear-gradient(135deg, rgba(244, 102, 102, 0.09) 0%, rgba(244, 102, 102, 0.02) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon — heart outline */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(244, 102, 102, 0.15)',
            border: '1px solid rgba(244, 102, 102, 0.3)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f46666"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            Like what you see? Support me on Patreon!
          </p>
          {!compact && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              This app is built by one person, released free. Your support keeps the updates coming and unlocks more tools like this one.
            </p>
          )}
          {compact && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              Help me keep building free VR tools
            </p>
          )}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs font-medium" style={{ color: '#f46666' }}>
              patreon.com/Vryionic
            </span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#f46666"
              strokeWidth="1.5" className="group-hover:translate-x-0.5 transition-transform"
            >
              <path d="M2 6h8M7 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  )
}


/**
 * Side-by-side pair for footers of main pages (Dashboard, Executive Summary).
 * Compact mode — short descriptions, tight padding.
 */
export function PromoDuoInline(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <VmscPromoCard compact />
      <PatreonPromoCard compact />
    </div>
  )
}

/**
 * Full-size pair for the Settings page. Longer descriptions, larger padding.
 */
export function PromoDuoFull(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <VmscPromoCard />
      <PatreonPromoCard />
    </div>
  )
}
