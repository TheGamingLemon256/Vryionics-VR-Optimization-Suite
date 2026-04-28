// Vryionics VR Optimization Suite — GPU Knowledge Base
//
// Per-GPU deep knowledge for VR-specific diagnostics. Each entry captures
// the VR-relevant dimensions of a GPU:
//   • Hardware encoder family + AV1 / HEVC / H.264 support (matters for
//     wireless VR streaming: VD, Air Link, ALVR, Steam Link VR)
//   • Upscaling family support (DLSS, FSR, XeSS + versions)
//   • PCIe generation + typical link width
//   • VRAM class relative to headset resolution
//   • VR-specific quirks (driver-level issues, architecture quirks, known
//     VR-incompatible optimizations, thermal/power sustain characteristics)
//
// No LLM required at runtime — all knowledge is static and curated.

// ── Types ─────────────────────────────────────────────────────

export type GpuVendor = 'nvidia' | 'amd' | 'intel'

export interface GpuEncoderCapability {
  family: 'NVENC' | 'AMF' | 'QSV' | 'none'
  /** Generation of the encoder — NVENC 7th gen = Turing, 8th = Ampere, etc. */
  generation?: string
  /** What the encoder can actually output. Affects wireless VR codec choice. */
  codecs: {
    h264: boolean
    hevc: boolean
    av1Encode: boolean
    av1Decode: boolean
  }
  /** Number of simultaneous encode sessions — relevant when VR + capture overlap. */
  concurrentSessions?: number
  note?: string
}

export interface GpuUpscalingSupport {
  dlss?: 'v1' | 'v2' | 'v3' | 'v3.5' | 'v4'
  dlssFrameGen?: 'fg' | 'mfg' | null  // FG = Frame Generation; MFG = Multi Frame Generation
  fsr?: '1' | '2' | '3' | '3.1' | '4'
  xess?: '1' | '1.1' | '1.2' | '1.3' | '2'
  note?: string
}

export interface GpuDbEntry {
  modelPatterns: string[]
  vendor: GpuVendor
  /** Architecture codename (Ampere / Ada Lovelace / Blackwell / RDNA2/3/4 / etc.). */
  architecture: string
  /** Release year (helpful for driver / feature availability). */
  releaseYear: number
  /** VRAM in GB (total dedicated VRAM). */
  vramGB: number
  /** Memory bus width in bits. */
  busWidthBits: number
  /** PCIe interface generation (3 / 4 / 5). */
  pcieGen: 3 | 4 | 5
  /** Physical / electrical link width (usually 16, sometimes 8). */
  pcieWidth: 8 | 16

  encoder: GpuEncoderCapability
  upscaling: GpuUpscalingSupport

  /**
   * Recommended VR resolution bucket for this GPU at 90 Hz.
   * 'entry'      = ~Quest 2 / Rift S class (1832×1920 or below)
   * 'mainstream' = ~Quest 3 / Index class (2064×2208 to 2448×2448)
   * 'high'       = ~Pimax Crystal / Varjo Aero class (2880×2720 to 2880×2880)
   * 'flagship'   = ~XR-4 / Crystal Super / Vision Pro (3840×3744 and above, requires foveation)
   */
  recommendedVrResolutionClass: 'entry' | 'mainstream' | 'high' | 'flagship'

  /** VR tier from GPU_TIERS — duplicated here for rule convenience. */
  vrTier: 'entry' | 'mid' | 'high' | 'flagship'

  /** VR-specific quirks unique to this GPU or its driver family. */
  quirks: string[]
  /** One-line headline for summary display. */
  oneLiner?: string
}

// ── NVIDIA — Pascal (GTX 10-series, 2016-2017) ──────────────

const nvidiaPascal: GpuDbEntry[] = [
  {
    modelPatterns: ['gtx 1060 6gb', 'gtx1060 6gb', 'gtx 1060'],
    vendor: 'nvidia',
    architecture: 'Pascal',
    releaseYear: 2016,
    vramGB: 6,
    busWidthBits: 192,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '6th gen (Pascal)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
      note: 'NVENC 6th-gen quality is noticeably below Turing+. Fine for H.264 at higher bitrates; HEVC quality is acceptable but not great for wireless VR.',
    },
    upscaling: {
      fsr: '3.1',  // driver/app-level, not hardware-gated
      note: 'No DLSS (Tensor cores require Turing+). FSR / FSR3 work on any GPU.',
    },
    recommendedVrResolutionClass: 'entry',
    vrTier: 'entry',
    quirks: [
      'Hardware floor for VR in 2025 — Quest 2 at native only, with reduced in-app settings.',
      'No AV1 encoding — if wireless streaming, use HEVC at 150+ Mbps.',
      'DX12 overhead hurts this card in modern VR games — prefer DX11 / Vulkan titles where possible.',
      'Doesn\'t support modern features: no DLSS, no RT cores, no hardware-accelerated GPU scheduling for complex scenes.',
    ],
    oneLiner: 'Bare-minimum 2016 VR card. Suitable only for Quest 2 at native, older titles.',
  },
  {
    modelPatterns: ['gtx 1070 ti', 'gtx1070 ti'],
    vendor: 'nvidia',
    architecture: 'Pascal',
    releaseYear: 2017,
    vramGB: 8,
    busWidthBits: 256,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '6th gen (Pascal)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'entry',
    vrTier: 'entry',
    quirks: [
      'Competent for Quest 2 / Rift S at native resolution + medium settings.',
      'No AV1 encoding — use HEVC for wireless streaming.',
    ],
    oneLiner: 'Solid 2017 GTX-class. Quest 2 / Rift S at native, medium settings.',
  },
  {
    modelPatterns: ['gtx 1080 ti', 'gtx1080 ti', 'gtx 1080ti'],
    vendor: 'nvidia',
    architecture: 'Pascal',
    releaseYear: 2017,
    vramGB: 11,
    busWidthBits: 352,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '6th gen (Pascal)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      'Surprisingly capable for VR even in 2025 — 11 GB VRAM is generous.',
      'No RTX features (no DLSS, no RT), no AV1 encoding.',
      'The last NVIDIA GPU without Tensor cores — its successor (2080 Ti) added DLSS.',
    ],
    oneLiner: '2017 flagship. Still handles Quest 3 / Index at 100% SS with reasonable settings.',
  },
]

// ── NVIDIA — Turing (GTX 16xx, RTX 20-series, 2018-2019) ────

const nvidiaTuring: GpuDbEntry[] = [
  {
    modelPatterns: ['gtx 1660 super', 'gtx1660 super'],
    vendor: 'nvidia',
    architecture: 'Turing (GTX)',
    releaseYear: 2019,
    vramGB: 6,
    busWidthBits: 192,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen (Turing)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
      note: 'NVENC 7th-gen is a substantial quality jump from Pascal. Still no AV1 encode.',
    },
    upscaling: {
      fsr: '3.1',
      note: 'GTX 16-series lacks Tensor cores — no DLSS, only FSR/XeSS CPU fallback paths.',
    },
    recommendedVrResolutionClass: 'entry',
    vrTier: 'entry',
    quirks: [
      'Turing encoder (NVENC 7th) is very good for H.264/HEVC wireless VR, even without AV1.',
      'Budget VR floor for Quest 2 / Quest 3 at native + low-medium settings.',
    ],
    oneLiner: 'Budget Turing — good NVENC, limited horsepower.',
  },
  {
    modelPatterns: ['rtx 2070 super', 'rtx2070 super'],
    vendor: 'nvidia',
    architecture: 'Turing',
    releaseYear: 2019,
    vramGB: 8,
    busWidthBits: 256,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen (Turing)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
    },
    upscaling: {
      dlss: 'v3.5',
      dlssFrameGen: null,  // Frame Gen requires Ada optical flow accelerator
      fsr: '3.1',
      note: 'DLSS 3.5 Super Resolution works. DLSS 3 Frame Generation does NOT work on Turing.',
    },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      'First NVIDIA RTX generation — introduced DLSS and NVENC 7th gen.',
      'No AV1 encoding; use HEVC for wireless VR.',
      'Handles Quest 3 / Index at 100-120% SS for most VR titles in 2025.',
    ],
    oneLiner: '2019 mainstream RTX. DLSS-capable but no AV1 encode.',
  },
  {
    modelPatterns: ['rtx 2080 ti', 'rtx2080 ti', 'rtx 2080ti'],
    vendor: 'nvidia',
    architecture: 'Turing',
    releaseYear: 2018,
    vramGB: 11,
    busWidthBits: 352,
    pcieGen: 3,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen (Turing)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: false },
      concurrentSessions: 3,
    },
    upscaling: {
      dlss: 'v3.5',
      dlssFrameGen: null,
      fsr: '3.1',
    },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      '11 GB VRAM remains useful at high VR resolutions.',
      'NVENC 7th gen is strong for wireless VR despite no AV1.',
      'Driver maturity is excellent — 2018 flagship has had 7+ years of refinement.',
    ],
    oneLiner: '2018 flagship with 11 GB VRAM. Still capable at mid-res VR.',
  },
]

// ── NVIDIA — Ampere (RTX 30-series, 2020-2022) ──────────────

const nvidiaAmpere: GpuDbEntry[] = [
  {
    modelPatterns: ['rtx 3060 ', 'rtx3060 ', 'rtx 3060\b'],  // trailing space/boundary to avoid matching 3060 Ti
    vendor: 'nvidia',
    architecture: 'Ampere',
    releaseYear: 2021,
    vramGB: 12,
    busWidthBits: 192,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen (Ampere — same as Turing)',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 3,
      note: 'Ampere NVENC is the same 7th-gen as Turing — no encoder uplift. AV1 DECODE added; still no AV1 encode.',
    },
    upscaling: { dlss: 'v3.5', dlssFrameGen: null, fsr: '3.1' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      '12 GB VRAM is surprisingly generous for a mid-range card — good for high-res VR textures.',
      '192-bit bus is the narrow side — hurts at very high resolutions.',
      'No AV1 encode — Ampere\'s main wireless VR limitation vs Ada Lovelace.',
    ],
    oneLiner: 'Great VRAM budget for the price. No AV1 encode.',
  },
  {
    modelPatterns: ['rtx 3070 ', 'rtx3070 ', 'rtx 3070\b'],
    vendor: 'nvidia',
    architecture: 'Ampere',
    releaseYear: 2020,
    vramGB: 8,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v3.5', dlssFrameGen: null, fsr: '3.1' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      '8 GB VRAM is borderline for high-res VR (Quest 3, Crystal) at max settings.',
      'Excellent raw perf/dollar for 2020 but VRAM-limited for 2025 flagship-res VR.',
    ],
    oneLiner: 'Strong rasterization, 8 GB VRAM is the bottleneck at high-res VR.',
  },
  {
    modelPatterns: ['rtx 3080 ', 'rtx3080 ', 'rtx 3080\b'],
    vendor: 'nvidia',
    architecture: 'Ampere',
    releaseYear: 2020,
    vramGB: 10,  // 10 GB standard; 12 GB refresh also exists
    busWidthBits: 320,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v3.5', dlssFrameGen: null, fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '10 GB VRAM for original; 12 GB for refresh — check your specific card.',
      'Handles Pimax Crystal / Varjo Aero at reduced SS very well.',
      'No AV1 encode — wireless VR uses HEVC.',
    ],
    oneLiner: '2020 high-end. Strong VR performer; no AV1 encode.',
  },
  {
    modelPatterns: ['rtx 3090 ti', 'rtx3090 ti'],
    vendor: 'nvidia',
    architecture: 'Ampere',
    releaseYear: 2022,
    vramGB: 24,
    busWidthBits: 384,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v3.5', dlssFrameGen: null, fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '24 GB VRAM — excellent for flagship-resolution VR (Crystal, Aero, XR-3/4) and VRChat with many avatars.',
      'Still no AV1 encode — one of the main reasons to upgrade to 40-series for wireless VR.',
      'Very power-hungry (450W TBP) — check PSU before installing.',
    ],
    oneLiner: '24 GB VRAM flagship. High-res VR capable; missing AV1 encode.',
  },
  {
    modelPatterns: ['rtx 3090 ', 'rtx3090 ', 'rtx 3090\b'],
    vendor: 'nvidia',
    architecture: 'Ampere',
    releaseYear: 2020,
    vramGB: 24,
    busWidthBits: 384,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '7th gen',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v3.5', dlssFrameGen: null, fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '24 GB VRAM — generous for high-res VR.',
      'Effectively a 3080 Ti with much more VRAM — raster gap vs 3080 Ti is small.',
    ],
    oneLiner: '24 GB VRAM, excellent for high-res VR; no AV1 encode.',
  },
]

// ── NVIDIA — Ada Lovelace (RTX 40-series, 2022-2024) ────────

const nvidiaAda: GpuDbEntry[] = [
  {
    modelPatterns: ['rtx 4060 ti', 'rtx4060 ti', 'rtx 4060ti'],
    vendor: 'nvidia',
    architecture: 'Ada Lovelace',
    releaseYear: 2023,
    vramGB: 8,  // 16 GB variant also exists
    busWidthBits: 128,
    pcieGen: 4,
    pcieWidth: 8,   // NOTE: 4060 Ti uses only x8 PCIe lanes
    encoder: {
      family: 'NVENC',
      generation: '8th gen (Ada)',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
      note: 'First consumer NVENC with AV1 encoding. Huge wireless VR quality improvement vs 30-series at same bitrate.',
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'fg', fsr: '3.1' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      'PCIe 4.0 x8 (not x16!) — fine on PCIe 4.0 boards, visibly slower on PCIe 3.0.',
      '8 GB VRAM is marginal for high-res VR. 16 GB variant is a better choice for VR.',
      'NVENC AV1 encode is the big VR upgrade — enable it in Virtual Desktop / OBS for cleaner wireless VR.',
    ],
    oneLiner: 'First AV1-encode NVIDIA consumer card. PCIe x8 caveat; 16 GB variant preferred for VR.',
  },
  {
    modelPatterns: ['rtx 4070 super', 'rtx4070 super'],
    vendor: 'nvidia',
    architecture: 'Ada Lovelace',
    releaseYear: 2024,
    vramGB: 12,
    busWidthBits: 192,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '8th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'fg', fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '12 GB VRAM is comfortable for Quest 3 / Index at max SS; adequate for Pimax Crystal at 80-90% SS.',
      'AV1 encode + DLSS 4 + FG — excellent wireless VR card in the mid-high range.',
    ],
    oneLiner: 'Sweet-spot VR card. 12 GB + AV1 + DLSS 4.',
  },
  {
    modelPatterns: ['rtx 4070 ti super', 'rtx4070 ti super'],
    vendor: 'nvidia',
    architecture: 'Ada Lovelace',
    releaseYear: 2024,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '8th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'fg', fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '16 GB VRAM and 256-bit bus — excellent for high-res VR without flagship pricing.',
      'Arguably the best VR value of the Ada generation.',
    ],
    oneLiner: '16 GB AV1 workhorse. Best VR value in Ada.',
  },
  {
    modelPatterns: ['rtx 4080 super', 'rtx4080 super'],
    vendor: 'nvidia',
    architecture: 'Ada Lovelace',
    releaseYear: 2024,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '8th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'fg', fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '16 GB VRAM sufficient for Crystal / Aero at 100% SS.',
      'Power-efficient vs 4090 — 320W TBP vs 450W. Runs cooler and quieter.',
    ],
    oneLiner: 'Flagship-capable with reasonable power draw. 16 GB + AV1.',
  },
  {
    modelPatterns: ['rtx 4090', 'rtx4090'],
    vendor: 'nvidia',
    architecture: 'Ada Lovelace',
    releaseYear: 2022,
    vramGB: 24,
    busWidthBits: 384,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '8th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 5,
      note: 'Dual NVENC encoders. Supports up to 5 concurrent sessions — critical for VR + OBS stream + second capture.',
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'fg', fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      'Dual NVENC — VR + streaming + recording no longer competes for encoder.',
      '24 GB VRAM handles Varjo XR-4, Pimax Crystal Super, Apple Vision Pro streaming.',
      'Watch the 12VHPWR connector — seat fully with zero cable strain.',
    ],
    oneLiner: 'Dual NVENC flagship. 24 GB VRAM. Handles any consumer VR headset.',
  },
]

// ── NVIDIA — Blackwell (RTX 50-series, 2025) ────────────────

const nvidiaBlackwell: GpuDbEntry[] = [
  {
    modelPatterns: ['rtx 5070 ti', 'rtx5070 ti'],
    vendor: 'nvidia',
    architecture: 'Blackwell',
    releaseYear: 2025,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 5,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '9th gen (Blackwell)',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
      note: 'Blackwell NVENC adds 4:2:2 support and improved AV1 quality-per-bit.',
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'mfg', fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      'DLSS 4 Multi Frame Generation (MFG) can synthesize up to 3 frames per real frame — dramatic smoothness gains in GPU-bound VR titles that support it.',
      'PCIe 5.0 x16; also works at 4.0 x16 with ~1-2% loss.',
      'GDDR7 memory — higher bandwidth than Ada at same bus width.',
    ],
    oneLiner: '16 GB GDDR7, DLSS 4 MFG, AV1 encode. 2025 mid-high VR card.',
  },
  {
    modelPatterns: ['rtx 5080', 'rtx5080'],
    vendor: 'nvidia',
    architecture: 'Blackwell',
    releaseYear: 2025,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 5,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '9th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 3,
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'mfg', fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '16 GB is the generation\'s sore spot — same as 4080. Flagship-resolution VR at max settings wants more.',
      'Raster perf only modestly above 4080 Super; MFG is the main upgrade vector.',
    ],
    oneLiner: '16 GB GDDR7. MFG is the killer feature; raster is incremental.',
  },
  {
    modelPatterns: ['rtx 5090', 'rtx5090'],
    vendor: 'nvidia',
    architecture: 'Blackwell',
    releaseYear: 2025,
    vramGB: 32,
    busWidthBits: 512,
    pcieGen: 5,
    pcieWidth: 16,
    encoder: {
      family: 'NVENC',
      generation: '9th gen',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 5,
      note: 'Dual NVENC (same as 4090). Highest simultaneous session count in consumer GPUs.',
    },
    upscaling: { dlss: 'v4', dlssFrameGen: 'mfg', fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '32 GB GDDR7 — overbuilt for current VR, but useful for Pimax Crystal Super / XR-4 with very high SS.',
      '575W TBP — serious PSU planning required. 12V-2x6 connector mandatory.',
      'Only current GPU that can brute-force flagship-resolution VR without foveated rendering.',
    ],
    oneLiner: '32 GB flagship. Only current GPU that can push 3840×3840 per eye without foveation.',
  },
]

// ── AMD — RDNA2 (RX 6000-series, 2020-2021) ─────────────────

const amdRdna2: GpuDbEntry[] = [
  {
    modelPatterns: ['rx 6700 xt', 'rx6700 xt'],
    vendor: 'amd',
    architecture: 'RDNA2',
    releaseYear: 2021,
    vramGB: 12,
    busWidthBits: 192,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 3.0',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 2,
      note: 'AMF H.264/HEVC encode quality is measurably below NVENC at the same bitrate. Wireless VR users often need +20-30 Mbps vs equivalent NVIDIA card to match quality.',
    },
    upscaling: { fsr: '3.1', note: 'No DLSS (NVIDIA-only). FSR 3 Frame Generation works.' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      '12 GB VRAM is generous for the tier.',
      'AMF encoder lagged NVENC for a long time; 2024-2025 driver updates closed the gap significantly.',
      'No AV1 encode — RDNA2 is pre-AV1.',
      'Enhanced Sync can introduce wireless VR latency; disable it in Adrenalin.',
    ],
    oneLiner: '12 GB VRAM mid-range. Weaker encoder than NVIDIA equivalents for wireless VR.',
  },
  {
    modelPatterns: ['rx 6800 xt', 'rx6800 xt'],
    vendor: 'amd',
    architecture: 'RDNA2',
    releaseYear: 2020,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 3.0',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '16 GB VRAM — strong high-res VR card.',
      'No AV1 encode; HEVC wireless VR streaming is the best available on this card.',
    ],
    oneLiner: '2020 AMD flagship. 16 GB VRAM, HEVC wireless VR, no AV1.',
  },
  {
    modelPatterns: ['rx 6900 xt', 'rx6900 xt'],
    vendor: 'amd',
    architecture: 'RDNA2',
    releaseYear: 2020,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 3.0',
      codecs: { h264: true, hevc: true, av1Encode: false, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '16 GB VRAM, slightly higher clocks than 6800 XT.',
      'Same encoder generation — no AV1.',
    ],
    oneLiner: 'Top RDNA2. Beats 3080 in raster, loses in encoder quality.',
  },
]

// ── AMD — RDNA3 (RX 7000-series, 2022-2024) ─────────────────

const amdRdna3: GpuDbEntry[] = [
  {
    modelPatterns: ['rx 7700 xt', 'rx7700 xt'],
    vendor: 'amd',
    architecture: 'RDNA3',
    releaseYear: 2023,
    vramGB: 12,
    busWidthBits: 192,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 4.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
      note: 'First AMD consumer AV1 encoder (RDNA3). Quality improved significantly vs VCN 3.0.',
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      'First AMD consumer GPU with AV1 encode — good for wireless VR quality.',
      '12 GB VRAM sufficient for most VR scenarios.',
      'FSR 3 Frame Generation works on this card (and any RDNA1+).',
    ],
    oneLiner: 'RDNA3 mid-range. First AMD AV1 encode. 12 GB VRAM.',
  },
  {
    modelPatterns: ['rx 7800 xt', 'rx7800 xt'],
    vendor: 'amd',
    architecture: 'RDNA3',
    releaseYear: 2023,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 4.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '16 GB VRAM + AV1 encode — strong wireless VR option from AMD.',
      'Rasterization performance competitive with RTX 4070.',
    ],
    oneLiner: '16 GB + AV1 encode. Competitive with 4070 Super for wireless VR.',
  },
  {
    modelPatterns: ['rx 7900 xt ', 'rx7900 xt '],  // trailing space — XTX matched below
    vendor: 'amd',
    architecture: 'RDNA3',
    releaseYear: 2022,
    vramGB: 20,
    busWidthBits: 320,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 4.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      '20 GB VRAM — excellent for high-res VR.',
      'AMF VCN 4.0 AV1 encode quality is close to but slightly below NVENC 8th gen.',
    ],
    oneLiner: '20 GB AMD high-end. AV1 encode, generous VRAM.',
  },
  {
    modelPatterns: ['rx 7900 xtx', 'rx7900 xtx'],
    vendor: 'amd',
    architecture: 'RDNA3',
    releaseYear: 2022,
    vramGB: 24,
    busWidthBits: 384,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 4.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '3.1' },
    recommendedVrResolutionClass: 'flagship',
    vrTier: 'flagship',
    quirks: [
      '24 GB VRAM + AV1 encode — strong flagship option for AMD users doing wireless VR.',
      'Rasterization close to RTX 4080 / 4080 Super; loses in ray tracing and DLSS availability.',
      'VR users should enable "Radeon Anti-Lag" cautiously — it can cause input stutters in certain VR runtimes.',
    ],
    oneLiner: '24 GB AMD flagship. Full AV1, close to 4080 raster. Great for wireless VR.',
  },
]

// ── AMD — RDNA4 (RX 9000-series, 2025) ──────────────────────

const amdRdna4: GpuDbEntry[] = [
  {
    modelPatterns: ['rx 9070 xt', 'rx9070 xt'],
    vendor: 'amd',
    architecture: 'RDNA4',
    releaseYear: 2025,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 5,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 5.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
      note: 'VCN 5.0 closes the quality gap with NVENC 9th-gen (Blackwell). AV1 encoding improved ~15% in quality-per-bit.',
    },
    upscaling: { fsr: '4', note: 'FSR 4 is ML-based and exclusive to RDNA4 hardware — major quality jump over FSR 3.' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      'FSR 4 is exclusive to RDNA4 — significantly better quality than FSR 3/2.',
      'Updated ray tracing hardware — finally competitive with NVIDIA for RT-heavy VR titles.',
      'VCN 5.0 encoder closes the wireless VR quality gap with NVENC.',
    ],
    oneLiner: '2025 AMD upper-mid. FSR 4, improved AV1, PCIe 5.0.',
  },
  {
    modelPatterns: ['rx 9070 ', 'rx9070 '],   // non-XT
    vendor: 'amd',
    architecture: 'RDNA4',
    releaseYear: 2025,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 5,
    pcieWidth: 16,
    encoder: {
      family: 'AMF',
      generation: 'VCN 5.0',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { fsr: '4' },
    recommendedVrResolutionClass: 'high',
    vrTier: 'high',
    quirks: [
      'Non-XT variant — ~10% lower raster than XT at a lower price point.',
      'Same VCN 5.0 encoder and FSR 4 support as the XT.',
    ],
    oneLiner: 'Non-XT RDNA4. Same AV1 + FSR 4 at mid-range pricing.',
  },
]

// ── Intel — Arc (Alchemist, Battlemage) ─────────────────────

const intelArc: GpuDbEntry[] = [
  {
    modelPatterns: ['arc a770', 'a770'],
    vendor: 'intel',
    architecture: 'Arc Alchemist',
    releaseYear: 2022,
    vramGB: 16,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'QSV',
      generation: 'Arc Alchemist (Xe HPG)',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
      note: 'Intel Arc has strong AV1 encoding quality — often cited as quality-per-bit champion for wireless VR.',
    },
    upscaling: { xess: '1.3', note: 'XeSS 1.3 — hardware-accelerated on Arc via XMX cores.' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      'Excellent AV1 hardware encoder — Virtual Desktop and ALVR both benefit visibly.',
      'DX11 driver has known VR performance regressions — DX12/Vulkan VR titles work better.',
      'Resizable BAR is MANDATORY for acceptable Arc performance. Check BIOS settings.',
      '16 GB VRAM is generous for the tier.',
    ],
    oneLiner: 'Best-in-class AV1 encode. Requires ReBAR. DX11 VR titles can be spotty.',
  },
  {
    modelPatterns: ['arc a750'],
    vendor: 'intel',
    architecture: 'Arc Alchemist',
    releaseYear: 2022,
    vramGB: 8,
    busWidthBits: 256,
    pcieGen: 4,
    pcieWidth: 16,
    encoder: {
      family: 'QSV',
      generation: 'Arc Alchemist',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
    },
    upscaling: { xess: '1.3' },
    recommendedVrResolutionClass: 'entry',
    vrTier: 'entry',
    quirks: [
      '8 GB VRAM — borderline for modern high-res VR.',
      'Same AV1 encoder as A770 — strong wireless VR streaming quality.',
      'ReBAR required for acceptable performance.',
    ],
    oneLiner: 'Budget AV1 encoder. 8 GB limits VR headroom.',
  },
  {
    modelPatterns: ['arc b580', 'b580'],
    vendor: 'intel',
    architecture: 'Arc Battlemage',
    releaseYear: 2024,
    vramGB: 12,
    busWidthBits: 192,
    pcieGen: 4,
    pcieWidth: 8,  // B580 uses x8 PCIe
    encoder: {
      family: 'QSV',
      generation: 'Arc Battlemage (Xe2)',
      codecs: { h264: true, hevc: true, av1Encode: true, av1Decode: true },
      concurrentSessions: 2,
      note: 'Battlemage encoder refined further — AV1 quality competitive with NVENC 8th gen.',
    },
    upscaling: { xess: '2', note: 'XeSS 2 adds Frame Generation on Battlemage.' },
    recommendedVrResolutionClass: 'mainstream',
    vrTier: 'mid',
    quirks: [
      '12 GB VRAM at budget-to-mid pricing — strong VR value.',
      'PCIe 4.0 x8 — verify motherboard supports this; older PCIe 3.0 boards lose ~5% perf.',
      'Battlemage drivers are much more mature at launch than Alchemist.',
    ],
    oneLiner: '2024 Intel mid-range. 12 GB, best-tier AV1, PCIe x8.',
  },
]

// ── Combined Export ──────────────────────────────────────────

export const GPU_DATABASE: GpuDbEntry[] = [
  ...nvidiaPascal,
  ...nvidiaTuring,
  ...nvidiaAmpere,
  ...nvidiaAda,
  ...nvidiaBlackwell,
  ...amdRdna2,
  ...amdRdna3,
  ...amdRdna4,
  ...intelArc,
]

// ── Lookup ───────────────────────────────────────────────────

/**
 * Find a GPU database entry by matching the detected GPU name against
 * every entry's modelPatterns. Case-insensitive substring match.
 * Returns null when no pattern matches.
 */
export function findGpuEntry(gpuName: string): GpuDbEntry | null {
  if (!gpuName) return null
  const lower = gpuName.toLowerCase()
  // Walk entries — first match wins. Order within each array is most-specific
  // first (Ti / Super variants before base model) to avoid shadowing.
  for (const entry of GPU_DATABASE) {
    for (const pattern of entry.modelPatterns) {
      if (lower.includes(pattern.toLowerCase())) return entry
    }
  }
  return null
}

/**
 * Quick predicate: does this GPU support AV1 hardware encoding? Central
 * question for wireless VR users — AV1 produces cleaner image quality at
 * the same bitrate vs HEVC / H.264, especially relevant for
 * Virtual Desktop, ALVR, Steam Link VR, and VIVE Streaming.
 */
export function gpuSupportsAv1Encode(gpuName: string): boolean {
  return findGpuEntry(gpuName)?.encoder.codecs.av1Encode ?? false
}
