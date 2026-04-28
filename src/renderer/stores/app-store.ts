import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PageId = 'dashboard' | 'summary' | 'upgrades' | 'questionnaire' | 'report' | 'optimizer' | 'storage' | 'drivers' | 'sessions' | 'vrchat' | 'settings' | 'wizard'

interface AppState {
  currentPage: PageId
  setCurrentPage: (page: PageId) => void
  advancedMode: boolean
  setAdvancedMode: (value: boolean) => void
  toggleAdvancedMode: () => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  isAdmin: boolean
  setIsAdmin: (value: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 'dashboard',
      setCurrentPage: (page) => set({ currentPage: page }),
      advancedMode: false,
      setAdvancedMode: (value) => set({ advancedMode: value }),
      toggleAdvancedMode: () => set((s) => ({ advancedMode: !s.advancedMode })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      isAdmin: false,
      setIsAdmin: (value) => set({ isAdmin: value })
    }),
    {
      name: 'vryionics-app-prefs',
      // Only persist UI preferences — not runtime state like currentPage or isAdmin
      partialize: (state) => ({
        advancedMode: state.advancedMode,
        sidebarCollapsed: state.sidebarCollapsed
      })
    }
  )
)
