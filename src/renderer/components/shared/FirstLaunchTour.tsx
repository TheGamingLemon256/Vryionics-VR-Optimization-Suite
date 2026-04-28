// Vryionics VR Optimization Suite — First-Launch Tour
//
// Lightweight 4-step coach-mark overlay that points new users at the most
// important UI elements after they finish the setup wizard. Persists a
// "tour complete" flag in localStorage so it never re-shows.
//
// Each step targets an element by data-tour-target attribute. The overlay
// dims the rest of the screen, draws a focus ring around the target, and
// shows a tooltip with prev/next/skip buttons.

import React, { useEffect, useState } from 'react'

interface TourStep {
  /** Element selector — e.g. data-tour-target="run-scan" → button with that attr */
  target: string
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    target: 'run-scan',
    title: 'Start with a full system scan',
    body: 'This examines your CPU, GPU, RAM, network, VR runtime, drivers, and OS settings — usually under 60 seconds. The dashboard fills with health cards as findings arrive.',
  },
  {
    target: 'sidebar-summary',
    title: 'See your action plan',
    body: 'After a scan, the Action Plan tab ranks every finding by VR impact. Most fixes preview before applying and are reversible — and a System Restore Point is created before any registry change.',
  },
  {
    target: 'sidebar-drivers',
    title: 'Keep drivers current',
    body: 'GPU drivers can silently regress for VR. The Drivers page checks vendor pages every 24 hours and offers one-click updates for safe categories or one-click vendor pages for risky ones.',
  },
  {
    target: 'sidebar-sessions',
    title: 'Diagnose VR perf issues',
    body: 'When VR launches, Vryionics auto-records CPU, GPU temperature, GPU power, and RAM at 1 Hz. Open VR Sessions later to scrub a timeline and see exactly when stutter happened.',
  },
]

const TOUR_COMPLETE_KEY = 'vros-first-launch-tour-complete'

export function FirstLaunchTour({ active }: { active: boolean }): React.ReactElement | null {
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [completed, setCompleted] = useState<boolean>(() => {
    try { return localStorage.getItem(TOUR_COMPLETE_KEY) === '1' } catch { return false }
  })

  // Recompute target rect on step change + on resize
  useEffect(() => {
    if (!active || completed) return
    const update = (): void => {
      const sel = `[data-tour-target="${STEPS[stepIdx].target}"]`
      const el = document.querySelector(sel)
      if (el) {
        setTargetRect(el.getBoundingClientRect())
        // Scroll into view if the element is offscreen
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      } else {
        setTargetRect(null)
      }
    }
    update()
    // Re-run shortly after to catch elements that mount slightly after step change
    const t = setTimeout(update, 200)
    window.addEventListener('resize', update)
    return () => { clearTimeout(t); window.removeEventListener('resize', update) }
  }, [stepIdx, active, completed])

  // Persist "tour seen" the moment the tour first becomes visible, not
  // only when the user clicks Finish. Otherwise, users who close the app
  // before finishing the tour see it again on every launch (Quantum's
  // feedback on v0.2.0). The flag is one-way — once set, never unset
  // unless the user resets it from Settings.
  useEffect(() => {
    if (active && !completed) {
      try { localStorage.setItem(TOUR_COMPLETE_KEY, '1') } catch { /* ignore */ }
    }
  }, [active, completed])

  if (!active || completed) return null

  const finish = (): void => {
    try { localStorage.setItem(TOUR_COMPLETE_KEY, '1') } catch { /* ignore */ }
    setCompleted(true)
  }

  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  // Tooltip placement — to the right of the target if it fits, else below
  const tooltipPos = targetRect
    ? (() => {
        const margin = 16
        const tooltipW = 320
        const tooltipH = 180
        const room = window.innerWidth - targetRect.right
        if (room > tooltipW + margin) {
          return { left: targetRect.right + margin, top: Math.max(margin, targetRect.top - 20) }
        }
        // Fall back: below if there's space, otherwise above
        const belowTop = targetRect.bottom + margin
        if (belowTop + tooltipH < window.innerHeight) {
          return { left: Math.max(margin, targetRect.left), top: belowTop }
        }
        return { left: Math.max(margin, targetRect.left), top: Math.max(margin, targetRect.top - tooltipH - margin) }
      })()
    : { left: window.innerWidth / 2 - 160, top: window.innerHeight / 2 - 90 }

  return (
    <>
      {/* Dim overlay with cut-out hole over the target */}
      <div
        className="fixed inset-0 z-[150] pointer-events-auto"
        onClick={(e) => { if (e.target === e.currentTarget) { /* click outside tooltip = no-op */ } }}
        style={{
          background: targetRect
            ? `radial-gradient(circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, rgba(0,0,0,0) ${Math.max(targetRect.width, targetRect.height) / 2 + 12}px, rgba(0,0,0,0.7) ${Math.max(targetRect.width, targetRect.height) / 2 + 60}px)`
            : 'rgba(0,0,0,0.7)',
        }}
      />

      {/* Highlight ring */}
      {targetRect && (
        <div
          className="fixed z-[151] pointer-events-none rounded-lg"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: '0 0 0 3px var(--accent-primary), 0 0 20px var(--accent-primary)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[152] glass-panel rounded-xl p-5 w-80 shadow-2xl"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          background: 'rgba(12, 12, 26, 0.96)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(155, 122, 255, 0.3)',
        }}
      >
        <p className="text-[10px] text-accent-primary font-semibold uppercase tracking-widest mb-1">
          Tour · {stepIdx + 1} / {STEPS.length}
        </p>
        <h3 className="text-sm font-bold text-white mb-2">{step.title}</h3>
        <p className="text-xs text-gray-300 leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-[11px] text-gray-500 hover:text-gray-300"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx((i) => i - 1)}
                className="text-xs px-3 py-1.5 rounded-md text-gray-300 hover:bg-white/5"
              >
                Back
              </button>
            )}
            <button
              onClick={() => isLast ? finish() : setStepIdx((i) => i + 1)}
              className="text-xs px-4 py-1.5 rounded-md font-medium bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 border border-accent-primary/30"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
