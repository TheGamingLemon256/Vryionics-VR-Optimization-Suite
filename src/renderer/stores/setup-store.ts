import { create } from 'zustand'

export type PcType = 'laptop' | 'desktop' | 'unknown'

export type PrimaryUseCase =
  | 'social-vr'     // VRChat, NeosVR, Resonite — cache-heavy, CPU-sensitive
  | 'simulation'    // MSFS, DCS, iRacing, ETS2 — GPU + RAM heavy
  | 'fitness'       // Beat Saber, Supernatural, Synth Riders — latency-sensitive
  | 'action-games'  // Half-Life: Alyx, Boneworks, Pavlov — balanced
  | 'productivity'  // Immersed, vSpatial, SteamVR Desktop — light, focus on latency
  | 'mixed'         // No single primary use

export type MainComplaint =
  | 'stutters'    // Frame drops / micro-stutter
  | 'blurry'      // Low perceived resolution / blurry
  | 'latency'     // Input lag / motion-to-photon
  | 'drops'       // Connection / tracking dropouts
  | 'crashes'     // VR software crashes
  | 'thermals'    // PC overheating
  | 'none'        // No complaint — everything works

export interface UserSetupConfig {
  headsetId: string
  headsetBrand: string
  headsetModel: string
  connectionId: string
  connectionArchetype: string
  streamingSoftware: string | null
  streamingEnabled: boolean
  streamingApp: string | null
  skillLevel: 'beginner' | 'intermediate' | 'advanced'
  // Phase-5 expansion: questionnaire data merged into wizard
  pcType?: PcType
  primaryUseCase?: PrimaryUseCase
  mainComplaint?: MainComplaint
  completedAt: number
}

interface SetupState {
  isComplete: boolean
  config: UserSetupConfig | null
  wizardStep: number

  setConfig: (config: UserSetupConfig) => void
  setWizardStep: (step: number) => void
  loadFromStorage: () => Promise<void>
  saveToStorage: (config: UserSetupConfig) => Promise<void>
  resetSetup: () => void
}

export const useSetupStore = create<SetupState>((set) => ({
  isComplete: false,
  config: null,
  wizardStep: 0,

  setConfig: (config) => set({ config, isComplete: true }),
  setWizardStep: (step) => set({ wizardStep: step }),

  loadFromStorage: async () => {
    try {
      const api = (window as any).api
      const config = await api.setup.getSetup() as UserSetupConfig | null
      if (config) {
        set({ config, isComplete: true })
      }
    } catch {
      // First run — no setup saved yet
    }
  },

  saveToStorage: async (config) => {
    const api = (window as any).api
    await api.setup.saveSetup(config)
    set({ config, isComplete: true })
  },

  resetSetup: () => set({ config: null, isComplete: false, wizardStep: 0 })
}))
