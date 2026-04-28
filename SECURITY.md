# Security Policy

## Reporting a vulnerability

If you find a security issue in Vryionics VR Optimization Suite, please **don't open a public issue.** Email the maintainer at **thegaminglemon256@gmail.com** instead. We aim to acknowledge reports within 72 hours.

A "security issue" includes but isn't limited to:

- Code paths that could be exploited to escalate privileges (we apply registry / system changes legitimately, but if there's a way for an attacker to hijack one of our flows, that's a security issue)
- Path-traversal or injection in any of the PowerShell scripts we generate
- Authentication bypasses against the auto-updater or driver download flows
- TOCTOU bugs in the signature-verification path of the driver installer
- Exposure of the bundled GitHub PAT beyond its intended read-only scope
- Anything that would let a malicious driver / fix / report tamper with the user's system

## Safe-harbor for researchers

We won't pursue legal action against good-faith security research. Specifically you may, without prior permission:

- Run automated tools against your own copy of the binary
- Reverse-engineer the binary
- Test the auto-updater / driver installer / fix-engine flows on your own systems
- Submit findings publicly **after** we've had a reasonable chance to fix them (we'll coordinate disclosure timing with you on confirmed issues)

We ask that you don't:

- Test on systems you don't own
- Exploit a finding beyond what's needed to demonstrate it
- Disrupt our update server or GitHub release infrastructure

## Threat model

What VROS protects against:

- **Driver installer tampering** — every silent install verifies Authenticode signature against a publisher allowlist (NVIDIA Corporation, Advanced Micro Devices, Intel Corporation, Realtek Semiconductor, Qualcomm, MediaTek, Microsoft Corporation) AND, where vendors publish hashes, verifies SHA-256
- **Auto-update tampering** — every update download verifies SHA-512 against the value published in the release's `latest.yml`
- **Fix-engine catastrophic failure** — every fix preview is shown before apply; every applied fix creates a System Restore Point first; every fix has a documented undo path

What VROS does **not** protect against:

- A compromised user account (admin-required fixes will run if the user is admin)
- A compromised GitHub account / repository (if our PAT or signing keys are compromised, attackers could push a malicious release)
- Targeted attacks on the bundled webhook URL (Discord webhook URLs are public-equivalent — anyone with the URL can post)

## Coordinated disclosure

For non-trivial issues we'll coordinate disclosure with you. Typical timeline:

| Day | Step |
|---|---|
| 0 | Receive report. Acknowledge within 72 h. |
| 1–7 | Confirm reproduction, assess severity, draft fix |
| 7–30 | Ship patch in next release. Credit you in the changelog (or not, if you'd rather stay anonymous). |
| 30+ | Public disclosure if you choose to publish. We won't object. |

## Security-relevant code paths

If you're looking for places where bugs would have outsized impact:

| File | Why it matters |
|---|---|
| `src/main/drivers/installer.ts` | Downloads + executes vendor `.exe` files. Signature + hash checks live here |
| `src/main/updater.ts` | Same pattern for our own auto-updater |
| `src/main/fixes/engine.ts` | Applies registry changes + service modifications. Backup + restore logic must be exact |
| `src/main/live-optimizer/optimizer.ts` | Stops + starts Windows services. Crash recovery via `service-recovery.ts` |
| `src/main/live-optimizer/service-recovery.ts` | The "if we crash mid-VR, restart these services on next launch" guard |
| `src/main/support/webhook-reporter.ts` | Outbound HTTPS POST. URL validation here |
| `update-server/ps-helpers/vros-helpers.ps1` | All the .NET P/Invoke into kernel32 / ntdll / advapi32. Privilege adjustment in standby cleaner |

We welcome PRs that improve the security posture of any of these paths.
