import React from 'react'
import { useAppStore, type PageId } from '../../stores/app-store'

interface NavItem {
  id: PageId
  label: string
  icon: string
  advancedOnly?: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',        icon: '⊞' },
  { id: 'summary',       label: 'Action Plan',       icon: '★' },
  { id: 'upgrades',      label: 'Upgrades',          icon: '⬆' },
  { id: 'optimizer',     label: 'Live Optimizer',    icon: '⚡' },
  { id: 'sessions',      label: 'VR Sessions',       icon: '◉' },
  { id: 'vrchat',        label: 'VRChat Tuning',     icon: '◈' },
  { id: 'storage',       label: 'Storage Cleanup',   icon: '🗑' },
  { id: 'drivers',       label: 'Drivers',           icon: '⊡' },
  // Old "Setup Interview" now lives inside the wizard (Phase-5 merge).
  // This nav item reopens the wizard so users can edit their answers.
  { id: 'questionnaire', label: 'Re-run Setup',       icon: '◎' },
  { id: 'report',        label: 'Report',            icon: '⊟' },
  { id: 'settings',      label: 'Settings',          icon: '⚙' }
]

function Sidebar(): React.ReactElement {
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const advancedMode = useAppStore((s) => s.advancedMode)
  const toggleAdvancedMode = useAppStore((s) => s.toggleAdvancedMode)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const visibleItems = navItems.filter(
    (item) => !item.advancedOnly || advancedMode
  )

  return (
    <div
      className={`glass-panel flex flex-col border-r border-glass-border rounded-none transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="w-full h-10 flex items-center justify-center hover:bg-white/5 transition-colors text-gray-400 text-xs"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? '›' : '‹'}
      </button>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-2">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              data-tour-target={`sidebar-${item.id}`}
              className={`sidebar-item flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white/8 text-white nav-item-active'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/4'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Support link — opens Patreon externally. Subtle, below the nav but
          above the Simple/Advanced toggle so it doesn't crowd page navigation. */}
      <div className="px-2 pb-1 pt-2 border-t border-glass-border">
        <button
          onClick={() => {
            try {
              ;(window as any).api?.app?.openExternal?.('https://www.patreon.com/c/Vryionic')
            } catch { /* ignore */ }
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all text-gray-400 hover:text-white hover:bg-white/4"
          title={sidebarCollapsed ? 'Support on Patreon' : undefined}
        >
          {/* Heart outline — fixed coral color to match the Patreon promo card identity */}
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="#f46666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="flex-shrink-0"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {!sidebarCollapsed && <span>Support</span>}
        </button>
      </div>

      {/* Simple / Advanced toggle */}
      <div className="px-3 py-3 border-t border-glass-border">
        <button
          onClick={toggleAdvancedMode}
          className="w-full flex items-center gap-2 text-xs"
          title={advancedMode ? 'Switch to Simple Mode' : 'Switch to Advanced Mode'}
        >
          {/* Toggle track */}
          <div
            className={`toggle-track relative w-8 h-4 rounded-full flex-shrink-0 transition-colors ${
              advancedMode ? 'bg-accent-primary/40' : 'bg-gray-600/40'
            }`}
          >
            <div
              className={`toggle-thumb absolute top-0.5 w-3 h-3 rounded-full bg-white shadow ${
                advancedMode ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </div>
          {!sidebarCollapsed && (
            <span className={advancedMode ? 'text-accent-primary' : 'text-gray-500'}>
              {advancedMode ? 'Advanced' : 'Simple'}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

export default Sidebar
