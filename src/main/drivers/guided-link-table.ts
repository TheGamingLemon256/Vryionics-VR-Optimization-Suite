// Vryionics VR Optimization Suite — Guided Driver Link Table
//
// Static mapping from (category + vendor + hardware-name-pattern) → the
// vendor's canonical "latest driver" page. Used as a fallback when we
// don't have a live version-check source for a given driver — the UI
// still gets an "Open download" button that sends the user to the right
// place to manually grab the latest driver.
//
// Entries are ordered specific → generic. The first regex that matches
// the hardware name wins, so narrow patterns (e.g. "Intel Wi-Fi 6E AX210")
// should come before broad ones (e.g. "Intel Wi-Fi").
//
// Every URL here is a public vendor support or Microsoft Update Catalog
// page — no third-party aggregators, no driver-pack sites.

import type { DriverCategory, DriverVendor } from './types'

export interface GuidedLinkEntry {
  /** Human-readable label shown on hover / in logs. */
  label: string
  /** Vendor's download / support page. */
  url: string
}

interface TableEntry {
  category: DriverCategory
  vendor?: DriverVendor
  /** Regex tested against the installed-driver hardware name. */
  match: RegExp
  link: GuidedLinkEntry
}

const TABLE: TableEntry[] = [
  // ── Chipset ─────────────────────────────────────────────────
  {
    category: 'chipset', vendor: 'AMD', match: /.*/,
    link: {
      label: 'AMD Chipset Drivers',
      url: 'https://www.amd.com/en/support/chipsets',
    },
  },
  {
    category: 'chipset', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel Chipset INF Utility',
      url: 'https://www.intel.com/content/www/us/en/download/19347/intel-chipset-device-software-inf-update-utility.html',
    },
  },

  // ── USB Controllers ─────────────────────────────────────────
  {
    category: 'usb', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel USB 3.x eXtensible Host Controller Driver',
      url: 'https://www.intel.com/content/www/us/en/download/19346/intel-usb-3-0-extensible-host-controller-driver-for-intel-8-9-100-series-and-intel-c220-c610-chipset-family.html',
    },
  },
  {
    category: 'usb', vendor: 'AMD', match: /.*/,
    link: {
      label: 'AMD Chipset Drivers (USB host + controller)',
      url: 'https://www.amd.com/en/support/chipsets',
    },
  },
  {
    category: 'usb', match: /asmedia|as\s*media/i,
    link: {
      label: 'ASMedia USB Drivers',
      url: 'https://www.asmedia.com.tw/product/usb',
    },
  },
  {
    category: 'usb', match: /via\s*labs|via\s*technologies/i,
    link: {
      label: 'VIA Labs USB Drivers',
      url: 'https://www.via-labs.com/downloads.php',
    },
  },
  {
    category: 'usb', match: /renesas|\bupd72\d{3}/i,
    link: {
      label: 'Renesas Electronics USB 3.0 Host Driver (via motherboard vendor)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Renesas+USB+3.0',
    },
  },
  {
    category: 'usb', match: /.*/,
    link: {
      label: 'Windows Update Catalog (USB controllers)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=USB+Host+Controller',
    },
  },

  // ── Audio ───────────────────────────────────────────────────
  {
    category: 'audio', match: /realtek/i,
    link: {
      label: 'Realtek High-Definition Audio (Microsoft Update Catalog)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Realtek+High+Definition+Audio',
    },
  },
  {
    category: 'audio', vendor: 'Intel', match: /smart\s*sound|sst/i,
    link: {
      label: 'Intel Smart Sound Technology Driver',
      url: 'https://www.intel.com/content/www/us/en/search.html?ws=text#q=smart+sound+technology+driver&sort=relevancy&f:@tabfilter=[Downloads]',
    },
  },
  {
    category: 'audio', vendor: 'NVIDIA', match: /high\s*definition|hdmi/i,
    link: {
      label: 'NVIDIA HD Audio (shipped with GeForce driver)',
      url: 'https://www.nvidia.com/Download/index.aspx',
    },
  },
  {
    category: 'audio', match: /.*/,
    link: {
      label: 'Windows Update Catalog (Audio)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Audio+Driver',
    },
  },

  // ── Ethernet ────────────────────────────────────────────────
  {
    category: 'ethernet', vendor: 'Intel', match: /i2[235]\d|i3\d{2}|i21\d|i210|82\d{3}/i,
    link: {
      label: 'Intel Ethernet Network Adapter Drivers',
      url: 'https://www.intel.com/content/www/us/en/download/15084/intel-ethernet-adapter-complete-driver-pack.html',
    },
  },
  {
    category: 'ethernet', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel Ethernet Driver Search',
      url: 'https://www.intel.com/content/www/us/en/download-center/home.html',
    },
  },
  {
    category: 'ethernet', match: /realtek|rtl\s*81/i,
    link: {
      label: 'Realtek PCIe GbE Family Controller',
      url: 'https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software',
    },
  },
  {
    category: 'ethernet', match: /killer/i,
    link: {
      label: 'Killer Control Center (via Rivet/Intel)',
      url: 'https://www.intel.com/content/www/us/en/download/19351/intel-killer-performance-suite.html',
    },
  },
  {
    category: 'ethernet', match: /.*/,
    link: {
      label: 'Windows Update Catalog (Ethernet)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Ethernet+Driver',
    },
  },

  // ── Wi-Fi ───────────────────────────────────────────────────
  {
    category: 'wifi', vendor: 'Intel', match: /be\s*20\d|ax21\d|ax20\d|ax41\d|ax16\d|wi-?fi\s*[67]/i,
    link: {
      label: 'Intel Wi-Fi Drivers for Windows 10/11',
      url: 'https://www.intel.com/content/www/us/en/download/19351/intel-wi-fi-drivers-for-wi-fi-6-7-adapters.html',
    },
  },
  {
    category: 'wifi', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel PROSet/Wireless Software',
      url: 'https://www.intel.com/content/www/us/en/download/17889/intel-proset-wireless-software-and-drivers-for-windows-11.html',
    },
  },
  {
    category: 'wifi', vendor: 'Qualcomm', match: /.*/,
    link: {
      label: 'Qualcomm Atheros Wi-Fi Drivers (via OEM)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Qualcomm+Atheros+Wireless',
    },
  },
  {
    category: 'wifi', vendor: 'MediaTek', match: /.*/,
    link: {
      label: 'MediaTek Wi-Fi Drivers (via OEM)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=MediaTek+Wireless',
    },
  },
  {
    category: 'wifi', match: /realtek|rtl/i,
    link: {
      label: 'Realtek Wi-Fi Drivers',
      url: 'https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software',
    },
  },
  {
    category: 'wifi', match: /.*/,
    link: {
      label: 'Windows Update Catalog (Wi-Fi)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Wireless+Network+Adapter',
    },
  },

  // ── Bluetooth ───────────────────────────────────────────────
  {
    category: 'bluetooth', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel Wireless Bluetooth Drivers',
      url: 'https://www.intel.com/content/www/us/en/download/18649/intel-wireless-bluetooth-for-windows-10-and-windows-11.html',
    },
  },
  {
    category: 'bluetooth', match: /realtek/i,
    link: {
      label: 'Realtek Bluetooth Drivers',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Realtek+Bluetooth',
    },
  },
  {
    category: 'bluetooth', vendor: 'Qualcomm', match: /.*/,
    link: {
      label: 'Qualcomm Bluetooth Drivers (via OEM)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Qualcomm+Bluetooth',
    },
  },
  {
    category: 'bluetooth', vendor: 'MediaTek', match: /.*/,
    link: {
      label: 'MediaTek Bluetooth Drivers (via OEM)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=MediaTek+Bluetooth',
    },
  },
  {
    category: 'bluetooth', match: /.*/,
    link: {
      label: 'Windows Update Catalog (Bluetooth)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Bluetooth+Driver',
    },
  },

  // ── Storage / HDC ───────────────────────────────────────────
  {
    category: 'storage', vendor: 'Intel', match: /rapid\s*storage|rst|vmd/i,
    link: {
      label: 'Intel Rapid Storage Technology (RST) / VMD',
      url: 'https://www.intel.com/content/www/us/en/download/19512/intel-rapid-storage-technology-user-interface-and-driver.html',
    },
  },
  {
    category: 'storage', vendor: 'AMD', match: /raid|sata/i,
    link: {
      label: 'AMD RAID / SATA Controller (AMD Chipset package)',
      url: 'https://www.amd.com/en/support/chipsets',
    },
  },
  {
    category: 'storage', match: /samsung.*nvme|samsung\s*(m\.2|ssd)/i,
    link: {
      label: 'Samsung NVMe Driver',
      url: 'https://semiconductor.samsung.com/consumer-storage/support/tools/',
    },
  },
  {
    category: 'storage', match: /.*/,
    link: {
      label: 'Windows Update Catalog (Storage Controllers)',
      url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=Storage+Controller',
    },
  },

  // ── GPU (fallback only — live sources are preferred) ────────
  {
    category: 'gpu', vendor: 'NVIDIA', match: /.*/,
    link: {
      label: 'NVIDIA Driver Downloads',
      url: 'https://www.nvidia.com/Download/index.aspx',
    },
  },
  {
    category: 'gpu', vendor: 'AMD', match: /.*/,
    link: {
      label: 'AMD Driver Downloads',
      url: 'https://www.amd.com/en/support/download/drivers.html',
    },
  },
  {
    category: 'gpu', vendor: 'Intel', match: /.*/,
    link: {
      label: 'Intel Graphics Driver Downloads',
      url: 'https://www.intel.com/content/www/us/en/download-center/home.html',
    },
  },
  {
    category: 'gpu', match: /displaylink/i,
    link: {
      label: 'DisplayLink Drivers',
      url: 'https://www.synaptics.com/products/displaylink-graphics/downloads/windows',
    },
  },
]

/**
 * Find the best guided download link for a given driver.
 * Returns null if nothing matches (very rare — each category ends with a
 * match-anything catch-all entry, guaranteeing a hit for almost every row).
 */
export function lookupGuidedLink(
  category: DriverCategory,
  vendor: DriverVendor,
  hardwareName: string,
): GuidedLinkEntry | null {
  for (const entry of TABLE) {
    if (entry.category !== category) continue
    if (entry.vendor && entry.vendor !== vendor) continue
    if (entry.match.test(hardwareName)) return entry.link
  }
  return null
}
