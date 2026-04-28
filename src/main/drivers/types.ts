// Vryionics VR Optimization Suite — Driver Updater Types
//
// Shared types for the driver-freshness checker + updater. Categorises
// each detected driver by bricking risk so the UI can present a two-tier
// experience: "Update" (silent) for low-risk drivers, "Open download"
// (guided) for higher-risk ones where a failed install could leave the
// user without Windows or without internet access.

export type DriverVendor =
  | 'NVIDIA'
  | 'AMD'
  | 'Intel'
  | 'Realtek'
  | 'Qualcomm'
  | 'MediaTek'
  | 'Microsoft'
  | 'Unknown'

/**
 * Hardware category this driver covers. Used to decide install tier:
 *   • auto-safe:    GPU, USB controllers, audio codecs
 *   • guided-only:  Chipset, storage, Wi-Fi, Bluetooth, Ethernet
 *   • never:        BIOS/UEFI, EC firmware, TPM, CPU microcode
 */
export type DriverCategory =
  | 'gpu'
  | 'chipset'
  | 'usb'
  | 'audio'
  | 'ethernet'
  | 'wifi'
  | 'bluetooth'
  | 'storage'
  | 'unknown'

/** How we'll deliver the update when the user clicks its row. */
export type InstallMode = 'auto' | 'guided'

/** Freshness state derived from age of installed version vs. vendor-latest. */
export type FreshnessState =
  | 'current'            // within 30 days of latest
  | 'warning'            // 31–90 days old
  | 'outdated'           // 90+ days old
  | 'not-yet-supported'  // we don't have a vendor source for this category yet
  | 'unknown'            // we should be able to check but something failed

export interface InstalledDriver {
  /** Stable ID derived from hardware (e.g. "nvidia-rtx-4080"). */
  id: string
  vendor: DriverVendor
  category: DriverCategory
  /** Human-readable hardware name, e.g. "NVIDIA GeForce RTX 4080 SUPER". */
  hardwareName: string
  /** Installed driver version string as reported by Windows. */
  installedVersion: string
  /** ISO date string of the installed driver, if Windows reports it. */
  installedDate?: string
}

export interface LatestAvailable {
  /** Version string published by the vendor. */
  version: string
  /** ISO date string of publication. */
  releaseDate?: string
  /** URL to download the driver installer .exe. */
  downloadUrl?: string
  /** SHA-256 of the installer (when vendor publishes it). */
  sha256?: string
  /** Where this info came from — for debugging. */
  source: 'vendor-endpoint' | 'static-fallback'
  /** Release notes URL, if available. */
  releaseNotesUrl?: string
  /**
   * False when `downloadUrl` points to an HTML support page rather than a
   * direct .exe — silent install would fail the size check. Forces the UI
   * to show "Open vendor page" (guided) instead of "Update" (silent),
   * regardless of the row's category install tier.
   *
   * Defaults to true when omitted (existing live-fetched installers).
   */
  installable?: boolean
}

export interface DriverRow {
  hardware: InstalledDriver
  latest: LatestAvailable | null
  freshness: FreshnessState
  /**
   * Install mode for THIS driver. Normally derived from category, but:
   *   • laptops ALWAYS get guided-only regardless of category
   *   • user's Settings toggle can force everything to guided-only
   */
  installMode: InstallMode
  /** Set when the freshness check failed for this row (endpoint down etc). */
  checkError?: string
  /** When this row was last refreshed. */
  checkedAt: number
}

/**
 * Authenticode publisher names we'll accept on downloaded installers.
 * Anything else gets refused — even if the cert is valid, we won't run it.
 */
export const TRUSTED_PUBLISHERS: Record<DriverVendor, string[]> = {
  NVIDIA: ['NVIDIA Corporation'],
  AMD: ['Advanced Micro Devices, Inc.'],
  Intel: ['Intel Corporation', 'Intel(R) Software Development Products'],
  Realtek: ['Realtek Semiconductor Corp.', 'Realtek Semiconductor Corporation'],
  Qualcomm: ['Qualcomm Technologies, Inc.', 'Qualcomm Atheros'],
  MediaTek: ['MediaTek Inc.'],
  Microsoft: ['Microsoft Corporation', 'Microsoft Windows'],
  Unknown: [],
}

/**
 * Which categories are safe to silent-install on desktop (not laptop).
 * Everything else falls through to guided-only.
 *
 * User decision (v0.1.7): GPU / USB / audio only. Wi-Fi, Bluetooth, Ethernet,
 * chipset, storage all stay guided — a failed network driver install leaves
 * the user without connectivity to download a fix.
 */
export const AUTO_SAFE_CATEGORIES: DriverCategory[] = ['gpu', 'usb', 'audio']

export function defaultInstallModeFor(category: DriverCategory, isLaptop: boolean): InstallMode {
  if (isLaptop) return 'guided'
  return AUTO_SAFE_CATEGORIES.includes(category) ? 'auto' : 'guided'
}
