// VR Optimization Suite — Storage Diagnostic Rules

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'

export const storageRules: Rule[] = [
  {
    id: 'storage-vr-on-hdd',
    category: 'storage',
    name: 'VR Installed on HDD',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const vrDrive = data.storage.vrInstallDrive
      if (!vrDrive) return null
      const drive = data.storage.drives.find((d) => d.letter.startsWith(vrDrive))
      if (!drive || drive.type !== 'HDD') return null
      return {
        ruleId: 'storage-vr-on-hdd',
        severity: 'critical',
        category: 'storage',
        explanation: {
          simple: 'Your VR games are installed on a traditional spinning hard drive (HDD), which is much too slow for VR. Loading new areas or assets can cause multi-second freezes. Move SteamVR and VRChat to an SSD.',
          advanced: `VRChat/SteamVR detected on drive ${vrDrive} (HDD). Average HDD seek time: 5-12ms. Average SSD: 0.1ms. NVMe SSD: <0.02ms. In VRC, avatar bundle loading is a significant source of hitches — on HDD, this takes 10-60 seconds vs 1-5 seconds on SSD. Move Steam library to an NVMe/SSD drive via Steam → Settings → Storage.`
        }
      }
    }
  },
  {
    id: 'storage-vr-drive-full',
    category: 'storage',
    name: 'VR Drive Low on Space',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const vrDrive = data.storage.vrInstallDrive
      const drives = vrDrive
        ? data.storage.drives.filter((d) => d.letter.startsWith(vrDrive))
        : data.storage.drives
      for (const drive of drives) {
        if (drive.totalGB === 0) continue
        const freePercent = (drive.freeGB / drive.totalGB) * 100
        if (freePercent >= 10) continue
        return {
          ruleId: 'storage-vr-drive-full',
          severity: freePercent < 5 ? 'critical' : 'warning',
          category: 'storage',
          explanation: {
            simple: `Drive ${drive.letter} only has ${drive.freeGB.toFixed(1)}GB free (${freePercent.toFixed(0)}%). When drives get full, VR worlds take longer to load and Windows can\'t use the drive for temporary swap space. Clear some space — start with the VRChat cache.`,
            advanced: `Drive ${drive.letter}: ${drive.freeGB.toFixed(1)}GB free / ${drive.totalGB.toFixed(1)}GB total (${freePercent.toFixed(1)}% free). Windows requires ~10-15% free space for optimal NTFS performance (fragmentation reduction, pagefile operations). VRChat cache alone can grow to 20GB+. Clear shader cache (${data.storage.shaderCacheSizeMB}MB) and VRChat cache (${data.storage.vrchatCacheSizeGB}GB) to recover space.`
          }
        }
      }
      return null
    }
  },
  {
    id: 'storage-shader-cache-large',
    category: 'storage',
    name: 'Large Shader Cache',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      if (data.storage.shaderCacheSizeMB < 5000) return null
      return {
        ruleId: 'storage-shader-cache-large',
        severity: 'info',
        category: 'storage',
        explanation: {
          simple: `Your shader cache is ${(data.storage.shaderCacheSizeMB / 1024).toFixed(1)}GB. While it speeds up game loading, an oversized cache can slow things down when it gets corrupted. If you\'re experiencing loading hitches, clearing it is worth trying.`,
          advanced: `Shader cache size: ${data.storage.shaderCacheSizeMB}MB across NVIDIA DxCache, AMD cache, D3DSCache, and VRChat ShaderCache. Large caches increase cache-miss search time and can contain stale entries that cause shader recompilation stutters. Clear via: NVIDIA Control Panel → Help → Debug → Flush Shader Cache, or manually delete %LOCALAPPDATA%\\NVIDIA\\DXCache. Steam also has a "Clear Shader Cache" option.`
        }
      }
    }
  },
  {
    id: 'nvme-power-saving-active',
    category: 'storage',
    name: 'NVMe Drive Power Saving Active',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      const affectedDrives = data.storage.drives.filter(
        (d) => d.type === 'NVMe' && d.nvmePowerStateOptimal === false
      )
      if (affectedDrives.length === 0) return null
      return {
        ruleId: 'nvme-power-saving-active',
        severity: 'warning',
        category: 'storage',
        explanation: {
          simple: `NVMe power saving is active on ${affectedDrives.map((d) => d.letter + ':').join(', ')}. When an NVMe drive wakes from a low-power state, it can take 10-100ms — causing a random stutter when VRChat loads a new asset.`,
          advanced: 'NVMe APST (Autonomous Power State Transition) and Windows StorPort idle power management allow the NVMe controller to enter low-power sleep states when idle. Wake latency ranges from 10ms (PS3) to 100ms+ (PS4) depending on the drive. During active VR sessions, asset streaming (VRChat worlds, avatar bundles) causes burst storage access — if the drive is asleep, the first access stalls while waiting for wake. Disabling StorPort idle PM keeps the drive awake during active sessions.'
        }
      }
    }
  },
  {
    id: 'storage-vrchat-cache-large',
    category: 'storage',
    name: 'VRChat Cache Very Large',
    evaluate: (data: ScanData): RuleResult | null => {
      if (!data.storage) return null
      if (data.storage.vrchatCacheSizeGB < 15) return null
      return {
        ruleId: 'storage-vrchat-cache-large',
        severity: 'info',
        category: 'storage',
        fixId: 'fix-vrchat-cache-size',
        explanation: {
          simple: `Your VRChat cache is ${data.storage.vrchatCacheSizeGB.toFixed(1)}GB. VRChat stores all downloaded avatars and worlds here. A very large cache means VRChat has to search through more files when loading, which can slow things down. Consider clearing old cache entries.`,
          advanced: `VRChat LocalLow cache: ${data.storage.vrchatCacheSizeGB.toFixed(1)}GB. VRC's LRU cache stores compressed avatar/world bundles. At this size, cache indexing overhead may increase load times marginally. Clear via VRChat settings → Performance → Cache Management → Clear Caches. Note: clearing forces re-downloading all avatars/worlds on next visit.`
        }
      }
    }
  }
]
