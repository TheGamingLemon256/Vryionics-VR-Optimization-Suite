// VR Optimization Suite — Rules Index
// All diagnostic rules combined into one flat array.

import { cpuRules } from './cpu.rules'
import { gpuRules } from './gpu.rules'
import { ramRules } from './ram.rules'
import { storageRules } from './storage.rules'
import { networkRules } from './network.rules'
import { vrRuntimeRules } from './vr-runtime.rules'
import { osConfigRules } from './os-config.rules'
import { processRules } from './processes.rules'
import { combinationRules } from './combination-rules'
import { headsetConnectionRules } from './headset-connection.rules'
import { cpuSpecificRules } from './cpu-specific.rules'
import { displayRules } from './display.rules'
import { audioRules } from './audio.rules'
import { usbRules } from './usb.rules'
import { eventLogRules } from './event-log.rules'
import { vrchatRules } from './vrchat.rules'
import { headsetProfileRules } from './headset-profile.rules'
import { compatRules } from './compat.rules'
import { userSetupRules } from './user-setup.rules'
import { cpuIntelRules } from './cpu-intel.rules'
import { gpuDatabaseRules } from './gpu-database.rules'
import { hardwareDatabaseRules } from './hardware-database.rules'
import { driverDatabaseRules } from './driver-database.rules'
import { gameProfileRules } from './game-profile.rules'
import type { Rule } from '../types'

export const allRules: Rule[] = [
  // Single-category rules (run first so combination rules can layer on top)
  ...cpuRules,
  // CPU-model-specific rules using the AM4/AM5 knowledge database
  ...cpuSpecificRules,
  ...gpuRules,
  ...ramRules,
  ...storageRules,
  ...networkRules,
  ...vrRuntimeRules,
  ...osConfigRules,
  ...processRules,
  // Multi-factor combination rules (require multiple modules)
  ...combinationRules,
  // Headset connection state rules
  ...headsetConnectionRules,
  // Display rules
  ...displayRules,
  // Audio rules
  ...audioRules,
  // USB rules
  ...usbRules,
  // Event log rules
  ...eventLogRules,
  // VRChat-specific performance rules
  ...vrchatRules,
  // Rules sourced from the user's selected headset profile JSON —
  // surface knownIssues, optimizationTips, and under-spec hardware
  ...headsetProfileRules,
  // System compatibility rules — hybrid GPU, HVCI, SteamVR Beta,
  // installed-but-not-running VR tools
  ...compatRules,
  // User-setup-aware rules — surface that wizard answers are biasing recs
  ...userSetupRules,
  // Intel-specific CPU rules (hybrid scheduling, Vmin microcode, Arrow Lake BIOS, laptop thermals)
  ...cpuIntelRules,
  // GPU-database-driven rules (AV1, DLSS 4 MFG, Arc ReBAR, VRAM undersizing, PCIe x8)
  ...gpuDatabaseRules,
  // Phase-7: Wi-Fi chipset, RAM kit, and motherboard chipset database rules
  ...hardwareDatabaseRules,
  // Phase-8: driver status + active-title game-profile guidance
  ...driverDatabaseRules,
  ...gameProfileRules
]
