import React, { useEffect, useState } from 'react'
import { useLiveOptimizerStore } from '../../stores/live-optimizer-store'
import { DisclosureModal } from './DisclosureModal'
import { ActivityLogPanel } from './ActivityLogPanel'

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-50 ${value ? 'bg-accent-primary' : 'bg-white/20'}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export function LiveOptimizerSettingsCard(): React.ReactElement {
  const { flags, running, init, enable, disable, acceptDisclosure } = useLiveOptimizerStore()

  const [discloseOpen, setDiscloseOpen] = useState<'pre-enable' | 'read-only' | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void init() }, [init])

  const handleToggle = async (): Promise<void> => {
    if (busy) return
    if (running || flags.enabled) {
      setBusy(true)
      try { await disable() } finally { setBusy(false) }
      return
    }
    if (!flags.disclosureAccepted) {
      setDiscloseOpen('pre-enable')
      return
    }
    setBusy(true)
    try { await enable() } finally { setBusy(false) }
  }

  const handleDisclosureEnable = async (): Promise<void> => {
    await acceptDisclosure()
    await enable()
    setDiscloseOpen(null)
  }

  const openTriggerFile = (): void => {
    const api = (window as unknown as { api: { liveOptimizer: { openTriggerFile: () => Promise<string> } } }).api
    void api.liveOptimizer.openTriggerFile()
  }
  const openAllowlistFile = (): void => {
    const api = (window as unknown as { api: { liveOptimizer: { openAllowlistFile: () => Promise<string> } } }).api
    void api.liveOptimizer.openAllowlistFile()
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Live Optimizer</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {flags.enabled
                ? 'On. Lowers background priority during VR sessions and restores it when VR closes.'
                : 'Off. No background processes are touched.'}
            </p>
          </div>
          <Toggle value={flags.enabled} onChange={() => { void handleToggle() }} disabled={busy} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => setDiscloseOpen('read-only')}
            className="text-xs text-accent-primary hover:underline"
          >
            What does this do?
          </button>
          <span className="text-gray-700">|</span>
          <button
            onClick={openTriggerFile}
            className="text-xs text-gray-400 hover:text-white"
          >
            View trigger list
          </button>
          <button
            onClick={openAllowlistFile}
            className="text-xs text-gray-400 hover:text-white"
          >
            View allowlist
          </button>
        </div>

        <div className="border-t border-white/5 pt-3">
          <button
            onClick={() => setActivityOpen(!activityOpen)}
            className="w-full flex items-center justify-between text-xs text-gray-300 hover:text-white"
          >
            <span className="font-medium">Activity log</span>
            <span className="text-gray-500">{activityOpen ? '▾' : '▸'}</span>
          </button>
          {activityOpen && (
            <div className="mt-3">
              <ActivityLogPanel />
            </div>
          )}
        </div>
      </div>

      <DisclosureModal
        open={discloseOpen !== null}
        mode={discloseOpen ?? 'read-only'}
        onCancel={() => setDiscloseOpen(null)}
        onEnable={handleDisclosureEnable}
      />
    </>
  )
}
