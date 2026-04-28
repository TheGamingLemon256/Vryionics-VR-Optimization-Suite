// Vryionics VR Optimization Suite — Update Chip
//
// Tiny floating pill in the TitleBar that surfaces pending app updates.
// Pops open a panel with release notes + download/install action.

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface UpdateStatus {
  available: boolean
  checking: boolean
  downloading: boolean
  downloadProgress: number
  error?: string
  readyToInstall: boolean
  updateInfo?: {
    version: string
    releaseNotes?: string
    publishedAt?: string
  }
}

export function UpdateChip(): React.ReactElement | null {
  const [status, setStatus] = useState<UpdateStatus>({
    available: false, checking: false, downloading: false, downloadProgress: 0, readyToInstall: false
  })
  const [showPopover, setShowPopover] = useState(false)
  const [downloadStallRetry, setDownloadStallRetry] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null)
  const downloadStartRef = useRef<number | null>(null)
  const stallCheckRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const api = (window as any).api as { updater?: any }
    if (!api?.updater) return
    const unsub = api.updater.onStatus((s: UpdateStatus) => setStatus(s))
    api.updater.checkForUpdates()
    return unsub
  }, [])

  // Detect stalled downloads (no progress for 30s)
  useEffect(() => {
    if (status.downloading) {
      if (!downloadStartRef.current) {
        downloadStartRef.current = Date.now()
        setDownloadStallRetry(false)
      }
      if (stallCheckRef.current) clearTimeout(stallCheckRef.current)
      stallCheckRef.current = setTimeout(() => {
        if (status.downloading) setDownloadStallRetry(true)
      }, 30_000)
    } else {
      downloadStartRef.current = null
      setDownloadStallRetry(false)
      if (stallCheckRef.current) {
        clearTimeout(stallCheckRef.current)
        stallCheckRef.current = null
      }
    }
    return () => {
      if (stallCheckRef.current) clearTimeout(stallCheckRef.current)
    }
  }, [status.downloading, status.downloadProgress])

  // Outside-click close + position tracking. Popover is portaled to body
  // (so it escapes stacking contexts and sits above everything) and
  // positioned via the button's getBoundingClientRect.
  useEffect(() => {
    if (!showPopover) return
    const updatePos = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setPopoverPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)

    const clickHandler = (e: MouseEvent): void => {
      const t = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(t) &&
        buttonRef.current && !buttonRef.current.contains(t)
      ) {
        setShowPopover(false)
      }
    }
    // Delay registering so the opening click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener('click', clickHandler), 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', clickHandler)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showPopover])

  const handleDownload = async (): Promise<void> => {
    setDownloadStallRetry(false)
    try { await (window as any).api.updater.downloadUpdate() } catch { /* shown via status */ }
  }

  const handleRetryDownload = async (): Promise<void> => {
    setDownloadStallRetry(false)
    try {
      await (window as any).api.updater.checkForUpdates()
      await (window as any).api.updater.downloadUpdate()
    } catch { /* shown via status */ }
  }

  const handleInstall = async (): Promise<void> => {
    if (installing) return
    setInstalling(true)
    setInstallError(null)
    try {
      await (window as any).api.updater.installAndRestart()
    } catch (err: any) {
      setInstalling(false)
      setInstallError(err?.message || 'Failed to launch installer')
    }
  }

  if (!status.available && !status.checking) return null

  if (status.checking) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-500 titlebar-nodrag">
        <svg className="animate-spin w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeDasharray="30" strokeDashoffset="10" />
        </svg>
        Checking...
      </div>
    )
  }

  if (!status.available) return null

  const popoverNode = showPopover && popoverPos ? (
    <div
      ref={popoverRef}
      className="w-72 rounded-xl backdrop-blur-xl border border-white/15 shadow-2xl p-3"
      style={{
        position: 'fixed',
        top: popoverPos.top,
        right: popoverPos.right,
        background: 'rgba(12, 12, 26, 0.96)',
        // Sit above everything: modal overlays (z-100), toasts (z-200), etc.
        // App doesn't use anything this high.
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 14V2m0 0L3 7m5-5l5 5" />
            </svg>
            <span className="text-sm font-medium text-blue-400">Update Available</span>
          </div>

          <div className="text-xs text-gray-400 mb-1">
            New version: <span className="text-white font-mono">{status.updateInfo?.version}</span>
          </div>

          {status.updateInfo?.releaseNotes && (
            <p className="text-xs text-gray-500 mb-3 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
              {status.updateInfo.releaseNotes}
            </p>
          )}

          {(status.error || installError) && (
            <p className="text-xs text-red-400 mb-2">{installError || status.error}</p>
          )}

          {status.downloading && (
            <div className="mb-3">
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${status.downloadProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Downloading... {status.downloadProgress}%</p>
              {downloadStallRetry && (
                <button
                  onClick={handleRetryDownload}
                  className="w-full mt-2 text-xs py-1 rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors font-medium"
                >
                  Download stalled — Retry
                </button>
              )}
            </div>
          )}

          {!status.readyToInstall && !status.downloading && (
            <button
              onClick={handleDownload}
              className="w-full text-xs py-1.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors font-medium"
            >
              Download Update
            </button>
          )}

          {status.readyToInstall && !status.downloading && (
            <button
              onClick={handleInstall}
              disabled={installing}
              className={`w-full text-xs py-1.5 rounded transition-colors font-medium ${
                installing
                  ? 'bg-yellow-500/15 text-yellow-400 cursor-wait'
                  : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              }`}
            >
              {installing ? 'Launching installer...' : 'Install & Restart'}
            </button>
          )}
        </div>
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className="titlebar-nodrag flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
      >
        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10V2m0 0L2 6m4-4l4 4" />
        </svg>
        <span className="text-xs text-blue-400 font-medium">
          {status.downloading ? `${status.downloadProgress}%` : status.readyToInstall ? 'Restart' : `v${status.updateInfo?.version}`}
        </span>
      </button>
      {/* Portal the popover to <body> so it escapes any clipping / stacking
          context the titlebar creates, and z-9999 puts it above everything. */}
      {popoverNode && createPortal(popoverNode, document.body)}
    </>
  )
}
