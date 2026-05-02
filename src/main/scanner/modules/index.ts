// Scan modules registered in execution order.

export { scanCpu } from './cpu'
export { scanGpu } from './gpu'
export { scanRam } from './ram'
export { scanStorage } from './storage'
export { scanNetwork } from './network'
export { scanProcesses } from './processes'
export { scanOsConfig } from './os-config'
export { scanPowerPlan } from './power-plan'
export { scanSteamVr } from './steamvr'
export { scanVrRuntime } from './vr-runtime'
export { scanSpeedTest } from './speedtest'
export { scanHeadsetConnection } from './headset-connection'
export { scanDisplay } from './display'
export { scanAudio } from './audio'
export { scanUsb } from './usb'
export { scanEventLog } from './event-log'
export { scanCompat } from './compat'

// Module execution order for the scan engine
export const MODULE_ORDER = [
  'cpu',
  'gpu',
  'ram',
  'storage',
  'network',
  'processes',
  'vr-runtime',
  'os-config',
  'power-plan',         // merge → osConfig.powerPlan
  'steamvr',            // merge → vrRuntime
  'headset-connection', // standalone → scanData.headsetConnection
  'display',            // standalone → scanData.display
  'speedtest',          // standalone → scanData.speedTest
  'audio',              // standalone → scanData.audio
  'usb',                // standalone → scanData.usb
  'event-log'           // standalone → scanData.eventLog
] as const

export type Phase1ModuleId = typeof MODULE_ORDER[number]
