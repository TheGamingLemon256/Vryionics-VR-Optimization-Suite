// Vryionics VR Optimization Suite — Intel-Specific CPU Rules
//
// Rules that fire for Intel CPUs based on the CPU_DATABASE entries added
// in Phase-6. Complements cpu-specific.rules.ts (AMD-only AM4/AM5 rules).
//
// Key coverage:
//   • Hybrid scheduling (P-core affinity for VR, E-core routing for background)
//   • Raptor Lake (13/14th gen) Vmin oxidation issue → microcode 0x12B
//   • DDR5 Gear mode detection (Gear 1 vs Gear 2 vs Gear 4) — VR latency critical
//   • Arrow Lake BIOS baseline (early releases had VR regressions)

import type { Rule, RuleResult } from '../types'
import type { ScanData } from '../../scanner/types'
import { findCpuEntry, type HybridTopology } from '../../data/cpu-database'

// ── Helpers ─────────────────────────────────────────────────

/**
 * Return the Intel hybrid topology for the detected CPU, or null when the
 * CPU isn't in the database or isn't a hybrid chip.
 */
function getHybrid(data: ScanData): { hybrid: HybridTopology; model: string; codename: string } | null {
  if (!data.cpu) return null
  const entry = findCpuEntry(data.cpu.model)
  if (!entry || entry.vendor !== 'Intel' || !entry.hybrid) return null
  return { hybrid: entry.hybrid, model: data.cpu.model, codename: entry.codename }
}

// ── Rule: Intel Hybrid — VR Needs P-Core Affinity ───────────
//
// Any 12th-gen+ Intel with E-cores benefits from pinning VR runtime and
// VR game processes to P-cores. Windows 11 Thread Director handles this
// in 80% of cases, but VR-specific software (especially older VR runtimes
// and community mods) frequently ignore the hints, and performance tanks
// when vrserver or the VR game ends up on an E-core.

const intelHybridPCoreAffinity: Rule = {
  id: 'intel-hybrid-vr-pcore-affinity',
  category: 'cpu',
  name: 'Intel Hybrid: Pin VR Processes to P-Cores',
  evaluate: (data: ScanData): RuleResult | null => {
    const info = getHybrid(data)
    if (!info) return null
    const { hybrid, model, codename } = info

    // Detect if Windows 11 is installed — if so, Thread Director usually
    // handles this automatically and we downgrade severity.
    const isWin11 = data.osConfig?.windowsBuild && data.osConfig.windowsBuild >= 22000
    const severity: RuleResult['severity'] = isWin11 ? 'info' : 'warning'

    return {
      ruleId: 'intel-hybrid-vr-pcore-affinity',
      severity,
      category: 'cpu',
      explanation: {
        simple:
          `Your ${model} has ${hybrid.pCores} Performance cores and ${hybrid.eCores} Efficient cores. ` +
          `VR runtimes and games should run on the Performance cores — if Windows accidentally puts them on the ` +
          `Efficient cores you'll see huge performance drops. ` +
          (isWin11
            ? `Windows 11 handles this automatically for most apps, but a few VR tools (older SteamVR drivers, ` +
              `custom compositor mods) ignore the hints. If you see stutters, set manual CPU affinity to mask ` +
              `${hybrid.pCoreAffinityMask} for vrserver.exe, vrcompositor.exe, and your VR game.`
            : `You're on Windows 10 which pre-dates Thread Director — manual affinity is essential. ` +
              `Set each VR exe's CPU affinity to mask ${hybrid.pCoreAffinityMask} via Task Manager or Process Lasso.`),
        advanced:
          `CPU: ${model} (${codename})\n` +
          `P-cores: ${hybrid.pCores} @ up to ${hybrid.pCoreMaxGHz} GHz\n` +
          `E-cores: ${hybrid.eCores} @ up to ${hybrid.eCoreMaxGHz} GHz\n` +
          `P-core-only affinity mask: ${hybrid.pCoreAffinityMask}\n` +
          `Windows build: ${data.osConfig?.windowsBuild ?? 'unknown'} ` +
          `(${isWin11 ? 'Win11 — Thread Director supported' : 'Win10 — pre-Thread-Director, manual affinity required'})\n\n` +
          `${hybrid.hybridNote}\n\n` +
          `Critical processes that must run on P-cores:\n` +
          `  • vrserver.exe        (SteamVR)\n` +
          `  • vrcompositor.exe    (SteamVR compositor)\n` +
          `  • OVRServer_x64.exe   (Meta / Oculus PC)\n` +
          `  • Your VR game .exe   (VRChat.exe, BeatSaber.exe, etc.)\n\n` +
          `Manual affinity methods:\n` +
          `  1. Task Manager → Details → right-click process → Set Affinity → select P-core logicals only\n` +
          `  2. Process Lasso (free tier) → create rule to always pin these .exes to mask ${hybrid.pCoreAffinityMask}\n` +
          `  3. Launcher script: 'start /affinity ${hybrid.pCoreAffinityMask} vrserver.exe'\n\n` +
          `Diagnostic: open HWiNFO64 → Per-Core Effective Clock. During VR,\n` +
          `P-core clocks should be near max (${hybrid.pCoreMaxGHz} GHz), E-core clocks should be moderate.\n` +
          `If E-cores are hot and P-cores idle, VR is being mis-routed.`,
      },
    }
  },
}

// ── Rule: Raptor Lake 13/14th-gen Vmin Oxidation Risk ───────

const raptorLakeVminRisk: Rule = {
  id: 'intel-raptor-lake-vmin-microcode',
  category: 'cpu',
  name: 'Raptor Lake (13/14th Gen): Apply 0x12B Microcode',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu) return null
    const entry = findCpuEntry(data.cpu.model)
    if (!entry || entry.vendor !== 'Intel') return null
    // Only Raptor Lake 13th gen and 14th gen refresh are affected —
    // not Alder Lake (12th), not Arrow Lake (Core Ultra), not mobile H-series.
    const isAffectedCodename =
      entry.codename === 'Raptor Lake' || entry.codename === 'Raptor Lake Refresh'
    if (!isAffectedCodename) return null
    // Mobile H-class skip — the Vmin issue primarily affected desktop K-class
    // silicon. Mobile is less exposed due to lower sustained voltage.
    const isMobile = entry.codename.toLowerCase().includes('mobile') ||
                     entry.codename.toLowerCase().includes('-hx') ||
                     entry.codename.toLowerCase().includes('-h ')
    if (isMobile) return null

    // Severity: warning because this is preventative, not currently-broken
    return {
      ruleId: 'intel-raptor-lake-vmin-microcode',
      severity: 'warning',
      category: 'cpu',
      explanation: {
        simple:
          `Your ${data.cpu.model} (${entry.codename}) is from the Intel 13/14th gen Raptor Lake family. ` +
          `These chips had a documented oxidation / Vmin-shift issue affecting stability after ~6+ months of use. ` +
          `Intel released microcode 0x12B via BIOS update (August 2024) that prevents further degradation by ` +
          `capping voltage more conservatively. If your BIOS is older than this, update it — it's the single most ` +
          `important maintenance task for these CPUs.`,
        advanced:
          `CPU: ${data.cpu.model} (${entry.codename})\n\n` +
          `The issue:\n` +
          `  Intel 13th and 14th gen K/KF-class silicon experienced a Vmin shift over time when exposed to\n` +
          `  sustained high voltages (>1.5V Vcore during boost). The shift manifested as:\n` +
          `  - Random crashes under load (including VR sessions)\n` +
          `  - Gradually increasing voltage required for stable boost\n` +
          `  - In extreme cases, CPU becoming unstable at stock settings\n\n` +
          `The fix:\n` +
          `  Microcode 0x12B (shipped via motherboard vendor BIOS updates from mid-2024 onwards)\n` +
          `  implements stricter voltage limits via the Intel Default Settings profile. Applying it:\n` +
          `  - Prevents further Vmin degradation\n` +
          `  - Can't reverse existing damage (already-affected chips may still show instability)\n\n` +
          `How to check / apply:\n` +
          `  1. Download the latest BIOS from your motherboard vendor (Asus/MSI/Gigabyte/ASRock)\n` +
          `  2. Release notes should explicitly mention 0x12B microcode or "Intel Default Settings"\n` +
          `  3. After flashing, enter BIOS → load "Intel Default" power profile\n` +
          `  4. PL1 should be capped at 125W (K/KF non-S) or the Intel "Performance" profile value\n\n` +
          `VR-specific impact:\n` +
          `  Long VR sessions (2+ hours) with high sustained CPU load (VRChat populated worlds, MSFS) are\n` +
          `  the most common trigger for Vmin-shift symptoms. If you already experience crashes in these\n` +
          `  scenarios, 0x12B microcode is critical.\n\n` +
          `Intel RMA policy: Intel extended the warranty on affected 13/14th-gen CPUs to 5 years.\n` +
          `If post-microcode you still see instability, initiate an RMA through Intel support.`,
      },
    }
  },
}

// ── Rule: Arrow Lake — Verify Post-Launch BIOS ──────────────

const arrowLakeBiosBaseline: Rule = {
  id: 'intel-arrow-lake-bios-baseline',
  category: 'cpu',
  name: 'Arrow Lake (Core Ultra 2): Verify Post-Jan 2025 BIOS',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu) return null
    const entry = findCpuEntry(data.cpu.model)
    if (!entry || entry.vendor !== 'Intel' || entry.codename !== 'Arrow Lake') return null

    return {
      ruleId: 'intel-arrow-lake-bios-baseline',
      severity: 'info',
      category: 'cpu',
      explanation: {
        simple:
          `Your ${data.cpu.model} is an Arrow Lake (Core Ultra Series 2) CPU. Launch BIOS (Oct 2024-Dec 2024) ` +
          `had documented VR performance regressions — Thread Director wasn't routing workloads correctly under ` +
          `Windows 11. Intel + Microsoft fixed this via BIOS updates and the Jan 2025 Windows 11 24H2 KB update. ` +
          `If your BIOS is from before Feb 2025, update it — you're likely leaving 5-10% VR performance on the table.`,
        advanced:
          `CPU: ${data.cpu.model} (Arrow Lake)\n\n` +
          `Launch-era issues (Oct 2024 - Jan 2025):\n` +
          `  - Thread Director mis-routing VR workloads (to E-cores)\n` +
          `  - Memory training failures above DDR5-6000\n` +
          `  - L2 cache sub-timings incorrectly set by several motherboard vendors\n\n` +
          `Fixes:\n` +
          `  - Motherboard BIOS updates from Feb 2025+ apply Intel's corrected microcode and P-core fabric settings\n` +
          `  - Windows 11 24H2 KB5050094 (Jan 14, 2025) reworked Thread Director hints for Arrow Lake\n\n` +
          `To verify:\n` +
          `  1. BIOS version: check vendor site for latest; most Z890 boards had a major VR-relevant BIOS in Feb-Mar 2025\n` +
          `  2. Windows: ensure you're on 24H2 with Jan 2025 or later cumulative updates\n` +
          `  3. Memory: DDR5-6400 CL32 should train cleanly on updated BIOS; older BIOS needs manual tuning\n\n` +
          `No security / stability risk like Raptor Lake's oxidation — Arrow Lake is architecturally different.\n` +
          `This is purely a performance / tuning issue. Still worth updating for the 5-10% VR gain.`,
      },
    }
  },
}

// ── Rule: Laptop — Thermal / Battery Advisory ───────────────
//
// Triggers when a laptop CPU is detected and the user is on battery or
// the PC type is known to be a laptop (from the wizard).

const laptopThermalAdvisory: Rule = {
  id: 'laptop-vr-thermal-advisory',
  category: 'cpu',
  name: 'Laptop VR: Thermal Throttling & dGPU Routing',
  evaluate: (data: ScanData): RuleResult | null => {
    if (!data.cpu) return null
    const entry = findCpuEntry(data.cpu.model)
    if (!entry) return null

    // Detect laptop from codename OR from user setup OR from compat scan
    const codenameIndicatesLaptop =
      entry.codename.toLowerCase().includes('mobile') ||
      entry.codename.toLowerCase().includes('phoenix') ||
      entry.codename.toLowerCase().includes('dragon range') ||
      entry.codename.toLowerCase().includes('strix point') ||
      entry.codename.toLowerCase().includes('meteor lake')
    const userSaidLaptop = data.userSetup?.pcType === 'laptop'
    const compatSaidLaptop = data.compat?.isLaptop === true
    if (!codenameIndicatesLaptop && !userSaidLaptop && !compatSaidLaptop) return null

    return {
      ruleId: 'laptop-vr-thermal-advisory',
      severity: 'warning',
      category: 'cpu',
      explanation: {
        simple:
          `You're running VR on a laptop. Laptops throttle much harder than desktops during sustained VR sessions — ` +
          `typical 10-30% performance loss after 10-15 minutes once thermals catch up. For the best experience: ` +
          `plug into AC power (battery severely caps performance), ensure VR apps are routed to the dedicated GPU ` +
          `(not the integrated GPU), use a cooling pad or laptop stand for airflow, and take breaks to let the chassis cool.`,
        advanced:
          `Detected laptop CPU: ${data.cpu.model} (${entry.codename})\n` +
          (entry.hybrid ? `Hybrid: ${entry.hybrid.pCores}P + ${entry.hybrid.eCores}E\n` : '') +
          `\nLaptop-specific VR concerns:\n` +
          `  1. Thermal throttling — laptop chassis cooling is limited vs desktop by 2-4× in sustained wattage.\n` +
          `     VR sessions >20 min will hit thermal caps on most designs. Measured perf drop: 10-30%.\n\n` +
          `  2. Hybrid GPU routing — Windows defaults may push VR apps to the integrated GPU.\n` +
          `     Verify in Settings → System → Display → Graphics → add each VR .exe → set "High performance":\n` +
          `       • vrserver.exe, vrcompositor.exe, OVRServer_x64.exe\n` +
          `       • VirtualDesktop.Streamer.exe (if using VD)\n` +
          `       • Your VR game .exe\n` +
          `     NVIDIA: also set NVIDIA Control Panel → 3D Settings → Program Settings for each.\n` +
          `     AMD: Radeon Settings → Graphics → per-app Switchable Graphics → "High performance".\n\n` +
          `  3. Battery vs AC — most laptops cap CPU + dGPU power on battery.\n` +
          `     Target mode: AC connected, "Best Performance" power slider, OEM utility (ROG Armoury, MSI Center,\n` +
          `     Razer Synapse) set to Performance / Turbo profile.\n\n` +
          `  4. Undervolting — Intel 13/14th-gen laptops have undervolting disabled (plundervolt mitigation).\n` +
          `     ThrottleStop / XTU can adjust power limits but not voltage on these chips.\n\n` +
          `  5. Chassis class matters — for VR-primary use, prioritize vapor-chamber or triple-fan designs\n` +
          `     (MSI Titan/GT, ROG Strix Scar, Razer Blade 18, Legion 9i). Thin-and-light gaming laptops\n` +
          `     (Zephyrus G14, Blade 14, Legion 5) will throttle earlier.\n\n` +
          `External cooling pad with high CFM fans can extend sustained boost by 5-10%.`,
      },
    }
  },
}

// ── Export ──────────────────────────────────────────────────

export const cpuIntelRules: Rule[] = [
  intelHybridPCoreAffinity,
  raptorLakeVminRisk,
  arrowLakeBiosBaseline,
  laptopThermalAdvisory,
]
