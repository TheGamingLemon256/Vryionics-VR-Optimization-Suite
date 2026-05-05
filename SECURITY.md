# Security Policy

## Reporting a vulnerability

If you find a security issue in Vryionics VR Optimization Suite, please **don't open a public issue.** Email the maintainer at **thegaminglemon256@gmail.com** instead. We aim to acknowledge reports within 72 hours.

A "security issue" includes but isn't limited to:

- Code paths that could be exploited to escalate privileges. v0.2.9 dropped the admin requirement and stops short of HKLM writes, so there shouldn't be much surface here, but if you find one, please flag it.
- Command injection or argument-smuggling in any of the `execFile` callsites (we converted away from `execSync` template literals in v0.2.9, but a missed spot is exactly the kind of thing a fresh pair of eyes finds)
- Authentication bypasses against the auto-updater or driver download flows
- TOCTOU bugs between the SHA-512 verification of the auto-updater installer and the install step
- IPC bridge bypasses: a way for the renderer to invoke main-process behaviour outside the explicit channel and config-key allowlists
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

What VOS protects against:

- **Auto-update tampering** — every update download verifies SHA-512 against the value published in the release's `latest.yml`. If `latest.yml` has no hash, the install is refused outright.
- **Driver installer tampering (partial)** — downloads come exclusively from a pinned set of vendor HTTPS domains, with size sanity checks and a SHA-256 verification when the vendor publishes one. **Authenticode subject pinning is not present in v0.2.9** — Get-AuthenticodeSignature was the only available verifier and PowerShell was removed from the codebase. Re-introducing publisher pinning via a non-shell verifier is tracked for v0.3.
- **Renderer compromise containment** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The preload bridge only accepts an explicit allowlist of subscribable channels and an explicit allowlist of config keys. CSP blocks remote script loads; `web-contents-created` blocks navigation off-app and rejects non-https `window.open`.
- **Fix-engine catastrophic failure** — every fix preview is shown before apply; every fix has a documented undo path. The auto-fix surface in v0.2.9 is narrow and reversible by design (no HKLM writes, no service stops via the fix engine).

What VOS does **not** protect against:

- A compromised user account
- A compromised GitHub account / repository (if maintainer credentials or, eventually, signing keys are compromised, attackers could push a malicious release). v0.2.9 ships no GitHub PAT in the installer.
- Authenticode-level tamper detection of vendor driver installers (see above)

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
| `src/main/drivers/installer.ts` | Downloads + executes vendor `.exe` files. Size check + SHA-256 check live here. Authenticode pinning intentionally absent in v0.2.9 (see threat model above). |
| `src/main/updater.ts` | Auto-updater download path. SHA-512 verification is mandatory. |
| `src/main/utils/url-guard.ts` | The single `isHttpsUrl` gate used by `shell.openExternal`, `setWindowOpenHandler`, and the `web-contents-created` lockdown. |
| `src/main/ipc/validators.ts` | Renderer-payload validators: the config-key allowlist and the setup-wizard schema. |
| `src/main/ipc/system.ts` | Where the validators above are actually wired into `ipcMain.handle`. |
| `src/preload/index.ts` | The contextBridge surface. The subscribable-channels allowlist lives here. |
| `src/main/index.ts` | `BrowserWindow` config (`sandbox`, `contextIsolation`, `nodeIntegration`) and the `web-contents-created` navigation lockdown. |
| `src/main/fixes/engine.ts` | The (narrow) auto-fix engine. v0.2.9 removed the HKLM-writing fixes; what remains should stay app-scoped and reversible. |
| `src/main/live-optimizer/optimizer.ts` | Sets process priorities via `os.setPriority`. The never-touch list and 25-process cap live here. |

We welcome PRs that improve the security posture of any of these paths.
