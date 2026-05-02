// USB host controller quality and VR device USB generations.

import { readKey } from '../../utils/registry-read'
import { enumerateRegistrySubkeys } from '../../utils/registry'
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
  'virtual reality', 'alvr',
]

interface RegistryDevice {
  name: string
  service: string
  hardwareId: string
}

async function readDevice(enumPath: string): Promise<RegistryDevice | null> {
  const key = await readKey(`HKLM\\${enumPath}`).catch(() => null)
  if (!key) return null

  const friendly = key.values['FriendlyName']
  const devDesc = key.values['DeviceDesc']
  const service = key.values['Service']
  const hardwareId = key.values['HardwareID']

  // DeviceDesc often holds an "@inf,%key%;Value" indirection — strip it down
  // to the resolved value, which Windows duplicates after the semicolon.
  let name = ''
  if (friendly && friendly.type === 'REG_SZ' && friendly.data.trim()) {
    name = friendly.data.trim()
  } else if (devDesc && devDesc.type === 'REG_SZ') {
    const semi = devDesc.data.lastIndexOf(';')
    name = semi >= 0 ? devDesc.data.slice(semi + 1).trim() : devDesc.data.trim()
  }

  if (!name) return null

  let hwId = ''
  if (hardwareId) {
    if (hardwareId.type === 'REG_MULTI_SZ' && hardwareId.data.length > 0) hwId = hardwareId.data[0]
    else if (hardwareId.type === 'REG_SZ') hwId = hardwareId.data
  }

  return {
    name,
    service: service && service.type === 'REG_SZ' ? service.data : '',
    hardwareId: hwId,
  }
}

/**
 * Walk Enum\<bus> and read each instance's child key. Layout is two levels
 * deep on USB: bus\VID_xxxx&PID_xxxx\<instance>. We collect every leaf with
 * a FriendlyName / DeviceDesc.
 */
async function enumerateBusDevices(busPath: string): Promise<RegistryDevice[]> {
  const devices: RegistryDevice[] = []
  const families = enumerateRegistrySubkeys('HKLM', busPath)
  for (const family of families) {
    const instances = enumerateRegistrySubkeys('HKLM', `${busPath}\\${family}`)
    for (const instance of instances) {
      const dev = await readDevice(`${busPath}\\${family}\\${instance}`)
      if (dev) devices.push(dev)
    }
  }
  return devices
}

export async function scanUsb(): Promise<ScanModuleResult<UsbData>> {
  console.log('[scan:usb] Starting USB scan...')
  const controllers: UsbData['controllers'] = []
  let headsetUsbGeneration: string | null = null
  const vrDevicesOnUsb: string[] = []
  let genericControllerCount = 0

  try {
    // Host controllers live under PCI, not USB. Their Service value is usbxhci
    // (USB 3+) or usbehci/usbohci/usbuhci for the older standards.
    const pciDevices = await enumerateBusDevices('SYSTEM\\CurrentControlSet\\Enum\\PCI')
    const hostServices = new Set(['usbxhci', 'usbehci', 'usbohci', 'usbuhci'])

    for (const dev of pciDevices) {
      const svc = dev.service.toLowerCase()
      if (!hostServices.has(svc)) continue

      const vendor = detectUsbVendor(dev.name)
      let generation = detectUsbGeneration(dev.name)
      if (generation === 'Unknown') {
        if (svc === 'usbxhci') generation = '3.0'
        else if (svc === 'usbehci') generation = '2.0'
      }

      controllers.push({ name: dev.name, vendor, generation })
      if (vendor === 'Unknown' && generation === 'Unknown') genericControllerCount++
    }

    // VR-relevant downstream devices live under Enum\USB. We match by
    // FriendlyName/DeviceDesc keywords to keep parity with the previous
    // Get-PnpDevice approach.
    const usbDevices = await enumerateBusDevices('SYSTEM\\CurrentControlSet\\Enum\\USB')
    for (const dev of usbDevices) {
      const lower = dev.name.toLowerCase()
      if (!VR_USB_KEYWORDS.some(kw => lower.includes(kw))) continue

      vrDevicesOnUsb.push(dev.name)
      // The hardware ID prefix tells us SuperSpeed vs full-speed: USB\VID
      // is generic; USB devices on xHCI ports typically also expose a
      // ContainerID and BusReportedDeviceDesc, but those don't carry speed
      // either. Use the parent controller's Service to infer.
      if (lower.includes('usb 3') || /(?:^|\W)ss(?:\W|$)/.test(dev.hardwareId.toLowerCase())) {
        headsetUsbGeneration = '3.0'
      } else if (!headsetUsbGeneration) {
        headsetUsbGeneration = '2.0'
      }
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
        genericControllerCount,
      }
    }
  } catch (error) {
    console.error(`[scan:usb] Error: ${(error as Error).message}`)
    return {
      success: false,
      error: (error as Error).message,
      partial: true,
      data: { controllers, headsetUsbGeneration, vrDevicesOnUsb, genericControllerCount },
    }
  }
}
