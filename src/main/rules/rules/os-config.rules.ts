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
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: `Your active power plan is "${data.osConfig.powerPlan}". Settings, System, Power has the option to change this if you want to. The Ultimate Performance plan typically gives the best VR frame consistency.`,
          advanced: `Active power plan: "${data.osConfig.powerPlan}". On a non-performance plan, CPU P-state transitions can add 1 to 10 ms of latency under sudden load, which shows up as occasional frame-time spikes in VR. The Ultimate Performance plan disables most of this gating. Tradeoff: sustained higher idle power draw and warmer components. To switch: Settings, System, Power, or powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (High Performance) or e9a42b02-d5df-448d-aa00-03f14749eb61 (Ultimate Performance).`
        }
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
          simple: 'The TCP Nagle algorithm is active — Windows is bundling small packets together before sending them, which trades a millisecond or two of latency for slightly less network overhead. For wireless VR you would rather keep that latency. Disabling Nagle is a per-adapter HKLM tweak, so it requires admin and we no longer ship it as a one-click fix.',
          advanced: 'RFC 896 Nagle algorithm coalesces small TCP segments. For wireless VR streaming (Virtual Desktop, AirLink, ALVR), control and pose packets pay this batching cost unnecessarily. The standard mitigation is TcpAckFrequency = 1 and TCPNoDelay = 1 under HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{adapter-guid}, applied to each interface. Typical improvement is 1-5ms of consistent latency. VOS only flags the condition; making the change requires an elevated registry edit, which is outside the safe-by-default scope.'
        }
      }
    }
  },
  {
    id: 'hyper-v-overhead',
    category: 'os-config',
    name: 'Hyper-V or Memory Integrity Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      const hyperV = data.osConfig.hyperVRunning
      const memIntegrity = data.compat?.hvciEnabled === true
      if (!hyperV && !memIntegrity) return null
      return {
        ruleId: 'hyper-v-overhead',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'Hyper-V or Memory Integrity is enabled. This costs roughly 5 to 10 percent CPU performance in CPU-bound VR titles. Disabling it improves VR performance but reduces protection against kernel-mode exploits. VOS does not change this for you.',
          advanced: `Hyper-V running: ${hyperV ? 'yes' : 'no'}. Memory Integrity (HVCI): ${memIntegrity ? 'on' : 'off or unknown'}. When the hypervisor launch type is Auto, Windows itself runs as a guest under a thin Type-1 hypervisor (the "root partition"), which virtualizes the TSC and routes hardware interrupts through the hypervisor first. HVCI adds VBS-backed code integrity checks on every kernel-mode driver load. Both features harden the kernel against rootkits and signed-driver attacks. The cost in CPU-bound VR is typically 5 to 10 percent in titles like VRChat and Pavlov; less in GPU-bound titles. To turn off: Windows Features, uncheck Hyper-V / Virtual Machine Platform / Windows Hypervisor Platform; and Windows Security, Device security, Core isolation, Memory integrity, Off. Reboot required.`
        }
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
    name: 'GPU Not Using MSI Interrupt Mode',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.gpuInterruptPrioritySet) return null
      if (data.osConfig.gpuPnpDeviceId === null) return null
      return {
        ruleId: 'gpu-interrupt-priority-normal',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'Your GPU is handling interrupts in legacy line-based mode at normal priority. Switching to MSI mode and raising the interrupt priority can shave 1 to 2 ms off frame-completion latency, but it is a manual registry change with a small risk of driver instability if the GPU does not implement MSI cleanly. VOS does not change this for you.',
          advanced: `GPU PNP device ID: ${data.osConfig.gpuPnpDeviceId}. DevicePriority is not 3 (High) at HKLM\\SYSTEM\\CurrentControlSet\\Enum\\{PNPDeviceID}\\Device Parameters\\Interrupt Management\\Affinity Policy, and MSISupported is not 1 under the MessageSignaledInterruptProperties subkey. Setting both moves the GPU from legacy line-based IRQs to Message Signaled Interrupts and bumps the kernel's interrupt-processing priority for that device. The downside: a small minority of older GPUs and some virtualization passthrough scenarios behave badly with MSI on, and a bad write here is annoying to diagnose. Reboot required to take effect; reboot again if the result is glitchy and you want to revert.`
        }
      }
    }
  },
  {
    id: 'wu-auto-reboot-risk',
    category: 'os-config',
    name: 'Windows Update May Reboot During VR Sessions',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (!data.osConfig.wuAutoRebootEnabled) return null
      return {
        ruleId: 'wu-auto-reboot-risk',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'Windows Update is allowed to restart your PC automatically after applying updates, including while a VR session is active. You can defer that reboot through Windows settings or group policy. Deferral keeps your session uninterrupted but also delays security patches actually taking effect. VOS does not change this for you.',
          advanced: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU\\NoAutoRebootWithLoggedOnUsers is absent or 0. With that policy set to 1, Windows Update still downloads and stages updates but waits for a manual restart instead of forcing one while you are logged in. Active hours and the Pause updates option in Settings, Windows Update, do similar work for shorter windows. Whichever route you pick, the patch is not applied until the reboot actually happens, so this is a tradeoff between session continuity and time-to-patched.'
        }
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
        }
      }
    }
  },
  {
    id: 'pcie-aspm-active',
    category: 'os-config',
    name: 'PCIe ASPM Power Savings Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.osConfig) return null
      if (data.osConfig.pcieAspmActive !== true) return null
      return {
        ruleId: 'pcie-aspm-active',
        severity: 'info',
        category: 'os-config',
        explanation: {
          simple: 'PCIe Active State Power Management is on. When the GPU or NVMe sits idle for a moment between frames, the PCIe link drops to a low-power state and has to wake back up the next time it is used. The wake delay is small but irregular, which can show up as occasional frame pacing hitches. Turning it Off in advanced power settings trades a small amount of idle power draw for steadier link latency. VOS does not change this for you.',
          advanced: 'Powercfg ASPM setting (PCIE_LINK_STATE subgroup 501a4d13-42af-4429-9fd1-a8218c268e20, value ee12f906-d277-404b-b6da-e5fa1a576df5) is currently 1 (Moderate) or 2 (Maximum). In those states the link transitions through L0s/L1 between bursts of traffic; coming back from L1 takes microseconds to single-digit milliseconds depending on chipset and device. On a steady VR workload the worst-case wakes are rare, but they can land on a frame and miss the compositor deadline. To turn off: powercfg, Change plan settings, Change advanced power settings, PCI Express, Link State Power Management, Off. Or: powercfg /setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0 (and the matching /setdcvalueindex on laptops).'
        }
      }
    }
  }
]
