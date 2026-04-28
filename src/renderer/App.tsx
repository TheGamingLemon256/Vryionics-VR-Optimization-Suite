import React, { useEffect, useState } from 'react'
import { useAppStore } from './stores/app-store'
import { useSetupStore } from './stores/setup-store'
import { useThemeStore } from './stores/theme-store'
import { useFixStore } from './stores/fix-store'
import { useScanStore } from './stores/scan-store'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './components/dashboard/Dashboard'
import ExecutiveSummary from './components/summary/ExecutiveSummary'
import UpgradesPage from './components/upgrades/UpgradesPage'
// SystemQuestionnaire is intentionally not imported — its questions were merged
// into SetupWizard as part of Phase-5, and the 'questionnaire' route now
// re-runs the wizard instead.
import ReportView from './components/report/ReportView'
import SettingsPage from './components/settings/SettingsPage'
import SetupWizard from './components/wizard/SetupWizard'
import LiveOptimizerPage from './components/live-optimizer/LiveOptimizerPage'
import StoragePage from './components/storage/StoragePage'
import DriversPage from './components/drivers/DriversPage'
import SessionsPage from './components/sessions/SessionsPage'
import VRChatPage from './components/vrchat/VRChatPage'
import { AmbientBackground } from './components/shared/AmbientBackground'
import { FirstLaunchTour } from './components/shared/FirstLaunchTour'
import OverlayView from './components/overlay/OverlayView'

function App(): React.ReactElement {
  // When launched with #/overlay (the always-on-top metrics window)
  // bypass the normal main-window flow entirely.
  if (typeof window !== 'undefined' && window.location.hash === '#/overlay') {
    return <OverlayView />
  }
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const setIsAdmin = useAppStore((s) => s.setIsAdmin)
  const { loadFromStorage, isComplete } = useSetupStore()
  const loadTheme = useThemeStore((s) => s.loadFromStorage)
  const loadFixHistory = useFixStore((s) => s.loadFromDisk)
  const [initializing, setInitializing] = useState(true)

  // On mount: load theme + setup config + check admin status
  useEffect(() => {
    const init = async () => {
      // Load theme first — prevents flash of wrong accent color
      await loadTheme().catch(() => {})

      try {
        await loadFromStorage()
      } catch {
        // First run — setup not saved yet
      }

      // Restore applied-fix state from persisted engine history so badges
      // ("✓ Fixed") survive app restarts without requiring a rescan.
      await loadFixHistory().catch(() => {})

      try {
        const api = (window as any).api
        const admin: boolean = await api.system.isAdmin()
        setIsAdmin(admin)
      } catch {
        setIsAdmin(false)
      }

      setInitializing(false)
    }

    init()
  }, [])

  // Tray + scheduler triggers: both signal "run a scan now" via the same
  // 'tray:run-scan' channel. We route to dashboard so the user sees scan
  // progress, then kick off the scan via the existing scan-store flow.
  useEffect(() => {
    const api = (window as any).api as { on?: (ch: string, cb: () => void) => () => void }
    const off1 = api?.on?.('tray:run-scan', () => {
      useAppStore.getState().setCurrentPage('dashboard')
      const setup = useSetupStore.getState().config
      useScanStore.getState().startScan({
        headsetProfileId: setup?.headsetId,
        connectionArchetype: setup?.connectionArchetype,
      }).catch(() => {})
    })
    const off2 = api?.on?.('tray:check-drivers', () => {
      useAppStore.getState().setCurrentPage('drivers')
      ;(window as any).api?.drivers?.refreshAll?.().catch(() => {})
    })
    return () => { off1?.(); off2?.() }
  }, [])

  // Redirect to wizard if setup not complete, once we know
  useEffect(() => {
    if (!initializing && !isComplete && currentPage !== 'wizard') {
      setCurrentPage('wizard')
    }
  }, [initializing, isComplete])

  if (initializing) {
    return (
      <>
        <AmbientBackground />
        <div className="h-screen flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-2xl glass-panel flex items-center justify-center text-2xl animate-pulse">
                🥽
              </div>
              <p className="text-sm text-gray-400">Loading...</p>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Wizard: full-screen, no sidebar
  if (currentPage === 'wizard' || !isComplete) {
    return (
      <>
        <AmbientBackground />
        <div className="h-screen flex flex-col overflow-hidden">
          <TitleBar />
          <div className="flex-1 overflow-y-auto">
            <SetupWizard />
          </div>
        </div>
      </>
    )
  }

  const renderPage = (): React.ReactElement => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'summary':
        return <ExecutiveSummary />
      case 'upgrades':
        return <UpgradesPage />
      case 'questionnaire':
        // Phase-5: the "Setup Interview" questionnaire is merged into the wizard.
        // The sidebar nav item labelled "Re-run Setup" routes here and we
        // forward to the wizard so the user sees a single unified flow.
        // The legacy questionnaire component is kept around for legacy reasons
        // (some users may still have persisted answers) — it's rendered as a
        // fallback only when the wizard has already been completed.
        return <SetupWizard />
      case 'report':
        return <ReportView />
      case 'optimizer':
        return <LiveOptimizerPage />
      case 'storage':
        return <StoragePage />
      case 'drivers':
        return <DriversPage />
      case 'sessions':
        return <SessionsPage />
      case 'vrchat':
        return <VRChatPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <Dashboard />
    }
  }

  return (
    <>
      <AmbientBackground />
      <div className="h-screen flex flex-col overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            {/* key forces React to unmount + remount on every navigation,
                reliably replaying the .page-enter animation on each page */}
            <div key={currentPage}>
              {renderPage()}
            </div>
          </main>
        </div>
      </div>
      {/* First-launch tour — only renders on the dashboard so we have
          targets for "Run Scan" + sidebar items present. Self-dismisses
          after the user steps through it (or hits Skip), and sets a
          localStorage flag so it never returns. */}
      <FirstLaunchTour active={isComplete && currentPage === 'dashboard'} />
    </>
  )
}

export default App
