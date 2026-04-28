// VR Optimization Suite — Audio Scanner Module
// Detects WASAPI exclusive mode, spatial audio overhead, default device.

import { tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, AudioData } from '../types'

export async function scanAudio(): Promise<ScanModuleResult<AudioData>> {
  console.log('[scan:audio] Starting audio scan...')
  let defaultDevice: string | null = null
  let spatialAudioEnabled = false
  let wasapiExclusiveModeInUse = false
  let wasapiBufferMs: number | null = null
  let voipNoiseSuppression = false
  const exclusiveDevices: string[] = []

  try {
    // Default audio output device
    const deviceOut = await tryRunPowerShell(`
(Get-CimInstance -Class Win32_SoundDevice -EA SilentlyContinue |
  Where-Object { $_.StatusInfo -eq 3 } |
  Select-Object -First 1).Name
`, 8000)
    if (deviceOut?.trim()) defaultDevice = deviceOut.trim()

    // Windows Sonic / spatial audio
    const sonicOut = await tryRunPowerShell(`
$sonicKey = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Audio\\ActivateWindowsSonicOnNarrower'
if (Test-Path $sonicKey) {
  (Get-ItemProperty -Path $sonicKey -EA SilentlyContinue).Enabled
}
`, 5000)
    if (sonicOut?.trim() === '1' || sonicOut?.trim().toLowerCase() === 'true') {
      spatialAudioEnabled = true
    }

    // Also check Windows Sonic via AudioSettings
    const spatialOut = await tryRunPowerShell(`
$keys = Get-ChildItem 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AudioSettings\\Device' -EA SilentlyContinue
foreach ($k in $keys) {
  $v = (Get-ItemProperty -Path $k.PSPath -Name 'SpatialAudioEnabled' -EA SilentlyContinue)
  if ($v -and $v.SpatialAudioEnabled -eq 1) { Write-Output '1'; break }
}
`, 6000)
    if (spatialOut?.trim() === '1') spatialAudioEnabled = true

    // Detect exclusive-mode apps (Voicemeeter, EqualAPO, etc. signal exclusive mode usage)
    const exclusiveApps = [
      'voicemeeter', 'voicemeeterpro', 'voicemeeterPotato',
      'EqualizerAPO', 'Peace', 'VirtualCable', 'vb-audio'
    ]
    const procOut = await tryRunPowerShell(`
Get-Process -EA SilentlyContinue | Select-Object -ExpandProperty Name
`, 8000)
    if (procOut) {
      const running = procOut.toLowerCase()
      for (const app of exclusiveApps) {
        if (running.includes(app.toLowerCase())) {
          wasapiExclusiveModeInUse = true
          exclusiveDevices.push(app)
        }
      }
    }

    // Voice focus / noise suppression (Windows 11 feature)
    const voipOut = await tryRunPowerShell(`
$k = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'
if (Test-Path $k) { (Get-ItemProperty -Path $k -EA SilentlyContinue).Value }
`, 5000)
    // Voice focus check via Windows Sonic noise suppression setting
    const noiseSuppOut = await tryRunPowerShell(`
(Get-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Audio' -Name 'UserWantsFx' -EA SilentlyContinue).UserWantsFx
`, 5000)
    if (noiseSuppOut?.trim() === '1') voipNoiseSuppression = true

    // Estimate buffer size from device type (gaming headsets typically 10ms, pro audio 5ms)
    // We can check the period size from WASAPI via WMI
    const bufferOut = await tryRunPowerShell(`
# Check audio service minimum period from device registry
$devices = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render' -EA SilentlyContinue
foreach ($d in $devices) {
  $props = Get-ChildItem "$($d.PSPath)\\Properties" -EA SilentlyContinue
  foreach ($p in $props) {
    $val = (Get-ItemProperty -Path $p.PSPath -EA SilentlyContinue)
    # {1da5d803-d492-4edd-8c23-e0c0ffee7f0e},2 = DefaultDevicePeriod in 100ns units
    if ($p.PSChildName -match '1da5d803') {
      $period = $val.'{1da5d803-d492-4edd-8c23-e0c0ffee7f0e},2'
      if ($period) { [math]::Round($period / 10000, 1); return }
    }
  }
}
`, 8000)
    if (bufferOut?.trim()) {
      const ms = parseFloat(bufferOut.trim())
      if (!isNaN(ms) && ms > 0 && ms < 1000) wasapiBufferMs = ms
    }

    console.log(
      `[scan:audio] Complete — device="${defaultDevice ?? 'unknown'}" spatial=${spatialAudioEnabled} ` +
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
        voipNoiseSuppression
      }
    }
  } catch (error) {
    console.error(`[scan:audio] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: {
        defaultDevice,
        wasapiExclusiveModeInUse,
        spatialAudioEnabled,
        wasapiBufferMs,
        exclusiveDevices,
        voipNoiseSuppression
      }
    }
  }
}
