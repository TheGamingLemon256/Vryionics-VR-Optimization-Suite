import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const gpuRules: Rule[] = [
  {
    id: 'gpu-utilization-maxed',
    category: 'gpu',
    name: 'GPU Fully Saturated',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.utilization < 95) return null
      return {
        ruleId: 'gpu-utilization-maxed',
        severity: 'critical',
        category: 'gpu',
        explanation: {
          simple: 'Your graphics card is working at maximum capacity. In VR, this means you\'ll see visual artifacts, reprojection, or frame drops. Reducing the game\'s visual quality settings or lowering the VR render resolution is the most immediate fix.',
          advanced: `GPU utilization: ${primary.utilization.toFixed(1)}% (${primary.name}). At sustained >95% GPU utilization, the VR compositor misses its frame deadline and falls back to reprojection/ASW. Lower SteamVR render resolution to ~80% or reduce in-game quality settings. VRAM: ${primary.vramUsed}/${primary.vramTotal}MB.`
        }
      }
    }
  },
  {
    id: 'gpu-vram-critical',
    category: 'gpu',
    name: 'VRAM Nearly Full',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.vramTotal === 0) return null
      const usagePercent = (primary.vramUsed / primary.vramTotal) * 100
      if (usagePercent < 88) return null
      return {
        ruleId: 'gpu-vram-critical',
        severity: 'critical',
        category: 'gpu',
        explanation: {
          simple: 'GPU is out of VRAM. It spills to system RAM over PCIe, which is much slower — that\'s where the stutter comes from. Drop texture quality or lower VR render resolution.',
          advanced: `VRAM usage: ${primary.vramUsed}/${primary.vramTotal}MB (${usagePercent.toFixed(1)}%). VRAM saturation causes GPU paging to system RAM via PCIe (10-50× slower). In VR, this manifests as severe frame time spikes. Reduce texture quality, disable MSAA in favor of TAA, or lower SteamVR resolution to reduce render target VRAM footprint.`
        }
      }
    }
  },
  {
    id: 'gpu-temperature-high',
    category: 'gpu',
    name: 'GPU Running Hot',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.temperature === 0) return null
      if (primary.temperature < 85) return null
      const isCritical = primary.temperature >= 93
      return {
        ruleId: 'gpu-temperature-high',
        severity: isCritical ? 'critical' : 'warning',
        category: 'gpu',
        explanation: {
          simple: `Your graphics card is running at ${primary.temperature}°C, which is ${isCritical ? 'dangerously' : 'quite'} hot. When GPUs overheat, they slow themselves down to cool off — causing frame drops in VR. Improve your PC's airflow or clean the GPU heatsink.`,
          advanced: `GPU temperature: ${primary.temperature}°C (${primary.name}). ${isCritical ? 'Critical: GPU is likely thermal throttling.' : 'Warning: approaching thermal limit.'} Most modern GPUs begin thermal throttling at 83-90°C. Check GPU fans are spinning, case airflow is adequate (positive pressure), and thermal paste is not dried out. Power draw: ${primary.powerDraw.toFixed(0)}W / ${primary.powerLimit.toFixed(0)}W.`
        }
      }
    }
  },
  {
    id: 'gpu-power-throttled',
    category: 'gpu',
    name: 'GPU Power Limited',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      // Temperature and power data unavailable for AMD/Intel — these rules silently skip via the === 0 guards.
      if (!primary || primary.powerLimit === 0) return null
      const powerPercent = (primary.powerDraw / primary.powerLimit) * 100
      if (powerPercent < 97) return null
      return {
        ruleId: 'gpu-power-throttled',
        severity: 'warning',
        category: 'gpu',
        explanation: {
          simple: 'Your graphics card is trying to draw more power than its limit allows, which forces it to slow down. This can cause stutters in demanding VR games. Consider raising the power limit in MSI Afterburner if your PSU can handle it.',
          advanced: `GPU power draw: ${primary.powerDraw.toFixed(1)}W / ${primary.powerLimit.toFixed(1)}W (${powerPercent.toFixed(1)}%). At 97%+ of power limit, NVIDIA's boost algorithm reduces clocks to stay within TDP. Use MSI Afterburner to increase power limit by 10-15% if your PSU has headroom. Alternatively, a mild undervolt maintains performance at lower power draw.`
        }
      }
    }
  },
  {
    id: 'gpu-encoder-saturated',
    category: 'gpu',
    name: 'GPU Encoder Saturated',
    appliesTo: { connectionArchetypes: ['wifi-wireless', 'usb-encoded'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.encoderUtilization < 90) return null
      const encoderName =
        primary.vendor === 'nvidia' ? 'NVENC (NVIDIA)' :
        primary.vendor === 'amd'    ? 'AMF (AMD)' :
        primary.vendor === 'intel' && !primary.isIntegrated ? 'Intel Arc AV1 encoder (QSV)' :
        'Quick Sync (Intel)'
      return {
        ruleId: 'gpu-encoder-saturated',
        severity: 'warning',
        category: 'gpu',
        explanation: {
          simple: 'Your graphics card\'s video encoder (the part that compresses and sends video to your headset) is maxed out. This causes visual compression artifacts in wireless VR. Lowering the streaming bitrate slightly or reducing resolution will help.',
          advanced: `GPU hardware encoder utilization: ${primary.encoderUtilization.toFixed(1)}% (${primary.name}). The ${encoderName} encoder running at >90% capacity causes encode latency spikes, increasing motion-to-photon latency and introducing compression artifacts. Reduce Virtual Desktop/Air Link bitrate by 20-30% or lower render resolution to reduce encode demand. Hardware encoders by vendor: NVENC (NVIDIA) / AMF (AMD) / Quick Sync (Intel).`
        }
      }
    }
  },
  {
    id: 'gpu-pcie-downgraded',
    category: 'gpu',
    name: 'PCIe Bandwidth Degraded',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.pcieGen === 0) return null
      if (primary.pcieGen >= 3 && primary.pcieLinkWidth >= 8) return null
      const issue =
        primary.pcieGen < 3
          ? `PCIe Gen ${primary.pcieGen}`
          : `x${primary.pcieLinkWidth} lanes (should be x16)`
      return {
        ruleId: 'gpu-pcie-downgraded',
        severity: 'warning',
        category: 'gpu',
        explanation: {
          simple: `Your graphics card is connected at reduced speed (${issue}). This means your CPU and GPU can\'t exchange data as fast as they should. Make sure your GPU is in the main PCIe slot on your motherboard.`,
          advanced: `PCIe link: Gen ${primary.pcieGen} x${primary.pcieLinkWidth} (should be Gen 3 x16 minimum). Possible causes: GPU installed in secondary slot (x4/x8), PCIe slot damage, or BIOS setting. Current bandwidth: ~${(primary.pcieGen * primary.pcieLinkWidth * 985).toFixed(0)} MB/s vs optimal ~${(4 * 16 * 985).toFixed(0)} MB/s. For texture streaming in VR, PCIe bandwidth impacts frame delivery.`
        }
      }
    }
  },
  {
    id: 'gpu-hags-disabled',
    category: 'gpu',
    name: 'Hardware Accelerated GPU Scheduling Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary) return null
      if (primary.hagsEnabled) return null
      // HAGS is supported on any GPU with a WDDM 2.7+ driver (Windows 10 v2004+).
      // This covers NVIDIA GTX 10xx (Pascal 2016+), AMD RX 400 (Polaris 2016+),
      // Intel Arc / Iris Xe (2020+), and many integrated GPUs.
      // Setting HwSchMode = 2 is safe on unsupported hardware — Windows ignores it.
      // Only skip if we detected an extremely old GPU pre-DirectX 12 era.
      const isVeryOld =
        primary.vendor === 'unknown' ||
        /GT [1-7][0-9]{2}\b|GTX [2-6][0-9]{2}\b|GTS|HD [2-5][0-9]{3}\b|HD Graphics [1-4][0-9]{3}\b/i.test(primary.name)
      if (isVeryOld) return null
      return {
        ruleId: 'gpu-hags-disabled',
        severity: 'info',
        category: 'gpu',
        explanation: {
          simple: `Hardware Accelerated GPU Scheduling (HAGS) is off on your ${primary.name}. Turning it on can reduce VR frame-time variance by roughly half a millisecond to two milliseconds, but a few NVIDIA driver branches have shipped HAGS-related compositor bugs (most notoriously the 545.x and 566.x series on Ampere). The toggle lives in Windows Settings, System, Display, Graphics. VOS does not change this for you.`,
          advanced: `HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\HwSchMode is 1 (off); 2 means on. Requires WDDM 2.7+ (Windows 10 v2004 or newer) and a driver that advertises HAGS support: NVIDIA GTX 10xx and later, AMD RX 400 and later, Intel Arc and Iris Xe. When supported, HAGS hands GPU memory scheduling from the kernel-mode driver to firmware on the GPU itself, which trims a small amount of CPU overhead and frame-time jitter. The reason to leave it as a manual choice rather than auto-applied: the same setting has been responsible for documented VR compositor crashes and flicker on specific NVIDIA driver versions, and the right answer is sometimes "wait for the next driver" rather than "flip the bit." Reboot required either way.`
        }
      }
    }
  },
  {
    id: 'gpu-rebar-disabled',
    category: 'gpu',
    name: 'Resizable BAR Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      // ReBAR rule is NVIDIA-only. AMD uses Smart Access Memory (SAM) — see gpu-sam-disabled rule.
      if (!primary || primary.vendor !== 'nvidia') return null
      if (primary.rebarEnabled) return null
      return {
        ruleId: 'gpu-rebar-disabled',
        severity: 'info',
        category: 'gpu',
        explanation: {
          simple: 'Resizable BAR lets your CPU access all of your GPU\'s video memory at once, which can improve performance in some VR titles. It\'s free to enable in your motherboard BIOS. Note: AMD GPUs have an equivalent feature called Smart Access Memory (SAM) — see the SAM recommendation if you have an AMD GPU.',
          advanced: `Resizable BAR is disabled for ${primary.name}. ReBAR allows CPU access to full GPU VRAM instead of 256MB windows, improving texture streaming by 5-15% in bandwidth-limited scenarios. Enable in motherboard BIOS: Advanced → PCIe → Resizable BAR → Enable (requires Above 4G Decoding enabled first). Also enable via NVIDIA Control Panel after reboot. AMD equivalent: Smart Access Memory (SAM) — see the gpu-sam-disabled rule for AMD RX 6000/7000 GPUs.`
        }
      }
    }
  },
  {
    id: 'gpu-sam-disabled',
    category: 'gpu',
    name: 'AMD Smart Access Memory Disabled',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary) return null
      // Only AMD discrete GPUs
      if (primary.vendor !== 'amd') return null
      if (primary.isIntegrated) return null
      if (primary.samEnabled) return null
      // Only RDNA2 or newer (RX 6000 series+)
      if (primary.gpuGeneration !== 'RDNA2' && primary.gpuGeneration !== 'RDNA3') return null
      return {
        ruleId: 'gpu-sam-disabled',
        severity: 'info',
        category: 'gpu',
        explanation: {
          simple: 'Your AMD RX 6000/7000 GPU supports Smart Access Memory (SAM), which lets your CPU access all GPU VRAM at once — but it appears to be disabled. Enabling it in your BIOS can give a 5–15% performance boost in GPU-limited VR.',
          advanced: `Smart Access Memory is disabled for ${primary.name}. SAM (AMD's name for Resizable BAR) allows the CPU to access the full GPU VRAM instead of being limited to 256MB windows, improving texture streaming by 5–15% in GPU-limited scenarios. SAM is equivalent to NVIDIA's ReBAR — both use the PCIe Resizable BAR standard. To enable: enter BIOS → enable "Above 4G Decoding" first (required) → enable "Resizable BAR", "Smart Access Memory", or "SAM". After booting Windows, open AMD Radeon Software → Performance → Tuning → confirm AMD Smart Access Memory shows as Enabled. If still disabled after BIOS changes, ensure your CPU supports SAM (Ryzen 4000+ or Intel 11th gen+).`
        }
      }
    }
  },
  {
    id: 'gpu-integrated-vr-warning',
    category: 'gpu',
    name: 'Integrated GPU Used for VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary) return null
      if (!primary.isIntegrated) return null
      // Critical if VRAM (shared system RAM allocation) is under 2GB
      const isCritical = primary.vramTotal > 0 && primary.vramTotal < 2048
      return {
        ruleId: 'gpu-integrated-vr-warning',
        severity: isCritical ? 'critical' : 'warning',
        category: 'gpu',
        explanation: {
          simple: `You're using an integrated GPU (${primary.name}) for VR. Integrated GPUs share system RAM instead of having dedicated video memory, which severely limits bandwidth for VR rendering. Some integrated GPUs can handle light VR: Intel Iris Xe and Intel Arc can run light PCVR at low settings; AMD Ryzen APUs with RDNA2 (Vega 8+) can do light PCVR. For anything beyond basic VR, a dedicated GPU is strongly recommended.`,
          advanced: `Primary GPU: ${primary.name} (integrated, shares system RAM). VRAM allocation: ${primary.vramTotal > 0 ? primary.vramTotal + 'MB' : 'unknown — from shared system RAM'}. Integrated GPUs have dramatically lower memory bandwidth than discrete GPUs (typically 30-80 GB/s vs 300-900 GB/s for discrete). This bottleneck directly impacts VR rendering, texture streaming, and reprojection. Generation context: Intel Iris Xe/Arc Alchemist can handle light SteamVR at 720p-1080p equivalent; AMD Ryzen RDNA2 APUs (e.g. Ryzen 6000+) can handle light PCVR; older Intel HD/UHD or AMD Vega ≤8 struggle significantly. A dedicated GPU (NVIDIA RTX 3060 or AMD RX 6600 or better) provides 10× better VR performance.`
        }
      }
    }
  },
  {
    id: 'gpu-driver-old',
    category: 'gpu',
    name: 'GPU Driver Outdated',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary || primary.driverDate === null) return null
      const daysOld = Math.floor((Date.now() - new Date(primary.driverDate).getTime()) / (1000 * 60 * 60 * 24))
      if (daysOld < 180) return null
      const monthsOld = Math.floor(daysOld / 30)
      const updateInstructions =
        primary.vendor === 'nvidia'
          ? 'NVIDIA: open GeForce Experience → Drivers tab, or visit nvidia.com/drivers and select your GPU + "Game Ready Driver".'
          : primary.vendor === 'amd'
          ? 'AMD: open Radeon Software → Updates tab, or visit amd.com/support and search for your GPU.'
          : primary.vendor === 'intel' && !primary.isIntegrated
          ? 'Intel Arc: open Intel Arc Control app → Software Updates, or visit intel.com/arc for the latest Arc driver.'
          : 'Intel: use the Intel Driver & Support Assistant (dsaoverride.intel.com), or check Windows Update for driver updates.'
      return {
        ruleId: 'gpu-driver-old',
        severity: 'info',
        category: 'gpu',
        explanation: {
          simple: `Your GPU driver is ${monthsOld} months old. New driver versions often include VR-specific optimizations, reprojection improvements, and bug fixes. Check for updates to ensure the best VR experience.`,
          advanced: `GPU driver date: ${primary.driverDate} (${primary.name}) — ${daysOld} days old. Driver updates frequently include: VR compositor optimizations, NVENC/AMF/QSV encoder improvements, OpenXR/OpenVR bug fixes, and game-specific performance patches. ${updateInstructions}`
        }
      }
    }
  },
  {
    id: 'gpu-thermal-throttling',
    category: 'gpu',
    evaluate: (data) => {
      if (!data.gpu) return null
      const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!gpu || !gpu.isThermalThrottled) return null
      return {
        ruleId: 'gpu-thermal-throttling',
        severity: 'high',
        category: 'gpu',
        title: `GPU Thermally Throttling — Clock Reduced to ${gpu.clockMhz} MHz`,
        explanation: {
          simple: `Your GPU is hot enough that it's reducing clock speed to protect itself (${gpu.temperature}°C, ${gpu.clockMhz} MHz vs ${gpu.boostClock}+ MHz boost). This is a direct cause of VR frame drops and reprojection.`,
          advanced: `GPU thermal throttle occurs when junction temperature exceeds the TjMax throttle point (~83-95°C depending on GPU). The driver reduces shader frequency (current: ${gpu.clockMhz} MHz, normal boost: ~${gpu.boostClock} MHz) to reduce power consumption and heat. In VR, any clock reduction causes frame time budget overruns that trigger reprojection. Fix by: improving case airflow, replacing thermal paste, adjusting fan curve, or undervolting the GPU.`
        },
        fixId: null
      }
    }
  },
  {
    id: 'gpu-clock-data-available',
    category: 'gpu',
    evaluate: (data) => {
      // Positive finding: clock data is available and normal
      if (!data.gpu) return null
      const gpu = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!gpu || gpu.clockMhz === 0) return null
      if (gpu.isThermalThrottled) return null // Already flagged
      if (gpu.temperature <= 75) return null // Only show if temps are somewhat elevated
      // Elevated but not throttling — just informational
      if (gpu.temperature < 83) return null
      return {
        ruleId: 'gpu-high-temp-not-throttling',
        severity: 'info',
        category: 'gpu',
        title: `GPU at ${gpu.temperature}°C — Approaching Throttle Threshold`,
        explanation: {
          simple: `GPU is at ${gpu.temperature}°C — not yet throttling (${gpu.clockMhz} MHz clock), but within 10°C of thermal throttle onset. Improve airflow to maintain headroom under sustained VR load.`,
          advanced: `Current GPU clock: ${gpu.clockMhz} MHz at ${gpu.temperature}°C. Most modern GPUs begin clock reduction above 83-88°C. Sustained VR sessions can push GPU temperatures 5-8°C higher than idle — ${gpu.temperature}°C idle means you may throttle under load.`
        },
        fixId: null
      }
    }
  },
  {
    id: 'gpu-arc-wireless-av1',
    category: 'gpu',
    name: 'Intel Arc AV1 Encoding Not Used for Wireless VR',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.gpu) return null
      const primary = data.gpu.devices[data.gpu.primaryGpuIndex]
      if (!primary) return null
      // Intel Arc discrete only (not UHD/Iris Xe integrated)
      if (primary.vendor !== 'intel') return null
      if (primary.isIntegrated) return null
      // Must be an Arc generation GPU
      const gen = primary.gpuGeneration ?? ''
      if (!gen.toLowerCase().includes('arc')) return null
      // Only fire when there is an active wireless VR connection
      const method = data.headsetConnection?.method
      const isWireless =
        method === 'airlink' ||
        method === 'virtual-desktop' ||
        method === 'alvr' ||
        method === 'unknown-wireless'
      if (!isWireless) return null
      return {
        ruleId: 'gpu-arc-wireless-av1',
        severity: 'info',
        category: 'gpu',
        explanation: {
          simple: 'Your Intel Arc GPU has hardware AV1 encoding — the most efficient codec for wireless VR streaming. If using Virtual Desktop, select \'AV1\' codec in its settings for noticeably sharper image at the same bitrate.',
          advanced: `${primary.name} has a dedicated AV1 hardware encoder (Intel XeSS/QSV AV1). AV1 provides ~30% better compression efficiency than H.264 and ~15% better than HEVC/H.265 at equal quality — meaning sharper visuals at the same wireless bitrate, or equal quality at lower bitrate (reducing compression artifacts). In Virtual Desktop: Settings → Video → Codec → AV1. Set bitrate to 150+ Mbps for best results. Note: Meta Air Link does not support AV1 as of 2025 — switch to Virtual Desktop to take advantage of Arc's AV1 encoder. Verify in Virtual Desktop stats overlay that the codec shows AV1.`
        }
      }
    }
  }
]
