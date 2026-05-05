import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const displayRules: Rule[] = [
  {
    id: 'display-low-refresh-rate',
    category: 'display',
    name: 'Primary Monitor Below 90Hz',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.display) return null
      const hz = data.display.primaryRefreshRateHz
      if (hz === 0 || hz >= 90) return null
      return {
        ruleId: 'display-low-refresh-rate',
        severity: hz < 75 ? 'warning' : 'info',
        category: 'display',
        explanation: {
          simple: `Your primary monitor is running at ${hz}Hz. The SteamVR compositor mirrors to your desktop at the headset's frame rate — a display below 90Hz can cause the mirror view to stutter and may affect some VR runtime behaviors.`,
          advanced: `Primary monitor refresh rate: ${hz}Hz. SteamVR's mirror window and desktop compositor run at your monitor's rate. For 90Hz VR, a 60Hz monitor creates 3:2 pulldown in the preview window. More critically, some VR runtimes (particularly WMR) tie certain compositor operations to the desktop refresh rate. Recommend 120Hz+ for best experience.`
        }
      }
    }
  },
  {
    id: 'display-hdr-overhead',
    category: 'display',
    name: 'HDR Enabled — Compositor Overhead',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.display?.anyHdrEnabled) return null
      return {
        ruleId: 'display-hdr-overhead',
        severity: 'info',
        category: 'display',
        explanation: {
          simple: 'HDR is enabled on one or more monitors. Windows HDR forces the desktop compositor into a special mode that adds a tone-mapping pass, which can increase GPU compositor overhead and occasionally causes color-space issues in VR previews.',
          advanced: 'Windows HDR (AutoHDR or manual HDR) changes the DXGI swapchain to use FP16 HDR10 format. The DWM compositor renders all SDR content with an additional tone-map step. This adds ~1-3ms GPU time per frame on the desktop compositor and can interact with VR runtime exclusive compositing. Disabling HDR during VR gaming is recommended unless using an HDR-native VR headset.'
        }
      }
    }
  },
  {
    id: 'display-no-adaptive-sync',
    category: 'display',
    name: 'G-Sync / FreeSync Not Detected',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.display) return null
      if (data.display.anyAdaptiveSyncEnabled !== false) return null // null = unknown, don't fire
      return {
        ruleId: 'display-no-adaptive-sync',
        severity: 'info',
        category: 'display',
        explanation: {
          simple: 'Adaptive sync (G-Sync or FreeSync) is not enabled. For the desktop mirror view during VR, adaptive sync eliminates tearing without the fixed latency of V-Sync.',
          advanced: 'G-Sync/FreeSync allows the monitor to match its refresh rate to GPU output frames, eliminating screen tearing in the desktop mirror while adding zero fixed latency (unlike V-Sync which adds up to 1 frame). This does not directly affect the VR headset compositor but improves the spectator/monitor experience. Enable via NVIDIA Control Panel → G-Sync or AMD Software → Display → FreeSync.'
        }
      }
    }
  }
]
