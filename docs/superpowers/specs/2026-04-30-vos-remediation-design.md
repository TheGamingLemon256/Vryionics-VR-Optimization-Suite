# VOS remediation design

Date: 2026-04-30
Status: design approved, ready for implementation plan
Author: Vryionics, with Claude assisting on drafting

## Why this exists

Between April 26 and 28, 2026, the public release of VOS drew sustained technical pushback on X, Reddit, and in DMs. Three categories of criticism:

1. **Real bugs.** Misidentification of GPU SKUs (1060 3 GB vs 6 GB), wrong terminology in the UI ("fake RAM"), single-channel detection misfiring, and the live optimizer pinning idle CPU at 100% by cold-starting a fresh PowerShell process every cycle.

2. **Real architectural problems.** A static security audit identified unsanitized shell execution in registry helpers and PowerShell wrappers, AV-evasion patterns from offloading P/Invoke into runtime-compiled scripts, and a series of fixes that actively trade off host security for VR performance (Defender exclusions, Hyper-V/VBS disable, Windows Update suppression, MSI/ASPM forcing).

3. **A reputation problem.** The criticism converged on "this looks like sloppy AI-stitched code." Even where individual rules are defensible, the volume of aggressive tweaks combined with PowerShell-everywhere, runtime C# compilation, and a uniform commit history reads as an unreviewed LLM dump to anyone scrutinizing the repo.

The maintainer issued a public apology committing to (a) recoding parts of it personally with help from new partners, (b) pursuing code signing, and (c) disabling the auto-updater until signing is in place. This document is the technical design for that remediation work.

The single biggest decision the design encodes: **VOS becomes a safe-by-default tool.** Detection stays comprehensive. Auto-fix shrinks to a small set of changes that are reversible, app-scoped, and cannot trade off host security. Aggressive Windows tweaks that previously had auto-fix support are removed entirely. Findings VOS can no longer fix are still surfaced in the scan as plain-English explanations, but the user is responsible for any changes outside the new auto-fix surface.

## Posture

The decision space was three-way: safe-by-default, power-user-with-airbags, or tiered with an "advanced mode" toggle. The maintainer chose safe-by-default. Detection is unchanged; auto-fix is dramatically narrowed; non-fixable findings surface as info-only entries in the scan results.

This is the foundation under every other decision in the document.

## Auto-fix triage

### Kept as auto-fix (six items)

These are reversible, app-scoped, or use Win32 APIs Task Manager exposes. None require admin. None touch the registry directly. None create AV-shaped silhouettes.

- **VRChat `config.json` edits.** Avatar physics caps (`dynamic_bone_max_*` keys, which still control PhysBones limits in modern VRChat), avatar culling distance, cache size. Plain JSON edits to a user-writable file under `LocalLow`. Per-key undo via the existing fix-history records.
- **VRChat MSAA fix.** Same file as above.
- **VRChat cache cleanup.** File deletion under the user's VRChat cache directory.
- **Steam launch option for X3D users.** Writes a single `cmd /c start /affinity FFFF /high "" %command%` string into Steam's per-user `localconfig.vdf`. Reversible by clearing the field.
- **GPU driver installation (where supported).** Spawns the vendor's official installer (NVIDIA / AMD / Intel) which self-elevates; VOS itself does not need admin for this.
- **Live Optimizer.** Process priority management during VR sessions. See "Live Optimizer" section for the full specification. Off by default; users opt in through a disclosure dialog.

### Removed entirely (no auto-fix, no manual guide, deleted from the codebase)

These are either myths, net-negative outside of narrow workloads, or active security downgrades. They will not appear in the action plan, the manual guide page, or any documentation as a recommended tweak. The detection rules also go (the "you have Defender exclusions configured" rule has no analogue, since the ones VOS itself created will be unwound on first run after upgrade).

- `SystemResponsiveness = 0` (MMCSS reservation). Modern Windows normalizes the value; setting it to zero produces no measurable effect. Multiple tester reports already documented this.
- The 30-second `NtSetSystemInformation` standby-list purge. Net-negative outside of long VR sessions; causes cache misses and disk thrashing in normal browser/Discord use. Also one of the most malware-shaped API calls in the entire codebase.
- Steam compositor priority elevation (any change to `vrserver.exe` or `vrcompositor.exe` priority class). Priority-inversion antipattern; raising the compositor above the workload it's compositing is the opposite of what helps.
- `Add-MpPreference -ExclusionPath` for Defender. Creates predictable safe haven directories; no responsible manual guide can be written for this either.
- `DODownloadMode` HTTP-only. Marginal performance gain, security implication, not worth keeping.
- The "upgrade your storage controller driver" rule. Bad routing for typical users; pointed at the Microsoft Update Catalog, which is not the right place to send anyone for AHCI/NVMe drivers. The rule itself goes; VOS won't suggest this.

### Demoted to detection-only (no auto-fix, info-only display)

The scan continues to detect these conditions and explain in plain English what they mean for VR performance. There is no fix-it button, no manual guide with regedit steps, and no copyable commands. If a user wants to make the change, they research it themselves or ask a friend.

- Hyper-V / VBS enabled. Detection only. Explanation includes the Memory Integrity tradeoff so the user can make an informed call.
- Windows Update deferral keys. Detection only.
- MSI mode and ASPM state. Detection only.
- HAGS state. Detection only.
- Windows Power Plan setting. Detection only. (Even the `powercfg` route, which technically uses Microsoft's blessed CLI, is dropped from auto-fix per the strict "no registry-touching writes" decision.)

The UI affordance for this category is a simple read-only callout in the scan results: title, plain explanation, technical detail in the expandable section, no Apply button. These items don't appear in the action plan at all.

## Live Optimizer specification

### Behavior

Off by default. When enabled by the user, polls the running process list every 2 seconds for known VR processes. When one is detected:

- The detected VR process gets `os.constants.priority.PRIORITY_HIGH` via `os.setPriority(pid, priority)` (Node stdlib).
- Every process whose name matches the lowering allowlist gets `PRIORITY_BELOW_NORMAL`.
- A record of original priority for each affected process is written to in-memory state and to `live-optimizer-state.json` on disk.

When all detected VR processes have exited, the optimizer reads the state file and restores every process's original priority. The state file is then cleared.

If VOS is launched and finds a non-empty state file (indicating an unclean prior shutdown), it reads the file, looks up each PID, and either (a) restores priority if the process is still running with a priority VOS would have changed, or (b) discards the entry if the process is gone or has a priority outside the lowered range.

### Trigger list (VR processes that activate the optimizer)

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

### Lowering allowlist (background processes whose priority will be reduced)

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

OBS (`obs64.exe`) is intentionally not on this list. If users want OBS lowered they can add it themselves; the default skips it because lowering OBS during a recording silently degrades capture quality.

### Hard never-touch list

Hardcoded in source, not user-editable. The optimizer refuses to change priority on any process whose name matches:

- System processes: `System`, `Idle`, `lsass.exe`, `csrss.exe`, `winlogon.exe`, `services.exe`, `svchost.exe`, `dwm.exe`, `wininit.exe`, `smss.exe`
- Anti-cheat services: `EasyAntiCheat.exe`, `EasyAntiCheat_EOS.exe`, `BEService.exe`, `BEServiceV2.exe`, `vgc.exe`, `vgtray.exe`, `EasyAntiCheat_Setup.exe`
- Headset runtime: `OVRServer_x64.exe`, `OculusClient.exe` (when not the trigger), `vrserver.exe`, `vrdashboard.exe`
- Anything in `C:\Windows\System32` or `C:\Windows\SysWOW64`, regardless of name
- The VOS process itself

### Hard concurrency cap

The optimizer will not lower priority on more than 25 processes simultaneously. If the allowlist matches more than 25 currently-running processes, the optimizer takes the top 25 by current CPU usage and leaves the rest alone. This protects against an edge case where a malformed allowlist file causes runaway behavior.

### Pre-enable disclosure

Before the toggle can be turned on, a modal explains exactly what the optimizer does, what it touches, what it doesn't touch, and how restoration works. Full text is in the relevant section of `2026-04-30-vos-remediation-design.md` (this file, "Live Optimizer disclosure copy" appendix). The user must check an "I've read this" box to enable.

The Settings page also includes:

- A "View trigger list" button that opens `live-optimizer-triggers.json` in the user's default editor.
- A "View allowlist" button that opens `live-optimizer-allowlist.json`.
- A "Live Optimizer activity log" panel showing the last 10 sessions: when activated, what got lowered, what got raised, when deactivated, what got restored. Persists across launches.

## Architecture

### Drop the admin requirement

VOS no longer requires elevation. The installer no longer requests UAC. The app itself runs as the standard user.

This is possible because:

- All file edits in the new auto-fix surface land in user-writable paths (`%LocalAppData%`, `%AppData%`, Steam's `userdata`).
- `os.setPriority` works on processes owned by the current user without elevation. The Live Optimizer does not need admin to lower Discord or raise VRChat — same user.
- GPU driver installers self-elevate via their own UAC prompt when launched.

Dropping admin eliminates roughly 70% of the security audit's critical-severity findings on its own, because local privilege escalation requires elevated context to escalate from. With VOS running as the user, any bug becomes a same-user issue, which is a much smaller blast radius.

### Eliminate PowerShell entirely (v0.3)

The detection layer is being rewritten to remove every `pwsh.exe` spawn from the codebase. WMI queries move to the `wmi-client` npm package (pure Node, talks to WMI over DCOM). Process enumeration moves to `ps-list` (small, calls `tasklist` via `child_process.execFile` with no shell interpolation). Registry reads use `reg query` via `execFile` with parameterized arguments, never via PowerShell.

The interim v0.2.9 release does not remove PowerShell — it ships the bug fixes and posture changes only. Full PS removal lands in v0.3, roughly 2–3 weeks later. This deliberate split keeps v0.2.9 small enough to ship in 3–4 days while letting the architecture work happen at its own pace.

### Replace `execSync` template literals with parameterized calls

Every `execSync(\`some-command "${maybeUserInput}"\`)` pattern in the codebase becomes either `execFile('some-command', [maybeUserInput, ...])` or `spawn('some-command', [...])` with arguments passed as an array. The shell is no longer involved in argument parsing; the OS passes the array straight to the target executable's `argv`. This eliminates command-injection as an attack surface entirely.

This sweep happens in v0.2.9 alongside the bug fixes, since the call sites are concentrated in `src/main/utils/registry.ts` and `src/main/utils/powershell.ts`.

### No native addon, no FFI

`os.setPriority` and `os.getPriority` exist in Node's standard library. Process enumeration via `ps-list` (~3KB) is sufficient. There is no need for an N-API addon, `node-ffi-napi`, or `koffi` for the Live Optimizer's needs.

This was an earlier design assumption that turned out to be wrong: the security audit's "build a signed native DLL" recommendation made sense for the original codebase that called `NtSetSystemInformation` and manipulated process tokens, but since both of those are being deleted, the residual Win32 needs are all already in Node's stdlib.

### Code signing

Deferred until SignPath.io approval clears (free for open-source projects, ~few weeks of review) or until Microsoft Trusted Signing is purchased ($10/month). Both options work without a hardware USB token. Both integrate with `electron-builder` via configuration.

Until either is available, all releases ship unsigned with prominent verification instructions in the README and the install video. The auto-updater stays disabled across v0.2.9 and v0.3, regardless of when signing arrives.

## Bug fix backlog (v0.2.9)

These are concrete, reported bugs. Each gets fixed in v0.2.9 alongside the posture changes.

1. **GTX 1060 3 GB vs 6 GB conflation.** The cards use different GPU dies (GP106-300 vs GP106-400) with different SM counts. The hardware database treats them as a single row and the WMI device-ID parser doesn't disambiguate. Fix: split into two database entries keyed on VRAM.

2. **"Fake RAM" UI label.** Misnomer. Renamed everywhere it appears to "Page file" or "Virtual memory" depending on context.

3. **Single-channel detection mis-firing on certain BIOSes.** The DIMM-slot WMI parser misreads slot population on some boards. Fix: rewrite against a wider sample of BIOS outputs; collect specific repro hardware from Blake.

4. **"Upgrade your storage controller driver" rule.** Deleted entirely per the triage section.

5. **Idle 100% CPU spike.** Symptom is the live optimizer's PowerShell scanner cold-starting `pwsh.exe` every cycle. Stopgap fix in v0.2.9: raise polling interval to 5 seconds, skip WMI calls when no VR process is detected. Permanent fix in v0.3: PS removal eliminates the cold-start entirely.

6. **PowerShell cold-start overhead.** Aldrich's catch. Even outside the live optimizer, every WMI query spawns a fresh `pwsh.exe`. Permanent fix: PS removal in v0.3.

7. **`execSync` command injection vectors.** Every template-literal shell call replaced with `execFile(args[])` in v0.2.9.

## Release plan

### v0.2.9 (target: 4 days from start)

- All seven bug fixes above.
- Auto-fix triage applied: deleted fixes removed from code, demoted fixes converted to detection-only display.
- Live Optimizer rewritten: Node-native, disclosure dialog, allowlist + trigger files, activity log.
- Admin requirement dropped. Installer + app run as user.
- `execSync` template literals replaced with `execFile` across the codebase.
- README updated to match the new posture.
- All changes credited to specific reporters in the release notes by handle.

Auto-updater remains disabled. Distribution via GitHub Releases, manual download, SHA-256 verification per the install instructions.

### v0.3.0 (target: 2–3 weeks after v0.2.9)

- PowerShell removed entirely. Detection layer uses `wmi-client` for WMI and `execFile` calls for everything else.
- Manual-guide UI polish (info-only display refined based on v0.2.9 feedback).
- Updated install/usage video matching the new UX.
- Code signing if SignPath / MS Trusted Signing has cleared by then.

If signing has cleared, v0.3 also flips the auto-updater back on. If it hasn't, the auto-updater stays off into v0.4.

## Communication strategy

### Per-release artifacts

Each release ships with:

- **GitHub Release page.** Detailed notes. Every change tagged to its reporter by handle (Blake, Aldrich, Yeusepe, the auditor, etc.). Includes the SHA-256 of the installer and the unsigned-build verification instructions.
- **X post.** Short summary, link to release notes, tags every credited reporter. No chest-beating; just "here's what landed and who flagged it."
- **README sync.** The repo README reflects current posture, not last-week's posture, so anyone landing fresh sees the right shape immediately.

### One-time engagements

- Direct DM reply to Blake referencing the v0.2.9 release with PR/commit links to each fix from his original list. The DM was already drafted and sent earlier in the remediation work.
- Public thank-you to Aldrich, Yeusepe, xNanochip, and the auditor in the v0.2.9 release notes. No tags or @-mentions in the X post unless they want to be tagged (some critics prefer not to be).
- VixenVRC reviews each release before merge. Public sign-off in the release notes.

### Code quality commitments

The remediation work introduces and enforces the following guardrails on new code, partly to address the "AI slop" reputation issue head-on:

- No box-drawing comment dividers (`// ──── Section ────`). Comments only when explaining *why*; never narration of what.
- No em-dashes in comments or in user-facing copy. Periods or colons or commas instead.
- No "Phase 1 / Phase 2" comment scaffolding in implementations.
- Existing utilities reused. New utilities added only when no equivalent exists.
- Less defensive boilerplate. Errors caught at API boundaries, not at every line.
- Variable naming matches the existing codebase style. New code does not silently reformat or "improve" the conventions of files it edits.
- Commit messages vary in style. Not every commit needs a Conventional Commits prefix.

These apply to all new code. Existing code retains its style until separately cleaned up. If a file with old-style comments is touched during remediation, the old `── Section ────` headers are quietly removed in the same edit but the file is not otherwise reformatted.

## Out of scope

The following are deliberately not part of this remediation. They may land in later versions but they don't block v0.2.9 or v0.3.

- A bifurcated UI/elevated-service architecture. The audit recommended this; the safe-by-default posture makes it unnecessary because there's no longer any elevated work to do.
- A native helper DLL or N-API addon. Same reason.
- Reproducible builds. Worth pursuing eventually for additional verification, but not blocking.
- Localization. The app is English-only and will remain so through v0.3.
- macOS or Linux support. Windows-only by design.
- A formal threat model document. The whitepaper from the public audit serves as a starting reference; a maintainer-written threat model can come later.

## Open questions

None blocking implementation. Items the maintainer may want to revisit during or after v0.3:

- Whether the manual-guide UI should ever exist for the demoted-to-detection items, or whether detection-only is permanent.
- Whether the Live Optimizer's allowlist should sync from a community-maintained list as a future feature.
- Whether the auto-updater, when re-enabled, should default to "check on launch" or "check daily" or remain user-prompted.

---

## Appendix: Live Optimizer disclosure copy

Verbatim text shown in the pre-enable modal. Word-for-word; do not paraphrase.

> **Live Optimizer — what this will do**
>
> When enabled, the Live Optimizer watches for a VR session to start. While VR is running, it temporarily lowers CPU priority on a list of background apps so your VR game gets more scheduler time. It also raises the VR game's priority. When VR closes, every change is reversed.
>
> **What it touches:**
>
> - Process priorities only. The same setting Task Manager exposes under Details, Set Priority.
> - Nothing on disk.
> - Nothing in the registry.
> - No services started, stopped, or modified.
> - No firewall rules, no network changes.
> - No drivers loaded, no kernel calls.
>
> **How it triggers:**
>
> Once enabled, VOS polls the running process list every 2 seconds for known VR processes. The full list is in `resources/live-optimizer-triggers.json` and you can audit it from Settings.
>
> When a VR process starts, the optimizer activates. When all of them exit, the optimizer restores everything.
>
> **What gets lowered:**
>
> Only processes whose name matches the allowlist. The allowlist is a strict list, not a pattern; nothing not on it is touched.
>
> **What gets raised:**
>
> The detected VR process itself, to High priority. Same call Task Manager makes.
>
> **What it will never touch — by design:**
>
> - System processes (`System`, `lsass.exe`, `csrss.exe`, `svchost.exe`, `winlogon.exe`, `dwm.exe`, anything in `C:\Windows\System32` or `SysWOW64`).
> - Anti-cheat services (`EasyAntiCheat.exe`, `BEService.exe`, `vgc.exe`, and friends).
> - Headset runtime (`OVRServer_x64.exe`, `vrserver.exe`, the SteamVR compositor, anything Virtual Desktop or ALVR ships). These need full priority to keep frames flowing to your headset.
> - Any process not on the lowered-allowlist.
> - The VOS process itself.
>
> **Crash recovery:**
>
> If VOS or your PC crashes during a VR session, priority changes don't survive a process restart on Windows. They're per-process and die with the parent. On the next VOS launch, any process still running with a priority VOS changed will be restored. You should never end up with a permanently de-prioritized Discord.
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
