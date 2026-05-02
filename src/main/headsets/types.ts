// Schema for per-headset JSON profiles in src/main/headsets/profiles/.

export type HeadsetType = 'standalone-hybrid' | 'tethered' | 'standalone'

export type ConnectionArchetype = 'tethered-dp' | 'usb-encoded' | 'wifi-wireless' | 'wigig'

export type VRRuntime =
  | 'steamvr'
  | 'openxr-steamvr'
  | 'oculus'
  | 'openxr-oculus'
  | 'wmr'
  | 'openxr-wmr'
  | 'pimaxxr'
  | 'vdxr'
  | 'pico-openxr'

export type PanelType = 'LCD' | 'OLED' | 'Mini-LED' | 'Micro-OLED'

export type Severity = 'critical' | 'warning' | 'info' | 'ok'


export interface ConnectionMethod {
  id: string // e.g. "usb-link", "air-link", "displayport"
  name: string // e.g. "Meta Air Link"
  archetype: ConnectionArchetype

  // Archetype determines what the scanner checks:
  // tethered-dp:    GPU-bound, no encoding overhead, cable/port version matters
  // usb-encoded:    GPU encodes video stream, USB bandwidth matters
  // wifi-wireless:  GPU encodes, network latency/bandwidth critical, router config matters
  // wigig:          60GHz direct link, line-of-sight, PCIe WiGig card required

  streamingSoftware?: string // e.g. "Virtual Desktop", "Air Link", "ALVR"
  requirements?: string[] // e.g. ["Wi-Fi 6 router (5GHz minimum)"]
  latencyProfile: {
    typical: number // ms, typical motion-to-photon
    best: number // ms, best case
    worst: number // ms, worst case
  }
}


export interface KnownIssue {
  id: string
  title: string
  description: string
  affectsConnectionTypes?: string[] // If only certain connection methods
  severity: Severity
  fix?: string // Reference to fix module
  workaround?: string // Manual workaround description
}

export interface OptimizationTip {
  category: 'performance' | 'visual-quality' | 'latency' | 'comfort'
  tip: string
  simpleExplanation: string // For Simple Mode
  advancedExplanation: string // For Advanced Mode
  applicableConnections?: string[] // If connection-specific
}


export interface HeadsetProfile {
  id: string // e.g. "meta-quest-3"
  brand: string // e.g. "Meta"
  model: string // e.g. "Quest 3"
  type: HeadsetType
  releaseYear: number

  display: {
    resolutionPerEye: [number, number] // e.g. [2064, 2208]
    refreshRates: number[] // e.g. [72, 80, 90, 120]
    panelType: PanelType
    fov: number // degrees, approximate
  }

  connections: ConnectionMethod[] // All supported connection methods

  runtimes: VRRuntime[] // Supported VR runtimes

  tracking: {
    type: 'inside-out' | 'outside-in' | 'lighthouse'
    controllers: string
    eyeTracking: boolean
    faceTracking: boolean
    bodyTracking: boolean
  }

  requirements: {
    minGPU: string // e.g. "GTX 1060 / RX 580"
    recommendedGPU: string
    minCPU: string
    minRAM: number // GB
    ports: string[] // e.g. ["USB-C 3.0", "DisplayPort 1.4"]
  }

  knownIssues: KnownIssue[]
  optimizationTips: OptimizationTip[]

  steamvrSettings: {
    renderResolution?: number // Supersampling multiplier
    reprojection?: 'motion-smoothing' | 'asw' | 'none'
  }
}


export interface HeadsetProfileSummary {
  id: string
  brand: string
  model: string
  type: HeadsetType
  connectionArchetypes: ConnectionArchetype[]
}
