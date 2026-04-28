// VR Optimization Suite — Process Diagnostic Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { dedupeProcesses, summariseProcessList } from '../process-dedupe'

export const processRules: Rule[] = [
  {
    id: 'bloat-processes-high',
    category: 'processes',
    name: 'Many Bloat Processes Running',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes) return null
      const bloat = data.processes.bloat
      const count = bloat.length
      // Raised tolerance: 5+ unique names (not instances) to flag. Many bloat
      // apps spawn many child processes (msedgewebview2, discord), so the raw
      // instance count overstates the problem.
      const deduped = dedupeProcesses(bloat)
      if (deduped.length < 5) return null
      const displayNames = summariseProcessList(bloat, 6)
      const totalRamMB = bloat.reduce((sum, p) => sum + p.ramMB, 0)
      return {
        ruleId: 'bloat-processes-high',
        severity: deduped.length >= 10 ? 'critical' : 'warning',
        category: 'processes',
        explanation: {
          simple: `${deduped.length} background apps are running that don't help VR (${displayNames}). These waste CPU and RAM that your VR game needs. Consider closing them before VR sessions.`,
          advanced: `${deduped.length} unique bloat apps, ${count} total instances, ~${totalRamMB.toFixed(0)}MB combined RAM. Top offenders: ${displayNames}. These add scheduler noise and compete for memory bandwidth. Recommendation: disable Discord/Spotify autostart, enable Windows Game Mode, or close these before VR sessions.`
        }
      }
    }
  },
  {
    id: 'no-vr-runtime-process',
    category: 'processes',
    name: 'VR Runtime Not Running',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes) return null
      if (data.processes.vrCritical.length > 0) return null
      // Only flag if VR software is installed but not running
      if (!data.vrRuntime?.steamvrInstalled && !data.vrRuntime?.oculusInstalled) return null
      return {
        ruleId: 'no-vr-runtime-process',
        severity: 'info',
        category: 'processes',
        explanation: {
          simple: 'Your VR software is installed but not currently running. Start SteamVR or your headset software before scanning for the most accurate VR-specific results.',
          advanced: `No VR compositor processes (vrserver, vrcompositor, ovrserver_x64) detected. Scan results may be incomplete — some VR-specific bottlenecks only manifest during active VR sessions. For the most accurate diagnosis, run this scan while SteamVR or the Oculus runtime is active with your headset connected.`
        }
      }
    }
  },
  {
    id: 'too-many-overlays',
    category: 'processes',
    name: 'Multiple VR Overlays Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes) return null
      const count = data.processes.vrOverlay.length
      if (count < 3) return null
      const names = summariseProcessList(data.processes.vrOverlay, 8)
      return {
        ruleId: 'too-many-overlays',
        severity: 'warning',
        category: 'processes',
        explanation: {
          simple: `${count} VR overlay apps are running (${names}). Each overlay adds a bit of work for your GPU every frame. Running too many can add up and cause stutters, especially in demanding games.`,
          advanced: `${count} active VR overlay processes: ${names}. OpenVR overlays inject rendering calls into the compositor pipeline. Each overlay adds GPU frame time — typically 0.2-1ms each, but can spike. Combined GPU overhead: potentially 0.6-3ms per frame. Disable overlays you don't actively use in their respective settings or via the OpenVR overlay manager.`
        }
      }
    }
  },
  {
    id: 'streaming-software-running',
    category: 'processes',
    name: 'Streaming/Recording Software Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes) return null
      if (data.processes.streaming.length === 0) return null
      const gpuUtil = data.gpu?.devices[0]?.encoderUtilization ?? 0
      const names = summariseProcessList(data.processes.streaming, 6)
      // Only flag if GPU encoder is stressed
      if (gpuUtil < 70) return null
      return {
        ruleId: 'streaming-software-running',
        severity: 'info',
        category: 'processes',
        explanation: {
          simple: `Streaming/recording software (${names}) is running and using ${gpuUtil.toFixed(0)}% of your GPU's encoder. If your VR is stuttering, consider lowering OBS settings or enabling hardware encoding.`,
          advanced: `Streaming processes: ${names}. GPU hardware encoder: ${gpuUtil.toFixed(1)}% utilized. When VR streaming + OBS share the same NVENC/AMF encoder, encoder contention can cause both streams to degrade. Consider: using a second GPU for OBS (if available), reducing OBS output resolution, or enabling OBS 'Game Capture' instead of 'Window Capture' to reduce overhead.`
        }
      }
    }
  },
  {
    id: 'anticheat-vr-overhead',
    category: 'processes',
    name: 'Anti-Cheat Kernel Driver Running During VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes?.antiCheat.length) return null
      const names = summariseProcessList(data.processes.antiCheat, 6)
      const totalCpu = data.processes.antiCheat.reduce((s, p) => s + p.cpuPercent, 0)
      return {
        ruleId: 'anticheat-vr-overhead',
        severity: totalCpu > 2 ? 'warning' : 'info',
        category: 'processes',
        explanation: {
          simple: `Anti-cheat software (${names}) is running and consuming kernel resources. Anti-cheat kernel drivers add interrupt overhead and DPC latency even when the associated game isn't running.`,
          advanced: `Detected anti-cheat processes: ${names} (combined CPU: ${totalCpu.toFixed(1)}%). Anti-cheat kernel drivers (especially Vanguard/vgc.exe which runs as a boot driver) add interrupt overhead at the kernel level that affects all processes, including VR. EAC and BattlEye only load when their specific game is running, but their services may persist. Vanguard runs continuously. Recommendation: if not actively playing a game that requires these, disable the service or uninstall while doing VR sessions.`
        }
      }
    }
  },
  {
    id: 'peripheral-software-overhead',
    category: 'processes',
    name: 'RGB/Peripheral Software Consuming Resources',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.processes?.peripheralSoftware.length) return null
      // Only warn if at least one has meaningful CPU or there are 2+ running
      const totalCpu = data.processes.peripheralSoftware.reduce((s, p) => s + p.cpuPercent, 0)
      const totalRamMB = data.processes.peripheralSoftware.reduce((s, p) => s + p.ramMB, 0)
      if (data.processes.peripheralSoftware.length < 2 && totalCpu < 1) return null
      const names = summariseProcessList(data.processes.peripheralSoftware, 6)
      return {
        ruleId: 'peripheral-software-overhead',
        severity: 'info',
        category: 'processes',
        explanation: {
          simple: `Peripheral management software (${names}) is running. These apps poll USB devices, sync RGB lighting, and run background services that collectively consume CPU cycles and memory during your VR session.`,
          advanced: `Detected peripheral software: ${names}. Combined CPU: ${totalCpu.toFixed(1)}%, combined RAM: ${totalRamMB.toFixed(0)}MB. iCUE is notorious for high CPU polling of all Corsair USB devices (~2-5%). Armoury Crate injects into processes. Razer Synapse has background services. These don't individually cause VR drops but collectively add background noise. During VR, lighting sync is wasted work — these apps can be closed or configured to run lighter profiles.`
        }
      }
    }
  }
]
