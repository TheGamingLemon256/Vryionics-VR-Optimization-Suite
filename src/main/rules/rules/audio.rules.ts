// VR Optimization Suite — Audio Diagnostic Rules

import type { Rule } from '../types'

export const audioRules: Rule[] = [
  {
    id: 'audio-spatial-overhead',
    category: 'audio',
    evaluate: (data) => {
      if (!data.audio) return null
      if (!data.audio.spatialAudioEnabled) return null
      return {
        ruleId: 'audio-spatial-overhead',
        severity: 'info',
        category: 'audio',
        title: 'Windows Spatial Audio Adds DSP CPU Overhead',
        explanation: {
          simple: 'Windows Sonic / spatial audio is enabled. It runs a DSP pipeline that adds 5-10ms audio latency and small CPU overhead — consider disabling in VR where audio direction comes from the game itself.',
          advanced: 'Windows spatial audio (Windows Sonic for Headphones, Dolby Atmos) applies head-related transfer function (HRTF) convolution in real-time via a system-level DSP pipeline. This adds ~5-10ms of audio latency and competes for CPU cycles. VR games already provide 3D spatial audio — enabling Windows spatial audio on top is typically redundant and can cause audio sync issues.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'audio-wasapi-exclusive-conflict',
    category: 'audio',
    evaluate: (data) => {
      if (!data.audio) return null
      if (!data.audio.wasapiExclusiveModeInUse) return null
      const apps = data.audio.exclusiveDevices.join(', ')
      return {
        ruleId: 'audio-wasapi-exclusive-conflict',
        severity: 'warning',
        category: 'audio',
        title: 'WASAPI Exclusive-Mode App Detected',
        explanation: {
          simple: `${apps} is using WASAPI exclusive mode. This locks the audio device and can prevent VR audio from initializing correctly, or cause audio glitches when VR tries to claim the device.`,
          advanced: 'WASAPI exclusive mode gives one application direct hardware access to the audio device, bypassing Windows Audio Session API mixing. When a VR compositor tries to initialize audio alongside an exclusive-mode app, Windows must negotiate device ownership — sometimes causing clicks, dropouts, or VR audio initialization failures. Voicemeeter, Equalizer APO with exclusive mode, and some DAW plugins commonly trigger this.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'audio-high-buffer-latency',
    category: 'audio',
    evaluate: (data) => {
      if (!data.audio) return null
      if (data.audio.wasapiBufferMs === null) return null
      if (data.audio.wasapiBufferMs <= 20) return null // 20ms or less is fine
      return {
        ruleId: 'audio-high-buffer-latency',
        severity: 'info',
        category: 'audio',
        title: 'Audio Buffer Larger Than Optimal for VR',
        explanation: {
          simple: `Audio buffer detected at ~${data.audio.wasapiBufferMs}ms. For VR, 5-10ms is ideal — larger buffers add perceptible audio lag that breaks immersion during fast head movements.`,
          advanced: `The WASAPI default device period of ~${data.audio.wasapiBufferMs}ms determines how frequently Windows commits audio to the hardware. VR requires tightly synchronized audio-visual output; large buffers mean audio can lag behind the rendered frame, breaking the perceptual sync that creates immersion. Setting the audio device to Exclusive mode with a 5ms period in device properties reduces this.`
        },
        fixId: null
      }
    }
  }
]
