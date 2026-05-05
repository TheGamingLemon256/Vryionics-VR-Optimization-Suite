// Fetches upgrade recommendations via IPC, renders UpgradesPanel.

import React, { useState, useEffect } from 'react'
import { useScanStore } from '../../stores/scan-store'
import UpgradesPanel, { type UpgradeRecommendation } from './UpgradesPanel'

export default function UpgradesPage(): React.ReactElement {
  const lastScanData = useScanStore((s) => s.lastScanData)
  const isScanning = useScanStore((s) => s.isScanning)
  const [upgrades, setUpgrades] = useState<UpgradeRecommendation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!lastScanData) return
    setLoading(true)
    const api = (window as any).api
    api.upgrades.generate(lastScanData)
      .then((recs: UpgradeRecommendation[]) => setUpgrades(recs ?? []))
      .catch(() => setUpgrades([]))
      .finally(() => setLoading(false))
  }, [lastScanData])

  if (isScanning) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Scan in progress…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)]/60 border-t-transparent animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Calculating upgrade recommendations…</p>
      </div>
    )
  }

  return <UpgradesPanel upgrades={upgrades} scanData={lastScanData} />
}
