# Privacy

This document is a complete, unsanitized inventory of every piece of data Vryionics VR Optimization Suite (VROS) reads from your system, every network connection it makes, and every file it writes. If you find anything missing or inaccurate, please open an issue — we treat the privacy disclosure as a contract.

> **Updated for v0.2.9.** v0.2.9 dropped WMI and PowerShell as data-collection mechanisms. Hardware identification now reads the registry directly. The handful of remaining external tools (`powercfg`, `netsh`, `route`, `ping`, `netstat`, `typeperf`, `reg.exe`, plus a single scoped PowerShell call for `Win32_PhysicalMemory` DIMM info) are invoked with `execFile` and a parameterized argv array — no shell, no template-literal interpolation. If you're auditing against a v0.2.7-era version of this document, expect the data sources to look different even when the data being read is the same.

## TL;DR

- **No telemetry.** No analytics SDKs, no usage pings, no error reporting unless you explicitly click "Send Bug Report".
- **No automatic data transmission of scan content.** Your scan results live entirely on your local machine.
- **Three legitimate outbound connections**: GitHub (release checks), vendor driver pages (NVIDIA/AMD/Intel), and Cloudflare's public speed-test endpoint (during network diagnostics).
- **One opt-in connection**: Bug report submission opens a pre-filled GitHub Issue in your browser — only when you click "Open Issue on GitHub". You then submit (or don't) using your own GitHub account. **No webhook URL is shipped in the installer**; bug reports go through GitHub's standard issue-tracking infrastructure.

## What VROS reads from your system

### Hardware inventory (every scan)
- CPU model, core/thread count, base/boost clocks — read from `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\*` and the per-CPU topology database
- GPU model, VRAM, driver version — read from `HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-...}` plus driver vendor APIs
- RAM total + used — `os.totalmem` / `os.freemem`. Live counters via `typeperf`
- DIMM type, speed, slot population — single scoped PowerShell call (`Get-CimInstance Win32_PhysicalMemory`); the PowerShell process exits as soon as the values are read
- Storage drives, free space, drive type — registry under `HKLM\SYSTEM\MountedDevices` and `HKLM\SYSTEM\CurrentControlSet\Enum\STORAGE\*`, plus `fs.statfs`
- Motherboard manufacturer + chipset — registry under `HKLM\HARDWARE\DESCRIPTION\System\BIOS` and SMBIOS data exposed there
- Battery presence (laptop detection) — registry under `HKLM\HARDWARE\DESCRIPTION\System\BIOS` (chassis type) plus `electron.screen` for display data
- Sound devices — registry under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio`
- USB / network / Bluetooth / chipset / storage drivers — registry under `HKLM\SYSTEM\CurrentControlSet\Control\Class\*` and `\Enum\*`, with a GUID-to-classname lookup table for modern Windows builds that omit the legacy class text value

### Operating system state
- Windows version, build number, install date — `os.release()` and registry under `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`
- Running services + their state — registry under `HKLM\SYSTEM\CurrentControlSet\Services\*`
- Startup programs registered to launch at boot — registry under the `Run` and `RunOnce` keys
- Power plan settings — `powercfg /getactivescheme` (no shell, parameterized argv)
- HVCI / VBS / Core Isolation status — registry reads at `HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard`
- Hyper-V / virtualization features status — registry plus the same DeviceGuard tree

### Running processes
- Process names, PIDs, CPU usage, memory usage, parent process — via the `ps-list` library (no PowerShell, no `Get-Process`)
- VR runtime detection (`vrserver.exe`, `vrcompositor.exe`, `OculusClient.exe`, `virtualdesktop.streamer.exe`, etc.)

### Network configuration
- Connected network adapter name, link speed, IP address — `route print` and registry under `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\*`
- Wi-Fi SSID, BSSID, signal strength, channel, band — `netsh wlan show interfaces`
- Nearby Wi-Fi networks for channel-congestion analysis — `netsh wlan show networks mode=bssid`
- Default gateway latency — `ping -n 4 <gateway>`
- TCP retransmit + UDP error counters — `netstat -s`

**VROS does NOT read saved Wi-Fi passwords.** We never invoke `netsh wlan show profile name="X" key=clear`.

### VR-specific
- SteamVR install path + settings (via `LOCALAPPDATA\openvr\steamvr.vrsettings` and Steam library config)
- Oculus install path
- Steam install paths (multiple library detection)
- VRChat install path + config (`config.json` for dynamic-bone limits)
- Headset connection state (DisplayPort cable detection, Wi-Fi adapter quality for streaming)

### Storage Cleanup categories (only when you click "Scan Storage")
The Storage Debloat module sizes (and optionally cleans) only the specific cache subdirectories listed in [`update-server/storage-categories.json`](update-server/storage-categories.json) — typically:
- Windows Temp / System Temp / Prefetch / Update download cache / Error reports
- Browser cache subdirectories (Chrome / Edge / Firefox `cache2/`) — **never the credential or login data folders**
- Discord cache (not Local Storage / leveldb where tokens live)
- Steam HTML cache (not Steam config or login files)
- NVIDIA / D3D shader caches
- VRChat asset caches
- Application crash dumps

**The Downloads folder is shown for size awareness only — VROS will never auto-delete files there.**

## What VROS writes to your system

### Local app data (`%APPDATA%\vryionics-vr-optimization-suite\`)
- `vros-config.json` — your Settings choices (theme, advanced mode, etc.)
- `vros-setup.json` — your Setup Wizard answers (headset model, connection type)
- `vros-fixes.json` — applied fix history (so badges persist across launches)
- `vros-reports.json` — saved scan reports (only when you click Save)
- `liveopt-config.json` — Live Optimizer config
- `vros-pending-restore.json` — services we've stopped that haven't been restarted yet (crash safety net)
- `logs/vros-YYYY-MM-DD.log` — daily-rotated app log (7-day retention, capped at 10 MB)
- `sessions/session-*.json` — VR session telemetry recordings

### When you apply a fix
- The specific registry keys / settings the fix declares (always shown in the preview before you click Apply). v0.2.9 narrowed the auto-fix surface to app-scoped, reversible changes — no HKLM writes from the fix engine.
- A backup of pre-fix values stored in `vros-fixes.json` so you can undo
- (No System Restore Point. v0.2.9 dropped restore-point creation alongside PowerShell removal — the only Win32 path to `SRClient` was via `Checkpoint-Computer`. Fix backups in `vros-fixes.json` remain.)

### Driver installs (only when you click "Update")
- Downloads to `%TEMP%\vryionics-vros-drivers\` from a pinned set of vendor HTTPS domains
- Size sanity check (rejects responses outside 50 MB – 2 GB to catch redirect-to-HTML pages)
- Verifies SHA-256 if the vendor publishes one
- Runs the vendor's silent-install flag detached, so the install survives VOS exit
- Note: Authenticode subject pinning is **not** present in v0.2.9 (regression vs v0.2.7). The only Authenticode verifier available was `Get-AuthenticodeSignature`, and PowerShell was removed from the codebase. Re-introducing publisher pinning via a non-shell verifier is tracked for v0.3.

### Auto-updater
- **Disabled in v0.2.9.** The release-checker still polls GitHub every 2 minutes and surfaces a download link, but installation is manual: you download from the release page yourself and run the installer.
- When/if the auto-installer flow is re-enabled in a future release, the same SHA-512 check that runs today on manual updates remains mandatory. If `latest.yml` has no hash, the install is refused.

## Outbound network connections

### Always-on (background)
| Endpoint | Frequency | Purpose | Data sent |
|---|---|---|---|
| `api.github.com/repos/.../releases/latest` | Every 2 minutes | Release check (auto-updater install path is disabled) | None — GET only. Unauthenticated request, identifying User-Agent only. **No GitHub PAT is shipped in the installer** as of v0.2.7. |
| `gfwsl.geforce.com` / `nvidia.com/Download/processDriver.aspx` | Every 24 hours | Latest NVIDIA driver lookup | None — GET only |
| `amd.com/en/support/download/drivers.html` | Every 24 hours | Latest AMD Adrenalin version scrape | None — GET only |
| `intel.com/content/www/us/en/download/...` | Every 24 hours | Latest Intel driver pages | None — GET only |

### Triggered by user action
| Endpoint | When | Data sent |
|---|---|---|
| `speed.cloudflare.com` | When you run "Network speed test" in scan | Standard speed-test traffic only |
| `github.com/.../issues/new?title=...&body=...` | When you click "Open Issue on GitHub" in the bug-report dialog | The bundle you previewed (your message + opted-in attachments) is encoded into the GitHub Issues URL query string. You're then on github.com under your own account; submission and content control happen entirely through GitHub from that point. |
| Vendor download URLs (NVIDIA / AMD / Intel) | When you click "Update" or "Open vendor page" on a Drivers row | None — opens browser or downloads installer |

### Never
- No analytics, no telemetry, no usage pings
- No third-party tracking SDKs
- No connections to ad networks, analytics platforms, or data brokers
- No automatic uploading of scan content, fix history, or session recordings

## What's in a bug report (when you click Open Issue on GitHub)

The bug-report builder UI shows you the exact attachments included before submission. Each attachment is a separate checkbox:

| Attachment | Default | Contents |
|---|---|---|
| **System Info** | ☑ on | Platform, OS version, hostname, CPU model, total RAM, uptime, Electron + Node + Chromium versions |
| **Latest Scan Data** | ☐ off | The full scan result JSON (hardware, processes, network, etc.) — same data shown in the Report tab |
| **Applied Fix History** | ☐ off | List of fix IDs applied + timestamps |
| **Recent App Log** | ☑ on | Last 500 lines of the app's daily log file |

The bundle is encoded into a GitHub Issue URL and opened in your default browser. A copy is also saved locally to `%APPDATA%\vryionics-vr-optimization-suite\bug-reports\` so you have a record of what was sent — and so you can drag-and-drop the file into the issue if it was longer than GitHub's URL length limit. **You are the one who actually clicks "Submit" on the GitHub issue page.** Until you do, nothing has been transmitted anywhere.

### Architecture history (transparency)

Bug reports were originally POSTed to a Discord webhook bundled inside the installer. That approach was reported as a security issue on 2026-04-28 (responsible disclosure — thank you, Bill) because anyone who unpacked the installer could spam the webhook. Webhooks shipped in client binaries are inherently abuseable; we replaced the architecture entirely in v0.2.8. The v0.2.4–v0.2.7 webhook URL has been deleted and is non-functional.

## Verifying any of this

The repository is fully open-source. Every claim above can be verified by reading the corresponding source file:

- Scan engine: `src/main/scanner/`
- Network requests: `src/main/updater.ts`, `src/main/drivers/sources/`
- Bug-report builder: `src/main/ipc/support.ts` and `src/renderer/components/support/BugReportModal.tsx`
- IPC bridge: `src/preload/index.ts` (channel allowlist) and `src/main/ipc/` (handlers and validators)
- Storage Cleanup categories: `update-server/storage-categories.json` (bundled into the installer at build time)
- Local file writes: `src/main/logger.ts`, `src/main/session-recorder.ts`, fix-engine backups in `src/main/fixes/engine.ts`

If you spot a discrepancy between this document and the code, please open an issue.
