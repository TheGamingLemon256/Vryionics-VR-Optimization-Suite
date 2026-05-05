// Process names the live optimizer must never adjust priority on.
// Includes Windows critical processes, anti-cheat engines (any priority
// nudge can be flagged as tampering), and VR runtime services that
// already manage their own scheduling.
export const NEVER_TOUCH_PROCESSES = new Set([
  'System',
  'Idle',
  'lsass.exe',
  'csrss.exe',
  'winlogon.exe',
  'services.exe',
  'svchost.exe',
  'dwm.exe',
  'wininit.exe',
  'smss.exe',
  'EasyAntiCheat.exe',
  'EasyAntiCheat_EOS.exe',
  'BEService.exe',
  'BEServiceV2.exe',
  'vgc.exe',
  'vgtray.exe',
  'EasyAntiCheat_Setup.exe',
  'OVRServer_x64.exe',
  'OculusClient.exe',
  'vrserver.exe',
  'vrdashboard.exe',
  'vrcompositor.exe',
])

export const NEVER_TOUCH_DIR_PREFIXES = [
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
]
