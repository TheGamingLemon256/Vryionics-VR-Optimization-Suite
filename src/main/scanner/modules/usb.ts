// VR Optimization Suite — USB Scanner Module
// Detects USB host controller quality and VR device USB generations.

import { tryRunPowerShell } from '../../utils/powershell'
import type { ScanModuleResult, UsbData } from '../types'

function detectUsbVendor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('asmedia') || n.includes('asm')) return 'ASMedia'
  if (n.includes('intel')) return 'Intel'
  if (n.includes('amd') || n.includes('advanced micro')) return 'AMD'
  if (n.includes('fresco') || n.includes('fl')) return 'Fresco Logic'
  if (n.includes('renesas') || n.includes('nec')) return 'Renesas'
  if (n.includes('via')) return 'VIA'
  if (n.includes('etron')) return 'Etron'
  return 'Unknown'
}

function detectUsbGeneration(name: string): '2.0' | '3.0' | '3.1' | '3.2' | 'Unknown' {
  const n = name.toLowerCase()
  if (n.includes('3.2') || n.includes('gen 2x2') || n.includes('20gbps')) return '3.2'
  if (n.includes('3.1') || n.includes('gen 2') || n.includes('10gbps')) return '3.1'
  if (n.includes('3.0') || n.includes('gen 1') || n.includes('5gbps') || n.includes('xhci') || n.includes('extensible')) return '3.0'
  if (n.includes('2.0') || n.includes('uhci') || n.includes('ohci') || n.includes('ehci')) return '2.0'
  return 'Unknown'
}

const VR_USB_KEYWORDS = [
  'oculus', 'meta', 'quest', 'pico', 'valve index', 'htc vive', 'vive',
  'pimax', 'bigscreen beyond', 'sony ps vr', 'psvr', 'mixed reality',
  'virtual reality', 'alvr'
]

export async function scanUsb(): Promise<ScanModuleResult<UsbData>> {
  console.log('[scan:usb] Starting USB scan...')
  const controllers: UsbData['controllers'] = []
  let headsetUsbGeneration: string | null = null
  const vrDevicesOnUsb: string[] = []
  let genericControllerCount = 0

  try {
    // Enumerate USB host controllers
    const ctrlOut = await tryRunPowerShell(`
Get-PnpDevice -Class 'USB' -PresentOnly -EA SilentlyContinue |
  Where-Object {
    $_.FriendlyName -like '*Host Controller*' -or
    $_.FriendlyName -like '*xHCI*' -or
    $_.FriendlyName -like '*eXtensible*' -or
    $_.FriendlyName -like '*EHCI*' -or
    $_.FriendlyName -like '*UHCI*'
  } |
  Select-Object FriendlyName |
  ConvertTo-Json -Compress
`, 12000)
    if (ctrlOut) {
      try {
        const raw = JSON.parse(ctrlOut)
        const list = Array.isArray(raw) ? raw : [raw]
        for (const item of list) {
          const name = String(item.FriendlyName ?? '')
          if (!name) continue
          const vendor = detectUsbVendor(name)
          const generation = detectUsbGeneration(name)
          controllers.push({ name, vendor, generation })
          if (vendor === 'Unknown' && generation === 'Unknown') genericControllerCount++
        }
      } catch { /* skip malformed */ }
    }

    // Find VR-related USB devices
    const devicesOut = await tryRunPowerShell(`
Get-PnpDevice -PresentOnly -EA SilentlyContinue |
  Where-Object { $_.Status -eq 'OK' } |
  Select-Object FriendlyName, HardwareId |
  ConvertTo-Json -Compress -Depth 2
`, 15000)
    if (devicesOut) {
      try {
        const raw = JSON.parse(devicesOut)
        const list = Array.isArray(raw) ? raw : [raw]
        for (const item of list) {
          const name = String(item.FriendlyName ?? '').toLowerCase()
          if (VR_USB_KEYWORDS.some((kw) => name.includes(kw))) {
            vrDevicesOnUsb.push(String(item.FriendlyName))
            // Detect USB generation from HardwareId
            const hwId = String(Array.isArray(item.HardwareId) ? item.HardwareId[0] : item.HardwareId ?? '')
            if (hwId.includes('USB\\')) {
              // Check if it's on a USB 3.x port by looking for USB 3 in parent controller
              // USB 3.x devices typically have HardwareId containing "USB\VID_" and are
              // connected to xHCI controllers. We look at transfer speed indicators.
              if (name.includes('usb 3') || hwId.includes('SS')) {
                headsetUsbGeneration = '3.0'
              } else {
                headsetUsbGeneration = '2.0'
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    // Better USB generation detection for VR headsets via PnpTree
    const vrUsbOut = await tryRunPowerShell(`
$vrKeywords = @('oculus', 'quest', 'pico', 'vive', 'valve index', 'mixed reality', 'pimax')
$devs = Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object {
  $n = $_.FriendlyName.ToLower()
  ($vrKeywords | Where-Object { $n -like "*$_*" }).Count -gt 0
}
if ($devs) {
  $devs | Select-Object FriendlyName, @{N='InstanceId';E={$_.InstanceId}} | ConvertTo-Json -Compress
}
`, 12000)
    if (vrUsbOut?.trim() && vrUsbOut.trim() !== 'null') {
      // Try to determine USB speed from instance ID
      try {
        const raw = JSON.parse(vrUsbOut)
        const list = Array.isArray(raw) ? raw : [raw]
        for (const item of list) {
          const instanceId = String(item.InstanceId ?? '').toLowerCase()
          // USB 3.x controllers have instance IDs with "xhci" or the device will show "SuperSpeed"
          if (instanceId.includes('xhci') || instanceId.includes('&ven_') ) {
            // Check the parent USB controller from WMI
            if (instanceId.includes('mi_')) {
              headsetUsbGeneration = headsetUsbGeneration ?? '3.0'
            }
          }
        }
      } catch { /* skip */ }
    }

    console.log(
      `[scan:usb] Complete — controllers=${controllers.length} ` +
      `(${controllers.map((c) => `${c.vendor} USB${c.generation}`).join(', ') || 'none'}) ` +
      `vrDevices=[${vrDevicesOnUsb.join(', ') || 'none'}] ` +
      `headsetGen=${headsetUsbGeneration ?? '?'} genericCount=${genericControllerCount}`
    )
    return {
      success: true,
      data: {
        controllers,
        headsetUsbGeneration,
        vrDevicesOnUsb,
        genericControllerCount
      }
    }
  } catch (error) {
    console.error(`[scan:usb] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { controllers, headsetUsbGeneration, vrDevicesOnUsb, genericControllerCount }
    }
  }
}
