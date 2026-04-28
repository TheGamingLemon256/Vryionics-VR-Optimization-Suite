// VR Optimization Suite — Network Diagnostic Rules (primarily for wireless VR)

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const networkRules: Rule[] = [
  {
    id: 'wifi-band-24ghz',
    category: 'network',
    name: 'Wi-Fi on 2.4GHz Band',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      if (data.network.wifi.band !== '2.4GHz') return null
      return {
        ruleId: 'wifi-band-24ghz',
        severity: 'critical',
        category: 'network',
        explanation: {
          simple: 'Your VR headset is streaming over the 2.4GHz Wi-Fi band, which is far too slow for smooth wireless VR. You\'ll see blurry, artifacted video and constant stutters. You need to switch to the 5GHz band on your router.',
          advanced: `Wi-Fi band: 2.4GHz (SSID: ${data.network.wifi.ssid ?? 'unknown'}). 2.4GHz maximum throughput (~150-300 Mbps with Wi-Fi 5) is insufficient for VR streaming at high quality (requires 150-900 Mbps depending on codec and quality). Additionally, 2.4GHz has only 3 non-overlapping channels (1, 6, 11) in North America, causing severe congestion in dense areas. Switch headset to a dedicated 5GHz or 6GHz SSID.`
        }
      }
    }
  },
  {
    id: 'wifi-signal-weak',
    category: 'network',
    name: 'Weak Wi-Fi Signal',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      const signal = data.network.wifi.signalStrength
      if (signal === null || signal >= 65) return null
      return {
        ruleId: 'wifi-signal-weak',
        severity: signal < 40 ? 'critical' : 'warning',
        category: 'network',
        explanation: {
          simple: `Your headset's Wi-Fi signal strength is only ${signal}%. A weak signal causes packet drops that appear as visual glitches and freezes in wireless VR. Move your router closer to your play space, or reduce obstacles between them.`,
          advanced: `Wi-Fi signal strength: ${signal}% (${data.network.wifi.ssid ?? 'unknown'}). Link speed: ${data.network.wifi.linkSpeed ?? 'N/A'} Mbps. ${signal < 40 ? 'Critical: packet loss likely.' : 'Warning: approaching marginal range.'} For stable VR streaming, target >70% signal strength (-65 dBm or better). Causes of weak signal: distance, walls, microwave interference, competing APs. Consider a Wi-Fi 6E access point in the play space.`
        }
      }
    }
  },
  {
    id: 'wifi-channel-congested',
    category: 'network',
    name: 'Wi-Fi Channel Congested',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      const nearby = data.network.wifi.nearbyNetworks
      if (!nearby || nearby.length === 0) return null
      const myChannel = data.network.wifi.channel
      if (!myChannel) return null
      const competing = nearby.filter((n) => Math.abs(n.channel - myChannel) <= 2).length
      if (competing < 3) return null
      return {
        ruleId: 'wifi-channel-congested',
        severity: 'warning',
        category: 'network',
        explanation: {
          simple: `${competing} other Wi-Fi networks are competing on the same channel as your headset. This is like trying to have a conversation in a room full of people talking — your headset and router have to take turns, adding delay. Switch your router to a less crowded channel.`,
          advanced: `${competing} overlapping networks detected on or near channel ${myChannel}. Channel overlap causes CSMA/CA collision avoidance, adding variable latency (1-30ms per collision). For 5GHz: use channels 36, 40, 44, 48 (non-DFS) or DFS channels 100-144 (less congested). 80MHz channel width recommended. Nearby networks: ${nearby.slice(0, 5).map((n) => `${n.ssid || 'hidden'} ch${n.channel}`).join(', ')}.`
        }
      }
    }
  },
  {
    id: 'wifi-link-speed-low',
    category: 'network',
    name: 'Wi-Fi Link Speed Too Low for VR',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      const linkSpeed = data.network.wifi.linkSpeed
      if (!linkSpeed || linkSpeed >= 866) return null
      return {
        ruleId: 'wifi-link-speed-low',
        severity: linkSpeed < 433 ? 'critical' : 'warning',
        category: 'network',
        explanation: {
          simple: `Your Wi-Fi connection speed is ${linkSpeed} Mbps — VR streaming needs at least 866 Mbps (Wi-Fi 5 on 5GHz). This limits the quality and smoothness of wireless VR. Upgrade to a Wi-Fi 6 or Wi-Fi 6E router.`,
          advanced: `Wi-Fi link speed: ${linkSpeed} Mbps (target: ≥866 Mbps for Wi-Fi 5 2×2 MIMO on 5GHz). At <866 Mbps, high-quality VR streaming codecs (HEVC 150+ Mbps, AV1) saturate the link, causing quality reduction or dropped frames. Causes: Wi-Fi 4 (802.11n) hardware, 2.4GHz band, 40MHz channel width, or signal degradation. Router: ${data.network.wifi.routerVendor ?? 'unknown vendor'}.`
        }
      }
    }
  },
  {
    id: 'wifi-power-saving-on',
    category: 'network',
    name: 'Wi-Fi Power Saving Enabled',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network?.wifi) return null
      if (data.network.wifi.powerSavingEnabled !== true) return null
      return {
        ruleId: 'wifi-power-saving-on',
        severity: 'warning',
        category: 'network',
        explanation: {
          simple: 'Your Wi-Fi adapter is in power-saving mode, which makes it "doze off" between packets to save battery. For wireless VR, this adds unpredictable delays. Disable it for a smoother experience.',
          advanced: `Wi-Fi adapter power saving mode is enabled. Power management causes the adapter to enter low-power states between packet bursts, adding 10-50ms wake-up latency. For wireless VR, every packet must be received without delay. Disable via Device Manager → Wi-Fi adapter → Properties → Power Management → uncheck "Allow the computer to turn off this device to save power". Also set Wi-Fi adapter to Maximum Performance in Power Plan advanced settings.`
        },
        fixId: 'fix-wifi-power-saving'
      }
    }
  },
  {
    id: 'network-gateway-latency',
    category: 'network',
    name: 'High Gateway Latency',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.network) return null
      const latency = data.network.latency.gateway
      if (!latency || latency <= 8) return null
      return {
        ruleId: 'network-gateway-latency',
        severity: latency > 20 ? 'critical' : 'warning',
        category: 'network',
        explanation: {
          simple: `Your connection to the Wi-Fi router has ${latency}ms of delay. For wireless VR, you want this under 5ms. High router latency means your head movements don't appear on screen fast enough, causing motion sickness.`,
          advanced: `Gateway ping latency: ${latency}ms (target: <5ms for wireless VR). Contributions to wireless VR total latency: encoding (~5-8ms) + Wi-Fi transmission (~${latency}ms) + decoding (~2ms) + display scan-out (~4ms). At ${latency}ms gateway latency alone, total motion-to-photon is likely >30ms (comfort threshold). Causes: Wi-Fi congestion, router CPU saturation, or QoS misconfiguration.`
        }
      }
    }
  },
  {
    id: 'wifi-6e-upgrade-opportunity',
    category: 'network',
    name: 'Wi-Fi 6E (6GHz) Upgrade Opportunity',
    appliesTo: { connectionArchetypes: ['wifi-wireless'] },
    evaluate: (data: ScanData): RuleResult | null => {
      if (data.network?.wifi?.band !== '5GHz') return null
      const method = data.headsetConnection?.method
      const isWireless =
        method === 'airlink' ||
        method === 'virtual-desktop' ||
        method === 'alvr' ||
        method === 'unknown-wireless'
      if (!isWireless) return null
      return {
        ruleId: 'wifi-6e-upgrade-opportunity',
        severity: 'info',
        category: 'network',
        explanation: {
          simple: "You're using 5GHz Wi-Fi for wireless VR. Wi-Fi 6E (6GHz) provides dedicated spectrum with zero neighboring networks, lower latency, and higher throughput — ideal for AirLink and Virtual Desktop.",
          advanced: "5GHz band is shared with thousands of devices. 6GHz (Wi-Fi 6E, IEEE 802.11ax on 6GHz) is currently uncongested spectrum with 1200MHz of bandwidth vs 500MHz on 5GHz. For VR streaming at 200Mbps+, 6GHz provides consistent throughput without channel interference. Requires a Wi-Fi 6E router (e.g. TP-Link Deco XE75, ASUS ROG Rapture GT6E) and 6E-capable headset (Quest 3, Quest Pro)."
        }
      }
    }
  },
  {
    id: 'wifi-6ghz-confirmed',
    category: 'network',
    name: 'Optimal Wi-Fi Band (6GHz)',
    evaluate: (data: ScanData): RuleResult | null => {
      if (data.network?.wifi?.band !== '6GHz') return null
      return {
        ruleId: 'wifi-6ghz-confirmed',
        severity: 'info',
        category: 'network',
        explanation: {
          simple: "You're connected on the 6GHz band (Wi-Fi 6E/7) — this is the optimal spectrum for wireless VR streaming with minimal interference.",
          advanced: "6GHz band (Wi-Fi 6E/7) confirmed. This band is currently the least congested Wi-Fi spectrum available, with up to 1200MHz of contiguous bandwidth and no legacy device interference. Ideal for sustained 200Mbps+ VR streaming with low jitter."
        }
      }
    }
  },

  // ── Wi-Fi chipset quality for wireless VR ─────────────────────
  // Only fires when the user's connection archetype is wifi-wireless.
  // Rates the active Wi-Fi adapter by its chipset and nudges Realtek /
  // Broadcom users toward Intel / Qualcomm for better sustained throughput.
  {
    id: 'wifi-chipset-poor-for-vr',
    category: 'network',
    name: 'Wi-Fi Adapter Chipset Suboptimal for VR Streaming',
    evaluate: (data: ScanData): RuleResult | null => {
      // Only relevant to wireless VR users
      if (data.connectionArchetype !== 'wifi-wireless') return null
      if (!data.network) return null

      const wifiAdapter = data.network.adapters.find(
        (a) => a.type === 'Wi-Fi' && a.connected
      )
      if (!wifiAdapter) return null
      if (!wifiAdapter.vrSuitability) return null
      // Only surface findings when there's an actionable concern
      if (wifiAdapter.vrSuitability === 'excellent' || wifiAdapter.vrSuitability === 'good') return null
      if (wifiAdapter.vrSuitability === 'unknown') return null

      const vendor = wifiAdapter.chipsetVendor ?? 'Unknown'
      const family = wifiAdapter.chipsetFamily ?? wifiAdapter.name
      const suitability = wifiAdapter.vrSuitability

      const severity: 'warning' | 'info' = suitability === 'poor' ? 'warning' : 'info'

      const simpleUpgradeMsg =
        suitability === 'poor'
          ? 'An Intel AX210 (~$25, Wi-Fi 6E) or Qualcomm FastConnect module is widely recommended for stable wireless VR. If you\'re on a desktop, it\'s a simple M.2 swap; on a laptop a USB Wi-Fi 6E dongle works almost as well.'
          : 'An Intel AX210 or newer BE200 (Wi-Fi 7) would give noticeably cleaner sustained bitrate. A USB 3.0 Wi-Fi 6E dongle is the easiest path on a laptop.'

      const simple =
        `Your Wi-Fi adapter uses a ${vendor} ${family} chipset — which has ${suitability === 'poor' ? 'known issues' : 'mixed community reports'} with sustained high-bitrate wireless VR streaming (the 150-200 Mbps UDP streams that Virtual Desktop, Air Link, and ALVR rely on). ` +
        `You may see micro-stutters, compression artifacts, or occasional disconnects, even when your signal strength is strong. ` +
        simpleUpgradeMsg

      const advanced =
        `Detected Wi-Fi adapter:\n` +
        `  Name:       ${wifiAdapter.name}\n` +
        `  Chipset:    ${vendor} — ${family}\n` +
        `  VR rating:  ${suitability}\n\n` +
        `Why the chipset matters for VR:\n` +
        `  Wireless VR streams encoded video as sustained UDP traffic at 100-200+ Mbps with strict jitter\n` +
        `  budgets (<5ms). Realtek and older Broadcom drivers have documented issues queuing packets under\n` +
        `  this profile — they'll pass generic Wi-Fi speed tests but stutter under sustained VR load.\n\n` +
        `  Intel AX200/AX210/BE200 and Qualcomm FastConnect chipsets are widely reported as "just works"\n` +
        `  with Virtual Desktop / Air Link / ALVR at high bitrates. The difference shows up in the 99th\n` +
        `  percentile frame time, not average throughput.\n\n` +
        `Upgrade paths:\n` +
        `  Desktop (M.2 slot):   Intel AX210 (~$25), Intel BE200 (~$40, Wi-Fi 7)\n` +
        `  Desktop (USB):        TP-Link AXE5400 USB (~$50), ASUS USB-AX56\n` +
        `  Laptop (non-upgradeable): USB dongle as above\n` +
        `  Laptop (upgradeable M.2): replace with Intel AX210/BE200 (~20 min job)\n\n` +
        `If an upgrade isn't feasible, mitigations that help somewhat on problematic chipsets:\n` +
        `  • Disable Wi-Fi power saving (VR Optimization Suite has a fix for this)\n` +
        `  • Force 5GHz-only SSID (avoid the 2.4GHz fallback)\n` +
        `  • Keep router within line-of-sight, <4m from play space\n` +
        `  • Disable Windows "Allow the computer to turn off this device" on the adapter`

      return {
        ruleId: 'wifi-chipset-poor-for-vr',
        severity,
        category: 'network',
        explanation: { simple, advanced },
      }
    },
  },
]
