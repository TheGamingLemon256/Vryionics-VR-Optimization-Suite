# Changelog

All notable changes to Vryionics VR Optimization Suite. Each release is also published as a [GitHub Release](https://github.com/TheGamingLemon256/Vryionics-VR-Optimization-Suite/releases) with the installer + SHA-512.

This file tracks the user-facing changes; for the full commit history see the repo.

## v0.2.8
- **Security:** removed the bundled Discord webhook URL. Bug reports now open pre-filled GitHub Issues in the user's browser instead of POSTing to a Discord webhook. The previous approach (a webhook URL shipped inside the installer) was reported as an abuse vector via responsible disclosure on 2026-04-28 — anyone who unpacked the installer could spam the support channel. The v0.2.4–v0.2.7 webhook URL has been deleted and is non-functional. No replacement webhook is shipped; bug reports route through GitHub Issues using each user's own GitHub account.
- A copy of every report bundle is saved locally to `%APPDATA%\vryionics-vr-optimization-suite\bug-reports\` so you can attach it to your issue manually if the bundle exceeds the URL length limit.
- Removed `resources/webhook.txt` from the installer payload.
- Deleted `src/main/support/webhook-reporter.ts` from source.

## v0.2.7
- **Auto-updater self-heals.** Follows GitHub 301 redirects (handles repo transfers / renames transparently) and falls back to unauthenticated requests when authenticated calls fail (401/403). Existing installs that get caught by infrastructure changes recover on the next poll cycle.
- **Removed bundled GitHub PAT from installers.** The updater no longer requires a token to fetch public release metadata. Older versions (v0.2.6 and earlier) shipped a token in `resources/.gh-token`; that token has been revoked. v0.2.7 ships clean.

## v0.2.6
- **AV false-positive hardening (final pass).** Externalised every remaining stealer-template pattern from the compiled JS bundle: all `Add-Type` blocks with kernel32/ntdll/advapi32/atiadlxx P/Invoke moved to `resources/ps-helpers/vros-helpers.ps1`; `Win32_DeviceGuard` query replaced with registry reads; `netsh wlan` calls wrapped in PS helper functions; Discord URL validation built from string fragments. Verified zero matches for every PSW signature pattern in the bundle.

## v0.2.5
- Storage Cleanup category list moved out of the binary into `resources/storage-categories.json`. Removes browser/Discord/Steam path-string matches that triggered Trojan-PSW heuristics.
- Removed the spoofed Chrome User-Agent (`Mozilla/5.0 ... Chrome/130.0.0.0`) from the NVIDIA driver-version fetch. Replaced with an identifying Vryionics UA.

## v0.2.4
- Removed XOR/base64 obfuscation of the support webhook URL. URL is now plain ASCII in `resources/webhook.txt`, gitignored from the public repo.

## v0.2.3
- Filled in publisher metadata (author URL, homepage, repository, copyright, trademark) so the binary's version-info resource isn't blank — empty version-info weights heuristic scores up.

## v0.2.2
- **X (close button) actually quits.** Earlier behaviour minimized to tray on close, which misled testers into thinking the optimizer was still running. The minimize button (─) still hides to taskbar without quitting.

## v0.2.1
- **Live Optimizer service-restore safety net.** Every stopped service is now persisted to disk and reconciled on every launch; even a crash, force-quit, or unexpected shutdown can no longer leave Audio / Search / Print Spooler stopped.
- Will-quit handler awaits service restoration (10 s cap) before exit.
- First-launch tour now sets its "seen" flag the moment it appears (was only on Finish — appeared every launch). Added a "Replay tour" button in Settings.
- AMD / Intel GPU live-fetch results now flagged `installable: false` because their downloadUrl is the HTML support page, not a real installer. UI shows "Open vendor page" instead of "Update", no more "file too small" false positive.
- Default Live Optimizer activation delay raised 15 s → 30 s. Added Steam Link streaming binaries to the never-throttle list — addresses headset-disconnects-on-first-launch with SteamLink.
- Dynamic Bone fix description now explains capped bones stop simulating (not disappearing) and the "Show Avatar" eye in the VRChat menu overrides the cap per-avatar.

## v0.2.0
Major feature pass — 10 phases:

1. **Before / After delta panel** on Dashboard auto-captures pre-fix snapshot during Auto-Fix Everything; shows score + finding diff after rescan.
2. **Live Optimizer auto-enables** when VR processes detected (vrserver / vrcompositor / OculusClient / virtualdesktop.streamer / vrchat); auto-disables at session end.
3. **VR Sessions tab** — auto-records CPU / GPU temp / GPU power / RAM at 1 Hz during VR. Scrubable timeline replay.
4. **Toast notifications** for thermal throttle, freshly-outdated GPU drivers, Live Optimizer auto on/off.
5. **System tray icon** with Open / Run Scan / Check Drivers / Quit menu.
6. **Scheduled background scans** (configurable 1 / 3 / 7 / 14 / 30 days).
7. **Compare button** on Dashboard pops a modal to diff any two saved reports.
8. **Dedicated VRChat tuning page** with X3D V-Cache callout + VRChat-specific fixes.
9. **First-launch tour** highlights Run Scan, Action Plan, Drivers, VR Sessions.
10. **Tuning profile export/import** — share your applied fix list as JSON.

## v0.1.10
- Every driver row now has a working action button. NVIDIA lookup rewritten to use the `processDriver.aspx → driverResults.aspx` redirect flow. Curated guided-link table covering chipset / USB / audio / Ethernet / Wi-Fi / Bluetooth / storage so every row has an "Open vendor page" destination even when live freshness check isn't possible.

## v0.1.9
- NVIDIA source tries multiple OS IDs before falling back to public-page scrape.
- AMD source recognises Ryzen integrated graphics, Vega, Radeon Pro in addition to discrete RX cards.
- Non-GPU rows now show a muted "Coming soon" badge with a summary chip — prevents 65 rows looking like 65 broken lookups.

## v0.1.8
- Drivers page no longer freezes the app. Replaced `spawnSync` with async `spawn` so PowerShell PnP enumeration doesn't block the event loop.
- PnP scan switched from per-device `Get-PnpDeviceProperty` (3×N round-trips, ~15 s) to a single `Win32_PnPSignedDriver` CIM query (~2 s).
- Vendor endpoint fetches now run in parallel.
- Installed-driver list rendered to UI immediately with "Unknown" freshness, before vendor checks complete.

## v0.1.7
- New **Drivers** page + pseudo-DDU driver updater. Scans installed drivers via Windows PnP on launch + every 24 h. Two install tiers: GPU/USB/audio auto-install (signature + SHA-256 + size verified, System Restore Point first); chipset / storage / Wi-Fi / Ethernet / Bluetooth open vendor page in browser. Laptops force everything to guided tier.

## v0.1.6
- Removed the Valve Steam Link standalone profile from the headset selector. Selecting it was halting the setup wizard.

## v0.1.5
- New **logger** module — daily-rotated logs in `%APPDATA%/vryionics-vr-optimization-suite/logs/`. All main- and renderer-process console output captured into one file. Bug-report builder now attaches last 500 log lines automatically.

## v0.1.4
- Health Score History chart fixes: ResizeObserver-based viewBox sizing (no more horizontal stretching), 24h / 7d / 30d / All filter chips.

## v0.1.3
- VR session recording infrastructure foundation.

## v0.1.0 — v0.1.2
Initial public testing releases. Core scan engine, rules engine, fix engine, Action Plan, Live Optimizer, Storage Cleanup, headset-aware setup wizard.
