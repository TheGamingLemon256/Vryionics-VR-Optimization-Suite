// VR Optimization Suite — Event Log Diagnostic Rules

import type { Rule } from '../types'

export const eventLogRules: Rule[] = [
  {
    id: 'gpu-tdr-events-recent',
    category: 'gpu',
    evaluate: (data) => {
      if (!data.eventLog) return null
      if (data.eventLog.gpuTdrEvents === 0) return null
      const severity = data.eventLog.gpuTdrEvents >= 5 ? 'critical' : 'high'
      return {
        ruleId: 'gpu-tdr-events-recent',
        severity,
        category: 'gpu',
        title: `GPU Driver Timeout (TDR) — ${data.eventLog.gpuTdrEvents} Event${data.eventLog.gpuTdrEvents !== 1 ? 's' : ''} in Last 7 Days`,
        explanation: {
          simple: `Your GPU driver crashed and recovered ${data.eventLog.gpuTdrEvents} time${data.eventLog.gpuTdrEvents !== 1 ? 's' : ''} in the last week. In VR this causes black screens, session crashes, and forced reprojection.`,
          advanced: 'GPU TDR (Timeout Detection and Recovery) fires when the GPU fails to respond to a command within 2 seconds (default TdrDelay). Causes: overclocking instability, driver bugs, memory corruption, power delivery issues, overheating, or VRAM errors. Each TDR in VR typically causes a complete session drop to desktop.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'whea-hardware-errors',
    category: 'cpu',
    evaluate: (data) => {
      if (!data.eventLog) return null
      if (data.eventLog.wheaErrors === 0) return null
      return {
        ruleId: 'whea-hardware-errors',
        severity: 'critical',
        category: 'cpu',
        title: `Hardware Errors Logged — ${data.eventLog.wheaErrors} WHEA Event${data.eventLog.wheaErrors !== 1 ? 's' : ''} in 7 Days`,
        explanation: {
          simple: `Windows detected ${data.eventLog.wheaErrors} hardware error${data.eventLog.wheaErrors !== 1 ? 's' : ''} from your CPU, RAM, or motherboard. This indicates physical instability that can cause random VR crashes and data corruption.`,
          advanced: 'WHEA (Windows Hardware Error Architecture) logs CPU cache errors, memory ECC corrections, PCIe link errors, and chipset faults. Recurring WHEA errors indicate hardware running outside safe parameters — caused by overclocking, failing RAM, inadequate cooling, or defective components. A single corrected error is normal; multiple errors per week indicates instability requiring investigation with MemTest86 and CPU stress testing.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'steamvr-crash-frequency',
    category: 'vr-runtime',
    evaluate: (data) => {
      if (!data.eventLog) return null
      if (data.eventLog.steamvrCrashes < 3) return null
      return {
        ruleId: 'steamvr-crash-frequency',
        severity: 'high',
        category: 'vr-runtime',
        title: `SteamVR Crashed ${data.eventLog.steamvrCrashes} Times in Last 7 Days`,
        explanation: {
          simple: `SteamVR or VRChat had ${data.eventLog.steamvrCrashes} crash events logged in the past week. Frequent crashes indicate a configuration conflict, driver issue, or resource contention.`,
          advanced: 'Repeated VR runtime crashes typically indicate: GPU driver timeouts (check TDR events), conflicting overlay software, USB instability on wired headsets, compositor thread priority starvation (check MMCSS and power plan), or VRChat shader compilation OOM. Cross-reference with GPU TDR events and process list.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'bios-outdated',
    category: 'os-config',
    evaluate: (data) => {
      if (!data.osConfig?.biosDate) return null
      // Parse BIOS date and check if > 3 years old
      try {
        const biosYear = parseInt(data.osConfig.biosDate.substring(0, 4))
        const currentYear = new Date().getFullYear()
        if (isNaN(biosYear) || currentYear - biosYear < 3) return null
        return {
          ruleId: 'bios-outdated',
          severity: 'info',
          category: 'os-config',
          title: `BIOS from ${biosYear} — Check for PCIe and USB Stability Updates`,
          explanation: {
            simple: `Your BIOS is from ${biosYear} (${currentYear - biosYear} years old). Motherboard vendors frequently release BIOS updates that fix PCIe stability, USB power issues, and VR compatibility problems.`,
            advanced: `BIOS ${data.osConfig.biosVersion ?? 'version unknown'} (${data.osConfig.biosDate}). Modern VR headsets expose PCIe and USB edge cases that early BIOS versions didn't anticipate. AMD AM4/AM5 platforms in particular have had many BIOS updates for AGESA microcode improving Infinity Fabric timing, PCIe link stability, and USB3 enumeration — all relevant to VR performance.`
          },
          fixId: null
        }
      } catch { return null }
    }
  },
  {
    id: 'laptop-on-battery',
    category: 'os-config',
    evaluate: (data) => {
      if (!data.osConfig?.isLaptop) return null
      if (!data.osConfig.isOnBattery) return null
      return {
        ruleId: 'laptop-on-battery',
        severity: 'critical',
        category: 'os-config',
        title: 'Laptop Running on Battery — GPU and CPU Are Throttled',
        explanation: {
          simple: 'Your laptop is running on battery power. Both CPU and GPU are aggressively throttled to save power — you will experience severe VR performance issues. Plug in before starting VR.',
          advanced: 'Battery-powered laptops apply aggressive DVFS (dynamic voltage-frequency scaling) to CPU and GPU, often cutting performance by 30-70%. dGPUs switch to much lower TDP limits. VR requires sustained, consistent GPU frame delivery — power limits cause frame time variability that manifests as stutters and judder. Always use AC power for VR.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'vpn-active-wireless-vr',
    category: 'network',
    evaluate: (data) => {
      if (!data.osConfig?.vpnActive) return null
      const isWireless =
        data.headsetConnection?.method === 'virtual-desktop' ||
        data.headsetConnection?.method === 'airlink' ||
        data.headsetConnection?.method === 'alvr' ||
        data.headsetConnection?.method === 'unknown-wireless'
      if (!isWireless) return null
      return {
        ruleId: 'vpn-active-wireless-vr',
        severity: 'warning',
        category: 'network',
        title: 'VPN Active — May Interfere with Local Wireless VR Streaming',
        explanation: {
          simple: 'A VPN is active. Wireless VR (Virtual Desktop, AirLink, ALVR) streams video over your local network — if the VPN routes local traffic through a remote server, latency will spike and the stream will drop.',
          advanced: 'Split-tunnel VPNs (that only route specific traffic) are usually fine. Full-tunnel VPNs route ALL traffic including local LAN packets through the VPN server, adding round-trip latency to the headset stream. Most wireless VR apps use UDP streaming on ports 38810-38830 (Virtual Desktop) or 9943-9944 (AirLink) — check if these ports bypass the VPN tunnel.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'third-party-av-overhead',
    category: 'os-config',
    evaluate: (data) => {
      if (!data.osConfig?.thirdPartyAv) return null
      const knownHeavy = ['norton', 'mcafee', 'kaspersky', 'avast', 'avg', 'bitdefender', 'webroot', 'malwarebytes', 'eset']
      const av = data.osConfig.thirdPartyAv.toLowerCase()
      const isHeavy = knownHeavy.some((k) => av.includes(k))
      if (!isHeavy) return null
      return {
        ruleId: 'third-party-av-overhead',
        severity: 'info',
        category: 'os-config',
        title: `${data.osConfig.thirdPartyAv} Antivirus May Add Real-Time Scan Overhead`,
        explanation: {
          simple: `${data.osConfig.thirdPartyAv} is running real-time protection. Some antivirus products scan shader files and game assets as they load, adding latency to world loads and causing micro-stutters during asset streaming in VRChat.`,
          advanced: 'Third-party AV hooks into file system filter drivers and inject scanning into I/O paths. When VRChat loads avatar assets or compiles shaders, every file read passes through the AV driver. Adding VRChat, SteamVR, and your VR headset folders to AV exclusions eliminates this overhead. Windows Defender with Game Mode active typically self-throttles during gameplay — third-party AV does not.'
        },
        fixId: null
      }
    }
  }
]
