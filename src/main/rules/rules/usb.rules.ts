// VR Optimization Suite — USB Diagnostic Rules

import type { Rule } from '../types'

export const usbRules: Rule[] = [
  {
    id: 'usb-generic-controller',
    category: 'usb',
    evaluate: (data) => {
      if (!data.usb) return null
      if (data.usb.genericControllerCount === 0) return null
      // Only flag if a VR headset is connected via USB
      if (data.usb.vrDevicesOnUsb.length === 0 && data.headsetConnection?.method !== 'usb-link' && data.headsetConnection?.method !== 'steamvr-usb') return null
      return {
        ruleId: 'usb-generic-controller',
        severity: 'warning',
        category: 'usb',
        title: 'Generic USB Controller May Cause VR Tracking Jitter',
        explanation: {
          simple: 'An unidentified (generic) USB host controller is present. Generic controllers often have poor interrupt timing, which can cause tracking micro-stutters and occasional tracking drops on wired VR headsets.',
          advanced: 'VR headsets require consistent, low-jitter USB communication for tracking data (typically 1000Hz polling). Generic USB host controllers — particularly cheap add-in cards using unknown chips — have inconsistent interrupt service routines. This manifests as irregular tracking data delivery, causing micro-stutters in the rendered view even when frame rate is stable. Intel or AMD chipset USB controllers (xHCI) or quality ASMedia controllers are preferred.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'usb-20-vr-headset',
    category: 'usb',
    evaluate: (data) => {
      if (!data.usb) return null
      if (data.usb.headsetUsbGeneration !== '2.0') return null
      if (data.usb.vrDevicesOnUsb.length === 0) return null
      return {
        ruleId: 'usb-20-vr-headset',
        severity: 'critical',
        category: 'usb',
        title: 'VR Headset on USB 2.0 — Insufficient Bandwidth for Link',
        explanation: {
          simple: 'Your VR headset appears to be connected via USB 2.0. Oculus Link and Pico Connect require USB 3.0+ (5 Gbps). On USB 2.0, you\'ll get severe compression artifacts, dropped frames, and degraded tracking.',
          advanced: 'USB 2.0 has 480Mbps theoretical bandwidth (~40MB/s real), while USB Link/Pico Connect video streaming needs 2-3 Gbps of effective link throughput for uncompressed or lightly-compressed video. USB 2.0 physically cannot sustain the required bitrate — the headset will fall back to extreme compression or simply not initialize the display link at all. Connect to a blue USB 3.0 port or an add-in USB 3.x PCIe card.'
        },
        fixId: null
      }
    }
  },
  {
    id: 'usb-no-vr-devices-detected',
    category: 'usb',
    evaluate: (data) => {
      if (!data.usb) return null
      // If using USB headset method but no VR USB devices found — may indicate driver issue
      const usbMethod = data.headsetConnection?.method === 'usb-link' || data.headsetConnection?.method === 'steamvr-usb'
      if (!usbMethod) return null
      if (data.usb.vrDevicesOnUsb.length > 0) return null
      return {
        ruleId: 'usb-no-vr-devices-detected',
        severity: 'warning',
        category: 'usb',
        title: 'Wired VR Method Detected But No VR USB Device Found',
        explanation: {
          simple: 'Your connection type suggests a wired USB headset, but no VR-related USB devices were found. The headset may not be plugged in, or may be using a driver that doesn\'t expose itself as a standard USB device.',
          advanced: 'Some VR headsets (particularly Valve Index base stations and lighthouse-tracked headsets) don\'t appear as USB devices unless the headset itself is connected via USB. If the headset is connected via DisplayPort only (e.g. Index via DP + audio jack), the USB device may be for audio/tracking only and may not match VR keywords.'
        },
        fixId: null
      }
    }
  },

  // ── ASMedia host controller + Quest Link / USB-tethered headset ──
  // ASMedia xHCI controllers (common on consumer X570/B550/Z790 boards)
  // have documented issues with Meta Quest Link: intermittent audio
  // dropouts, occasional USB-reset micro-stutters, and in rare cases
  // compressor dropouts at high encode bitrates. Intel / AMD native
  // USB controllers are much more reliable for this workload.
  //
  // We only fire when the user is actually USB-tethered — firing for
  // wireless / DisplayPort users would be noise since their USB path
  // isn't critical.
  {
    id: 'usb-asmedia-on-wired-link',
    category: 'usb',
    name: 'ASMedia USB Controller on Wired VR Connection',
    evaluate: (data) => {
      if (!data.usb) return null
      const method = data.headsetConnection?.method
      // Only for USB-tethered wired connections (Quest Link, Pico USB, Vive Pro 2 USB)
      const isWiredUsb =
        method === 'usb-link' ||
        data.connectionArchetype === 'usb-encoded' ||
        data.connectionArchetype === 'tethered-dp' // some DP headsets still use USB for tracking
      if (!isWiredUsb) return null

      const asmediaControllers = data.usb.controllers.filter(
        (c) => c.vendor === 'ASMedia'
      )
      if (asmediaControllers.length === 0) return null

      // Check if a non-ASMedia controller is also available — mitigations are
      // much easier when the user can just move to a different port
      const nonAsmedia = data.usb.controllers.filter(
        (c) => c.vendor !== 'ASMedia' && c.vendor !== 'Unknown'
      )
      const hasAlternate = nonAsmedia.length > 0

      return {
        ruleId: 'usb-asmedia-on-wired-link',
        severity: 'info',
        category: 'usb',
        explanation: {
          simple:
            `Your system has an ASMedia USB host controller. Meta Quest Link and other ` +
            `USB-tethered VR connections are known to occasionally drop audio or stutter ` +
            `when plugged into ASMedia ports. ` +
            (hasAlternate
              ? `You also have a ${nonAsmedia[0].vendor} USB controller — try moving your ` +
                `headset cable to a port connected to that controller instead.`
              : `If you see audio dropouts during Link sessions, a PCIe USB 3.0 expansion ` +
                `card with an Intel or Renesas controller ($20-40) is the easiest fix.`),
          advanced:
            `Detected USB controllers:\n` +
            data.usb.controllers.map((c) =>
              `  • ${c.vendor} — ${c.generation}  (${c.name})`
            ).join('\n') + '\n\n' +
            `ASMedia ASM1042/1142/1143/2142 xHCI controllers are widely deployed on AM4 and\n` +
            `AM5 consumer boards (often as the secondary USB controller alongside native\n` +
            `AMD USB). The Oculus community has extensively documented intermittent audio\n` +
            `dropouts, encoder stalls, and USB-reset events on these controllers during\n` +
            `sustained high-bandwidth Link sessions at 400-500 Mbps.\n\n` +
            `Recommended mitigation order:\n` +
            `  1. Move the headset cable to an Intel / AMD native USB 3 port (look at the\n` +
            `     motherboard I/O panel diagram — the CPU/chipset-direct ports vs. ASMedia).\n` +
            `  2. If all ports are ASMedia, install the latest ASMedia USB driver from your\n` +
            `     motherboard vendor (not Windows Update's generic driver).\n` +
            `  3. Add a PCIe x1 USB 3.0 card with an Intel/Renesas/NEC controller.\n\n` +
            `How to identify your port vendor: Device Manager → View → Devices by connection.\n` +
            `Expand the host controller your Quest is on and check the vendor.`,
        },
      }
    },
  },
]
