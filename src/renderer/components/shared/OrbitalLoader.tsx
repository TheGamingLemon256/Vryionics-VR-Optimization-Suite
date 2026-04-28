// VR Optimization Suite — Shared Orbital Loader
// Reusable animated orbital emblem used wherever the app is working / has no data yet.
// Keyframes live in globals.css (vrs-spin-cw, vrs-orbit-*, etc.) so they're defined once.

import React from 'react'

// ── Types ─────────────────────────────────────────────────────

interface OrbitalLoaderProps {
  /** Show the full scanning display (orbital + percent + label + progress bar).
   *  Defaults to 'full'. Pass 'mini' for a compact 90 px orbital only. */
  size?: 'full' | 'mini'
  /** 0-100. Only used in 'full' mode. */
  percent?: number
  /** Cycling label shown beneath the emblem. Only used in 'full' mode. */
  moduleLabel?: string
}

// ── Orbit dot colours (index → opacity multiplier) ────────────
const DOT_OPACITIES = [1, 0.9, 0.8] as const

// ── Main export ───────────────────────────────────────────────

export function OrbitalLoader({
  size = 'full',
  percent = 0,
  moduleLabel = 'Initialising…',
}: OrbitalLoaderProps): React.ReactElement {
  return size === 'mini'
    ? <MiniOrbital />
    : <FullOrbital percent={percent} moduleLabel={moduleLabel} />
}

// ── Full orbital (220 px, used in Dashboard scanning display) ─

function FullOrbital({ percent, moduleLabel }: { percent: number; moduleLabel: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-10 py-14 select-none">

      {/* ── Emblem ── */}
      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>

        {/* Ambient glow */}
        <div style={{
          position: 'absolute', inset: -24, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(var(--accent-rgb),.18) 0%, transparent 70%)',
          animation: 'vrs-pulse-glow 3s ease-in-out infinite',
        }} />

        {/* Arc 1 — outer, slow CW */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor:    'rgba(var(--accent-rgb),.9)',
          borderRightColor:  'rgba(var(--accent-rgb),.15)',
          borderBottomColor: 'rgba(var(--accent-rgb),0)',
          borderLeftColor:   'rgba(var(--accent-rgb),.45)',
          animation: 'vrs-spin-cw 3.6s linear infinite',
          filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),.7))',
        }} />

        {/* Arc 2 — middle, medium CCW */}
        <div style={{
          position: 'absolute', inset: 18, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor:    'rgba(var(--accent-rgb),0)',
          borderRightColor:  'rgba(var(--accent-rgb),.9)',
          borderBottomColor: 'rgba(var(--accent-rgb),.5)',
          borderLeftColor:   'rgba(var(--accent-rgb),.1)',
          animation: 'vrs-spin-ccw 2.4s linear infinite',
          filter: 'drop-shadow(0 0 5px rgba(var(--accent-rgb),.65))',
        }} />

        {/* Arc 3 — inner, fast CW */}
        <div style={{
          position: 'absolute', inset: 36, borderRadius: '50%',
          border: '1.5px solid transparent',
          borderTopColor:    'rgba(var(--accent-rgb),.8)',
          borderRightColor:  'rgba(var(--accent-rgb),0)',
          borderBottomColor: 'rgba(var(--accent-rgb),.6)',
          borderLeftColor:   'rgba(var(--accent-rgb),0)',
          animation: 'vrs-spin-cw 1.5s linear infinite',
          filter: 'drop-shadow(0 0 4px rgba(var(--accent-rgb),.5))',
        }} />

        {/* Orbiting dots — 3 evenly spaced */}
        {(['vrs-orbit-a', 'vrs-orbit-b', 'vrs-orbit-c'] as const).map((anim, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: `${anim} 4s linear infinite`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: `rgba(var(--accent-rgb),${DOT_OPACITIES[i]})`,
              boxShadow:  `0 0 10px 3px rgba(var(--accent-rgb),.55)`,
            }} />
          </div>
        ))}

        {/* Core circle */}
        <div style={{
          width: 96, height: 96, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(30,20,60,.95) 0%, rgba(20,14,45,.98) 100%)',
          border: '1px solid rgba(var(--accent-rgb),.3)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'vrs-core-breathe 3s ease-in-out infinite',
          zIndex: 2, gap: 4,
        }}>
          <VrHeadsetIcon size={28} />
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: 'var(--accent-text)',
            letterSpacing: '0.02em', lineHeight: 1,
          }}>
            {percent}%
          </span>
        </div>
      </div>

      {/* ── Text block ── */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">

        {/* Module label — key change triggers fade animation restart */}
        <div style={{ height: 22, overflow: 'hidden', position: 'relative', width: '100%', textAlign: 'center' }}>
          <span
            key={moduleLabel}
            style={{
              display: 'inline-block',
              fontSize: 13, fontWeight: 500,
              color: 'var(--accent-text)',
              letterSpacing: '0.05em', textTransform: 'uppercase',
              animation: 'vrs-label-fade 2.8s ease-in-out forwards',
            }}
          >
            {moduleLabel}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', height: 3, borderRadius: 999,
          background: 'rgba(255,255,255,.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${percent}%`, borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(var(--accent-rgb),.8) 0%, rgba(var(--accent-rgb),1) 50%, rgba(var(--accent-rgb),.8) 100%)',
            backgroundSize: '200% 100%',
            animation: 'vrs-bar-flow 2s linear infinite',
            transition: 'width 400ms ease-out',
          }} />
        </div>

        <p style={{ fontSize: 12, color: 'rgba(156,163,175,.6)', letterSpacing: '0.03em' }}>
          Analysing your VR system…
        </p>
      </div>
    </div>
  )
}

// ── Mini orbital (90 px, used inline in other pages) ──────────

function MiniOrbital(): React.ReactElement {
  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: 90, height: 90 }}>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: -10, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(var(--accent-rgb),.15) 0%, transparent 70%)',
        animation: 'vrs-pulse-glow 3s ease-in-out infinite',
      }} />

      {/* Arc 1 — outer CW */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '1.5px solid transparent',
        borderTopColor:    'rgba(var(--accent-rgb),.9)',
        borderRightColor:  'rgba(var(--accent-rgb),.15)',
        borderBottomColor: 'rgba(var(--accent-rgb),0)',
        borderLeftColor:   'rgba(var(--accent-rgb),.45)',
        animation: 'vrs-spin-cw 3.6s linear infinite',
        filter: 'drop-shadow(0 0 4px rgba(var(--accent-rgb),.7))',
      }} />

      {/* Arc 2 — middle CCW */}
      <div style={{
        position: 'absolute', inset: 7, borderRadius: '50%',
        border: '1.5px solid transparent',
        borderTopColor:    'rgba(var(--accent-rgb),0)',
        borderRightColor:  'rgba(var(--accent-rgb),.9)',
        borderBottomColor: 'rgba(var(--accent-rgb),.5)',
        borderLeftColor:   'rgba(var(--accent-rgb),.1)',
        animation: 'vrs-spin-ccw 2.4s linear infinite',
        filter: 'drop-shadow(0 0 3px rgba(var(--accent-rgb),.65))',
      }} />

      {/* Arc 3 — inner CW */}
      <div style={{
        position: 'absolute', inset: 14, borderRadius: '50%',
        border: '1px solid transparent',
        borderTopColor:    'rgba(var(--accent-rgb),.8)',
        borderRightColor:  'rgba(var(--accent-rgb),0)',
        borderBottomColor: 'rgba(var(--accent-rgb),.6)',
        borderLeftColor:   'rgba(var(--accent-rgb),0)',
        animation: 'vrs-spin-cw 1.5s linear infinite',
        filter: 'drop-shadow(0 0 3px rgba(var(--accent-rgb),.5))',
      }} />

      {/* Orbiting dots — mini scale, translateX(36px) */}
      {(['vrs-mini-orbit-a', 'vrs-mini-orbit-b', 'vrs-mini-orbit-c'] as const).map((anim, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: `${anim} 4s linear infinite`,
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: `rgba(var(--accent-rgb),${DOT_OPACITIES[i]})`,
            boxShadow: '0 0 6px 2px rgba(var(--accent-rgb),.5)',
          }} />
        </div>
      ))}

      {/* Core */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(30,20,60,.95) 0%, rgba(20,14,45,.98) 100%)',
        border: '1px solid rgba(var(--accent-rgb),.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'vrs-core-breathe 3s ease-in-out infinite',
        zIndex: 2,
      }}>
        <VrHeadsetIcon size={16} />
      </div>
    </div>
  )
}

// ── Shared VR headset icon SVG ────────────────────────────────

function VrHeadsetIcon({ size }: { size: number }): React.ReactElement {
  // Scale the viewBox geometry to the requested pixel size
  const h = Math.round(size * (18 / 28))
  return (
    <svg width={size} height={h} viewBox="0 0 28 18" fill="none">
      <rect x="1" y="4" width="26" height="11" rx="5.5"
        stroke="rgba(var(--accent-rgb),.85)" strokeWidth="1.5" />
      <circle cx="9"  cy="9.5" r="3"
        stroke="rgba(var(--accent-rgb),.7)"  strokeWidth="1.2" />
      <circle cx="19" cy="9.5" r="3"
        stroke="rgba(var(--accent-rgb),.7)"  strokeWidth="1.2" />
      <path d="M12 9.5h4"
        stroke="rgba(var(--accent-rgb),.4)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
