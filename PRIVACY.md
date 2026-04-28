# Privacy

This document is a complete, unsanitized inventory of every piece of data Vryionics VR Optimization Suite (VROS) reads from your system, every network connection it makes, and every file it writes. If you find anything missing or inaccurate, please open an issue — we treat the privacy disclosure as a contract.

## TL;DR

- **No telemetry.** No analytics SDKs, no usage pings, no error reporting unless you explicitly click "Send Bug Report".
- **No automatic data transmission of scan content.** Your scan results live entirely on your local machine.
- **Three legitimate outbound connections**: GitHub (release checks), vendor driver pages (NVIDIA/AMD/Intel), and Cloudflare's public speed-test endpoint (during network diagnostics).
- **One opt-in connection**: Bug report submission to a Discord webhook — only when you click "Send".

## What VROS reads from your system

### Hardware inventory (every scan)
- CPU model, core/thread count, base/boost clocks (via `Win32_Processor`)
- GPU model, VRAM, driver version (via `Win32_VideoController` + driver vendor APIs)
- RAM total, used, type, speed, kit configuration (via `Win32_PhysicalMemory`)
- Storage drives, free space, drive type (via `Win32_DiskDrive` + `Win32_LogicalDisk`)
- Motherboard manufacturer + chipset (via `Win32_BaseBoard` + `Win32_BIOS`)
- Battery presence (laptop detection) (via `Win32_Battery` + `Win32_SystemEnclosure`)
- Sound devices (via `Win32_SoundDevice`)
- USB / network / Bluetooth / chipset / storage drivers (via `Win32_PnPSignedDriver`)

### Operating system state
- Windows version, build number, install date (via `Win32_OperatingSystem`)
- Running services + their state (via `Win32_Service`)
- Startup programs registered to launch at boot (via `Win32_StartupCommand`)
- Power plan settings (via `powercfg`)
- HVCI / VBS / Core Isolation status (via registry reads at `HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard`)
- Hyper-V / virtualization features status

### Running processes
- Process names, PIDs, CPU usage, memory usage, parent process (via `Win32_Process`)
- VR runtime detection (vrserver.exe, vrcompositor.exe, OculusClient.exe, virtualdesktop.streamer.exe, etc.)

### Network configuration
- Connected network adapter name, link speed, IP address (`Get-NetAdapter`)
- Wi-Fi SSID, BSSID, signal strength, channel, band (via `netsh wlan show interfaces`)
- Nearby Wi-Fi networks for channel-congestion analysis (via `netsh wlan show networks mode=bssid`)
- Default gateway latency (via `Test-Connection`)
- TCP retransmit + UDP error counters (via `Get-NetTCPStatistics` / `Get-NetUDPStatistics`)

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
- A System Restore Point is created (via `Checkpoint-Computer`)
- The specific registry keys / settings the fix declares (always shown in the preview before you click Apply)
- A backup of pre-fix values stored in `vros-fixes.json` so you can undo

### Driver installs (only when you click "Update")
- Downloads to `%TEMP%\vryionics-vros-drivers\`
- Verifies Authenticode signature against a publisher allowlist (NVIDIA, AMD, Intel, Realtek, Qualcomm, MediaTek, Microsoft)
- Verifies SHA-256 if the vendor publishes one
- Runs vendor's silent-install flag, then deletes the installer

### Auto-updater (only when a new release exists)
- Downloads installer to `%TEMP%\vryionics-vros-update\`
- Verifies SHA-512 from the release's `latest.yml`
- Spawns a PowerShell script that waits for the app to exit, runs the new installer, and relaunches

## Outbound network connections

### Always-on (background)
| Endpoint | Frequency | Purpose | Data sent |
|---|---|---|---|
| `api.github.com/repos/TheGamingLemon256/Vryionics-VR-Optimization-Suite/releases/latest` | Every 2 minutes | Auto-updater | None — GET only. Headers contain User-Agent + GitHub PAT (read-only, scoped to this repo) |
| `gfwsl.geforce.com` / `nvidia.com/Download/processDriver.aspx` | Every 24 hours | Latest NVIDIA driver lookup | None — GET only |
| `amd.com/en/support/download/drivers.html` | Every 24 hours | Latest AMD Adrenalin version scrape | None — GET only |
| `intel.com/content/www/us/en/download/...` | Every 24 hours | Latest Intel driver pages | None — GET only |

### Triggered by user action
| Endpoint | When | Data sent |
|---|---|---|
| `speed.cloudflare.com` | When you run "Network speed test" in scan | Standard speed-test traffic only |
| Discord webhook | When you click "Send Bug Report" | The bundle you previewed in the report-builder UI (your message + opted-in attachments: scan data, fix history, system info, app log) |
| Vendor download URLs (NVIDIA / AMD / Intel) | When you click "Update" or "Open vendor page" on a Drivers row | None — opens browser or downloads installer |

### Never
- No analytics, no telemetry, no usage pings
- No third-party tracking SDKs
- No connections to ad networks, analytics platforms, or data brokers
- No automatic uploading of scan content, fix history, or session recordings

## What's in a bug report (when you click Send)

The bug-report builder UI shows you the exact attachments included before submission. Each attachment is a separate checkbox:

| Attachment | Default | Contents |
|---|---|---|
| **System Info** | ☑ on | Platform, OS version, hostname, CPU model, total RAM, uptime, Electron + Node + Chromium versions |
| **Latest Scan Data** | ☐ off | The full scan result JSON (hardware, processes, network, etc.) — same data shown in the Report tab |
| **Applied Fix History** | ☐ off | List of fix IDs applied + timestamps |
| **Recent App Log** | ☑ on | Last 500 lines of the app's daily log file |

The bundle is POSTed to the Discord webhook URL stored in `resources/webhook.txt`. We don't store, mine, or share these reports outside of triaging the specific issue you raised.

## Verifying any of this

The repository is fully open-source. Every claim above can be verified by reading the corresponding source file:

- IPC / scan engine: `src/main/scanner/`
- Network requests: `src/main/updater.ts`, `src/main/drivers/sources/`, `src/main/support/webhook-reporter.ts`
- Storage Cleanup categories: `update-server/storage-categories.json`
- Local file writes: `src/main/logger.ts`, `src/main/session-recorder.ts`, fix-engine backups in `src/main/fixes/engine.ts`
- PowerShell helpers: `update-server/ps-helpers/vros-helpers.ps1`

If you spot a discrepancy between this document and the code, please open an issue.
