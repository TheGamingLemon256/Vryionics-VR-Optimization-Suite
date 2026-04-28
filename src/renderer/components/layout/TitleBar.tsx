import React from 'react'
import { UpdateChip } from './UpdateChip'

declare global {
  interface Window {
    api: {
      app: {
        getVersion: () => Promise<string>
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      system: {
        isAdmin: () => Promise<boolean>
      }
    }
  }
}

function TitleBar(): React.ReactElement {
  return (
    <div className="glass-panel flex items-center justify-between h-10 px-4 border-b border-glass-border rounded-none titlebar-drag select-none">
      {/* App title */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/90 tracking-wide">
          Vryionics VR Optimization Suite
        </span>
        <span className="text-[10px] text-gray-500 font-medium">v0.2.8</span>
      </div>

      {/* Update chip + window controls */}
      <div className="flex items-center gap-2 titlebar-nodrag">
        <UpdateChip />
        <button
          onClick={() => window.api.app.minimize()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" className="text-gray-400">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={() => window.api.app.maximize()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          aria-label="Maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-400">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button
          onClick={() => window.api.app.close()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/30 transition-colors"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" className="text-gray-400">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
