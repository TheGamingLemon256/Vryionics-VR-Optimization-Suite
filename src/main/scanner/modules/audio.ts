// VR Optimization Suite — Audio Scanner Module
// Detects WASAPI exclusive mode, spatial audio overhead, default device.

import { readKey, readValue } from '../../utils/registry-read'
import { enumerateRegistrySubkeys } from '../../utils/registry'
import { enumerateProcesses } from '../../utils/process'
import type { ScanModuleResult, AudioData } from '../types'

const RENDER_BASE = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render'
const RENDER_BASE_NO_HIVE = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render'

// MMDevice property keys are GUIDs followed by a comma and an index. The two
// we care about live under Render\<endpoint>\Properties:
//   {a45c254e-df1c-4efd-8020-67d146a850e0},2  -> friendly device name
//   {1da5d803-d492-4edd-8c23-e0c0ffee7f0e},2  -> default device period (100ns)
const NAME_KEY_RE = /^\{a45c254e-df1c-4efd-8020-67d146a850e0\},\s*2$/i
const PERIOD_KEY_RE = /^\{1da5d803-d492-4edd-8c23-e0c0ffee7f0e\},\s*2$/i

async function findActiveRenderEndpoint(): Promise<string | null> {
  // Endpoints have a DeviceState DWORD; 1 = active. We pick the first active
  // one as a best-effort default. Without WASAPI the "system default" is
  // another lookup, but for VR diagnostics knowing one active device is enough.
  const endpoints = enumerateRegistrySubkeys('HKLM', RENDER_BASE_NO_HIVE)
  for (const guid of endpoints) {
    const state = await readValue(`${RENDER_BASE}\\${guid}`, 'DeviceState')
    if (state && state.type === 'REG_DWORD' && state.data === 1) {
      return guid
    }
  }
  return null
}

async function readEndpointFriendlyName(guid: string): Promise<string | null> {
  const propsKey = await readKey(`${RENDER_BASE}\\${guid}\\Properties`).catch(() => null)
  if (!propsKey) return null
  for (const [name, value] of Object.entries(propsKey.values)) {
    if (NAME_KEY_RE.test(name) && (value.type === 'REG_SZ' || value.type === 'REG_EXPAND_SZ')) {
      return value.data.trim() || null
    }
  }
  return null
}

async function readEndpointPeriodMs(guid: string): Promise<number | null> {
  const propsKey = await readKey(`${RENDER_BASE}\\${guid}\\Properties`).catch(() => null)
  if (!propsKey) return null
  for (const [name, value] of Object.entries(propsKey.values)) {
    if (PERIOD_KEY_RE.test(name) && value.type === 'REG_DWORD') {
      // Stored in 100ns units. 100000 == 10ms.
      const ms = value.data / 10000
      if (ms > 0 && ms < 1000) return Math.round(ms * 10) / 10
    }
  }
  return null
}

async function readSpatialAudioFlag(): Promise<boolean> {
  const sonic = await readValue(
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Audio\\ActivateWindowsSonicOnNarrower',
    'Enabled'
  )
  if (sonic && sonic.type === 'REG_DWORD' && sonic.data === 1) return true

  // Per-device toggle under AudioSettings\Device\<guid>:SpatialAudioEnabled.
  const deviceSubkeys = enumerateRegistrySubkeys(
    'HKCU',
    'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AudioSettings\\Device'
  )
  for (const sk of deviceSubkeys) {
    const v = await readValue(
      `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AudioSettings\\Device\\${sk}`,
      'SpatialAudioEnabled'
    )
    if (v && v.type === 'REG_DWORD' && v.data === 1) return true
  }
  return false
}

async function readVoipSuppression(): Promise<boolean> {
  const v = await readValue(
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Audio',
    'UserWantsFx'
  )
  return !!(v && v.type === 'REG_DWORD' && v.data === 1)
}

const EXCLUSIVE_APP_PROCESSES: Array<{ match: string; label: string }> = [
  { match: 'voicemeeter', label: 'voicemeeter' },
  { match: 'voicemeeter8', label: 'voicemeeterpro' },
  { match: 'voicemeeterpotato', label: 'voicemeeterPotato' },
  { match: 'equalizerapo', label: 'EqualizerAPO' },
  { match: 'peace', label: 'Peace' },
  { match: 'vbcable', label: 'VirtualCable' },
  { match: 'vb-audio', label: 'vb-audio' },
]

async function detectExclusiveModeApps(): Promise<string[]> {
  const procs = await enumerateProcesses()
  const names = new Set(procs.map((p) => p.name.toLowerCase()))
  const hits: string[] = []
  for (const { match, label } of EXCLUSIVE_APP_PROCESSES) {
    for (const n of names) {
      if (n.includes(match)) {
        hits.push(label)
        break
      }
    }
  }
  return hits
}

export async function scanAudio(): Promise<ScanModuleResult<AudioData>> {
  console.log('[scan:audio] Starting audio scan...')
  let defaultDevice: string | null = null
  let wasapiBufferMs: number | null = null
  const exclusiveDevices: string[] = []

  try {
    const endpointGuid = await findActiveRenderEndpoint()
    if (endpointGuid) {
      defaultDevice = await readEndpointFriendlyName(endpointGuid)
      wasapiBufferMs = await readEndpointPeriodMs(endpointGuid)
    }

    const [spatialAudioEnabled, voipNoiseSuppression, exclusiveHits] = await Promise.all([
      readSpatialAudioFlag(),
      readVoipSuppression(),
      detectExclusiveModeApps(),
    ])
    exclusiveDevices.push(...exclusiveHits)
    const wasapiExclusiveModeInUse = exclusiveDevices.length > 0

    console.log(
      `[scan:audio] Complete. device="${defaultDevice ?? 'unknown'}" spatial=${spatialAudioEnabled} ` +
      `exclusiveMode=${wasapiExclusiveModeInUse} exclusiveApps=[${exclusiveDevices.join(', ')}] ` +
      `bufferMs=${wasapiBufferMs ?? '?'} voipSuppression=${voipNoiseSuppression}`
    )
    return {
      success: true,
      data: {
        defaultDevice,
        wasapiExclusiveModeInUse,
        spatialAudioEnabled,
        wasapiBufferMs,
        exclusiveDevices,
        voipNoiseSuppression,
      },
    }
  } catch (error) {
    console.error(`[scan:audio] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: {
        defaultDevice,
        wasapiExclusiveModeInUse: exclusiveDevices.length > 0,
        spatialAudioEnabled: false,
        wasapiBufferMs,
        exclusiveDevices,
        voipNoiseSuppression: false,
      },
    }
  }
}
