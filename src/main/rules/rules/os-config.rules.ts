// VR Optimization Suite — OS Config / MMCSS / Power Plan Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const osConfigRules: Rule[] = [
  {
    id: 'power-plan-not-performance',
    category: 'os-config',
    name: 'Power Plan Not Set to High Performance',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      const plan = data.osConfig.powerPlan.toLowerCase()
      if (
        plan.includes('high performance') ||
        plan.includes('ultimate') ||
        plan.includes('performance')
      ) return null
      return {
        ruleId: 'power-plan-not-performance',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `Your PC is set to "${data.osConfig.powerPlan}" power mode, which tells it to save electricity by slowing down when not under load. For VR, you want "High Performance" so your PC is always ready to respond instantly.`,
          advanced: `Active power plan: "${data.osConfig.powerPlan}". For VR, use High Performance or Ultimate Performance plan to prevent CPU frequency scaling delays (P-state transitions add 1-10ms latency). AMD users: use "AMD Ryzen Balanced" as a compromise. Set via: powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (High Performance) or powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61 (Ultimate Performance).`
        },
        fixId: 'fix-power-plan'
      }
    }
  },
  {
    id: 'virtualization-active',
    category: 'os-config',
    name: 'Virtualization Software Running',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.virtualizationDrivers.length === 0) return null
      const drivers = data.osConfig.virtualizationDrivers.join(', ')
      return {
        ruleId: 'virtualization-active',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `Virtualization software (${drivers}) is running on your PC. These programs create extra work for your CPU and can cause irregular delays that make VR stutter. Disable or uninstall them when gaming in VR.`,
          advanced: `Active virtualization drivers: ${drivers}. Hypervisors (Hyper-V, VirtualBox, WSL2) intercept CPU instructions, increasing interrupt latency and nonpaged pool memory usage. Hyper-V specifically adds timer interrupt overhead (~1ms+) that conflicts with VR frame timing. Disable via: Turn Windows Features → uncheck Hyper-V / Virtual Machine Platform / WSL.`
        }
      }
    }
  },
  {
    id: 'game-mode-disabled',
    category: 'os-config',
    name: 'Windows Game Mode Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.gameModeEnabled) return null
      return {
        ruleId: 'game-mode-disabled',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'Windows Game Mode is turned off. When enabled, Windows gives your VR game higher priority and temporarily pauses Windows Update installs during gameplay. It\'s worth turning on.',
          advanced: `Windows Game Mode (HKCU\\Software\\Microsoft\\GameBar\\AutoGameModeEnabled = 0). Game Mode suspends Windows Update delivery optimization, reduces background task scheduling, and improves GPU scheduling for foreground games. Enable in Windows Settings → Gaming → Game Mode → On.`
        }
      }
    }
  },
  {
    id: 'windows-build-old',
    category: 'os-config',
    name: 'Outdated Windows Version',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      // Windows 11 starts at build 22000, Windows 10 21H2 = 19044
      if (data.osConfig.windowsBuild >= 19044) return null
      return {
        ruleId: 'windows-build-old',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: `Your Windows version (build ${data.osConfig.windowsBuild}) is out of date. Newer Windows versions include better VR scheduling improvements and HAGS support. Consider updating.`,
          advanced: `Windows build ${data.osConfig.windowsBuild} is below Windows 10 21H2 (19044). Key VR-relevant improvements in newer builds: improved MMCSS scheduling (20H2+), HAGS support (20H1+), DirectStorage (Win11 22H2+), improved GPU P-state management. Update via Windows Update.`
        }
      }
    }
  },
  {
    id: 'too-many-startup-items',
    category: 'os-config',
    name: 'Excessive Startup Programs',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      const count = data.osConfig.startupItems.filter((i) => i.enabled).length
      if (count < 15) return null
      return {
        ruleId: 'too-many-startup-items',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `You have ${count} programs starting automatically with Windows. Many of these run in the background and eat up RAM and CPU that VR needs. Disabling unnecessary startup programs (like media players and chat apps) frees up resources.`,
          advanced: `${count} enabled startup items detected. Startup programs compete for I/O, CPU, and RAM during and after boot. In Task Manager → Startup, disable items with High startup impact that aren't needed for VR. Common culprits: Teams, Discord, Spotify, OneDrive, printer software, RGB utilities.`
        }
      }
    }
  },
  {
    id: 'xbox-dvr-enabled',
    category: 'os-config',
    name: 'Xbox Game Bar / DVR Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.xboxDvrEnabled) return null
      return {
        ruleId: 'xbox-dvr-enabled',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'Xbox Game Bar is active. Its background recording hooks run in every application, including VR — adding CPU and GPU overhead even when you\'re not recording. Disabling it removes this hidden tax on your system.',
          advanced: 'Xbox Game Bar / Game DVR hooks into processes via GameBarPresenceWriter and the broadcast API. Registry keys affected: HKCU\\System\\GameConfigStore → GameDVR_Enabled = 0, and HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR → AppCaptureEnabled = 0. Note that Game Bar can still be re-enabled from Settings → Gaming → Xbox Game Bar after disabling via registry.'
        },
        fixId: 'fix-disable-xbox-dvr'
      }
    }
  },
  {
    id: 'usb-selective-suspend-active',
    category: 'os-config',
    name: 'USB Selective Suspend Active (USB VR Headset)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.usbSelectiveSuspendEnabled) return null
      const isUsbHeadset =
        data.headsetConnection?.method === 'usb-link' ||
        data.headsetConnection?.method === 'steamvr-usb'
      if (!isUsbHeadset) return null
      return {
        ruleId: 'usb-selective-suspend-active',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'USB selective suspend is active — Windows briefly powers down USB ports between data bursts. When a USB VR headset wakes the port, there\'s a brief pause that can cause tracking glitches or audio dropouts.',
          advanced: 'USB selective suspend transitions device ports through D2/D3 power states to save power. The wake recovery latency for D3 (suspend) can be 10-50ms, which is catastrophic for a VR headset that needs continuous 72-120Hz data flow. Disable via Power Options → Change plan settings → Change advanced power settings → USB settings → USB selective suspend setting → Disabled.'
        },
        fixId: 'fix-usb-selective-suspend'
      }
    }
  },
  {
    id: 'cpu-core-parking-active',
    category: 'os-config',
    name: 'CPU Core Parking Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      // Tightened threshold — on modern Windows, coresMinParkedPercent is
      // almost always below 100 but the scheduler never actually parks cores
      // under VR workloads. Only flag when fewer than half the cores are
      // guaranteed active, which is a genuinely aggressive power profile.
      if (data.osConfig.coresMinParkedPercent >= 50) return null
      return {
        ruleId: 'cpu-core-parking-active',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: `Your power profile only guarantees ${data.osConfig.coresMinParkedPercent}% of CPU cores stay awake. Switching to High Performance or Ultimate Performance keeps them all ready at all times.`,
          advanced: `CPMINCORES=${data.osConfig.coresMinParkedPercent}%. On modern Windows schedulers, cores rarely actually get parked under VR workloads even at low CPMINCORES — this is informational rather than a guaranteed stutter source. Setting it to 100 (or using High Performance plan) removes any theoretical wake-up latency. Not worth applying as an auto-fix.`
        }
        // NOTE: no fixId — auto-disable was unreliable and produced no measurable change.
      }
    }
  },
  {
    id: 'nagle-algorithm-active',
    category: 'os-config',
    name: 'TCP Nagle Algorithm Active (Wireless VR)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.nagleEnabled) return null
      const isWireless =
        data.headsetConnection?.method === 'virtual-desktop' ||
        data.headsetConnection?.method === 'airlink' ||
        data.headsetConnection?.method === 'alvr' ||
        data.headsetConnection?.method === 'unknown-wireless'
      if (!isWireless) return null
      return {
        ruleId: 'nagle-algorithm-active',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'The TCP Nagle algorithm is active — it bundles small packets together to reduce network overhead, but this adds latency. For wireless VR streaming (where every millisecond counts), disabling it gives lower, more consistent packet delivery times.',
          advanced: 'RFC 896 Nagle algorithm coalesces small TCP segments to reduce the number of packets, introducing up to 200ms of artificial delay waiting for a full segment. For wireless VR streaming, this means control/pose packets are delayed unnecessarily. Disable by setting TcpAckFrequency = 1 and TCPNoDelay = 1 in HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{adapter-guid}. Typical improvement: 1-5ms reduction in consistent latency.'
        },
        fixId: 'fix-nagle-disable'
      }
    }
  },
  {
    id: 'hyper-v-overhead',
    category: 'os-config',
    name: 'Hyper-V Overhead Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.hyperVRunning) return null
      return {
        ruleId: 'hyper-v-overhead',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'Hyper-V is active on your system. Even with no VMs running, Hyper-V makes Windows itself run as a virtual machine on a hypervisor. This adds interrupt latency and can disrupt VR compositor timing. Disabling it restores native Windows scheduling.',
          advanced: 'Hyper-V is a Type-1 hypervisor — when enabled, Windows itself runs as a guest VM (the "root partition"). This virtualizes the TSC (Time Stamp Counter), adds IOMMU overhead, and introduces ~1ms+ additional interrupt latency because hardware interrupts are now fielded by the hypervisor first before being forwarded to Windows. VR compositors rely on precise timer interrupts for frame scheduling; hypervisor overhead can cause compositor deadline misses. Requires reboot to disable: Turn Windows Features → uncheck Hyper-V, Virtual Machine Platform, and Windows Hypervisor Platform.'
        },
        fixId: 'fix-hyper-v-disable'
      }
    }
  },
  {
    id: 'timer-resolution-not-optimized',
    category: 'os-config',
    name: 'Global Timer Resolution Not Optimized (Win 11)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.globalTimerResolutionEnabled) return null
      if (data.osConfig.windowsBuild < 22621) return null // Win 11 22H2 = build 22621
      return {
        ruleId: 'timer-resolution-not-optimized',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'Windows uses a 15.6ms timer tick by default. VR compositors need sub-millisecond precision for frame scheduling — without it, frames can be delivered slightly late causing micro-judder. This registry flag lets VR runtimes request the more precise 0.5ms tick.',
          advanced: 'On Windows 11, Microsoft changed timer resolution behavior so that timeBeginPeriod(1) calls from applications no longer affect the global system timer — only that process\'s timer is affected. Setting GlobalTimerResolutionRequests = 1 in HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel restores the previous behavior where any app requesting high-resolution timers raises the global tick rate to ~0.5ms. SteamVR and Oculus runtime both call timeBeginPeriod(1) for frame scheduling — this flag ensures their requests apply system-wide.'
        },
        fixId: 'fix-windows-timer-resolution'
      }
    }
  },
  {
    id: 'steamvr-async-reprojection-disabled',
    category: 'os-config',
    name: 'SteamVR Async Reprojection Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      const val = data.osConfig.steamVrAsyncReprojectionEnabled
      if (val === null || val === true) return null // null = not installed, true = already on
      return {
        ruleId: 'steamvr-async-reprojection-disabled',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'SteamVR\'s Async Reprojection is not enabled. When your GPU misses a frame deadline, async reprojection synthesizes the missing frame in the background — keeping motion smooth instead of stuttering to half-rate.',
          advanced: 'Async Reprojection (also called ATW — Asynchronous TimeWarp) runs on a dedicated high-priority GPU context that synthetically warps the last completed frame to match head pose when the main render thread misses its deadline. Unlike synchronous reprojection (which waits for the next frame slot and halves your frame rate), async reprojection delivers a warped frame at the original rate. For lower-end hardware, Interleaved Reprojection can alternate between real and synthetic frames. Enable via steamvr.vrsettings: "steamvr": { "allowAsyncReprojection": true }'
        },
        fixId: 'fix-steamvr-async-reprojection'
      }
    }
  },
  {
    id: 'vrchat-avatar-culling-disabled',
    category: 'os-config',
    name: 'VRChat Avatar Culling Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.vrRuntime?.vrchatConfig) return null
      const cullingEnabled = data.vrRuntime.vrchatConfig.avatar_culling_enabled
      if (cullingEnabled === true) return null
      return {
        ruleId: 'vrchat-avatar-culling-disabled',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'VRChat is rendering all avatars regardless of distance. In busy worlds or events, avatars 50-100 meters away are still consuming GPU and CPU resources. Enabling avatar culling (25m cutoff) eliminates that invisible overhead.',
          advanced: 'Avatar culling stops rendering avatars beyond a configurable distance (avatar_culling_distance, default 25m). Each avatar in VRChat generates draw calls, skinning computations, and shader evaluations. In busy public worlds with 20+ players, uncullled far avatars can account for 15-30% of total GPU time. The config.json setting avatar_culling_enabled = true with avatar_culling_distance = 25 provides a good balance between social presence and performance. Located at %USERPROFILE%\\AppData\\LocalLow\\VRChat\\VRChat\\config.json'
        },
        fixId: 'fix-vrchat-avatar-culling'
      }
    }
  },
  {
    id: 'gpu-interrupt-priority-normal',
    category: 'os-config',
    name: 'GPU Interrupt Priority Not Optimized',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.gpuInterruptPrioritySet) return null
      if (data.osConfig.gpuPnpDeviceId === null) return null
      return {
        ruleId: 'gpu-interrupt-priority-normal',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'Your GPU\'s interrupt signals are being processed at normal Windows priority. Setting MSI (Message Signaled Interrupt) mode and High interrupt priority ensures that GPU frame-completion signals are handled immediately — reducing frame latency by 1-2ms.',
          advanced: `GPU PNP device ID: ${data.osConfig.gpuPnpDeviceId}. GPU interrupt processing priority (DevicePriority) is not set to 3 (High) in HKLM\\SYSTEM\\CurrentControlSet\\Enum\\{PNPDeviceID}\\Device Parameters\\Interrupt Management\\Affinity Policy. MSISupported should also be set to 1 in the MessageSignaledInterruptProperties subkey. These settings tell Windows to use Message Signaled Interrupts (level-triggered, lower latency than legacy line-based IRQs) and to process the GPU's interrupt at High device priority. Requires reboot.`
        },
        fixId: 'fix-gpu-interrupt-priority'
      }
    }
  },
  {
    id: 'wu-auto-reboot-risk',
    category: 'os-config',
    name: 'Windows Update Auto-Restart Active During VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.wuAutoRebootEnabled) return null
      return {
        ruleId: 'wu-auto-reboot-risk',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: 'Windows Update can force-restart your PC even while you\'re in a VR session. Setting NoAutoRebootWithLoggedOnUsers prevents automatic reboots while you\'re logged in — Windows will wait until next manual restart to apply updates.',
          advanced: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU\\NoAutoRebootWithLoggedOnUsers is absent or set to 0. This allows Windows Update to initiate automatic reboots when it considers a reboot "needed" after an update, even with active user sessions. Setting NoAutoRebootWithLoggedOnUsers = 1 suppresses the forced reboot. Setting AUOptions = 2 (notify before download) also prevents background downloads from consuming bandwidth during VR. These are group policy registry equivalents — no domain controller required.'
        },
        fixId: 'fix-disable-wu-reboot'
      }
    }
  },
  {
    id: 'win11-eco-qos-risk',
    category: 'os-config',
    name: 'Windows 11 Power Throttling May Affect VR Processes',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.win11EcoQosRisk) return null
      const plan = data.osConfig.powerPlan.toLowerCase()
      if (plan.includes('high') || plan.includes('ultimate')) return null
      return {
        ruleId: 'win11-eco-qos-risk',
        severity: 'warning',
        category: 'os-config',
        explanation: {
          simple: `Windows 11's EcoQoS system can silently move processes to efficiency cores to save power. On your current "${data.osConfig.powerPlan}" power plan, VR runtime processes (vrserver, vrcompositor) may be throttled without warning — switch to High Performance to prevent this.`,
          advanced: `Windows 11 22H2+ introduced stricter EcoQoS (Quality of Service) enforcement in non-High-Performance power plans. The OS uses "Efficient QoS" hints to throttle background processes via PROCESS_POWER_THROTTLING_EXECUTION_SPEED. While VR runtimes attempt to opt out, this interacts with the scheduler in ways that can degrade frame timing. High Performance power plan disables EcoQoS globally. Current plan: "${data.osConfig.powerPlan}".`
        },
        fixId: 'fix-power-plan'
      }
    }
  }
]
