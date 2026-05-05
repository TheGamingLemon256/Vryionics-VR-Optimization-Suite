import React from 'react'
import StorageDebloatPanel from '../summary/StorageDebloatPanel'
import VRGamesPanel from '../summary/VRGamesPanel'

export default function StoragePage(): React.ReactElement {
  return (
    <div className="page-enter flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Storage Cleanup</h1>
        <p className="text-sm text-gray-400 mt-1">
          Scan for cache files, temp data, shader caches, and VR bloat. Select categories
          to free up space without touching anything important.
        </p>
      </div>

      <StorageDebloatPanel />

      <div className="border-t border-white/5 pt-6 mt-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">VR Game Settings Scanner</h2>
          <p className="text-sm text-gray-400 mt-0.5">Scan installed VR games for sub-optimal settings. Issues can be fixed directly.</p>
        </div>
        <VRGamesPanel />
      </div>
    </div>
  )
}
