# VOS remediation design

Date: 2026-04-30
Status: design approved, ready for implementation plan
Author: Vryionics, with Claude assisting on drafting

## Why this exists

Between April 26 and 28, 2026, the public release of VOS drew sustained technical pushback on X, Reddit, and in DMs. The criticism fell into three rough buckets.

The first was actual bugs. The GPU detector treats the GTX 1060 3 GB and 6 GB as a single SKU even though they're different dies (GP106-300 vs GP106-400). The UI labels the page file as "fake RAM," which isn't a real concept. The single-channel detector misfires on certain motherboard BIOSes. The live optimizer pins idle CPU at 100 percent because it spawns a fresh PowerShell process on every poll cycle.

The second bucket was architectural. A static security audit identified unsanitized shell execution in the registry helper and PowerShell wrapper, a runtime-C#-compilation pattern that looks structurally identical to AV evasion, and a series of fixes that traded host security for VR performance: Defender exclusions, Hyper-V/VBS disable, Windows Update suppression, MSI mode forcing, ASPM disable. The audit's central recommendation was to stop being a "high-risk script wrapper" and become a "robust system utility," which is the right call.

The third was reputational. Even where individual rules were defensible, the volume of aggressive tweaks combined with PowerShell-everywhere, the runtime C# compilation, and a uniform commit history reads as an unreviewed LLM dump to anyone scrutinizing the repo. The maintainer issued a public apology committing to recoding parts of it personally with help from new partners, pursuing code signing, and disabling the auto-updater until signing is in place. This document is the technical design for that remediation work.

The decision that drives everything else: VOS becomes a safe-by-default tool. Detection stays comprehensive. Auto-fix shrinks to a small set of changes that are reversible, app-scoped, and cannot trade off host security. Aggressive Windows tweaks that previously had auto-fix support are removed entirely. Findings VOS can no longer fix are still surfaced in the scan as plain-English explanations, but the user is responsible for any changes outside the new auto-fix surface.

## Posture

The decision space was three-way. Safe-by-default (delete the controversial fixes outright). Power-user with airbags (keep them, gate behind warnings). Tiered with an "advanced mode" toggle (default to safe, unlock power-user mode behind explicit acceptance).

The maintainer chose safe-by-default. Detection is unchanged. Auto-fix is dramatically narrowed. Non-fixable findings surface as info-only entries in the scan results, with no fix-it button and no copy-pasteable steps.

This is the foundation under every other decision below.

## Auto-fix triage

### Kept as auto-fix (six items)

These are reversible, app-scoped, or use Win32 APIs Task Manager already exposes. None require admin. None touch the Windows registry directly. None create the kind of AV silhouette that got us here.

- **VRChat `config.json` edits.** Avatar physics caps (the `dynamic_bone_max_*` keys, which still control PhysBones limits in modern VRChat), avatar culling distance, cache size. Plain JSON edits to a user-writable file under `LocalLow`. Per-key undo via the existing fix-history records.
- **VRChat MSAA fix.** Same file as above.
- **VRChat cache cleanup.** File deletion under the user's VRChat cache directory.
- **Steam launch option for X3D users.** Writes a single launch-option string into Steam's per-user `localconfig.vdf`. Reversible by clearing the field. The affinity mask is computed from the detected CPU rather than hardcoded; see the Steam launch option section for details.
- **GPU driver installation (where supported).** Spawns the vendor's official installer (NVIDIA, AMD, Intel) which self-elevates. VOS itself does not need admin for this.
- **Live Optimizer.** Process priority management during VR sessions. Off by default; users opt in through a disclosure dialog. Full spec below.

### Removed entirely

These are either myths, net-negative outside narrow workloads, or active security downgrades. They will not appear in the action plan, the scan results, or any documentation as a recommended tweak. The associated rules are deleted from the codebase, not just hidden.

- `SystemResponsiveness = 0` (MMCSS reservation). Modern Windows normalizes the value; setting it to zero produces no measurable effect. Multiple tester reports already documented this.
- The 30-second `NtSetSystemInformation` standby-list purge. Net-negative outside of long VR sessions; causes cache misses and disk thrashing under normal browser-and-Discord use. Also the most malware-shaped API call in the entire codebase.
- Steam compositor priority elevation. Any change to `vrserver.exe` or `vrcompositor.exe` priority class. Priority-inversion antipattern; raising the compositor above the workload it's compositing is the opposite of what helps.
- `Add-MpPreference -ExclusionPath` for Defender. Creates predictable safe-haven directories. No responsible manual guide can be written for this either, so it doesn't get demoted to detection-only; it's just gone.
- `DODownloadMode` HTTP-only. Marginal performance gain, security implication, not worth keeping.
- The "upgrade your storage controller driver" rule. Bad routing for typical users; pointed at the Microsoft Update Catalog, which is not the right place to send anyone for AHCI/NVMe drivers.

VOS does not attempt to remove Defender exclusions, registry keys, or BCD changes added by older versions. Whatever older VOS installs left on user systems stays where it is. The remediation work is forward-looking: the new posture only governs what new code does.

### Demoted to detection-only

The scan continues to detect these conditions and explain in plain English what they mean for VR performance. There is no fix-it button. There is no manual guide with regedit steps. There are no copyable commands. If a user wants to make the change, they can research it themselves or ask a friend.

- Hyper-V / VBS enabled. Detection only, with the Memory Integrity tradeoff noted in the explanation.
- Windows Update deferral keys. Detection only.
- MSI mode and ASPM state. Detection only.
- HAGS state. Detection only.
- Windows power plan setting. Detection only. (Even the `powercfg` route, which technically uses Microsoft's blessed CLI, is dropped from auto-fix per the strict no-write-to-OS-state decision.)

The UI affordance for this category is a read-only callout in the scan results: title, plain explanation, technical detail in the expandable section, no Apply button. These items don't appear in the action plan.

## Live Optimizer

### Behavior

Off by default. When the user enables it, the optimizer polls the running process list every 2 seconds for known VR processes. When one is detected, the optimizer raises that process's priority and lowers priority on a strict allowlist of background apps. When all detected VR processes have exited, the optimizer restores every affected process to its original priority.

Priority changes use Node's standard library: `os.setPriority(pid, priority)` with constants from `os.constants.priority`. No native addon, no FFI, no PowerShell. On Windows, `os.setPriority` calls `SetPriorityClass`, and a standard user can normally set HIGH on a process they own without any special privilege.

In practice the raise-to-HIGH call can still fail on locked-down machines: some endpoint-protection products hook `SetPriorityClass`, some AppLocker or WDAC profiles restrict priority changes for specific binaries, and some managed-device configurations remove the privilege entirely. When the HIGH call fails with any error, the optimizer falls back to `PRIORITY_ABOVE_NORMAL` and writes a note to the activity log. The failure is never surfaced as an error in the UI. Lowering of background apps still happens normally.

### Trigger list

Defined in `resources/live-optimizer-triggers.json`, shipped with the app and editable by the user. Defaults:

```json
[
  "vrchat.exe",
  "vrmonitor.exe",
  "vrcompositor.exe",
  "OVRServer_x64.exe",
  "VirtualDesktop.Streamer.exe",
  "ALVR.exe",
  "Resonite.exe",
  "ChilloutVR.exe",
  "NeosVR.exe"
]
```

### Lowering allowlist

Defined in `resources/live-optimizer-allowlist.json`, shipped with the app and editable by the user. Defaults:

```json
[
  "Discord.exe",
  "Spotify.exe",
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "Telegram.exe",
  "OneDrive.exe",
  "SearchHost.exe",
  "Slack.exe",
  "Code.exe"
]
```

OBS (`obs64.exe`) is intentionally not on the default list. Users who want OBS lowered can add it themselves; the default skips it because lowering OBS during a recording silently degrades capture quality.

### Hard never-touch list

Hardcoded in source, not user-editable, applied as a filter when the allowlist is loaded. The optimizer refuses to change priority on any process whose name matches:

- System processes: `System`, `Idle`, `lsass.exe`, `csrss.exe`, `winlogon.exe`, `services.exe`, `svchost.exe`, `dwm.exe`, `wininit.exe`, `smss.exe`.
- Anti-cheat services: `EasyAntiCheat.exe`, `EasyAntiCheat_EOS.exe`, `BEService.exe`, `BEServiceV2.exe`, `vgc.exe`, `vgtray.exe`, `EasyAntiCheat_Setup.exe`.
- Headset runtime: `OVRServer_x64.exe`, `OculusClient.exe`, `vrserver.exe`, `vrdashboard.exe`, `vrcompositor.exe`.
- Anything in `C:\Windows\System32` or `C:\Windows\SysWOW64`.
- The VOS process itself.

The never-touch list applies as a hard filter at every priority-change call site, including the raise path for the trigger process. Several VR runtime processes appear on both the trigger list and the never-touch list (`OVRServer_x64.exe`, `vrserver.exe`, `vrcompositor.exe`); when one of these is the trigger, VOS still detects the VR session and lowers the allowlisted background apps, but it does not raise priority on the never-touch trigger itself. Trigger detection and priority management are independent operations; the never-touch list governs only the priority side.

If the user edits the allowlist file to add a name that matches the never-touch list, the entry is silently filtered on load and a warning is written to the activity log. The file is not modified on disk; the entry is just ignored at runtime.

### Concurrency cap

The optimizer will not lower priority on more than 25 processes simultaneously. If the allowlist matches more than 25 currently-running processes, the optimizer takes the first 25 by allowlist file order (deterministic, no ranking heuristic, no extra data needed) and leaves the rest alone. This protects against a malformed allowlist file producing runaway behavior. Users with more than 25 entries on their allowlist who hit the cap will see a note in the activity log explaining what was skipped.

### State persistence and crash recovery

The optimizer writes `live-optimizer-state.json` to the app's user-data directory every time it changes a process's priority. The file records `{ pid, imageName, originalPriority, currentPriority }` for each affected process. The file is cleared when the optimizer restores everything on a clean VR-session exit.

If VOS launches and finds a non-empty state file, it reads each entry and decides whether to restore. PIDs on Windows can be reused, so PID alone is not sufficient. VOS verifies that the live process at that PID has the recorded image name (via `ps-list`'s `name` field) AND that its current priority matches the `currentPriority` recorded in the state file. If both checks pass, the original priority is restored. If either fails, the entry is discarded as stale.

This guards against the most common failure mode (Discord crashed, an unrelated process now has Discord's old PID) without needing a process-creation-time field, which Node's `ps-list` does not expose and which would otherwise force a PowerShell or native-addon dependency. The "current priority matches" check is the core safeguard: an unrelated process at a reused PID will almost certainly not be running at the exact priority class VOS set, so the entry will be discarded.

### Pre-enable disclosure

A modal explains exactly what the optimizer does, what it touches, what it doesn't touch, and how restoration works. The user must check an "I've read this" box to enable. Verbatim text is in the appendix at the end of this document.

The Settings page also includes:

- A "View trigger list" button that opens the trigger JSON in the user's default editor.
- A "View allowlist" button that opens the allowlist JSON.
- A Live Optimizer activity panel showing the last ten sessions: when activated, what got lowered, what got raised, when deactivated, what got restored. Persists across launches.

## Architecture

### Drop the admin requirement

VOS no longer requires elevation. The installer no longer requests UAC. The app itself runs as the standard user.

This is possible because the new auto-fix surface only does file edits in user-writable paths (`%LocalAppData%`, `%AppData%`, Steam's `userdata`) and process-priority changes on processes owned by the same user. `os.setPriority` works on user-owned processes without elevation. GPU driver installers self-elevate via their own UAC prompt when launched.

Dropping admin removes the bulk of the security audit's critical-severity findings, because local privilege escalation requires elevated context to escalate from. With VOS running as the user, any bug becomes a same-user issue, which is a much smaller blast radius.

### Drop WMI

The plan to use the `wmi-client` npm package was wrong. That package is a wrapper around `wmic.exe`, and `wmic.exe` was deprecated in Windows 10 21H1 and is not present on fresh Windows 11 24H2 / 25H2 installs. It would break on the OS versions VOS most needs to support.

Instead, hardware identification moves to direct registry reads via `reg query`, called through `child_process.execFile` with strictly parameterized arguments. The data lives in stable, version-independent locations:

- CPU model, identifier, vendor, base clock: `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0` (values `ProcessorNameString`, `Identifier`, `VendorIdentifier`, `~MHz`).
- Per-logical-CPU enumeration: subkeys `\CentralProcessor\0`, `\1`, `\2`, etc.
- BIOS info: `HKLM\HARDWARE\DESCRIPTION\System\BIOS`.
- PCI device enumeration (GPU, network, storage controllers): `HKLM\SYSTEM\CurrentControlSet\Enum\PCI\*`.
- USB device enumeration (headsets): `HKLM\SYSTEM\CurrentControlSet\Enum\USB\*`.
- OS build info: `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`.
- Display adapter VRAM: `HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\NNNN` (the GUID is the standard Display class; `NNNN` is the per-adapter index).

A small wrapper module (`src/main/utils/registry-read.ts`) handles `reg query` calls with parameterized arguments and parses the output into structured data. The module is read-only; nothing in the new posture writes to the registry. Recursive enumeration under `Enum\PCI` is bounded to a single level deep at a time to avoid `reg query` performance issues on machines with many devices.

### Eliminate PowerShell

With WMI replaced by registry reads and the aggressive fixes removed, PowerShell has no remaining role in the codebase. Every `pwsh.exe` invocation is removed. Every WMI call is replaced with a registry read or a direct Win32 stdlib call. Every system-mutation script is deleted along with the fixes that called them.

The interim v0.2.9 release does not need to ship a partial PowerShell removal; the WMI-to-registry rewrite is the bulk of the work, and once that lands the remaining PowerShell calls all go with it.

### Replace `execSync` template literals

Every `execSync` call constructed via template-literal interpolation becomes either `execFile('binary', [args])` or `spawn('binary', [args])` with arguments passed as an array. The shell is no longer involved in argument parsing; the OS passes the array straight to the target executable's `argv`. This eliminates command injection as an attack surface.

The call sites are concentrated in `src/main/utils/registry.ts`, `src/main/utils/powershell.ts`, and a handful of fix implementations. The sweep happens in v0.2.9 alongside the bug fixes.

### No native addon, no FFI

`os.setPriority` and `os.getPriority` exist in Node's standard library. Process enumeration uses `ps-list` (~3 KB, calls `tasklist` via `child_process.execFile` with no shell interpolation). Hardware identification uses `reg query`. None of this needs an N-API addon, `node-ffi-napi`, or `koffi`.

The original audit recommendation to build a signed native DLL was correct for a tool calling `NtSetSystemInformation` and manipulating process tokens. With those calls deleted, the residual Win32 needs are all in Node's stdlib.

### Code signing

Deferred until one of two paths clears:

- **SignPath.io.** Free for qualifying open-source projects. Application takes a few weeks of review. Worth applying for in parallel with the v0.2.9 work.
- **Microsoft Trusted Signing.** Subscription product (~$10/month) but does require an identity-verification step: a solo individual signing up needs to complete IDV through Microsoft, which involves uploading documentation and waiting for approval. It is not the instant-checkout path the name might suggest. Plan on 1 to 3 weeks from signup to first usable certificate.

Both options work without a USB hardware token (which is the gating constraint that makes EV certs awkward for solo devs since the June 2023 hardware-token requirement). Both integrate with `electron-builder` via configuration.

Until either is available, all releases ship unsigned with prominent verification instructions in the README and the install video. The auto-updater stays disabled across v0.2.9 and v0.3 regardless of when signing arrives.

## Steam launch option for X3D

The previous launch option was hardcoded as `cmd /c start /affinity FFFF /high "" %command%`. The mask `FFFF` pins to logical processors 0 through 15. This is wrong for any X3D part with fewer than 16 cores (which is most of them) and wrong for dual-CCD X3D parts where the V-cache CCD is not always processors 0 through 7.

The fix uses VOS's existing CPU database, which already encodes per-model topology (V-cache CCD location, total core count, hybrid CPU layout). The launch-option writer reads the detected CPU model, looks up its topology, computes the appropriate hex affinity mask, and writes the corresponding string. For example, a 7800X3D writes `/affinity FF` (cores 0 through 7); a 7950X3D writes the mask matching its V-cache CCD; a non-X3D AMD CPU does not get the affinity portion at all (only the `/high` priority).

The existing CPU database needs entries for the affinity mask per model. Adding those is part of the v0.2.9 work.

### Implementation notes

- Steam stores per-user launch options in `<SteamPath>/userdata/<accountid>/config/localconfig.vdf`. The format is Valve's KeyValues VDF, not JSON. The `vdf` npm package (or `simple-vdf`) parses and serializes it correctly; do not hand-roll a parser.
- Steam rewrites `localconfig.vdf` when it exits. If VOS writes the file while Steam is running, the change will be clobbered. The fix's preview step detects a running `steam.exe` and refuses to apply with a clear message: "Close Steam before applying this fix." The Apply path re-checks immediately before writing.
- Undo restores the previous launch-option string verbatim, including the empty-string case if the field was unset before. The fix-history record stores the prior value.
- VOS only modifies the `LaunchOptions` field for App ID 438100 (VRChat). Other apps' launch options are not read or modified.

## Bug fix backlog (v0.2.9)

Concrete reported bugs. Each gets fixed in v0.2.9 alongside the posture changes.

1. GTX 1060 3 GB versus 6 GB conflation. The cards use different dies (GP106-300 versus GP106-400) with different SM counts. The hardware database treats them as a single row and the device-ID parser doesn't disambiguate. Fix: split into two database entries keyed on VRAM size.

2. "Fake RAM" UI label. Misnomer. Renamed everywhere it appears to "Page file" or "Virtual memory" depending on context.

3. Single-channel detection misfiring on certain BIOSes. The DIMM-slot parser misreads slot population on some boards. Fix: rewrite against a wider sample of BIOS outputs; collect specific repro hardware from Blake.

4. "Upgrade your storage controller driver" rule. Deleted entirely per the triage section.

5. Idle 100% CPU spike. Symptom: VOS sitting idle pegs a core at 100%. Suspected cause is the live optimizer scanner spawning `pwsh.exe` every poll cycle plus running its WMI queries unconditionally. Confirm root cause before claiming a fix; the WMI-to-registry rewrite plus polling-interval increase plus skip-when-no-VR-detected should land together. If the spike persists after those changes, profile the renderer for runaway React state or any other hot loop before shipping.

6. PowerShell cold-start overhead generally. Aldrich's catch. Fixed by full removal in the same release.

7. `execSync` command injection vectors. Every template-literal shell call replaced with `execFile(args[])`.

## Release plan

### v0.2.9

Ships when ready, not on a fixed deadline. Contains:

- All seven bug fixes above.
- Auto-fix triage applied: deleted fixes removed from code, demoted fixes converted to detection-only display.
- Live Optimizer rewritten Node-native, with the disclosure dialog, allowlist plus trigger files, and activity log.
- Admin requirement dropped. Installer and app run as the standard user.
- `execSync` template literals replaced with `execFile` across the codebase.
- WMI-to-registry rewrite for hardware identification.
- PowerShell removed entirely.
- Per-CPU affinity mask logic for the X3D launch option.
- README updated to match the new posture.
- All changes credited to specific reporters in the release notes by handle.

Auto-updater remains disabled. Distribution via GitHub Releases, manual download, SHA-256 verification per the install instructions.

### v0.3.0

Lands after v0.2.9 once feedback is in. Contents are smaller than originally planned because v0.2.9 absorbed the architecture work:

- UI polish on the manual-fix info-only display, refined based on v0.2.9 user feedback.
- Updated install/usage video matching the new UX.
- Code signing if SignPath or Microsoft Trusted Signing has cleared.

If signing has cleared, v0.3 also flips the auto-updater back on. If it hasn't, the auto-updater stays off into v0.4.

## Communication strategy

### Per-release artifacts

Each release ships with a GitHub Release page carrying detailed notes, the SHA-256 of the installer, and unsigned-build verification instructions. Every change is tagged to its reporter by handle. An X post links to the release notes and tags every credited reporter (with their consent; some prefer not to be tagged). The repo README is updated to match current posture so anyone landing fresh sees the right shape immediately.

### One-time engagements

- Direct DM reply to Blake referencing v0.2.9 with PR or commit links to each fix from his original list.
- Public credit for Aldrich, Yeusepe, xNanochip, and the auditor in the v0.2.9 release notes.
- VixenVRC reviews each release before merge. Public sign-off in the release notes.

### Code quality commitments

The remediation work introduces the following guardrails on new code, partly to address the AI-slop reputation issue head-on:

- No box-drawing comment dividers. Comments only when explaining why; never narration of what.
- No em-dashes in comments or in user-facing copy. Periods, colons, or commas instead.
- No "Phase 1 / Phase 2" comment scaffolding in implementations.
- Existing utilities reused. New utilities added only when no equivalent exists.
- Less defensive boilerplate. Errors caught at API boundaries, not at every line.
- Variable naming matches the existing codebase style. New code does not silently reformat or "improve" the conventions of files it edits.
- Commit messages vary in style. Not every commit needs a Conventional Commits prefix.

These apply to new code. Existing code retains its style until separately cleaned up. If a file with old-style comments is touched during remediation, the old box-drawing headers are removed in the same edit but the file is not otherwise reformatted.

## Out of scope

Deliberately not part of this remediation. May land in later versions but does not block v0.2.9 or v0.3.

- A bifurcated UI plus elevated background-service architecture. The audit recommended this; the safe-by-default posture makes it unnecessary because there is no longer any elevated work to do.
- A native helper DLL or N-API addon. Same reason.
- Reproducible builds. Worth pursuing eventually for additional verification, but not blocking.
- Localization. The app is English-only and remains so through v0.3.
- macOS or Linux support. Windows-only by design.
- A formal threat model document. The whitepaper from the public audit is the starting reference; a maintainer-written threat model can come later.

## Open questions

None blocking implementation. Items the maintainer may want to revisit during or after v0.3:

- Whether the manual-guide UI should ever exist for the demoted-to-detection items, or whether detection-only is permanent.
- Whether the Live Optimizer's allowlist should sync from a community-maintained list as a future feature.
- Whether the auto-updater, when re-enabled, should default to "check on launch," "check daily," or remain user-prompted.

---

## Appendix: Live Optimizer disclosure copy

Verbatim text shown in the pre-enable modal. Word-for-word; do not paraphrase.

> **Live Optimizer: what this will do**
>
> When enabled, the Live Optimizer watches for a VR session to start. While VR is running, it temporarily lowers CPU priority on a list of background apps so your VR game gets more scheduler time. It also raises the VR game's priority. When VR closes, every change is reversed.
>
> **What it touches:**
>
> - Process priorities only. The same setting Task Manager exposes under Details, Set Priority.
> - Nothing on disk.
> - Nothing in the registry.
> - No services started, stopped, or modified.
> - No firewall rules. No network changes.
> - No drivers loaded. No kernel calls.
>
> **How it triggers:**
>
> Once enabled, VOS polls the running process list every 2 seconds for known VR processes. The full list is in `resources/live-optimizer-triggers.json` and you can audit it from Settings.
>
> When a VR process starts, the optimizer activates. When all of them exit, the optimizer restores everything.
>
> **What gets lowered:**
>
> Only processes whose name matches the allowlist. The allowlist is a strict list, not a pattern. Nothing not on it is touched.
>
> **What gets raised:**
>
> The detected VR process itself, to High priority. Same call Task Manager makes. (If your system policy blocks raising to High, the optimizer falls back to Above Normal and logs a note to the activity log. The lowering still happens normally.)
>
> **What it will never touch, by design:**
>
> - System processes (`System`, `lsass.exe`, `csrss.exe`, `svchost.exe`, `winlogon.exe`, `dwm.exe`, anything in `C:\Windows\System32` or `SysWOW64`).
> - Anti-cheat services (`EasyAntiCheat.exe`, `BEService.exe`, `vgc.exe`, and friends).
> - Headset runtime (`OVRServer_x64.exe`, `vrserver.exe`, the SteamVR compositor, anything Virtual Desktop or ALVR ships). These need full priority to keep frames flowing to your headset.
> - Any process not on the lowered-allowlist.
> - The VOS process itself.
>
> **Crash recovery:**
>
> If VOS or your PC crashes during a VR session, priority changes do not survive a process restart on Windows. They are per-process and die with the parent. On the next VOS launch, the optimizer reads its state file and restores any process still running at the priority it set, verifying both the process name and the priority class match before changing anything. You should never end up with a permanently de-prioritized Discord.
>
> **OBS exception:**
>
> OBS is not on the default allowlist. If you add it manually, be aware that lowering OBS while it's recording or streaming will silently degrade your capture. VOS will not check for this.
>
> **Off-by-default:**
>
> Live Optimizer is off until you enable it. Enabling it does not retroactively touch any process. Only processes that match the allowlist during a future VR session will be lowered.
>
> ☐ I've read the above. Enable Live Optimizer.
