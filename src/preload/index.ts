// VR Optimization Suite — Preload Bridge
// Exposes typed window.api to the renderer via contextBridge.

import { contextBridge, ipcRenderer } from 'electron'
import type { ScanData, ScanProgress } from '../main/scanner/types'

const api = {
  // ── Scan ──────────────────────────────────────────────────
  scan: {
    runFull: (options?: { headsetProfileId?: string; connectionArchetype?: string }) =>
      ipcRenderer.invoke('scan:runFull', options) as Promise<ScanData>,
    getLastResult: () =>
      ipcRenderer.invoke('scan:getLastResult') as Promise<ScanData | null>,
    cancel: () => ipcRenderer.send('scan:cancel'),
    networkPacketDiagnosis: (durationMs?: number) =>
      ipcRenderer.invoke('scan:networkPacketDiagnosis', durationMs),
    onProgress: (callback: (progress: ScanProgress) => void) => {
      const handler = (_: unknown, data: ScanProgress) => callback(data)
      ipcRenderer.on('scan:progress', handler)
      return () => ipcRenderer.removeListener('scan:progress', handler)
    }
  },

  // ── Rules ─────────────────────────────────────────────────
  rules: {
    evaluate: (scanData: ScanData, headsetBrand?: string) =>
      ipcRenderer.invoke('rules:evaluate', scanData, headsetBrand),
    getAll: () =>
      ipcRenderer.invoke('rules:getAll')
  },

  // ── Summary ───────────────────────────────────────────────
  summary: {
    generate: (findings: unknown[], scanData: ScanData) =>
      ipcRenderer.invoke('summary:generate', findings, scanData)
  },

  // ── Storage / Debloat ─────────────────────────────────────
  storage: {
    scanDebloat: () =>
      ipcRenderer.invoke('storage:scanDebloat'),
    deleteCategory: (categoryId: string) =>
      ipcRenderer.invoke('storage:deleteCategory', categoryId),
    deleteCategories: (categoryIds: string[]) =>
      ipcRenderer.invoke('storage:deleteCategories', categoryIds)
  },

  // ── Upgrades ─────────────────────────────────────────────
  upgrades: {
    generate: (scanData: ScanData) =>
      ipcRenderer.invoke('upgrades:generate', scanData)
  },

  // ── Fix Engine ────────────────────────────────────────────
  fix: {
    preview: (fixId: string) =>
      ipcRenderer.invoke('fix:preview', fixId),
    apply: (fixId: string) =>
      ipcRenderer.invoke('fix:apply', fixId),
    undo: (fixId: string) =>
      ipcRenderer.invoke('fix:undo', fixId),
    applyAll: (fixIds: string[]) =>
      ipcRenderer.invoke('fix:applyAll', fixIds),
    getHistory: () =>
      ipcRenderer.invoke('fix:getHistory'),
    previewAll: (fixIds: string[]) =>
      ipcRenderer.invoke('fix:previewAll', fixIds) as Promise<unknown[]>,
  },

  // ── System ────────────────────────────────────────────────
  system: {
    isAdmin: () =>
      ipcRenderer.invoke('system:isAdmin') as Promise<boolean>,
    requestElevation: () =>
      ipcRenderer.invoke('system:requestElevation') as Promise<boolean>
  },

  // ── Setup Wizard ──────────────────────────────────────────
  setup: {
    getHeadsetProfiles: () =>
      ipcRenderer.invoke('setup:getHeadsetProfiles'),
    getProfile: (id: string) =>
      ipcRenderer.invoke('setup:getProfile', id),
    saveSetup: (config: unknown) =>
      ipcRenderer.invoke('setup:saveSetup', config),
    getSetup: () =>
      ipcRenderer.invoke('setup:getSetup')
  },

  // ── Config ────────────────────────────────────────────────
  config: {
    get: (key: string) =>
      ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('config:set', key, value)
  },

  // ── App ───────────────────────────────────────────────────
  app: {
    getVersion: () =>
      ipcRenderer.invoke('app:getVersion') as Promise<string>,
    isDevBuild: () =>
      ipcRenderer.invoke('app:isDevBuild') as Promise<boolean>,
    minimize: () => ipcRenderer.invoke('app:minimize'),
    maximize: () => ipcRenderer.invoke('app:maximize'),
    close: () => ipcRenderer.invoke('app:close'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  },

  // ── Overlay window (always-on-top VR metrics widget) ─────
  overlay: {
    open:    () => ipcRenderer.invoke('overlay:open'),
    close:   () => ipcRenderer.invoke('overlay:close'),
    isOpen:  () => ipcRenderer.invoke('overlay:isOpen') as Promise<boolean>,
  },

  liveOptimizer: {
    status: () => ipcRenderer.invoke('liveopt:status'),
    enable: () => ipcRenderer.invoke('liveopt:enable'),
    disable: () => ipcRenderer.invoke('liveopt:disable'),
    getFlags: () => ipcRenderer.invoke('liveopt:getFlags'),
    setDisclosureAccepted: (accepted: boolean) =>
      ipcRenderer.invoke('liveopt:setDisclosureAccepted', accepted),
    setAutoEnable: (value: boolean) =>
      ipcRenderer.invoke('liveopt:setAutoEnable', value),
    openTriggerFile: () => ipcRenderer.invoke('liveopt:openTriggerFile'),
    openAllowlistFile: () => ipcRenderer.invoke('liveopt:openAllowlistFile'),
    readActivityLog: () => ipcRenderer.invoke('liveopt:readActivityLog'),
    onStatusUpdate: (callback: (status: unknown) => void) => {
      const handler = (_: unknown, status: unknown): void => callback(status)
      ipcRenderer.on('liveopt:statusUpdate', handler)
      return (): void => { ipcRenderer.removeListener('liveopt:statusUpdate', handler) }
    }
  },

  // ── Reports ───────────────────────────────────────────────
  reports: {
    save: (report: unknown) => ipcRenderer.invoke('reports:save', report),
    getAll: () => ipcRenderer.invoke('reports:getAll'),
    get: (id: string) => ipcRenderer.invoke('reports:get', id),
    delete: (id: string) => ipcRenderer.invoke('reports:delete', id),
    clear: () => ipcRenderer.invoke('reports:clear')
  },

  // ── Steam Games ───────────────────────────────────────────────
  steamGames: {
    scan: () => ipcRenderer.invoke('steamgames:scan')
  },

  // ── Metrics ───────────────────────────────────────────────
  metrics: {
    poll: () => ipcRenderer.invoke('metrics:poll') as Promise<import('../main/ipc/metrics').MetricsSnapshot>
  },

  // ── Support / Bug Reports ─────────────────────────────────
  support: {
    sendBugReport: (payload: {
      message: string
      includeScanData?: boolean
      includeFixHistory?: boolean
      includeSystemInfo?: boolean
      includeAppLog?: boolean
      scanDataJson?: string
      clientId?: string
    }) =>
      ipcRenderer.invoke('support:sendBugReport', payload) as Promise<{
        ok: boolean
        status?: number
        error?: string
      }>
  },

  // ── Background Scheduler ──────────────────────────────────
  scheduler: {
    getConfig: () => ipcRenderer.invoke('scheduler:getConfig') as Promise<{ enabled: boolean; intervalDays: number }>,
    setConfig: (cfg: { enabled?: boolean; intervalDays?: number }) =>
      ipcRenderer.invoke('scheduler:setConfig', cfg) as Promise<{ enabled: boolean; intervalDays: number }>,
  },

  // ── Tuning Profile Export / Import ────────────────────────
  profile: {
    export: (setup: { headsetId?: string; connectionArchetype?: string; pcType?: string; primaryUseCase?: string } | null, description: string) =>
      ipcRenderer.invoke('profile:export', setup, description) as Promise<string | null>,
    import: () => ipcRenderer.invoke('profile:import') as Promise<{
      formatVersion: number
      appVersion: string
      exportedAt: string
      activeFixes: string[]
      description: string
      setup: { headsetId?: string; connectionArchetype?: string } | null
    } | null>,
    applyImported: (fixIds: string[]) =>
      ipcRenderer.invoke('profile:applyImported', fixIds) as Promise<Array<{ fixId: string; success: boolean; error?: string }>>,
  },

  // ── VR Session Recordings ─────────────────────────────────
  sessions: {
    list:    () => ipcRenderer.invoke('sessions:list'),
    get:     (id: string) => ipcRenderer.invoke('sessions:get', id),
    delete:  (id: string) => ipcRenderer.invoke('sessions:delete', id),
    active:  () => ipcRenderer.invoke('sessions:active'),
    onState: (callback: (state: unknown) => void) => {
      const handler = (_: unknown, state: unknown) => callback(state)
      ipcRenderer.on('session-recorder:state', handler)
      return () => ipcRenderer.removeListener('session-recorder:state', handler)
    },
  },

  // ── Driver Updater ────────────────────────────────────────
  drivers: {
    getState: () => ipcRenderer.invoke('drivers:getState'),
    refreshAll: () => ipcRenderer.invoke('drivers:refreshAll'),
    refreshOne: (rowId: string) => ipcRenderer.invoke('drivers:refreshOne', rowId),
    install: (rowId: string) => ipcRenderer.invoke('drivers:install', rowId) as Promise<{ success: boolean; error?: string }>,
    onState: (callback: (state: unknown) => void) => {
      const handler = (_: unknown, state: unknown) => callback(state)
      ipcRenderer.on('drivers:state', handler)
      return () => ipcRenderer.removeListener('drivers:state', handler)
    },
  },

  // ── Logging (renderer → main unified log) ─────────────────
  logging: {
    write: (level: 'debug' | 'info' | 'warn' | 'error', namespace: string, message: string): void => {
      try { ipcRenderer.invoke('log:write', level, namespace, message) } catch { /* never throw from logger */ }
    },
    getCurrentFile: () => ipcRenderer.invoke('log:currentFile') as Promise<string | null>,
    getDirectory: () => ipcRenderer.invoke('log:directory') as Promise<string | null>,
  },

  // ── Auto-Updater ──────────────────────────────────────────
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check') as Promise<{
      available: boolean
      checking: boolean
      downloading: boolean
      downloadProgress: number
      readyToInstall: boolean
      error?: string
      updateInfo?: {
        version: string
        releaseNotes?: string
        publishedAt?: string
        downloadUrl?: string
        downloadSize?: number
      }
    }>,
    downloadUpdate: () => ipcRenderer.invoke('updater:download') as Promise<void>,
    installAndRestart: () => ipcRenderer.invoke('updater:install') as Promise<void>,
    getStatus: () => ipcRenderer.invoke('updater:status'),
    onStatus: (callback: (status: unknown) => void) => {
      const handler = (_: unknown, status: unknown) => callback(status)
      ipcRenderer.on('updater-status', handler)
      return () => ipcRenderer.removeListener('updater-status', handler)
    }
  },

  // ── Event Bus (main → renderer) ───────────────────────────
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_: unknown, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

export type VROSApi = typeof api

contextBridge.exposeInMainWorld('api', api)
