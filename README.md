# Vryionics VR Optimization Suite

> Diagnose, explain, and fix VR performance bottlenecks on Windows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078d4)](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases)
[![Built with: Electron + React + TypeScript](https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20TypeScript-9b7aff)](#built-with)
[![Latest Release](https://img.shields.io/github/v/release/Vryionics/Vryionics-VR-Optimization-Suite)](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases/latest)

Vryionics VR Optimization Suite (VROS) scans your Windows PC for the configuration issues that hurt VR performance, explains every finding in both plain English and technical detail, and offers reversible one-click fixes. It's built specifically for VR — every rule and recommendation is informed by VR-specific bottleneck patterns (CPU-bound social VR, GPU-bound flight sims, wireless streaming jitter, etc.) rather than generic "system optimizer" snake-oil.

## What it does

| Surface | Purpose |
|---|---|
| **Full system scan** | Inventories your CPU, GPU, RAM, storage, network, VR runtime (SteamVR / Oculus / Virtual Desktop / ALVR), Windows configuration, drivers, and running processes |
| **Action Plan** | Ranks every detected issue by VR-impact and offers a preview-then-apply fix flow with automatic System Restore Points before any registry change |
| **Live Optimizer** | Auto-detects when you launch a VR session (SteamVR, Oculus, VRChat, Virtual Desktop, ALVR) and temporarily throttles background processes for the duration. Restores everything when VR ends |
| **Drivers** | Checks NVIDIA / AMD / Intel vendor pages for the latest drivers matching your GPU and shows what's outdated. One-click vendor-page open or (where safe) silent install with signature verification |
| **VR Sessions** | Records CPU, GPU temperature, GPU power, and RAM at 1 Hz throughout every VR session so you can scrub the timeline later and see exactly when stutter happened |
| **VRChat Tuning** | Dedicated page for VRChat-specific optimizations including Steam launch-option pinning to 3D V-Cache cores on AMD X3D CPUs |
| **Storage Cleanup** | Categorized cache cleanup (Windows temp, browser caches, GPU shader caches, VRChat asset cache, etc.) with size previews |
| **Reports + Compare** | Saves every scan; diff any two side-by-side to see what changed when |

## Installing

Download the latest installer from the [Releases](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases/latest) page.

The installer is **unsigned** (we're a small open-source project; code-signing certificates cost real money). Windows SmartScreen will show a warning the first time you run it — click "More info" → "Run anyway." You can verify the installer's SHA-256 against the value posted in the release notes if you want to confirm authenticity.

### Antivirus false positives

Some heuristic AV engines occasionally flag the installer because VROS does things that overlap with credential-stealing malware patterns: enumerates running processes, queries hardware via WMI, makes network requests, etc. **None of this is unique to malware** — every legitimate system-monitoring tool does the same things — but unsigned binaries score higher on heuristic engines.

If your AV flags VROS, you can:

1. **Verify on VirusTotal** — current detection ratio is typically 0–1 / 67 vendors
2. **Read [TRANSPARENCY.md](TRANSPARENCY.md)** for a complete inventory of every system call, network endpoint, and registry key VROS touches
3. **Build from source** to verify the binary you'd be running matches the published code (instructions below)
4. **Submit a false-positive report** to your AV vendor — we maintain template text in [TRANSPARENCY.md](TRANSPARENCY.md#submitting-fp-reports)

## Privacy

VROS runs entirely locally. **No telemetry, no analytics, no automatic data transmission.** The only network requests it makes are:

- Fetching the latest GitHub release for the auto-updater (every 2 minutes)
- Querying NVIDIA / AMD / Intel public driver pages (every 24 hours)
- Opening a pre-filled GitHub Issue when you click "Open Issue on GitHub" in Settings → Bug Report — the report goes through GitHub Issues using your own GitHub account; no third-party endpoints involved

Full data inventory in [PRIVACY.md](PRIVACY.md).

## Building from source

```bash
git clone https://github.com/Vryionics/Vryionics-VR-Optimization-Suite.git
cd Vryionics-VR-Optimization-Suite
npm install
npm run dev          # development build with hot reload
npm run build:win    # production NSIS installer in dist/
```

Requires Node 20+ and Windows 10 or 11.

## Built with

- [Electron](https://www.electronjs.org/) — cross-process desktop app shell (we only target Windows)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — renderer UI
- [Zustand](https://github.com/pmndrs/zustand) — renderer state
- [electron-vite](https://electron-vite.org/) — build pipeline
- [electron-builder](https://www.electron.build/) — installer packaging
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [electron-store](https://github.com/sindresorhus/electron-store) — local persistence

No telemetry SDKs, no third-party analytics, no remote-loaded code.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contributions right now:

- **Hardware database expansions** — add new CPUs / GPUs / chipsets / Wi-Fi adapters to `src/main/data/*.ts`
- **Game profile additions** — add VR titles to `src/main/data/game-profile-database.ts`
- **Headset profile JSON** — add new headsets to `src/main/headsets/profiles/`
- **Rule additions** — write new diagnostic rules under `src/main/rules/rules/`
- **Translations** — currently English-only; localization would be welcome

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md) — please disclose privately rather than via public issues.

## License & trademarks

The **code** is licensed under MIT — see [LICENSE](LICENSE). Use it however you want; just don't blame us if your registry edit goes sideways.

The **name "Vryionics" and the project's logo / visual identity** are trademarks. You can fork the code freely; you can't ship your fork *as* Vryionics. See [TRADEMARKS.md](TRADEMARKS.md) for the specifics — TL;DR: rename your fork, swap the icon, you're good.

---

*Vryionics VR Optimization Suite is not affiliated with or endorsed by Valve, Meta, HTC, Pimax, Sony, ByteDance/Pico, or any VR hardware or software vendor. All trademarks remain the property of their respective owners.*
