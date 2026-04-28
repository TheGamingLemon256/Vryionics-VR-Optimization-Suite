// Vryionics VR Optimization Suite — Ambient Background
//
// The "Pandora" layer. Five large, blurred, accent-tinted orbs that drift
// slowly and breathe on independent paths, sitting behind all content but
// in front of the static gradient painted on body::after.
//
// All motion is CSS-driven (keyframes in globals.css) so React doesn't have
// to re-render anything after mount — the GPU runs the animation on its own
// compositor layer. The component is intentionally minimal for this reason:
// just five divs with the right class names.
//
// Respecting reduce-motion:
//   • The user toggles it in Settings → Appearance → Reduce Motion
//   • That toggle calls useThemeStore.setReducedMotion(true), which adds
//     the class `reduce-motion` to <html>
//   • globals.css: `html.reduce-motion .ambient-orb { animation: none; }`
//     freezes the orbs where they were without hiding them, so the page
//     still has atmosphere, just static.
//
// Why fixed positioning + z-index: -1 vs. rendering inside each page:
//   • Persisting across page transitions means the orbs don't "reset"
//     every time the user clicks a sidebar item — they feel continuous,
//     like real ambient light.

import React from 'react'

export function AmbientBackground(): React.ReactElement {
  return (
    <div className="ambient-bg-layer" aria-hidden="true">
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />
      <div className="ambient-orb ambient-orb-4" />
      <div className="ambient-orb ambient-orb-5" />
    </div>
  )
}
