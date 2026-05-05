# Vryionics VR Optimization Suite

> Scan your Windows PC for VR performance issues and explain what's actually wrong.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078d4)](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases)
[![Built with: Electron + React + TypeScript](https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20TypeScript-9b7aff)](#built-with)
[![Latest Release](https://img.shields.io/github/v/release/Vryionics/Vryionics-VR-Optimization-Suite)](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases/latest)

Vryionics VR Optimization Suite (VOS) is a diagnostic tool. It runs a comprehensive scan of your Windows PC, explains every finding in plain English next to the technical details, and offers a small, reversible set of auto-fixes for the things that are genuinely safe to change automatically. Everything else is detected and explained, but you make the change yourself if you decide to.

## What's in v0.2.9

v0.2.9 is the safe-by-default release. The diagnostic surface stays comprehensive. The auto-fix surface narrowed to a small set of app-scoped reversible changes after a public audit and community feedback. Aggressive Windows tweaks were removed entirely.

See the [CHANGELOG](CHANGELOG.md) for the full list of removals, demotions, bug fixes, and architecture changes.

## Heads up: this project is AI-assisted

I'm a solo dev and I built VOS with heavy use of an AI coding assistant (Claude). The diagnostic rules, fix logic, UI, and most of the code comments were written or co-written with AI, then reviewed, tested, and refined by me. The choice of *what* to build, the VR-specific knowledge that shapes the rules, the hardware database, and every fix that ships are mine, but the prose around them was very often drafted by a model.

I'm calling this out because:

- **You deserve to know** what you're running. If "vibe-coded with an LLM" is a dealbreaker, this isn't the project for you, and that's a fair call.
- **Bugs from AI assistance are still my bugs.** If something breaks your config, that's on me to fix, not on the model. File an issue.
- **Some copy will read AI-flavoured.** I'm working on cleaning the most LLM-sounding stuff up over time. If you spot something that's flat-out wrong (like a dated reference), please open an issue. That's exactly how the avatar-physics rule got fixed.

The codebase is fully open under MIT. Read the source, audit any fix before you apply it, build it yourself if you don't trust the binary. I'd rather you do that than take my word for it.

## What it does

VOS does two things: it tells you what's going on with your system, and it changes a small number of things for you when you ask it to.

**Detection (everything).** A full scan inventories your CPU, GPU, RAM, storage, network, VR runtime (SteamVR, Oculus, Virtual Desktop, ALVR), Windows configuration, drivers, and running processes. Every finding gets ranked by VR impact, with a plain-English explanation alongside the technical detail. This includes things VOS will not change for you (Hyper-V/VBS, Windows Update deferral, MSI mode, ASPM, HAGS, power plan, Nagle, Wi-Fi power saving). The scan still detects them, explains the trade-off, and leaves the decision to you. There is no Apply button on those.

**Auto-fixes (narrow, reversible, app-scoped).** What VOS will change automatically:

- VRChat config tweaks
- Steam launch options for VR titles, including a per-CPU `/affinity` mask computed from the topology database for AMD X3D parts
- GPU driver checks against NVIDIA / AMD / Intel vendor pages, with one-click vendor-page open or signature-verified install where it's safe
- Live Optimizer (off by default, opt-in) which lowers the priority of background processes during a VR session and restores them when VR ends

That's it. No HKLM writes, no service stops, no registry tweaks dressed up as "optimizations." The reasoning is in the [CHANGELOG](CHANGELOG.md) under v0.2.9.

VOS still records CPU, GPU temperature, GPU power, and RAM at 1 Hz during every VR session so you can scrub the timeline later and see when stutter happened. It still keeps every scan and lets you diff any two reports. Storage Cleanup still groups Windows temp, browser caches, GPU shader caches, and VRChat asset cache with size previews before you delete anything.

## Installing

Download the latest installer from the [Releases](https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases/latest) page.

The installer is **unsigned**. Code-signing certificates cost real money and this is a small open-source project. Windows SmartScreen will show a warning the first time you run it. Click "More info," then "Run anyway." Each release page publishes both a SHA-512 (the hash electron-builder emits in `latest.yml`) and a SHA-256 (handy for VirusTotal lookups) — verify the installer against either before you run it if you want to confirm authenticity.

As of v0.2.9, the installer and the app run as the standard user. No admin elevation is required to install or to use VOS.

### Antivirus false positives

Some heuristic AV engines occasionally flag the installer because VOS does things that overlap with credential-stealing malware patterns: enumerates running processes, reads hardware identifiers, makes network requests, and so on. None of this is unique to malware. Every legitimate system-monitoring tool does the same things, but unsigned binaries score higher on heuristic engines.

If your AV flags VOS, you can:

1. **Verify on VirusTotal.** Current detection ratio is typically 0 to 1 out of 67 vendors.
2. **Read [TRANSPARENCY.md](TRANSPARENCY.md)** for a complete inventory of every system call, network endpoint, and registry key VOS touches.
3. **Build from source** to verify the binary you'd be running matches the published code (instructions below).
4. **Submit a false-positive report** to your AV vendor. We maintain template text in [TRANSPARENCY.md](TRANSPARENCY.md#submitting-fp-reports).

## Privacy

VOS runs entirely locally. No telemetry, no analytics, no automatic data transmission. The only network requests it makes are:

- Fetching the latest GitHub release for the auto-updater (every 2 minutes; the auto-updater itself is disabled until code-signing is in place, so this is a metadata check only)
- Querying NVIDIA / AMD / Intel public driver pages (every 24 hours)
- Opening a pre-filled GitHub Issue when you click "Open Issue on GitHub" in Settings then Bug Report. The report goes through GitHub Issues using your own GitHub account. No third-party endpoints involved.

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

- [Electron](https://www.electronjs.org/), the cross-process desktop app shell. We only target Windows.
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/) for the renderer UI
- [Zustand](https://github.com/pmndrs/zustand) for renderer state
- [electron-vite](https://electron-vite.org/) as the build pipeline
- [electron-builder](https://www.electron.build/) for installer packaging
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [electron-store](https://github.com/sindresorhus/electron-store) for local persistence

No telemetry SDKs, no third-party analytics, no remote-loaded code. As of v0.2.9, no PowerShell either; hardware identification moved to direct registry reads.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contributions right now:

- **Hardware database expansions.** Add new CPUs, GPUs, chipsets, or Wi-Fi adapters to `src/main/data/*.ts`.
- **Game profile additions.** Add VR titles to `src/main/data/game-profile-database.ts`.
- **Headset profile JSON.** Add new headsets to `src/main/headsets/profiles/`.
- **Rule additions.** Write new diagnostic rules under `src/main/rules/rules/`.
- **Translations.** Currently English-only; localization would be welcome.

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md). Please disclose privately rather than via public issues.

## License and trademarks

The **code** is licensed under MIT. See [LICENSE](LICENSE). Use it however you want; just don't blame us if your registry edit goes sideways.

The **name "Vryionics" and the project's logo and visual identity** are trademarks. You can fork the code freely. You can't ship your fork *as* Vryionics. See [TRADEMARKS.md](TRADEMARKS.md) for the specifics. The short version: rename your fork, swap the icon, you're good.

---

*Vryionics VR Optimization Suite is not affiliated with or endorsed by Valve, Meta, HTC, Pimax, Sony, ByteDance/Pico, or any VR hardware or software vendor. All trademarks remain the property of their respective owners.*
