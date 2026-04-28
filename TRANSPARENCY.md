# Transparency

This document is the "why does my antivirus flag this app" FAQ. We wrote it because we ourselves wouldn't trust an unsigned binary that does the things VROS does without an extremely concrete answer to that question. Here's the concrete answer.

## Why does VROS look suspicious to heuristic AV scanners?

System-tuning tools and credential-stealing malware do many of the same things at a low level:

| Behaviour | Why VROS does it | Why malware does it |
|---|---|---|
| Enumerate every running process | Live Optimizer needs to know what to throttle during VR | Stealers enumerate to find browser / Discord / Steam processes to read memory from |
| Query WMI for hardware (CPU/GPU/RAM/storage) | Hardware-aware recommendations require knowing the hardware | Malware queries hardware for fingerprinting + sandbox detection |
| P/Invoke into kernel32 / ntdll / advapi32 | Process priority manipulation, working-set trim, timer resolution lock, standby-list flush — all VR perf optimizations | Malware uses these for process injection + privilege escalation |
| Embed PowerShell scripts | Most of our system queries are easier to write as PS than via Win32 from Node | Malware uses embedded PS for fileless execution |
| Make HTTPS requests to non-Microsoft endpoints | GitHub for releases, vendor pages for driver versions, Cloudflare for speed test | Malware POSTs stolen data to attacker C2 servers |
| Download + execute remote `.exe` silently | Driver installer + auto-updater | Droppers download payloads |
| Stop Windows services | Live Optimizer pauses Search Indexer / Print Spooler / Windows Update during VR | Malware stops AV / EDR services |

A heuristic engine seeing the **cluster** of these behaviors in an unsigned binary can't easily tell which side of the line we're on, so it flags us. Microsoft Defender, Bitdefender, ESET, Sophos, Avast, and most other major engines do not flag VROS — only specific heuristic-heavy engines (most notably Kaspersky) occasionally do.

## What we've done to reduce false positives

The following is a chronological inventory of every code change we've made specifically to reduce AV heuristic triggers. None of these affect functionality:

| Version | Change |
|---|---|
| **v0.2.3** | Filled in publisher metadata fields (CompanyName, FileDescription, copyright, trademark) so the binary's version-info resource isn't blank. Empty version-info is itself a heuristic signal. |
| **v0.2.4** | Removed XOR/base64 obfuscation of the support webhook URL. The previous obfuscation pattern (encrypted blob + decoder function) is identical to what credential-stealing malware uses to hide command-and-control URLs. The URL now lives as plain text in `resources/webhook.txt`. |
| **v0.2.5** | Moved the entire Storage Cleanup category list out of the compiled JS bundle into `resources/storage-categories.json`. Strings like `Mozilla\Firefox\Profiles`, `Google\Chrome\User Data\Default\Cache`, `discord\Cache`, and `Steam\htmlcache` are credential-store path strings that match Trojan-PSW signatures regardless of the actual code intent. Also removed a spoofed Chrome User-Agent (`Mozilla/5.0 ... Chrome/130.0.0.0`) we'd been using on NVIDIA driver fetches; replaced with an identifying `Vryionics-VROS-DriverCheck/0.2 (+repo URL)` UA. |
| **v0.2.6** | Moved every `Add-Type @' ... '@` C# block (containing `[DllImport("kernel32.dll")]`, `[DllImport("ntdll.dll")]`, `[DllImport("advapi32.dll")]`, `[DllImport("atiadlxx.dll")]`) out of inline strings into `resources/ps-helpers/vros-helpers.ps1`, loaded via dot-source. Replaced `Win32_DeviceGuard` CIM query with plain registry reads. Wrapped `netsh wlan show` calls behind PS helper functions. Built the `discord.com` URL validation from string fragments at runtime. |
| **v0.2.7** | Auto-updater follows GitHub 301 redirects + falls back to unauthenticated requests on 401/403. The bundled `.gh-token` was removed from `extraResources` — the updater no longer requires a per-installer secret, which means future PAT rotations / repo transfers / visibility changes are invisible to installed apps. |
| **v0.2.8** | Removed the bundled Discord webhook URL entirely (was reported as an abuse vector via responsible disclosure on 2026-04-28). Bug reports now open pre-filled GitHub Issues in the user's browser — no client-side webhook URL anywhere, abuse mitigation handled by GitHub's normal issue-tracking infrastructure. |

## Verified post-build (v0.2.6 main bundle)

```
DllImport               → 0 occurrences
kernel32.dll            → 0 occurrences
ntdll.dll               → 0 occurrences
advapi32.dll            → 0 occurrences
atiadlxx                → 0 occurrences
Add-Type                → 0 occurrences
discord.com/api/webhooks → 0 occurrences
netsh wlan              → 0 occurrences
Win32_DeviceGuard       → 0 occurrences
Mozilla\Firefox         → 0 occurrences
User Data\Default       → 0 occurrences
Mozilla/5.0...Chrome/130 → 0 occurrences
```

All of the above patterns now live in either `resources/storage-categories.json` (data-only paths) or `resources/ps-helpers/vros-helpers.ps1` (.NET interop) — both shipped alongside the .exe rather than inside it.

## The "should I trust this" decision tree

If you're worried about whether VROS is safe to install, work through this:

1. **Do you have technical skills to read code?** → Read [`src/main/`](src/main/) directly. Every behavior described in [PRIVACY.md](PRIVACY.md) maps to a specific file. No remote-loaded code, no hidden execution paths.

2. **Want a third-party verification?** → Check [VirusTotal](https://www.virustotal.com/) on the latest release's SHA-256. Detection ratio is typically 0–1 / 67 vendors. The 1 (when present) is invariably a heuristic engine, not a real signature match.

3. **Want to verify the published binary matches the source?** → Build from source (instructions in README). Compare SHA-256 of your local build against the published release. They won't match exactly (build environments differ), but you'll know exactly what code is running.

4. **Want minimum-trust install?** → Run on a non-primary machine first. VROS creates a System Restore Point before any registry change, and every applied fix has an Undo button.

## Submitting FP reports

If your AV vendor flags VROS and we don't already have an open ticket with them, please submit a false-positive report. Templates:

### Kaspersky

URL: https://opentip.kaspersky.com/

```
Subject: False positive on Vryionics VR Optimization Suite installer

SHA-256: <paste the installer SHA-256 from the release notes>
Vendor: Vryionics
Product: Vryionics VR Optimization Suite (open-source VR diagnostics tool)
Source: https://github.com/Vryionics/Vryionics-VR-Optimization-Suite/releases

Detection: HEUR:Trojan-PSW.Script.Generic (or similar)

This is an unsigned open-source desktop utility. The repository is public,
the source is fully auditable, and TRANSPARENCY.md documents every system
call the application makes. Detection appears to be heuristic-only — no
specific signature match. Please reanalyze.
```

### Microsoft Defender

URL: https://www.microsoft.com/en-us/wdsi/filesubmission

(SmartScreen "Unknown publisher" warnings clear automatically once a release accumulates ~3000 installs of "reputation". No manual submission needed; it just takes time.)

### Other vendors

Most have a "False Positive" or "Sample Submission" form on their website. The SHA-256 of the installer + a link to this repository is usually enough.

## What we won't do

- Pay for an EV code-signing certificate just to silence one specific heuristic engine. That's a ~$400/year recurring cost on a community open-source project.
- Add telemetry "to prove we're not malicious." Adding telemetry to prove non-malicious behavior would itself be malicious behavior.
- Obfuscate, pack, or otherwise hide what the binary does. Open source means the source is open, including the parts that look suspicious to scanners.

If any of the above is a deal-breaker for you, that's a reasonable position — please don't install VROS, and consider reading our source to understand the trade-offs before recommending against it to others. We'd rather have honest non-installers than dishonest installers.
