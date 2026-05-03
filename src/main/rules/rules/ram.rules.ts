// VR Optimization Suite — RAM Diagnostic Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const ramRules: Rule[] = [
  {
    id: 'ram-insufficient',
    category: 'ram',
    name: 'Insufficient RAM for VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (data.ram.totalGB >= 16) return null
      return {
        ruleId: 'ram-insufficient',
        severity: data.ram.totalGB < 8 ? 'critical' : 'warning',
        category: 'ram',
        explanation: {
          simple: `Your PC has ${data.ram.totalGB}GB of RAM, but VR needs at least 16GB. With less RAM, Windows has to swap data out to the page file on your drive, which is much slower than RAM and causes severe VR stuttering. Consider upgrading.`,
          advanced: `System RAM: ${data.ram.totalGB}GB. Minimum for stable VR: 16GB. VRChat alone can consume 4-8GB; add SteamVR (~1GB), vrcompositor, OBS, and OS overhead and you're easily at 12-14GB. Below 16GB, Windows pagefile usage increases significantly, causing unpredictable 100-500ms+ stutter spikes when swapping. Commit charge: ${data.ram.commitChargePercent.toFixed(1)}%.`
        }
      }
    }
  },
  {
    id: 'ram-usage-high',
    category: 'ram',
    name: 'High Memory Usage',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (data.ram.usagePercent < 82) return null
      return {
        ruleId: 'ram-usage-high',
        severity: data.ram.usagePercent >= 92 ? 'critical' : 'warning',
        category: 'ram',
        explanation: {
          simple: `Your system is using ${data.ram.usagePercent.toFixed(0)}% of its RAM. When RAM fills up, Windows starts using your hard drive to store data instead, which is much slower and causes VR stuttering. Close background apps.`,
          advanced: `RAM usage: ${data.ram.usedGB.toFixed(1)}/${data.ram.totalGB}GB (${data.ram.usagePercent.toFixed(1)}%). Available: ${data.ram.availableGB.toFixed(1)}GB. Commit charge: ${data.ram.commitChargePercent.toFixed(1)}%. Nonpaged pool: ${data.ram.nonpagedPoolMB}MB. At >82% usage, Windows increases soft-fault frequency. Close browsers, Discord, OBS preview, and any non-essential apps before VR sessions.`
        }
      }
    }
  },
  {
    id: 'ram-xmp-not-enabled',
    category: 'ram',
    name: 'RAM Not Running at Rated Speed (XMP/EXPO)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (!data.ram.xmpSpeed) return null
      const diff = data.ram.xmpSpeed - data.ram.speed
      if (diff < 200) return null
      return {
        ruleId: 'ram-xmp-not-enabled',
        severity: 'warning',
        category: 'ram',
        explanation: {
          simple: `Your RAM is running at ${data.ram.speed}MHz, but it\'s rated for ${data.ram.xmpSpeed}MHz. Enabling XMP (or EXPO on AMD) in your BIOS activates the rated speed. This is a BIOS change, so it\'s an advanced step; a wrong setting can stop the system from booting and you\'d need to clear CMOS to recover. If BIOS is unfamiliar, leave this alone.`,
          advanced: `RAM configured speed: ${data.ram.speed}MHz vs rated speed: ${data.ram.xmpSpeed}MHz (difference: ${data.ram.speed < data.ram.xmpSpeed ? '-' : '+'}${Math.abs(data.ram.xmpSpeed - data.ram.speed)}MHz). Enabling requires entering BIOS (Advanced → Memory → XMP Profile → Profile 1, or Enabled). Ryzen systems use EXPO/DOCP for better tuned timings. This is advanced; a misconfigured XMP profile can prevent POST and require a CMOS clear to recover. Higher RAM speed improves integrated GPU performance, DRAM-heavy operations, and AMD Infinity Fabric clock synchronization.`
        }
      }
    }
  },
  {
    id: 'ram-single-channel',
    category: 'ram',
    name: 'RAM May Be in Single-Channel Mode',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (data.ram.dualChannelConfirmed) return null // Dual channel confirmed
      if (data.ram.totalGB < 8) return null // Low RAM is a different issue
      // channels === 0 means we couldn't determine channel mode from the
      // registry-only path. Don't fire on unknown.
      if (data.ram.channels === 0 || data.ram.channels >= 2) return null
      return {
        ruleId: 'ram-single-channel',
        severity: 'warning',
        category: 'ram',
        explanation: {
          simple: 'Your RAM may be running in single-channel mode, which halves memory bandwidth. For VR, and especially VRChat with many avatars, memory bandwidth directly impacts CPU physics simulation speed and GPU texture streaming.',
          advanced: 'Dual-channel mode doubles memory bus width (64-bit × 2 = 128-bit effective), doubling peak bandwidth (e.g. DDR4-3200: 25.6 GB/s → 51.2 GB/s). For integrated graphics users this is critical — the GPU shares system RAM bandwidth. For discrete GPUs, CPU-side physics (VRChat dynamic bones, Unity job scheduler) and CPU↔GPU transfers are bandwidth-limited. Check your motherboard manual: RAM sticks must be in the correct DIMM slots (usually A2+B2 on ATX boards, or slots 1+3).'
        }
      }
    }
  },
  {
    id: 'ram-nonpaged-pool-high',
    category: 'ram',
    name: 'Nonpaged Pool Memory High',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.ram) return null
      if (data.ram.nonpagedPoolMB < 600) return null
      return {
        ruleId: 'ram-nonpaged-pool-high',
        severity: 'warning',
        category: 'ram',
        explanation: {
          simple: `Windows kernel memory (nonpaged pool) is using ${data.ram.nonpagedPoolMB}MB, which is unusually high. This is often caused by virtualization software like Hyper-V or VirtualBox. High kernel memory usage reduces available RAM for VR games.`,
          advanced: `Nonpaged pool: ${data.ram.nonpagedPoolMB}MB (warning threshold: 600MB). Nonpaged pool stores kernel-mode memory that cannot be swapped. Common causes of high NP pool: Hyper-V virtual switch, VirtualBox drivers, WSL2 networking, and some antivirus products. Use poolmon.exe or RAMMap from Sysinternals to identify the largest pool allocations.`
        }
      }
    }
  }
]
