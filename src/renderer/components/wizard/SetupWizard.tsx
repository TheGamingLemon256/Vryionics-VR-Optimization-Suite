// VR Optimization Suite — Setup Wizard (Phase-5 unified flow)
//
// Single-source setup pipeline:
//   Welcome → Headset → Connection → PC Type → Use Case → Main Complaint → Skill → Done
//
// Key design decisions:
//   • Connection step pulls the selected headset's ACTUAL connection methods
//     from profile.connections[]. A Valve Index user sees "DisplayPort 1.2"
//     only. A Quest 3 user sees Link / Air Link / VD / ALVR / Steam Link VR.
//     No more showing "Wi-Fi" to a wired-only headset.
//   • Skill level is applied to the app's Simple/Advanced mode on finish.
//     Previously it was stored and never read.
//   • Three new steps — PC Type, Primary Use Case, Main Complaint — capture
//     the information the old "Setup Interview" questionnaire asked, but as
//     part of the primary flow. These feed ScanData for rule personalization.

import React, { useEffect, useReducer, useState } from 'react'
import {
  useSetupStore,
  type UserSetupConfig,
  type PcType,
  type PrimaryUseCase,
  type MainComplaint,
} from '../../stores/setup-store'
import { useAppStore } from '../../stores/app-store'

// ── Types ─────────────────────────────────────────────────────

interface HeadsetSummary {
  id: string
  brand: string
  model: string
  type?: string
  connectionArchetypes?: string[]
}

/** Minimal subset of HeadsetProfile we consume in the wizard. */
interface LoadedProfile {
  id: string
  brand: string
  model: string
  connections: Array<{
    id: string
    name: string
    archetype: string
    streamingSoftware?: string
    requirements?: string[]
    latencyProfile: { typical: number; best: number; worst: number }
  }>
}

interface WizardState {
  step: number
  brand: string | null
  headsetId: string | null
  headsetModel: string | null
  /** Loaded profile for the selected headset — populated after headset selection. */
  profile: LoadedProfile | null
  /** Connection method id chosen from profile.connections */
  connectionId: string | null
  connectionArchetype: string | null
  /** Optional: streaming software name (e.g. "Virtual Desktop") — set when user
   * picks a connection that has streamingSoftware. */
  streamingSoftware: string | null
  /** Laptop vs desktop — affects hybrid GPU routing rule. */
  pcType: PcType | null
  /** Main VR activity — prioritizes recommendations. */
  primaryUseCase: PrimaryUseCase | null
  /** Main complaint — biases action plan order. */
  mainComplaint: MainComplaint | null
  /** Report detail depth — wires to advancedMode on finish. */
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | null
}

type WizardAction =
  | { type: 'SET_BRAND'; brand: string }
  | { type: 'SET_HEADSET'; id: string; model: string }
  | { type: 'SET_PROFILE'; profile: LoadedProfile | null }
  | { type: 'SET_CONNECTION'; id: string; archetype: string; streamingSoftware: string | null }
  | { type: 'SET_PC_TYPE'; pcType: PcType }
  | { type: 'SET_USE_CASE'; useCase: PrimaryUseCase }
  | { type: 'SET_COMPLAINT'; complaint: MainComplaint }
  | { type: 'SET_SKILL'; level: 'beginner' | 'intermediate' | 'advanced' }
  | { type: 'NEXT' }
  | { type: 'BACK' }

const initialState: WizardState = {
  step: 0,
  brand: null,
  headsetId: null,
  headsetModel: null,
  profile: null,
  connectionId: null,
  connectionArchetype: null,
  streamingSoftware: null,
  pcType: null,
  primaryUseCase: null,
  mainComplaint: null,
  skillLevel: null,
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_BRAND':
      return {
        ...state, brand: action.brand,
        headsetId: null, headsetModel: null, profile: null,
        connectionId: null, connectionArchetype: null, streamingSoftware: null,
      }
    case 'SET_HEADSET':
      return {
        ...state, headsetId: action.id, headsetModel: action.model,
        profile: null,  // cleared until SET_PROFILE fires
        connectionId: null, connectionArchetype: null, streamingSoftware: null,
      }
    case 'SET_PROFILE':
      return { ...state, profile: action.profile }
    case 'SET_CONNECTION':
      return {
        ...state,
        connectionId: action.id,
        connectionArchetype: action.archetype,
        streamingSoftware: action.streamingSoftware,
      }
    case 'SET_PC_TYPE':
      return { ...state, pcType: action.pcType }
    case 'SET_USE_CASE':
      return { ...state, primaryUseCase: action.useCase }
    case 'SET_COMPLAINT':
      return { ...state, mainComplaint: action.complaint }
    case 'SET_SKILL':
      return { ...state, skillLevel: action.level }
    case 'NEXT':
      return { ...state, step: state.step + 1 }
    case 'BACK':
      return { ...state, step: Math.max(0, state.step - 1) }
    default:
      return state
  }
}

// ── Step definitions ──────────────────────────────────────────

const STEP_LABELS = ['Welcome', 'Headset', 'Connection', 'PC Type', 'Use Case', 'Main Issue', 'Skill', 'Done']

// ── Main Component ────────────────────────────────────────────

export default function SetupWizard(): React.ReactElement {
  const [state, dispatch] = useReducer(wizardReducer, initialState)
  const [profiles, setProfiles] = useState<HeadsetSummary[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const { saveToStorage } = useSetupStore()
  const { setCurrentPage, setAdvancedMode } = useAppStore()

  useEffect(() => {
    const api = (window as any).api
    api.setup.getHeadsetProfiles()
      .then((summaries: HeadsetSummary[]) => setProfiles(summaries))
      .catch(() => setProfiles([]))
      .finally(() => setLoadingProfiles(false))
  }, [])

  // Fetch the full profile whenever the selected headset changes
  useEffect(() => {
    if (!state.headsetId) return
    let cancelled = false
    const api = (window as any).api
    api.setup.getProfile(state.headsetId)
      .then((profile: LoadedProfile | null) => {
        if (!cancelled) dispatch({ type: 'SET_PROFILE', profile })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'SET_PROFILE', profile: null })
      })
    return () => { cancelled = true }
  }, [state.headsetId])

  const brands = Array.from(new Set(profiles.map((p) => p.brand)))
    // Keep "Other" at the bottom
    .sort((a, b) => {
      if (a.toLowerCase() === 'other') return 1
      if (b.toLowerCase() === 'other') return -1
      return a.localeCompare(b)
    })
  const modelsForBrand = profiles.filter((p) => p.brand === state.brand)

  const handleFinish = async () => {
    if (
      !state.headsetId || !state.headsetModel || !state.brand ||
      !state.connectionId || !state.connectionArchetype ||
      !state.skillLevel
    ) return

    const selectedProfile = profiles.find((p) => p.id === state.headsetId)
    const config: UserSetupConfig = {
      headsetId: state.headsetId,
      headsetBrand: state.brand,
      headsetModel: selectedProfile?.model ?? state.headsetModel,
      connectionId: state.connectionId,
      connectionArchetype: state.connectionArchetype,
      streamingSoftware: state.streamingSoftware,
      streamingEnabled: !!state.streamingSoftware,
      streamingApp: state.streamingSoftware,
      skillLevel: state.skillLevel,
      pcType: state.pcType ?? 'unknown',
      primaryUseCase: state.primaryUseCase ?? 'mixed',
      mainComplaint: state.mainComplaint ?? 'none',
      completedAt: Date.now(),
    }
    await saveToStorage(config)

    // Wire skill level → app-wide Simple/Advanced mode.
    // Beginner → Simple off. Advanced → on. Intermediate → leave as-is (default off)
    // so intermediate users still see the simple-mode UI but can toggle anytime.
    if (state.skillLevel === 'advanced') setAdvancedMode(true)
    else if (state.skillLevel === 'beginner') setAdvancedMode(false)

    setCurrentPage('dashboard')
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Compact progress strip — was visible but noisy with 8 labels
            in the old 5-label design. Labels hide on narrow widths. */}
        <div className="flex items-center justify-between mb-8">
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  i < state.step ? 'bg-vr-healthy text-black' :
                  i === state.step ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/30' :
                  'bg-white/10 text-gray-500'
                }`}>
                  {i < state.step ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] hidden md:block transition-colors ${
                  i === state.step ? 'text-white font-medium' : 'text-gray-500'
                }`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`flex-1 h-px mx-1.5 transition-all duration-300 ${i < state.step ? 'bg-vr-healthy/50' : 'bg-white/10'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="glass-panel p-8 modal-animate">
          {state.step === 0 && <StepWelcome onNext={() => dispatch({ type: 'NEXT' })} />}
          {state.step === 1 && (
            <StepHeadset
              brands={brands}
              models={modelsForBrand}
              loading={loadingProfiles}
              selectedBrand={state.brand}
              selectedHeadsetId={state.headsetId}
              onSelectBrand={(b) => dispatch({ type: 'SET_BRAND', brand: b })}
              onSelectHeadset={(id, model) => dispatch({ type: 'SET_HEADSET', id, model })}
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 2 && state.headsetId && (
            <StepConnection
              profile={state.profile}
              headsetLabel={`${state.brand ?? ''} ${state.headsetModel ?? ''}`.trim()}
              selectedConnectionId={state.connectionId}
              onSelect={(id, archetype, streamingSoftware) =>
                dispatch({ type: 'SET_CONNECTION', id, archetype, streamingSoftware })
              }
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 3 && (
            <StepPcType
              selected={state.pcType}
              onSelect={(t) => dispatch({ type: 'SET_PC_TYPE', pcType: t })}
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 4 && (
            <StepUseCase
              selected={state.primaryUseCase}
              onSelect={(u) => dispatch({ type: 'SET_USE_CASE', useCase: u })}
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 5 && (
            <StepMainComplaint
              selected={state.mainComplaint}
              onSelect={(c) => dispatch({ type: 'SET_COMPLAINT', complaint: c })}
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 6 && (
            <StepSkillLevel
              selected={state.skillLevel}
              onSelect={(l) => dispatch({ type: 'SET_SKILL', level: l })}
              onNext={() => dispatch({ type: 'NEXT' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
          {state.step === 7 && (
            <StepDone
              state={state}
              onFinish={handleFinish}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step: Welcome ─────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }): React.ReactElement {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-3xl glass-panel-sm flex items-center justify-center text-5xl">
        🥽
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to Vryionics</h1>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          Let's set up your VR system profile. Your answers drive every scan's recommendations —
          the more we know, the more accurately we can diagnose and prioritize fixes.
        </p>
      </div>
      <div className="flex items-start gap-4 glass-panel-sm p-4 text-left">
        <span className="text-2xl mt-0.5">⚡</span>
        <div>
          <p className="text-sm font-semibold text-white">Takes about 90 seconds</p>
          <p className="text-xs text-gray-400 mt-1">Seven short questions — headset, connection, PC type, main VR activity, biggest complaint, and detail preference.</p>
        </div>
      </div>
      <button
        className="glass-button btn-spring px-8 py-3 text-sm font-semibold w-full"
        onClick={onNext}
      >
        Get Started →
      </button>
    </div>
  )
}

// ── Step: Headset ─────────────────────────────────────────────

interface StepHeadsetProps {
  brands: string[]
  models: HeadsetSummary[]
  loading: boolean
  selectedBrand: string | null
  selectedHeadsetId: string | null
  onSelectBrand: (b: string) => void
  onSelectHeadset: (id: string, model: string) => void
  onNext: () => void
  onBack: () => void
}

function StepHeadset({ brands, models, loading, selectedBrand, selectedHeadsetId, onSelectBrand, onSelectHeadset, onNext, onBack }: StepHeadsetProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Your VR Headset</h2>
        <p className="text-sm text-gray-400">Select the headset you primarily use for PC VR.</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Brand</p>
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 glass-panel-sm rounded-lg shimmer" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => onSelectBrand(brand)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                  selectedBrand === brand
                    ? 'bg-accent-primary/20 border-accent-primary/50 text-white'
                    : 'glass-panel-sm border-white/5 text-gray-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedBrand && (
        <div className="panel-animate">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Model</p>
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
            {models.map((profile) => (
              <button
                key={profile.id}
                onClick={() => onSelectHeadset(profile.id, profile.model)}
                className={`px-4 py-3 rounded-lg text-sm text-left font-medium transition-all border ${
                  selectedHeadsetId === profile.id
                    ? 'bg-accent-primary/20 border-accent-primary/50 text-white'
                    : 'glass-panel-sm border-white/5 text-gray-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {profile.model}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedHeadsetId === 'generic-unlisted' && (
        <div
          className="glass-panel-sm rounded-lg p-3 border panel-animate"
          style={{
            borderColor: 'rgba(var(--accent-rgb), 0.3)',
            background: 'rgba(var(--accent-rgb), 0.06)',
          }}
        >
          <p className="text-xs font-semibold text-white mb-1">Using generic VR defaults</p>
          <p className="text-[11px] text-gray-300 leading-relaxed">
            Without a dedicated profile, the suite applies only general VR best-practice rules —
            headset-specific tweaks (optimal supersampling, panel quirks, runtime-specific tips)
            won't be surfaced. If your headset is a popular model,
            <button
              type="button"
              className="mx-1 underline hover:text-white"
              style={{ color: 'var(--accent-text)' }}
              onClick={() => {
                try {
                  ;(window as any).api?.app?.openExternal?.('https://vmsc.vryionic.com')
                } catch { /* ignore */ }
              }}
            >
              let us know
            </button>
            — profiles are cheap to add and ship in the next update.
          </p>
        </div>
      )}

      <WizardNavBar
        onBack={onBack}
        onNext={onNext}
        canNext={!!selectedHeadsetId}
      />
    </div>
  )
}

// ── Step: Connection (per-headset) ────────────────────────────

/**
 * Human-readable archetype label for the badge next to each connection option.
 * Keeps the wire-vs-wireless nature of each option obvious at a glance.
 */
const ARCHETYPE_BADGE: Record<string, { label: string; className: string }> = {
  'tethered-dp':   { label: 'Wired — DP',    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  'usb-encoded':   { label: 'USB tether',    className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  'wifi-wireless': { label: 'Wireless — Wi-Fi', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  'wigig':         { label: 'Wireless — 60GHz', className: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
}

function StepConnection({ profile, headsetLabel, selectedConnectionId, onSelect, onNext, onBack }: {
  profile: LoadedProfile | null
  headsetLabel: string
  selectedConnectionId: string | null
  onSelect: (id: string, archetype: string, streamingSoftware: string | null) => void
  onNext: () => void
  onBack: () => void
}): React.ReactElement {
  const connections = profile?.connections ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Connection Method</h2>
        <p className="text-sm text-gray-400">
          How does your <span className="text-white font-medium">{headsetLabel || 'headset'}</span> connect to your PC?
          {' '}Only options supported by your specific headset are shown.
        </p>
      </div>

      {/* Loading profile */}
      {!profile && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 glass-panel-sm rounded-lg shimmer" />
          ))}
        </div>
      )}

      {/* Connections from the headset's profile.connections array */}
      {profile && connections.length === 0 && (
        <div className="glass-panel-sm p-4 border border-vr-warning/20 text-xs text-gray-400">
          No connection methods are defined in this headset's profile — please pick a different
          headset or report this as a bug.
        </div>
      )}

      {profile && connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((conn) => {
            const badge = ARCHETYPE_BADGE[conn.archetype] ?? {
              label: conn.archetype,
              className: 'bg-white/5 text-gray-400 border-white/10',
            }
            const selected = selectedConnectionId === conn.id
            return (
              <button
                key={conn.id}
                onClick={() => onSelect(conn.id, conn.archetype, conn.streamingSoftware ?? null)}
                className={`w-full px-4 py-3.5 rounded-lg text-left transition-all border ${
                  selected
                    ? 'bg-accent-primary/15 border-accent-primary/50'
                    : 'glass-panel-sm border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>
                    {conn.name}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                {conn.streamingSoftware && (
                  <p className="text-[11px] text-gray-500 mb-1">via {conn.streamingSoftware}</p>
                )}
                {conn.requirements && conn.requirements.length > 0 && (
                  <ul className="text-[11px] text-gray-400 list-disc list-inside leading-relaxed mt-1">
                    {conn.requirements.slice(0, 3).map((req, i) => <li key={i}>{req}</li>)}
                  </ul>
                )}
                {conn.latencyProfile && (
                  <p className="text-[10px] text-gray-600 mt-2">
                    Typical motion-to-photon latency: <span className="text-gray-400">~{conn.latencyProfile.typical} ms</span>
                    {' '}(best {conn.latencyProfile.best} ms, worst {conn.latencyProfile.worst} ms)
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      <WizardNavBar onBack={onBack} onNext={onNext} canNext={!!selectedConnectionId} />
    </div>
  )
}

// ── Step: PC Type ─────────────────────────────────────────────

function StepPcType({ selected, onSelect, onNext, onBack }: {
  selected: PcType | null
  onSelect: (t: PcType) => void
  onNext: () => void
  onBack: () => void
}): React.ReactElement {
  const options: Array<{ id: PcType; icon: string; label: string; description: string }> = [
    {
      id: 'desktop',
      icon: '🖥',
      label: 'Desktop PC',
      description: 'Tower / small-form-factor desktop with dedicated GPU. VR-ideal form factor.',
    },
    {
      id: 'laptop',
      icon: '💻',
      label: 'Laptop / All-in-One',
      description: 'Portable chassis with both integrated and dedicated GPU. Needs explicit dGPU pinning for VR apps.',
    },
    {
      id: 'unknown',
      icon: '❓',
      label: 'Not sure / prefer not to say',
      description: 'We\'ll auto-detect during scan and apply relevant rules either way.',
    },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">PC Type</h2>
        <p className="text-sm text-gray-400">
          Laptops have extra considerations — hybrid GPU routing, power management, thermal
          throttling — that change what we recommend.
        </p>
      </div>

      <div className="space-y-2">
        {options.map((opt) => (
          <OptionCard key={opt.id} icon={opt.icon} label={opt.label} description={opt.description}
            selected={selected === opt.id} onClick={() => onSelect(opt.id)} />
        ))}
      </div>

      <WizardNavBar onBack={onBack} onNext={onNext} canNext={!!selected} />
    </div>
  )
}

// ── Step: Primary Use Case ────────────────────────────────────

function StepUseCase({ selected, onSelect, onNext, onBack }: {
  selected: PrimaryUseCase | null
  onSelect: (u: PrimaryUseCase) => void
  onNext: () => void
  onBack: () => void
}): React.ReactElement {
  const options: Array<{ id: PrimaryUseCase; icon: string; label: string; description: string }> = [
    { id: 'social-vr',     icon: '👥', label: 'Social VR',           description: 'VRChat, NeosVR, Resonite — cache-heavy, CPU-sensitive. Prioritizes CPU + RAM tuning.' },
    { id: 'simulation',    icon: '✈️', label: 'Sims (flight, racing)', description: 'MSFS, DCS, iRacing, ETS2 — GPU + RAM demanding. Prioritizes GPU / VRAM headroom.' },
    { id: 'fitness',       icon: '💪', label: 'Fitness / Rhythm',    description: 'Beat Saber, Supernatural, Synth Riders — latency-sensitive. Prioritizes latency fixes.' },
    { id: 'action-games',  icon: '🎮', label: 'Action / Adventure',  description: 'Half-Life: Alyx, Boneworks, Blade & Sorcery — balanced workload.' },
    { id: 'productivity',  icon: '🧑‍💼', label: 'Productivity',         description: 'Immersed, vSpatial, remote desktop — focuses on display latency and clarity.' },
    { id: 'mixed',         icon: '🌀', label: 'A bit of everything', description: 'No single primary use — general-purpose VR recommendations.' },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Primary VR Activity</h2>
        <p className="text-sm text-gray-400">
          What do you use VR for most? This helps us prioritize which fixes to surface first —
          social-VR players care about different things than flight-sim pilots.
        </p>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {options.map((opt) => (
          <OptionCard key={opt.id} icon={opt.icon} label={opt.label} description={opt.description}
            selected={selected === opt.id} onClick={() => onSelect(opt.id)} />
        ))}
      </div>

      <WizardNavBar onBack={onBack} onNext={onNext} canNext={!!selected} />
    </div>
  )
}

// ── Step: Main Complaint ──────────────────────────────────────

function StepMainComplaint({ selected, onSelect, onNext, onBack }: {
  selected: MainComplaint | null
  onSelect: (c: MainComplaint) => void
  onNext: () => void
  onBack: () => void
}): React.ReactElement {
  const options: Array<{ id: MainComplaint; icon: string; label: string; description: string }> = [
    { id: 'stutters',  icon: '📉', label: 'Stutters / frame drops',       description: 'Choppy motion even though your PC should be fast enough.' },
    { id: 'blurry',    icon: '👁️', label: 'Blurry / low resolution',       description: 'Image looks soft or pixelated when it should be sharper.' },
    { id: 'latency',   icon: '⏱', label: 'Lag / delayed controls',         description: 'Movements feel disconnected from on-screen response.' },
    { id: 'drops',     icon: '📶', label: 'Connection / tracking drops',  description: 'Headset disconnects, controllers lose tracking.' },
    { id: 'crashes',   icon: '💥', label: 'VR software crashes',          description: 'SteamVR / Oculus / game crashes during sessions.' },
    { id: 'thermals',  icon: '🌡', label: 'PC overheating',               description: 'Fans spin loud, GPU / CPU thermal-throttle during VR.' },
    { id: 'none',      icon: '✅', label: 'No complaint — just optimizing', description: 'Everything works fine; you just want to squeeze out more performance.' },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Main Issue (if any)</h2>
        <p className="text-sm text-gray-400">
          What bothers you most about your current VR experience? Rules and action plans that
          target your chosen issue get boosted to the top.
        </p>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {options.map((opt) => (
          <OptionCard key={opt.id} icon={opt.icon} label={opt.label} description={opt.description}
            selected={selected === opt.id} onClick={() => onSelect(opt.id)} />
        ))}
      </div>

      <WizardNavBar onBack={onBack} onNext={onNext} canNext={!!selected} />
    </div>
  )
}

// ── Step: Skill Level ─────────────────────────────────────────

const SKILL_OPTIONS: Array<{ id: 'beginner' | 'intermediate' | 'advanced'; label: string; emoji: string; description: string }> = [
  { id: 'beginner',     label: 'Beginner',     emoji: '🌱', description: 'Plain-English explanations only. No technical jargon or registry paths. (App opens in Simple Mode)' },
  { id: 'intermediate', label: 'Intermediate', emoji: '⚡', description: 'Mix of plain-English and some technical context. Good for enthusiasts. (Simple Mode default, toggleable)' },
  { id: 'advanced',     label: 'Advanced',     emoji: '🔬', description: 'Full technical details with registry paths, exact values, and kernel metrics. (App opens in Advanced Mode)' },
]

function StepSkillLevel({ selected, onSelect, onNext, onBack }: {
  selected: string | null
  onSelect: (level: 'beginner' | 'intermediate' | 'advanced') => void
  onNext: () => void
  onBack: () => void
}): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Report Detail Level</h2>
        <p className="text-sm text-gray-400">
          How technical would you like your scan reports? This sets your default Simple/Advanced mode,
          and affects which level of explanation each finding defaults to.
        </p>
      </div>

      <div className="space-y-3">
        {SKILL_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`w-full px-5 py-4 rounded-lg text-left transition-all border flex items-start gap-4 ${
              selected === opt.id
                ? 'bg-accent-primary/15 border-accent-primary/50'
                : 'glass-panel-sm border-white/5 hover:border-white/20'
            }`}
          >
            <span className="text-3xl mt-0.5">{opt.emoji}</span>
            <div>
              <p className={`text-sm font-semibold mb-1 ${selected === opt.id ? 'text-white' : 'text-gray-200'}`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 text-center">You can change this anytime in Settings.</p>

      <WizardNavBar onBack={onBack} onNext={onNext} canNext={!!selected} nextLabel="Continue →" />
    </div>
  )
}

// ── Step: Done ────────────────────────────────────────────────

function StepDone({ state, onFinish, onBack }: {
  state: WizardState
  onFinish: () => void
  onBack: () => void
}): React.ReactElement {
  const selectedConnection = state.profile?.connections.find((c) => c.id === state.connectionId)
  const skillLabel = SKILL_OPTIONS.find((o) => o.id === state.skillLevel)?.label ?? state.skillLevel
  const pcTypeLabel = state.pcType === 'laptop' ? 'Laptop' : state.pcType === 'desktop' ? 'Desktop' : 'Unknown'
  const useCaseLabel = useCaseDisplayLabel(state.primaryUseCase)
  const complaintLabel = complaintDisplayLabel(state.mainComplaint)

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-3xl bg-vr-healthy/10 border border-vr-healthy/30 flex items-center justify-center text-4xl">
        ✓
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">All Set!</h2>
        <p className="text-sm text-gray-400">Here's your configuration — everything below is used to personalize recommendations.</p>
      </div>

      <div className="glass-panel-sm p-5 text-left space-y-3">
        <ConfigRow label="Headset"      value={`${state.brand} ${state.headsetModel}`} />
        <ConfigRow label="Connection"   value={selectedConnection?.name ?? state.connectionId ?? '—'} />
        <ConfigRow label="PC Type"      value={pcTypeLabel} />
        <ConfigRow label="Primary Use"  value={useCaseLabel} />
        <ConfigRow label="Main Issue"   value={complaintLabel} />
        <ConfigRow label="Report Style" value={skillLabel ?? '—'} />
      </div>

      <div className="flex gap-3">
        <button className="glass-button-danger btn-spring px-4 py-2.5 text-sm" onClick={onBack}>← Back</button>
        <button className="glass-button-success btn-spring flex-1 py-2.5 text-sm font-semibold" onClick={onFinish}>
          Launch Dashboard →
        </button>
      </div>
    </div>
  )
}

function useCaseDisplayLabel(u: PrimaryUseCase | null): string {
  switch (u) {
    case 'social-vr':    return 'Social VR (VRChat, Resonite)'
    case 'simulation':   return 'Simulation (MSFS, DCS, iRacing)'
    case 'fitness':      return 'Fitness / Rhythm'
    case 'action-games': return 'Action / Adventure'
    case 'productivity': return 'Productivity'
    case 'mixed':        return 'Mixed use'
    default:             return '—'
  }
}

function complaintDisplayLabel(c: MainComplaint | null): string {
  switch (c) {
    case 'stutters':  return 'Stutters / frame drops'
    case 'blurry':    return 'Blurry / low resolution'
    case 'latency':   return 'Lag / latency'
    case 'drops':     return 'Connection / tracking drops'
    case 'crashes':   return 'VR software crashes'
    case 'thermals':  return 'PC overheating'
    case 'none':      return 'No complaint (optimizing)'
    default:          return '—'
  }
}

// ── Shared UI ─────────────────────────────────────────────────

function ConfigRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function OptionCard({ icon, label, description, selected, onClick }: {
  icon: string
  label: string
  description: string
  selected: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-start gap-3 border ${
        selected
          ? 'bg-accent-primary/15 border-accent-primary/50'
          : 'glass-panel-sm border-white/5 hover:border-accent-primary/30 hover:bg-accent-primary/5'
      }`}
    >
      <span className="text-xl mt-0.5 shrink-0 leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${selected ? 'text-white' : 'text-gray-200'}`}>
          {label}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      {selected && <span className="text-accent-primary text-sm shrink-0 mt-0.5">✓</span>}
    </button>
  )
}

function WizardNavBar({ onBack, onNext, canNext, nextLabel = 'Next →' }: {
  onBack: () => void
  onNext: () => void
  canNext: boolean
  nextLabel?: string
}): React.ReactElement {
  return (
    <div className="flex gap-3 pt-2">
      <button
        className="glass-button-danger btn-spring px-5 py-2.5 text-sm"
        onClick={onBack}
      >
        ← Back
      </button>
      <button
        className={`flex-1 btn-spring py-2.5 text-sm font-semibold transition-all ${
          canNext
            ? 'glass-button'
            : 'glass-panel-sm text-gray-600 cursor-not-allowed border-white/5'
        }`}
        onClick={onNext}
        disabled={!canNext}
      >
        {nextLabel}
      </button>
    </div>
  )
}
