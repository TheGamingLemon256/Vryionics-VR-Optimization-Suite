// VR Optimization Suite — CPU Diagnostic Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const cpuRules: Rule[] = [
  {
    id: 'cpu-usage-critical',
    category: 'cpu',
    name: 'CPU Usage — Critical',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (data.cpu.avgUsage < 90) return null
      return {
        ruleId: 'cpu-usage-critical',
        severity: 'critical',
        category: 'cpu',
        explanation: {
          simple: 'Your processor is maxed out. VR needs your CPU to handle controllers, physics, and audio simultaneously — when it\'s this full, you\'ll get stutters and freezes. Close background apps immediately.',
          advanced: `CPU average usage is ${data.cpu.avgUsage.toFixed(1)}% (critical threshold: 90%). VR requires consistent sub-frame headroom for vrcompositor reprojection. At >90% avg usage, frame drops and ASW/reprojection artifacts are likely. Per-core peak: ${Math.max(...data.cpu.perCoreUsage).toFixed(1)}%.`
        }
      }
    }
  },
  {
    id: 'cpu-usage-high',
    category: 'cpu',
    name: 'CPU Usage — High',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (data.cpu.avgUsage < 75 || data.cpu.avgUsage >= 90) return null
      return {
        ruleId: 'cpu-usage-high',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: 'Your processor is working quite hard. VR games need extra headroom in your CPU — closing background apps like browsers or Discord might help prevent occasional stutters.',
          advanced: `CPU average usage is ${data.cpu.avgUsage.toFixed(1)}% (warning threshold: 75%). VR compositors require ~15% headroom for reprojection. Consider closing streaming software, browsers, and background updaters. Per-core breakdown: ${data.cpu.perCoreUsage.map((u, i) => `Core${i}: ${u.toFixed(0)}%`).join(', ')}.`
        }
      }
    }
  },
  {
    id: 'cpu-cores-insufficient',
    category: 'cpu',
    name: 'Insufficient CPU Cores',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (data.cpu.cores >= 6) return null
      return {
        ruleId: 'cpu-cores-insufficient',
        severity: data.cpu.cores < 4 ? 'critical' : 'warning',
        category: 'cpu',
        explanation: {
          simple: `Your processor has ${data.cpu.cores} cores, which is below what modern VR recommends. VR needs cores for game physics, audio, tracking, and the VR compositor all at once. This may limit your VR experience.`,
          advanced: `${data.cpu.model} has ${data.cpu.cores} physical cores (${data.cpu.threads} threads). Modern VR workloads (vrserver, vrcompositor, game logic, audio, tracking) benefit from 6+ physical cores. With <6 cores, high-priority VR threads compete with OS background tasks, increasing frame delivery variance.`
        }
      }
    }
  },
  {
    id: 'cpu-single-thread-bottleneck',
    category: 'cpu',
    name: 'Single-Thread Bottleneck',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu || data.cpu.perCoreUsage.length === 0) return null
      const maxCore = Math.max(...data.cpu.perCoreUsage)
      const avg = data.cpu.avgUsage
      if (maxCore < 90 || avg > 70) return null
      const hotCoreIndex = data.cpu.perCoreUsage.indexOf(maxCore)
      return {
        ruleId: 'cpu-single-thread-bottleneck',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: 'One CPU core is pinned near 100% while the rest are idle — single-thread bottleneck. A faster-per-core CPU helps more here than adding cores.',
          advanced: `Core ${hotCoreIndex} is at ${maxCore.toFixed(1)}% while CPU average is only ${avg.toFixed(1)}%. This indicates a single-threaded bottleneck — likely vrcompositor, vrserver, or the game's main thread. Single-core performance (IPC × clock speed) is the limiting factor here, not total core count.`
        }
      }
    }
  },
  {
    id: 'cpu-context-switches-high',
    category: 'cpu',
    name: 'High Context Switch Rate',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (data.cpu.contextSwitchesPerSec < 60000) return null
      return {
        ruleId: 'cpu-context-switches-high',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: 'Context-switch rate is unusually high. Threads keep getting preempted, which wastes CPU and can cause VR hiccups. Too many background programs is the usual cause.',
          advanced: `Context switch rate: ${data.cpu.contextSwitchesPerSec.toLocaleString()}/s (warning threshold: 60,000/s). High context switch rates indicate excessive thread contention, often from many background services and applications. Each context switch costs ~1-5µs. At this rate, it represents significant overhead. Close unnecessary background apps and services.`
        }
      }
    }
  },
  {
    id: 'cpu-thermal-throttling',
    category: 'cpu',
    name: 'CPU Thermal Throttling',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (!data.cpu.thermalThrottled) return null
      return {
        ruleId: 'cpu-thermal-throttling',
        severity: 'critical',
        category: 'cpu',
        explanation: {
          simple: 'Your CPU is reducing its clock speed to avoid overheating. This severely impacts VR compositor and game performance — VRChat worlds with many players will be nearly unplayable.',
          advanced: `CPU thermal throttle occurs when junction temperature reaches TjMax (~95-100°C for most modern CPUs). The CPU drops voltage and frequency below base clock to reduce heat. Current observed boost: ${data.cpu.boostClockMhz !== null ? data.cpu.boostClockMhz + ' MHz' : 'below spec'}. Fix: improve CPU cooling (better paste, better cooler), reduce CPU load (close background apps), or check power plan isn't causing throttle at lower temps via turbo boost power limits.`
        }
      }
    }
  },
  {
    id: 'cpu-vcache-missing-vr',
    category: 'cpu',
    name: 'AMD V-Cache Not Configured for VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.cpu) return null
      if (!data.cpu.hasVCache || !data.cpu.vcacheDriverPresent) return null
      // Check if VRChat or vrserver are in the V-Cache app list
      const entries = data.cpu.vcacheAppEntries
      const vrAppNames = ['vrchat', 'vrserver', 'vrcompositor']
      const hasVrEntry = Object.keys(entries).some((name) =>
        vrAppNames.some((vr) => name.toLowerCase().includes(vr))
      )
      if (hasVrEntry) return null
      return {
        ruleId: 'cpu-vcache-missing-vr',
        severity: 'warning',
        category: 'cpu',
        explanation: {
          simple: 'You have a special AMD processor with extra-large cache memory (3D V-Cache), but it\'s not set up to give VR apps priority access to that cache. Setting this up can noticeably improve VR smoothness.',
          advanced: `${data.cpu.model} has AMD 3D V-Cache. The amd3dvcacheSvc driver is installed, but VRChat/vrserver are not registered in the V-Cache app preferences list (HKLM\\SYSTEM\\CurrentControlSet\\Services\\amd3dvcacheSvc\\Parameters\\Preferences\\App). Adding vrserver.exe and VRChat.exe with Type=1 ensures these processes get scheduled on V-Cache-enabled CCD.`
        }
      }
    }
  }
]
