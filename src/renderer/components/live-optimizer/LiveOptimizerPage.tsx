// VR Optimization Suite — Live Optimizer Page

import React from 'react'
import LiveOptimizerPanel from './LiveOptimizerPanel'

export default function LiveOptimizerPage(): React.ReactElement {
  return (
    <div className="page-enter flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Live Optimizer</h1>
        <p className="text-sm text-gray-400 mt-1">
          Automatically close background processes and pause Windows services when a VR session is detected,
          then restore everything when you're done.
        </p>
      </div>

      <div className="glass-panel-sm p-5">
        <LiveOptimizerPanel />
      </div>
    </div>
  )
}
