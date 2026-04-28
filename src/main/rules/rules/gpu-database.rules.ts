// Vryionics VR Optimization Suite — GPU Database-Driven Rules
//
// Rules that query GPU_DATABASE for VR-relevant capabilities:
//   • AV1 hardware encode availability (wireless VR quality)
//   • DLSS / FSR / XeSS version availability (performance recovery)
//   • PCIe x8 warning for boards using x16 slots
//   • VRAM class vs declared headset resolution (undersizing warning)
//   • Architecture-specific quirks (Intel Arc ReBAR, dual NVENC, etc.)

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { findGpuEntry } from '../../data/gpu-database'
import type { HeadsetProfile } from '../../headsets/types'

// ── Helpers ─────────────────────────────────────────────────

function primaryGpuEntry(data: ScanData) {
  if (!data.gpu || data.gpu.devices.length === 0) return null
  const primary = data.gpu.devices[data.gpu.primaryGpuIndex] ?? data.gpu.devices[0]
  if (!primary) return null
  const entry = findGpuEntry(primary.name)
  if (!entry) return null
  return { primary, entry }
}

function headsetResolutionClass(data: ScanData): 'entry' | 'mainstream' | 'high' | 'flagship' | null {
  const p = data.headsetProfile as HeadsetProfile | null | undefined
  if (!p || !p.display?.resolutionPerEye) return null
  const [w, h] = p.display.resolutionPerEye
  const pixels = w * h
  if (pixels >= 3840 * 3840 * 0.9)     return 'flagship'    // Crystal Super / XR-4 class
  if (pixels >= 2880 * 2880 * 0.9)     return 'high'        // Pimax Crystal, Aero, Beyond, MeganeX
  if (pixels >= 2000 * 2000 * 0.9)     return 'mainstream'  // Quest 3, Index, Vive Pro 2, PSVR2, Pico 4
  return 'entry'                                            // Quest 2 / 3S, Rift S, Vive
}

// ── Rule: AV1 Wireless VR Recommendation ────────────────────
//
// Fires for wireless VR users with an AV1-capable GPU, telling them to
// enable AV1 in their streaming app. Also fires as a missed-opportunity
// info for wireless users whose GPU doesn't support AV1 (flagging the
// upgrade value for when they buy next).

const av1WirelessEncoder: Rule = {
  id: 'gpu-av1-wireless-encoder',
  category: 'gpu',
  name: 'AV1 Hardware Encoding Available for Wireless VR',
  appliesTo: { connectionArchetypes: ['wifi-wireless'] },
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit

    // Only fire when AV1 is supported — otherwise we'd nag every non-AV1 user forever
    if (!entry.encoder.codecs.av1Encode) return null

    const conn = data.userSetup?.primaryUseCase  // purely for context
    return {
      ruleId: 'gpu-av1-wireless-encoder',
      severity: 'info',
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} supports AV1 hardware encoding — enable it in your wireless VR streaming app ` +
          `for noticeably cleaner image quality at the same bitrate. AV1 typically delivers the same visual ` +
          `quality as HEVC at 30-40% lower bitrate, or much better quality at the same bitrate. This is one ` +
          `of the biggest wireless VR quality wins available on your hardware.`,
        advanced:
          `GPU: ${primary.name} (${entry.architecture})\n` +
          `Encoder: ${entry.encoder.family} ${entry.encoder.generation ?? ''}\n` +
          `AV1 encode: YES\n` +
          `Concurrent encode sessions: ${entry.encoder.concurrentSessions ?? 'unknown'}\n\n` +
          `How to enable AV1 in each major wireless VR app:\n` +
          `  • Virtual Desktop: Settings → Video → Codec → "AV1 10-bit" (requires VD 1.30+)\n` +
          `  • Meta Quest Link / Air Link: Oculus Debug Tool → "Encode Codec" → "AV1"\n` +
          `  • ALVR: Dashboard → Video → Codec → AV1\n` +
          `  • Steam Link VR: automatic when GPU supports it (Steam Link v1.4+)\n` +
          `  • VIVE Streaming: Settings → Video Stream → Codec → AV1 (Vive Streaming 1.8+)\n\n` +
          `Bitrate guidance:\n` +
          `  Old HEVC setting (Mbps) × 0.65 = equivalent-quality AV1 bitrate\n` +
          `  e.g. if you were on 150 Mbps HEVC, try 100 Mbps AV1 — lower network usage at same quality.\n` +
          `  Or hold bitrate constant and enjoy the quality jump.\n\n` +
          `${entry.encoder.note ?? ''}`,
      },
    }
  },
}

// ── Rule: AV1 Missing (wireless users) ──────────────────────

const av1MissingOpportunity: Rule = {
  id: 'gpu-av1-missing-for-wireless',
  category: 'gpu',
  name: 'Wireless VR: GPU Lacks AV1 Encoding',
  appliesTo: { connectionArchetypes: ['wifi-wireless'] },
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit
    if (entry.encoder.codecs.av1Encode) return null  // covered by AV1-available rule
    // Only note this if the GPU is 2022+ — no point telling a GTX 1060 user
    if (entry.releaseYear < 2020) return null

    return {
      ruleId: 'gpu-av1-missing-for-wireless',
      severity: 'info',
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} doesn't have AV1 hardware encoding, which means your wireless VR streaming is ` +
          `using HEVC — still perfectly workable, but next time you upgrade, AV1-capable cards (NVIDIA 40-series+, ` +
          `AMD RX 7000+, Intel Arc) offer a meaningful wireless VR image quality upgrade at the same bitrate.`,
        advanced:
          `GPU: ${primary.name} (${entry.architecture})\n` +
          `Encoder: ${entry.encoder.family} ${entry.encoder.generation ?? ''}\n` +
          `AV1 encode: NO\n\n` +
          `Current best wireless VR codec for this card: HEVC (H.265)\n` +
          `Fallback / compatibility: H.264\n\n` +
          `Mitigations on this hardware:\n` +
          `  • Use HEVC at 150-200 Mbps in Virtual Desktop / Air Link for best quality\n` +
          `  • Don't waste bitrate on H.264 — HEVC does more with less on this encoder\n` +
          `  • If network is rock-solid 5GHz/6GHz, push bitrate higher (200+ Mbps) to compensate for codec limits\n\n` +
          `Upgrade path when relevant (no rush):\n` +
          `  • NVIDIA: RTX 4060 or higher (NVENC 8th gen adds AV1)\n` +
          `  • AMD: RX 7700 XT or higher (VCN 4.0 adds AV1)\n` +
          `  • Intel: Arc A750 or higher (launched with AV1)`,
      },
    }
  },
}

// ── Rule: PCIe x8 Warning ───────────────────────────────────

const pcieX8Warning: Rule = {
  id: 'gpu-pcie-x8-warning',
  category: 'gpu',
  name: 'GPU Uses PCIe x8 — Check Slot Compatibility',
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit
    if (entry.pcieWidth !== 8) return null

    // Check what the GPU is actually running at (if we detected it)
    const detectedWidth = primary.pcieLinkWidth
    const detectedGen   = primary.pcieGen

    // If detected as x8 at the expected gen, note as informational only;
    // if downgraded below the card's intended gen, severity up-ticks.
    const expectedGen = entry.pcieGen
    const isDowngraded = detectedGen !== null && detectedGen < expectedGen
    const severity: RuleResult['severity'] = isDowngraded ? 'warning' : 'info'

    return {
      ruleId: 'gpu-pcie-x8-warning',
      severity,
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} uses an 8-lane PCIe connection (not 16 like most GPUs). ` +
          (isDowngraded
            ? `And it's currently running at PCIe ${detectedGen}.0 instead of the ${expectedGen}.0 the card is designed for — ` +
              `this compounds the reduced lane count and measurably hurts VR performance.`
            : `On a PCIe ${expectedGen}.0 slot this is fine; on older PCIe 3.0 slots you'll lose a few percent performance.`) +
          ` Verify your motherboard slot is PCIe ${expectedGen}.0 x16 (or x8 electrically) — NOT a chipset-slot x4 lane.`,
        advanced:
          `GPU: ${primary.name} (${entry.architecture})\n` +
          `Designed PCIe: Gen ${expectedGen} x${entry.pcieWidth}\n` +
          `Detected PCIe: Gen ${detectedGen ?? '?'} x${detectedWidth ?? '?'}\n\n` +
          `Why this matters:\n` +
          `  Cards like the RTX 4060 Ti, Arc B580, and some AMD mid-range use only 8 PCIe lanes to save cost.\n` +
          `  On PCIe ${expectedGen}.0 x8 (expected), bandwidth is equivalent to PCIe ${expectedGen - 1}.0 x16 — fine.\n` +
          `  On PCIe ${expectedGen - 1}.0 x8 (older board, downgraded), bandwidth is half — measurable VR perf loss.\n` +
          `  On PCIe ${expectedGen - 2}.0 x8 or chipset x4 lane, perf loss compounds severely.\n\n` +
          `How to verify:\n` +
          `  1. GPU-Z → Graphics Card tab → "Bus Interface" → hit the "?" button → runs render test\n` +
          `  2. Under load it should say "PCIe ${expectedGen}.0 x${entry.pcieWidth} @ x${entry.pcieWidth} ${expectedGen}.0"\n` +
          `  3. If it says lower (x4, x8, or older Gen), check motherboard manual: GPU should be in the CPU-direct slot,\n` +
          `     not a chipset slot. On most ATX boards this is the topmost PCIe x16 slot.\n\n` +
          `If your motherboard only has PCIe 3.0 slots and this is an x8 card, the performance hit on VR is\n` +
          `typically 5-10% in GPU-bound scenarios — not catastrophic but measurable.`,
      },
    }
  },
}

// ── Rule: VRAM Undersizing for Headset ──────────────────────

const vramUndersizingRule: Rule = {
  id: 'gpu-vram-undersized-for-headset',
  category: 'gpu',
  name: 'GPU VRAM Undersized for Your Headset',
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit

    const headsetClass = headsetResolutionClass(data)
    if (!headsetClass) return null

    // Mapping: headset resolution class → minimum recommended VRAM GB
    const recommendedGB: Record<string, number> = {
      'entry':      8,
      'mainstream': 10,
      'high':       12,
      'flagship':   16,
    }
    const minVram = recommendedGB[headsetClass]
    if (entry.vramGB >= minVram) return null

    const severity: RuleResult['severity'] = entry.vramGB < minVram - 2 ? 'warning' : 'info'
    const profile = data.headsetProfile as HeadsetProfile | null | undefined
    const headsetLabel = profile ? `${profile.brand} ${profile.model}` : 'your headset'

    return {
      ruleId: 'gpu-vram-undersized-for-headset',
      severity,
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} has ${entry.vramGB} GB of VRAM, which is below the ~${minVram} GB typically recommended ` +
          `for ${headsetLabel}'s resolution class. You can still run VR, but you'll need to keep in-game texture ` +
          `settings on Medium or lower and avoid pushing supersampling much above 100%. VRAM exhaustion causes severe ` +
          `VR stutters (the GPU has to swap textures over PCIe mid-render).`,
        advanced:
          `GPU: ${primary.name} — ${entry.vramGB} GB VRAM\n` +
          `Headset: ${headsetLabel} — resolution class: ${headsetClass}\n` +
          `Recommended minimum VRAM for this class: ${minVram} GB\n` +
          `Deficit: ${minVram - entry.vramGB} GB\n\n` +
          `Why VRAM matters more in VR than flat games:\n` +
          `  VR renders two full frame buffers (one per eye) at the headset's native resolution or higher.\n` +
          `  At ${headsetClass} class, that's 2× the pixel budget of a 1440p monitor before supersampling.\n` +
          `  Each frame also needs full texture working set — no time to swap mid-frame without a visible stutter.\n\n` +
          `Mitigations for this GPU + headset pairing:\n` +
          `  1. SteamVR render resolution: cap at 90-100% (don't push above)\n` +
          `  2. In-game texture quality: Medium max (High eats the extra VRAM budget you don't have)\n` +
          `  3. Enable DLSS / FSR / XeSS Performance mode — renders at lower resolution, upscales\n` +
          `  4. Close other VRAM consumers: Chrome GPU processes, OBS Game Capture, NVIDIA ShadowPlay\n` +
          `  5. In VRChat: lower "Avatar Max Texture Size" in the config — helps significantly\n\n` +
          `Next upgrade cycle: prioritize VRAM capacity over raw raster perf for this headset class.`,
      },
    }
  },
}

// ── Rule: Intel Arc — ReBAR Mandatory ───────────────────────

const intelArcReBarRule: Rule = {
  id: 'gpu-intel-arc-rebar-required',
  category: 'gpu',
  name: 'Intel Arc: Resizable BAR is Mandatory for Acceptable Performance',
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit
    if (entry.vendor !== 'intel' || !entry.architecture.includes('Arc')) return null
    if (primary.rebarEnabled === true) return null  // all good

    return {
      ruleId: 'gpu-intel-arc-rebar-required',
      severity: 'critical',
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} is an Intel Arc card, and Resizable BAR (ReBAR) is currently DISABLED. ` +
          `Unlike NVIDIA/AMD where ReBAR is a minor optimization, on Intel Arc it's architecturally mandatory — ` +
          `performance collapses without it. You need to enable "Above 4G Decoding" and "Resizable BAR" in your ` +
          `motherboard BIOS before Arc becomes viable for VR.`,
        advanced:
          `GPU: ${primary.name} (${entry.architecture})\n` +
          `ReBAR detected: ${primary.rebarEnabled === false ? 'DISABLED' : 'unknown'}\n\n` +
          `Why Arc is different:\n` +
          `  Intel's Xe HPG / Xe2 architecture was designed assuming ReBAR. Without it, CPU→GPU transfers\n` +
          `  are serialized into 256 MB chunks and latency balloons. Benchmarks show 30-70% performance loss\n` +
          `  on Arc cards without ReBAR — not a minor tuning knob, a deal-breaker.\n\n` +
          `How to enable (motherboard-specific):\n` +
          `  1. Reboot into BIOS / UEFI\n` +
          `  2. Find "Above 4G Decoding" (usually under Advanced → PCIe) — ENABLE\n` +
          `  3. Find "Resizable BAR" or "Smart Access Memory" — ENABLE\n` +
          `  4. Save, boot into Windows\n` +
          `  5. Verify in GPU-Z: "Resizable BAR: Enabled" should show on the Graphics Card tab\n\n` +
          `Compatibility:\n` +
          `  • Intel 10th gen+: supported\n` +
          `  • AMD Ryzen 3000+: supported (B450/X470 may need BIOS update)\n` +
          `  • NVIDIA 20-series and older systems: may not have ReBAR support — check vendor BIOS\n\n` +
          `If your motherboard can't enable ReBAR, Intel Arc isn't a viable VR GPU on your system.\n` +
          `You'd get better VR performance from an RTX 3060 or RX 6700 XT on the same board.`,
      },
    }
  },
}

// ── Rule: DLSS 4 / MFG Availability ─────────────────────────

const dlss4FrameGenAvailable: Rule = {
  id: 'gpu-dlss4-mfg-available',
  category: 'gpu',
  name: 'DLSS 4 Multi Frame Generation Available',
  evaluate: (data: ScanData): RuleResult | null => {
    const hit = primaryGpuEntry(data)
    if (!hit) return null
    const { primary, entry } = hit
    if (entry.upscaling.dlssFrameGen !== 'mfg') return null

    return {
      ruleId: 'gpu-dlss4-mfg-available',
      severity: 'info',
      category: 'gpu',
      explanation: {
        simple:
          `Your ${primary.name} supports DLSS 4 Multi Frame Generation, which can synthesize up to 3 extra frames ` +
          `per rendered frame. In GPU-bound VR titles that support DLSS 4 MFG, you can double or triple effective ` +
          `frame rate at modest latency cost. This is a substantial VR quality-of-life upgrade when available.`,
        advanced:
          `GPU: ${primary.name} (${entry.architecture})\n` +
          `Upscaling: DLSS ${entry.upscaling.dlss}, Multi Frame Generation (MFG) — generates up to 3 frames per render\n\n` +
          `VR-specific considerations:\n` +
          `  • Frame Generation adds a small latency cost (~5-10ms) per synthesized frame. VR motion-to-photon\n` +
          `    latency budget is tight (<20ms ideally) — MFG is best for fitness/rhythm VR or sims where frame\n` +
          `    smoothness matters more than absolute latency.\n` +
          `  • Not all VR titles support DLSS 4 MFG — check the title's settings or the NVIDIA supported-games list.\n` +
          `  • Works alongside standard DLSS Super Resolution upscaling (FP8 transformer model).\n\n` +
          `How to enable:\n` +
          `  1. NVIDIA App (not Control Panel) → Graphics → per-game settings\n` +
          `  2. In-game: DLSS settings → "Super Resolution + Multi Frame Generation"\n` +
          `  3. Choose Frame Generation multiplier (x2, x3, or x4) based on target FPS\n\n` +
          `Best use cases in VR: simulators (MSFS, DCS), rhythm games (Beat Saber with mods), large sandbox titles.\n` +
          `Avoid in: fast-reaction competitive VR (Onward, Pavlov) where the small latency cost matters.`,
      },
    }
  },
}

// ── Export ──────────────────────────────────────────────────

export const gpuDatabaseRules: Rule[] = [
  av1WirelessEncoder,
  av1MissingOpportunity,
  pcieX8Warning,
  vramUndersizingRule,
  intelArcReBarRule,
  dlss4FrameGenAvailable,
]
