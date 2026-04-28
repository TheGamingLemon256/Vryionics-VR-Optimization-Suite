# Contributing

PRs welcome. Vryionics VR Optimization Suite is an actively-developed open-source project and we're happy to merge improvements.

## Getting started

```bash
git clone https://github.com/TheGamingLemon256/Vryionics-VR-Optimization-Suite.git
cd Vryionics-VR-Optimization-Suite
npm install
npm run dev          # development build with hot reload
```

Requires Node 20+ and Windows 10 or 11 to actually run (the app is Windows-only).

## What's most useful

Listed roughly in descending order of community impact:

### 1. Hardware database expansions
The `src/main/data/` folder contains structured databases of CPUs, GPUs, motherboard chipsets, RAM kits, Wi-Fi adapters, drivers, and game profiles. Adding entries here directly improves diagnostic accuracy for users with the corresponding hardware.

| File | Add entries when |
|---|---|
| `cpu-database.ts` / `cpu-intel.rules.ts` | A CPU we don't have detailed VR-relevant notes for |
| `gpu-database.ts` | New GPUs (especially refresh SKUs) |
| `hardware-database.ts` | Motherboard chipsets, RAM kits, Wi-Fi chipsets |
| `driver-database.ts` | Known-good / known-bad GPU driver versions for VR |
| `game-profile-database.ts` | New VR titles with bottleneck classifications |

Each entry is a typed object with a documented schema; follow existing examples.

### 2. Headset profiles
`src/main/headsets/profiles/*.json` — one JSON file per headset. Schema is documented in `_template.json`. Adding a new headset surfaces correct connection options, requirements, known issues, and optimization tips for users of that headset.

### 3. Diagnostic rules
`src/main/rules/rules/*.rules.ts` — each file exports rule objects that take `ScanData` and return `RuleResult` (or null). Rules are how the Action Plan and Health Cards are populated. New rules should:

- Be VR-specific (generic Windows-tuning rules belong in a different project)
- Have both `simple` and `advanced` explanations
- Reference an existing fix where possible, or be guidance-only with `fixId: undefined`

### 4. Fixes
`src/main/fixes/engine.ts` — fixes are objects with `preview()`, `apply()`, and `undo()` methods. Every fix MUST:

- Be reversible (or explicitly mark itself as not, with strong justification)
- Show a meaningful preview before applying
- Store backup data so the undo can restore exact prior values
- Default to `requiresAdmin: false` unless it actually needs HKLM / service control

### 5. Translations
The app is currently English-only. The renderer's text is sprinkled across React components rather than a single i18n catalogue, so localization would require an i18n refactor first. PRs that introduce a clean i18n layer (we'd accept `react-i18next` or similar) are welcome.

### 6. Documentation
[`docs/`](docs/) is sparse. User-facing how-tos, fix explanations with screenshots, and recovery guides for "I applied a fix and now X is broken" scenarios are all useful contributions.

## Style conventions

- TypeScript strict mode is on; respect it
- Prefer explicit over clever — this codebase has lots of contributors with varying experience levels
- Comment **why**, not what — comments that just rephrase the code are noise; comments that explain a non-obvious decision or constraint are gold
- One concept per PR. "Add hardware DB entries for AM5 + fix dynamic-bone bug + refactor scan IPC" should be three PRs, not one
- No new dependencies without discussion. We've kept the dep tree small on purpose

## Testing your changes

1. `npm run build` should complete without TypeScript errors
2. `npm run dev` should launch the app
3. Run a full scan; verify your changes show up in the UI
4. If you added a fix, run the preview and apply flows manually; then test undo
5. If you modified the live optimizer or service-stopping code, verify recovery on next launch by force-killing the app mid-session

There is currently no automated test suite — adding one is on our backlog.

## PR review

Open a PR against `main`. We aim to triage within 72 hours. Drive-by code-style nits will be batched separately so your PR doesn't become a bikeshed.

If your change involves a real fix to a real user issue, **link the originating GitHub issue** so we can close both at once.

## Getting help

- Open an issue with the `question` label — community members can answer
- Check existing issues + closed PRs first; common questions are usually answered there
- Discord: **TBD** (community channel is being set up)
