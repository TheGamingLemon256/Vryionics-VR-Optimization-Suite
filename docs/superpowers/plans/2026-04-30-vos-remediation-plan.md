# VOS remediation implementation plan

> For agentic workers: REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take VOS from "AI-stitched script wrapper" to "safe-by-default diagnostic tool with reversible app-scoped fixes." Land as v0.2.9.

**Architecture:** Drop admin requirement. Drop WMI; hardware reads via `reg query` through `execFile`. Eliminate PowerShell. No native addon, no FFI. Live Optimizer rewritten on Node stdlib (`os.setPriority`) plus `ps-list`.

**Tech Stack:** Electron, electron-vite, TypeScript, Zustand (renderer), Tailwind, electron-builder. Adds: `vitest` (tests), `vdf` (Steam config parsing), `ps-list` (process enumeration).

**Spec:** `docs/superpowers/specs/2026-04-30-vos-remediation-design.md`. Read it first; this plan assumes you have.

---

## Anti-vibeslop guardrails

The user explicitly called out that the codebase has been criticized for "AI-stitched" code style. The #1 quality bar of this implementation: the resulting code must read like a thoughtful person wrote it, not like an LLM autocompleted it. Every task in this plan must hold to these constraints.

### Comments
- No box-drawing dividers in source files. Whitespace and named functions are sufficient structure.
- No comments that narrate what the code does (`// loop through items`, `// set the priority`). Comments only explain WHY when the why is non-obvious.
- No "Phase 1 / Phase 2 / Step 1" comment scaffolding inside functions.
- Multi-line JSDoc only on exported functions whose intent isn't clear from name and signature. Internal helpers get one-line `//` comments at most.
- No "TODO" comments in shipped code. Either fix it now or open an issue.

### Strings (errors, log messages, user-facing copy)
- No em-dashes. Use periods, colons, or commas.
- No three-bullet parallel structures in error messages.
- Error messages name the actual operation that failed and the input, not "an error occurred while processing the request."
- Log messages match the existing `src/main/logger.ts` style. Look at adjacent calls before adding new ones.

### Code style
- Variable names match the surrounding file.
- No defensive try/catch wrapping every line. Catch errors at boundaries (IPC handlers, top-level scanner functions). Trust your own pure logic.
- No `?.` chains where the structure is statically known.
- No reformatting touched files. Match what's already there.
- No `as any`. Use `unknown` and narrow.
- Tests don't deeply nest `describe`. One or two levels max.

### File structure
- New files go where similar files already live.
- File-level comments explain what the file is for in one sentence, not three paragraphs of design rationale.

**Per-task callouts:** Each task that adds new code includes a short list of "vibeslop traps" specific to that change.

---

## File structure

### Files to create
- `src/main/utils/registry-read.ts` — read-only `reg query` wrapper with parameterized args.
- `src/main/utils/dxgi-vram.ts` — DXGI fallback for VRAM detection when registry binary parse misses.
- `src/main/live-optimizer/state-store.ts` — `live-optimizer-state.json` reader/writer.
- `src/main/live-optimizer/allowlist.ts` — allowlist + trigger list loader with never-touch filter.
- `src/main/live-optimizer/never-touch.ts` — hardcoded never-touch list.
- `src/main/live-optimizer/activity-log.ts` — activity log persistence.
- `resources/live-optimizer-triggers.json` — default trigger list.
- `resources/live-optimizer-allowlist.json` — default lowering allowlist.
- `vitest.config.ts` — test runner config.
- `tests/registry-read.test.ts`, `tests/x3d-affinity.test.ts`, `tests/live-optimizer/*.test.ts`.

### Files to modify
- `package.json` — add test scripts; add `vitest`, `ps-list`, `vdf`.
- `electron-builder.yml` (or `.json5` / wherever the builder config lives) — drop `requireAdministrator`, set `asInvoker`.
- `src/main/fixes/engine.ts` — delete six removed fixes; rewrite Steam launch-option fix; remove anything that needs admin.
- `src/main/rules/rules/*.rules.ts` — delete or convert demoted rules.
- `src/main/rules/rules/index.ts` — update rule registration.
- `src/main/scanner/modules/{cpu,gpu,ram,storage,network,os-config,processes,usb,headset-connection,power-plan}.ts` — migrate from WMI/PowerShell.
- `src/main/utils/registry.ts` — convert `execSync` template literals to `execFile`.
- `src/main/data/gpu-database.ts` — split GTX 1060 into 3 GB and 6 GB rows.
- `src/main/data/cpu-database.ts` — add `vcacheAffinityMask` field on X3D entries.
- `src/main/index.ts` — audit IPC handlers; remove ones for deleted fixes.
- `README.md` — rewrite to match safe-by-default posture.
- `CHANGELOG.md` — v0.2.9 entry.

### Files to delete
- `src/main/utils/wmi.ts`
- `src/main/utils/powershell.ts`
- `src/main/utils/ps-helpers.ts`
- `src/main/scanner/modules/mmcss.ts`
- `src/main/live-optimizer/service-recovery.ts` (replaced)
- `update-server/ps-helpers/` (whole directory)

---

## Chunk 1: Tooling setup (vitest + supporting deps)

**Goal:** Test infrastructure lands first so subsequent chunks can ship with tests. Without this the plan is a wish list.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `tests/.gitkeep` (or first real test file)

**Vibeslop traps for this chunk:**
- Don't auto-generate a giant vitest config. Six lines is fine.
- Don't add a `tests/setup.ts` with `console.error` hooks and global mocks "just in case." Empty until something actually needs setup.
- Don't add a `__mocks__` directory until a test demands it.

### Steps

- [ ] **1.1: Install dev dependencies.**

```bash
npm install --save-dev vitest @vitest/ui
```

Expected: deps land, no peer warnings.

- [ ] **1.2: Install runtime dependencies for later chunks.**

```bash
npm install ps-list vdf
```

(`vdf` is a small, mature parser for Valve KeyValues files. If it's deprecated by the time of implementation, pivot to `simple-vdf`.)

- [ ] **1.3: Add test scripts to `package.json`.**

In `scripts`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Don't reformat the rest of the file.

- [ ] **1.4: Create `vitest.config.ts` at the repo root.**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

Six lines, no comments.

- [ ] **1.5: Verify the test runner finds zero tests cleanly.**

```bash
npm test
```

Expected: `No test files found, exiting with code 1` or similar. That's fine for now; we just want the runner working.

- [ ] **1.6: Commit.**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "set up vitest"
```

---

## Chunk 2: Bug fixes (the easy wins)

**Goal:** Ship the seven concrete reported bugs. Each gets a self-contained commit so reverting any single one is clean.

**Files:**
- Modify: `src/main/data/gpu-database.ts`
- Modify: `src/main/scanner/modules/ram.ts`
- Search-and-replace: anywhere "fake RAM" appears in the renderer
- Modify or delete: storage-controller rule (find the file by grepping the rules dir)
- Modify: `src/main/live-optimizer/optimizer.ts` (interim polling-interval fix; full rewrite happens in Chunk 9)

**Vibeslop traps for this chunk:**
- The GTX 1060 split is two database rows, not a class hierarchy. Don't introduce a `Gpu1060Variant` enum.
- The "fake RAM → page file" rename is mechanical. Don't simultaneously refactor the RAM detection module.
- The single-channel detection rewrite doesn't need a 200-line state machine. Look at the parser, find the actual bug, fix it, write a test against the captured BIOS output that triggered it.

### Steps

- [ ] **2.1: Read `src/main/data/gpu-database.ts` and locate the GTX 1060 entry.**

- [ ] **2.2: Split the entry.**

The two cards differ in shader count and VRAM. Replace the single row with two rows keyed on VRAM (`vramGB: 3` and `vramGB: 6`). Match the field order of surrounding entries; don't reorder fields.

- [ ] **2.3: Locate the device-ID parser that decides which DB row matches.**

Likely in the GPU scanner module or a helper called from it. The parser currently picks the first 1060 row. Update it to disambiguate by VRAM, reading VRAM from whatever source the existing module uses (WMI). This disambiguation is intentionally written against the WMI shape because the registry-read util doesn't exist yet; in Chunk 6.4 the entire GPU scanner gets re-pointed at registry-read and this disambiguation is rewritten as part of that migration. The fix lands in two stages by design.

- [ ] **2.4: Manual smoke-test on whatever 1060 you have access to (or skip if no hardware).**

The build needs to identify the correct row. If no 1060 hardware, mark this verified during user testing of the v0.2.9 build.

- [ ] **2.5: Commit the GPU split.**

```bash
git add src/main/data/gpu-database.ts src/main/scanner/modules/gpu.ts
git commit -m "split GTX 1060 into 3 GB and 6 GB database rows

Reported by @BlakeVRCC."
```

- [ ] **2.6: Search the repo for "fake RAM" / "fakeRam" / "Fake RAM" (case-insensitive).**

```bash
grep -ri "fake ram" src/
```

Note every hit. Replace user-facing strings with "page file" or "virtual memory" depending on context (use "page file" in technical UI, "virtual memory" in plainer copy).

- [ ] **2.7: Make the renames.**

- Variable names that include `fakeRam` get renamed to `pageFileSize` or similar.
- UI strings get the new label.
- Don't rename type definitions if they aren't user-facing; that's just churn.

- [ ] **2.8: Run typecheck.**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **2.9: Commit the rename.**

```bash
git add -A
git commit -m "rename 'fake RAM' to 'page file' / 'virtual memory'

Reported by @BlakeVRCC. The previous label conflated swap with a
nonexistent concept."
```

- [ ] **2.10: Find the single-channel detection logic.**

Likely in `src/main/scanner/modules/ram.ts`. Read the function that decides single vs dual channel.

- [ ] **2.11: Identify the parsing bug.**

Common cause: WMI's `MemoryArrayMappedAddresses` or `PhysicalMemory.MemoryType` returns inconsistent slot population on certain BIOSes. The fix usually involves reading the populated-DIMM count and module-size set, not the channel report directly. Confirm what the existing code does.

- [ ] **2.12: Write the failing test.**

Create `tests/ram-channel-detection.test.ts`. Use captured WMI output from Blake's bench (request from him) or, if not available yet, write tests against the cases you can synthesize: 2 DIMMs same size = dual; 1 DIMM = single; 4 DIMMs same size = dual; 2 DIMMs different sizes = flex/single.

```ts
import { describe, it, expect } from 'vitest'
import { detectChannelMode } from '../src/main/scanner/modules/ram'

describe('detectChannelMode', () => {
  it('reports dual for two equal-size DIMMs', () => {
    const dimms = [{ slot: 0, sizeGB: 16 }, { slot: 1, sizeGB: 16 }]
    expect(detectChannelMode(dimms)).toBe('dual')
  })

  it('reports single for one DIMM', () => {
    expect(detectChannelMode([{ slot: 0, sizeGB: 16 }])).toBe('single')
  })

  it('reports dual for four DIMMs across two channels', () => {
    const dimms = [
      { slot: 0, sizeGB: 16 }, { slot: 1, sizeGB: 16 },
      { slot: 2, sizeGB: 16 }, { slot: 3, sizeGB: 16 },
    ]
    expect(detectChannelMode(dimms)).toBe('dual')
  })

  it('reports flex/single for two DIMMs of different sizes', () => {
    const dimms = [{ slot: 0, sizeGB: 8 }, { slot: 1, sizeGB: 16 }]
    expect(detectChannelMode(dimms)).toBe('single')
  })
})
```

- [ ] **2.13: Refactor `detectChannelMode` (or whatever it's called) to take an array of `{slot, sizeGB}` objects and apply the rules above.**

- [ ] **2.14: Run the test.**

```bash
npm test -- ram-channel-detection
```

Expected: passes.

- [ ] **2.15: Commit the channel-detection fix.**

```bash
git add tests/ram-channel-detection.test.ts src/main/scanner/modules/ram.ts
git commit -m "rewrite RAM channel detection against DIMM population

Reported by @BlakeVRCC. Previous WMI-based channel report was
unreliable across BIOS vendors. New logic looks at populated slot
count and module-size equality."
```

- [ ] **2.16: Find the storage-controller-driver rule and delete it.**

```bash
grep -rln "storage.controller" src/main/rules/
```

Delete the rule. Update `src/main/rules/rules/index.ts` to remove its registration.

- [ ] **2.17: Find and delete any UI affordance pointing users to the Microsoft Update Catalog for storage controllers.**

- [ ] **2.18: Commit the storage-controller deletion.**

```bash
git add -A
git commit -m "remove storage-controller-driver rule

Reported by @BlakeVRCC. Routing typical users to the Microsoft Update
Catalog for AHCI/NVMe drivers was bad advice. The rule fired too
broadly and the suggested action was wrong for almost every user."
```

- [ ] **2.19: Apply the interim idle-CPU fix.**

In `src/main/live-optimizer/optimizer.ts` (current implementation, before the full rewrite in Chunk 9), find the polling loop. Increase the interval from the current value (likely 1 or 2 seconds) to 5 seconds, and add a short-circuit: if no VR process has been detected in the last N polls, skip the WMI calls entirely.

This is a stopgap. The real fix is the WMI-to-registry rewrite plus full optimizer rewrite. Document this in the commit message.

- [ ] **2.20: Commit the interim fix.**

```bash
git add src/main/live-optimizer/optimizer.ts
git commit -m "live optimizer: interim polling-interval bump to 5s

Reported by @aldrichhecc and @BlakeVRCC. The full rewrite later in
v0.2.9 (Chunk 9) removes PowerShell entirely. This stopgap raises
the polling interval and short-circuits WMI calls when no VR process
is detected, which fixes the 100% idle CPU symptom in the meantime."
```

---

## Chunk 3: Auto-fix deletions

**Goal:** Remove the six fixes from the codebase that the spec marks as "deleted entirely." Detection rules associated with them go too. The goal is a smaller surface, not a refactor.

**Files:**
- Modify: `src/main/fixes/engine.ts` — delete six fix definitions.
- Delete: `src/main/scanner/modules/mmcss.ts`.
- Modify: `src/main/rules/rules/*.rules.ts` — delete associated rules.
- Modify: `src/main/rules/rules/index.ts` — update registrations.
- Modify: `src/main/index.ts` (or wherever IPC handlers live) — delete handlers for the removed fix IDs.

**Vibeslop traps for this chunk:**
- Don't replace deleted fixes with "stub" no-op versions. Delete the code, not just the body.
- Don't comment out blocks "in case we want to bring it back." Git history exists.
- Don't reorder remaining fixes alphabetically or whatever. Leave them where they were.
- The fix-history record schema may have entries for deleted fixes. Don't migrate them; just ignore unknown fix IDs gracefully when the history page renders.

### Steps

- [ ] **3.1: Open `src/main/fixes/engine.ts`.**

Locate each of the six fixes by ID:
- `fix-defender-exclusions`
- `fix-mmcss-system-responsiveness` (or whatever the SystemResponsiveness=0 fix is named)
- `fix-standby-list-purge`
- `fix-compositor-priority`
- `fix-do-mode-http-only` (DODownloadMode HTTP-only)
- The storage-controller-driver fix (already partly removed in Chunk 2 if its rule was deleted; finish here).

- [ ] **3.2: Delete each fix's full definition (including any `apply`, `undo`, `preview` methods).**

- [ ] **3.3: Remove each from the registered fix array (likely a `fixes` constant near the bottom of `engine.ts`).**

- [ ] **3.4: Run typecheck.**

```bash
npm run typecheck
```

Expected: no errors. Errors here mean a renderer or IPC handler still references a deleted fix ID.

- [ ] **3.5: Address any typecheck errors by deleting the references, not by stubbing the fixes back.**

- [ ] **3.6: Commit the fix deletions.**

```bash
git add src/main/fixes/engine.ts src/main/index.ts
git commit -m "remove security-downgrade and myth fixes

- fix-defender-exclusions: created predictable safe-haven directories
  for malware. No responsible manual guide either; just gone.
- fix-mmcss-system-responsiveness: SystemResponsiveness=0 does nothing
  on modern Windows; the value normalizes. Reported by @yeusep3 via
  @xNanochip's writeup.
- fix-standby-list-purge: net-negative outside long VR sessions.
  Causes cache misses and disk thrashing under normal use. Also the
  most malware-shaped API call in the codebase.
- fix-compositor-priority: priority-inversion antipattern. Raising the
  compositor above the workload it composites is the opposite of what
  helps.
- fix-do-mode-http-only: marginal gain, security implication.
- storage-controller-driver fix: bad routing advice for normal users."
```

- [ ] **3.7: Delete `src/main/scanner/modules/mmcss.ts`.**

```bash
git rm src/main/scanner/modules/mmcss.ts
```

- [ ] **3.8: Find references to the mmcss module and remove them.**

```bash
grep -rln "mmcss" src/
```

Remove imports, scanner registrations, and any rule that depended on `data.mmcss`. Don't replace those rules with "we no longer scan this" placeholders; the data is just gone from the scan.

- [ ] **3.9: Run typecheck again.**

```bash
npm run typecheck
```

- [ ] **3.10: Commit the mmcss removal.**

```bash
git add -A
git commit -m "remove mmcss scanner module

The auto-fix is gone, and SystemResponsiveness has no useful read-only
value to surface in detection. Just delete the module."
```

- [ ] **3.11: Delete rules associated with the removed fixes.**

Rules to find and delete (or fold into existing rules if they had non-fix value):
- Any rule that recommends `Add-MpPreference -ExclusionPath`.
- Any rule that fires on `SystemResponsiveness != 0` and recommends setting it.
- Any rule that fires on standby-list size and recommends purging.
- Any rule that recommends compositor priority changes.
- Any rule that recommends `DODownloadMode = 1`.

Keep detection-only equivalents only if they're already covered by Chunk 4's demoted-rules work. Don't preemptively create them here.

- [ ] **3.12: Update `src/main/rules/rules/index.ts` to remove the deleted rules from registration.**

- [ ] **3.13: Run typecheck.**

- [ ] **3.14: Commit the rule deletions.**

```bash
git add -A
git commit -m "remove rules tied to deleted auto-fixes

The six auto-fixes removed in the previous commits had associated
recommendation rules. Those rules go too. Detection-only equivalents
where appropriate are added in the next commit batch."
```

---

## Chunk 4: Demoted-to-detection-only rules

**Goal:** Convert the rules that lost their auto-fix into detection-only entries. The scan still finds these conditions and explains them; there's no Apply button.

**Files:**
- Modify: `src/main/rules/rules/os-config.rules.ts` (likely; or wherever Hyper-V, VBS, Windows Update, MSI, ASPM, HAGS rules live).
- Modify: rule type definitions (`src/main/rules/types.ts` or similar) to make `fixId` optional or null.
- Modify: renderer scan-results component to render rules without an Apply button.

**Vibeslop traps for this chunk:**
- The detection-only UI affordance is "no button, expandable explanation." That's it. Don't introduce a `RuleSeverity.InfoOnly` enum and a whole rendering subsystem; piggyback on the existing severity model.
- The explanations stay short and matter-of-fact. No "Did you know?" framing. No "If you're a power user, consider..." suggestions.

### Steps

- [ ] **4.1: Audit the existing Rule type for whether `fixId` is required or optional.**

If it's required, make it optional (`fixId?: string | null`). The detection-only rules will set it to `null` or omit it.

- [ ] **4.2: Audit the renderer's rule rendering.**

Find the component that renders a scan finding. Confirm it currently always shows an Apply button. Add a condition: if `fixId` is null or undefined, don't render the button. Show only the title, explanation, and expandable advanced-detail section.

- [ ] **4.3: Commit the type + UI scaffolding for detection-only rules.**

```bash
git add -A
git commit -m "support detection-only rules with no Apply button

Rules with fixId=null render the title and explanation but no Apply
button. Used for findings VOS won't auto-fix under the new posture."
```

- [ ] **4.4: Update the Hyper-V / VBS rule.**

Find the existing rule. Set `fixId` to null. Update the explanation:
- Simple: "Hyper-V or Memory Integrity is enabled. This costs roughly 5 to 10 percent CPU performance in CPU-bound VR titles. Disabling it improves VR performance but reduces protection against kernel-mode exploits. VOS does not change this for you."
- Advanced: include the technical detail about VBS, hypervisor launch type, and the Memory Integrity tradeoff.

- [ ] **4.5: Update the Windows Update deferral rule.**

If a rule for Windows Update settings exists and previously had `fixId: 'fix-defer-updates'` or similar, set fixId to null and rewrite the explanation. If no such rule existed before (the previous code wrote the keys without surfacing them in detection), this is a new rule.

- [ ] **4.6: Update or add MSI / ASPM / HAGS rules as detection-only.**

Same pattern: fixId null, explanation focused on the trade-off, no recommended action.

- [ ] **4.7: Update or add a power-plan detection-only rule.**

Currently the auto-fix for power plan is being removed. The rule (if it exists) becomes detection-only: "Your active power plan is X. The Ultimate Performance plan typically gives the best VR frame consistency. Open Settings, System, Power, and select a different plan if you want to change this."

(That last sentence is informational, not an instruction VOS will execute. The wording matters: "if you want to change this," not "do this.")

- [ ] **4.8: Run typecheck.**

- [ ] **4.9: Smoke-test by running the app and confirming the detection-only rules render without Apply buttons.**

```bash
npm run dev
```

Trigger a scan. Look at the Action Plan or scan results page. Verify the demoted rules show up with explanations and no Apply button.

- [ ] **4.10: Commit the detection-only rule conversions.**

```bash
git add -A
git commit -m "convert demoted rules to detection-only

Hyper-V/VBS, Windows Update deferral, MSI mode, ASPM, HAGS, and power
plan all lost their auto-fix in the previous commits. They remain in
the scan as detection-only entries with plain-English explanations
and no Apply button."
```

---

## Chunk 5: Registry-read utility

**Goal:** Build the `reg query`-based hardware-read wrapper. Read-only, parameterized, no PowerShell, no `wmic`. This is the foundation Chunk 6 builds on.

**Files:**
- Create: `src/main/utils/registry-read.ts`
- Create: `tests/registry-read.test.ts`
- Create: `src/main/utils/dxgi-vram.ts` (small, separate from registry-read)

**Vibeslop traps for this chunk:**
- The wrapper does ONE thing: shell out to `reg query` with `execFile` and parse the output. It is not a "registry abstraction layer." No interfaces with five methods. One exported `readKey` function and one exported `readValue` function is the whole API.
- Don't add caching, retry-with-backoff, or any other "production-grade" features. `reg query` is a 30 ms call.
- The output parser handles the common output shapes. If you encounter an exotic shape, write a focused test for it and add a parser branch. Don't write a generic-recursive-descent parser preemptively.
- DXGI fallback: it's one Win32 call wrapped in Node-side glue. If you find yourself writing a "DxgiAdapterEnumerator" class, stop.

### Steps

- [ ] **5.1: Write the failing test for `readValue`.**

Create `tests/registry-read.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseRegQueryOutput } from '../src/main/utils/registry-read'

describe('parseRegQueryOutput', () => {
  it('parses a single REG_SZ value', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\r\n    ProcessorNameString    REG_SZ    AMD Ryzen 7 7800X3D\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed).toEqual({
      key: 'HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0',
      values: { ProcessorNameString: { type: 'REG_SZ', data: 'AMD Ryzen 7 7800X3D' } },
    })
  })

  it('parses a REG_DWORD value as a number', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\r\n    ~MHz    REG_DWORD    0x00001068\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed.values['~MHz']).toEqual({ type: 'REG_DWORD', data: 0x1068 })
  })

  it('parses a REG_BINARY value as a Buffer', () => {
    const out = `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\r\n    HardwareInformation.qwMemorySize    REG_BINARY    0000000200000000\r\n`
    const parsed = parseRegQueryOutput(out)
    expect(parsed.values['HardwareInformation.qwMemorySize'].type).toBe('REG_BINARY')
    expect(Buffer.isBuffer(parsed.values['HardwareInformation.qwMemorySize'].data)).toBe(true)
  })

  it('returns null for "not found" output', () => {
    const out = `\r\nERROR: The system was unable to find the specified registry key or value.\r\n`
    expect(parseRegQueryOutput(out)).toBeNull()
  })
})
```

- [ ] **5.2: Run the test, expect it to fail (function not defined).**

```bash
npm test -- registry-read
```

- [ ] **5.3: Implement `parseRegQueryOutput` and the public `readKey` / `readValue` API.**

Sketch (don't copy literally if your style differs):

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type RegValue =
  | { type: 'REG_SZ'; data: string }
  | { type: 'REG_DWORD'; data: number }
  | { type: 'REG_QWORD'; data: bigint }
  | { type: 'REG_BINARY'; data: Buffer }
  | { type: 'REG_MULTI_SZ'; data: string[] }
  | { type: 'REG_EXPAND_SZ'; data: string }

interface RegKey {
  key: string
  values: Record<string, RegValue>
}

export function parseRegQueryOutput(out: string): RegKey | null {
  // implementation: split on lines, find the key header, then parse
  // each indented "name TYPE data" line. Return null on the standard
  // "not found" error string.
}

export async function readKey(path: string): Promise<RegKey | null> {
  const { stdout } = await execFileAsync('reg', ['query', path, '/reg:64'])
  return parseRegQueryOutput(stdout)
}

export async function readValue(path: string, name: string): Promise<RegValue | null> {
  const { stdout } = await execFileAsync('reg', ['query', path, '/v', name, '/reg:64'])
  const parsed = parseRegQueryOutput(stdout)
  return parsed?.values[name] ?? null
}
```

Vibeslop traps for this file specifically:
- The functions are `readKey` and `readValue`. Not `RegistryReader.read` on a class.
- `execFile` with an arg array. Never string interpolation.
- `/reg:64` always. The wrapper handles that; callers don't pass it.
- No JSDoc. Type signatures speak.

- [ ] **5.4: Run the tests, expect them to pass.**

- [ ] **5.5: Commit the registry-read utility.**

```bash
git add tests/registry-read.test.ts src/main/utils/registry-read.ts
git commit -m "add registry-read utility (reg query through execFile)

Replaces the WMI/PowerShell hardware-read path. Parameterized, view-
pinned to /reg:64, no shell interpolation. Handles REG_SZ, DWORD,
QWORD, BINARY, MULTI_SZ, EXPAND_SZ. Returns null on not-found."
```

- [ ] **5.6: Implement the VRAM read helper (registry QWORD only).**

Create `src/main/utils/vram.ts`. The fallback path is "report unknown."

The constraint stack rules out everything else: a real DXGI call would need a native addon (excluded), `wmic path Win32_VideoController get AdapterRAM` doesn't work on Win11 24H2+, and `Get-CimInstance` would re-introduce PowerShell. The user's combined "no native + no PS + no wmic" constraints mean the only available source is the registry QWORD. The spec previously mentioned DXGI as a fallback; that's not realizable under these constraints, and the spec gets updated to match before this lands.

For the rare case where the QWORD is missing (very old drivers or unusual configs), the helper logs a warning and the scanner reports VRAM as `unknown`. Better than reporting the wrong number.

- [ ] **5.7: Implement registry-only VRAM read.**

In `src/main/utils/dxgi-vram.ts` (rename to `vram.ts` since DXGI was deferred):

```ts
import { readValue } from './registry-read'

export async function readVramBytes(adapterIndex: number): Promise<number | null> {
  const path = `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\${String(adapterIndex).padStart(4, '0')}`
  const value = await readValue(path, 'HardwareInformation.qwMemorySize')
  if (!value || value.type !== 'REG_BINARY') return null
  if (value.data.length < 8) return null
  return Number(value.data.readBigUInt64LE(0))
}
```

- [ ] **5.8: Write a tiny test for the binary parse.**

```ts
import { describe, it, expect, vi } from 'vitest'

// VRAM read is hard to unit-test without mocking registry-read.
// Add a parse-only helper if cleaner; otherwise skip the test for
// this module and rely on integration testing during v0.2.9 QA.
```

For v0.2.9, integration testing is fine here. Skip the unit test rather than fight the mocking.

- [ ] **5.9: Commit the VRAM helper.**

```bash
git add src/main/utils/vram.ts
git commit -m "add VRAM read helper (registry QWORD parse)

DXGI fallback isn't possible under the current constraint stack
(no native addon, no PowerShell, no wmic), so the helper returns
null when the QWORD is missing and the caller reports VRAM as
unknown. The vast majority of GPUs report the QWORD correctly;
the unknown case is rare on supported Windows versions."
```

---

## Chunk 6: Migrate scanner modules from WMI to registry

**Goal:** Convert each scanner module to use `registry-read` instead of WMI. One module per commit so reverts are clean and the diff is reviewable.

**Files:**
- Modify (one per commit): `src/main/scanner/modules/{cpu, gpu, ram, storage, network, os-config, processes, usb, headset-connection, power-plan}.ts`
- Modify: `src/main/scanner/index.ts` (the orchestrator) if module signatures change.
- Modify: `src/main/scanner/types.ts` if data shapes change.

**Vibeslop traps for this chunk:**
- Each migration is "swap the data source, keep the output shape." Don't rewrite the rule logic that consumes the output. The rule's input type stays the same.
- Some WMI fields don't have direct registry equivalents. When that happens, drop the field from the output (and update consumers) rather than trying to fake it from a different source.
- Don't add new "robustness" features (circuit breakers, fallbacks, retries). The registry-read util either works or returns null. Callers pass null through to the consumer, which displays "unknown."
- Don't add "for performance" parallelism. Scanner runs once per minute; sequential is fine.

### Steps

- [ ] **6.1: Migrate `cpu.ts`.**

Replace WMI calls with:

```ts
const cpuKey = await readKey('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0')
const model = (cpuKey?.values.ProcessorNameString as { data: string })?.data ?? null
const identifier = (cpuKey?.values.Identifier as { data: string })?.data ?? null
// ...
```

Logical-CPU count: enumerate subkeys of `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\` by reading the parent key (which lists subkeys) or by attempting to read 0, 1, 2, ... until null is returned.

- [ ] **6.2: Run typecheck and the dev build.**

```bash
npm run typecheck
npm run dev
```

Trigger a scan; verify CPU info still populates correctly.

- [ ] **6.3: Commit the CPU migration.**

```bash
git add src/main/scanner/modules/cpu.ts
git commit -m "migrate cpu scanner from WMI to registry-read"
```

- [ ] **6.4: Migrate `gpu.ts`.**

Use registry-read against `HKLM\SYSTEM\CurrentControlSet\Enum\PCI\*` (filter to display devices by VEN_/DEV_ prefix patterns) plus the VRAM helper from Chunk 5.

The 1060 3 GB / 6 GB disambiguation lives here: read VRAM, match against the database row that has matching VRAM.

- [ ] **6.5: Smoke-test on whatever GPU you have. Commit.**

```bash
git add src/main/scanner/modules/gpu.ts
git commit -m "migrate gpu scanner from WMI to registry-read

Uses the registry's PCI enumeration plus the new VRAM read helper.
Driver version comes from the Driver subkey under each adapter's
DRIVERS class GUID."
```

- [ ] **6.6: Migrate the remaining modules one at a time:**

For each of `ram.ts`, `storage.ts`, `network.ts`, `os-config.ts`, `usb.ts`, `headset-connection.ts`, `power-plan.ts`:

1. Identify the WMI calls in the module.
2. Find registry equivalents (or drop the field if there's no equivalent).
3. Type-check.
4. Smoke-test the relevant scan section.
5. Commit individually.

Each commit message follows: `migrate <module> scanner from WMI to registry-read`.

For `processes.ts`, the migration is to `ps-list` (already installed in Chunk 1):

```ts
import psList from 'ps-list'

export async function readProcesses(): Promise<ProcessInfo[]> {
  const procs = await psList()
  return procs.map(p => ({ pid: p.pid, name: p.name, ppid: p.ppid }))
}
```

- [ ] **6.7: After all modules migrate, delete `src/main/utils/wmi.ts`.**

```bash
git rm src/main/utils/wmi.ts
```

If anything still imports it, fix the imports first.

- [ ] **6.8: Run the dev build, do a full scan, verify nothing crashes.**

- [ ] **6.9: Commit the wmi.ts deletion.**

```bash
git add -A
git commit -m "delete wmi.ts; all consumers migrated to registry-read"
```

---

## Chunk 7: PowerShell elimination

**Goal:** Now that WMI is gone, PowerShell has no remaining role. Delete it.

**Files:**
- Delete: `src/main/utils/powershell.ts`
- Delete: `src/main/utils/ps-helpers.ts`
- Delete: `update-server/ps-helpers/` (whole directory)
- Modify: any remaining caller of `pwsh.exe`.

**Vibeslop traps for this chunk:**
- Search for ALL `pwsh`, `powershell`, `Get-CimInstance`, `Add-Type`, `DllImport`, `[DllImport]`, `Invoke-Expression` strings in the codebase. There may be stragglers in fix files or scanner modules that didn't get caught in Chunk 6.
- If a fix or module still uses PowerShell after the v0.2.9 work, it's almost certainly something that should be deleted (because the auto-fixes that needed PS are gone). Question whether the caller should exist at all before migrating it.

### Steps

- [ ] **7.1: Grep for PowerShell references.**

```bash
grep -rln "pwsh\.exe\|powershell\.exe\|Get-CimInstance\|Add-Type" src/ update-server/
```

- [ ] **7.2: For each hit, decide: migrate, delete, or keep (very rare).**

Most should be deletes. The fixes that needed PowerShell (Defender exclusions, MSI mode, etc.) are already deleted. The scanners that needed PowerShell are migrated.

- [ ] **7.3: Delete `src/main/utils/powershell.ts` and `src/main/utils/ps-helpers.ts`.**

```bash
git rm src/main/utils/powershell.ts src/main/utils/ps-helpers.ts
```

- [ ] **7.4: Delete `update-server/ps-helpers/`.**

```bash
git rm -r update-server/ps-helpers/
```

- [ ] **7.5: Run typecheck and a full dev-mode smoke test.**

- [ ] **7.6: Commit.**

```bash
git add -A
git commit -m "delete powershell utilities

All scanner modules migrated to registry-read; all auto-fixes that
needed PowerShell were removed in earlier commits. PowerShell has no
remaining role in the codebase."
```

---

## Chunk 8: execSync sweep

**Goal:** Every `execSync` call constructed via template-literal interpolation becomes `execFile` or `spawn` with arg arrays. No shell involvement in argument parsing.

**Files:**
- Modify: `src/main/utils/registry.ts` (if it still exists post-Chunk 7, or any callers of `reg.exe` outside the new util).
- Modify: any other file that does `execSync(\`...\${input}...\`)`.

**Vibeslop traps for this chunk:**
- The fix is `execFile('binary', [arg1, arg2, ...])`. Not `execFile('binary', ['arg1 arg2 arg3'])` (still string-shaped).
- Don't introduce a "command builder" abstraction. `execFile('reg', ['query', path, '/v', name])` is fine to write inline at call sites.
- Tests for command-injection resistance: pass deliberately-malicious input (a path like `"; rm -rf /;"`) and verify the call still works because the arg is passed as a single arg to `reg.exe`, not interpreted by the shell. Don't write 50 of these; one or two for the highest-risk call sites is enough.

### Steps

- [ ] **8.1: Grep for `execSync` and `\`.*\${.*}.*\`` patterns.**

```bash
grep -rn "execSync" src/
```

- [ ] **8.2: For each hit, classify: already-safe (no interpolation), template-literal-with-input (refactor target), or already-using-execFile (no action).**

- [ ] **8.3: For each refactor target, change to `execFile`.**

Pattern:

```ts
// before
const cmd = `reg query "${path}" /v "${name}"`
const out = execSync(cmd, { encoding: 'utf-8' })

// after
const out = execFileSync('reg', ['query', path, '/v', name, '/reg:64'], { encoding: 'utf-8' })
```

For async paths use `execFile` with `promisify`.

- [ ] **8.4: Write one focused command-injection test per high-risk call site.**

Example:

```ts
import { describe, it, expect } from 'vitest'
import { someFunction } from '../src/main/utils/something'

describe('someFunction', () => {
  it('does not interpret shell metacharacters in inputs', async () => {
    const malicious = `"; echo pwned; "`
    const result = await someFunction(malicious)
    expect(result).toBeNull()
  })
})
```

- [ ] **8.5: Run all tests.**

```bash
npm test
```

- [ ] **8.6: Commit.**

```bash
git add -A
git commit -m "replace execSync template literals with execFile

Every shell-interpolated command becomes an arg-array execFile call.
Eliminates command-injection as an attack surface in the registry
helpers and any other utility that built commands from string
concatenation."
```

---

## Chunk 9: Live Optimizer rewrite

**Goal:** The full optimizer rebuild per the spec. Off by default, lower-bg-and-raise-VR posture, never-touch hard list, concurrency cap, state file with crash recovery, HIGH→ABOVE_NORMAL fallback, activity log.

**Files:**
- Rewrite: `src/main/live-optimizer/optimizer.ts`
- Create: `src/main/live-optimizer/state-store.ts`
- Create: `src/main/live-optimizer/allowlist.ts`
- Create: `src/main/live-optimizer/never-touch.ts`
- Create: `src/main/live-optimizer/activity-log.ts`
- Create: `resources/live-optimizer-triggers.json`
- Create: `resources/live-optimizer-allowlist.json`
- Modify: `src/main/live-optimizer/types.ts`
- Modify: `src/main/live-optimizer/auto-enable.ts` (if it survives the rewrite)
- Delete: `src/main/live-optimizer/service-recovery.ts`
- Tests: `tests/live-optimizer/*.test.ts`

**Vibeslop traps for this chunk:**
- The main loop is one async function with a `setTimeout` recursion or a simple `while` loop with an exit flag. Not a `LiveOptimizerStateMachine` with five state classes.
- The never-touch list is a const array exported from one file. Not an injectable strategy.
- The activity log is an in-memory rolling buffer of the last 10 sessions, persisted as JSON. Not a `Sink` with pluggable backends.
- Logging: use the existing `src/main/logger.ts`. Don't introduce a new logger.
- The disclosure modal copy is verbatim from the spec. Don't paraphrase.

### Steps

- [ ] **9.1: Write the never-touch list.**

`src/main/live-optimizer/never-touch.ts`:

```ts
export const NEVER_TOUCH_PROCESSES = new Set([
  'System',
  'Idle',
  'lsass.exe',
  'csrss.exe',
  'winlogon.exe',
  'services.exe',
  'svchost.exe',
  'dwm.exe',
  'wininit.exe',
  'smss.exe',
  'EasyAntiCheat.exe',
  'EasyAntiCheat_EOS.exe',
  'BEService.exe',
  'BEServiceV2.exe',
  'vgc.exe',
  'vgtray.exe',
  'EasyAntiCheat_Setup.exe',
  'OVRServer_x64.exe',
  'OculusClient.exe',
  'vrserver.exe',
  'vrdashboard.exe',
  'vrcompositor.exe',
])

export const NEVER_TOUCH_DIR_PREFIXES = [
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
]
```

That's the whole file. No exported `class NeverTouch`, no factory function.

- [ ] **9.2: Write the allowlist + trigger loaders.**

`src/main/live-optimizer/allowlist.ts`:

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { NEVER_TOUCH_PROCESSES } from './never-touch'
import { logger } from '../logger'

// extraResources lands files at process.resourcesPath/resources/ in
// production. In dev we read from the repo's resources/ directly.
const RESOURCE_DIR = process.env.NODE_ENV === 'development'
  ? join(process.cwd(), 'resources')
  : join(process.resourcesPath, 'resources')

async function readJsonList(filename: string): Promise<string[]> {
  const path = join(RESOURCE_DIR, filename)
  const text = await fs.readFile(path, 'utf-8')
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(x => typeof x === 'string')
}

export async function loadTriggers(): Promise<Set<string>> {
  return new Set(await readJsonList('live-optimizer-triggers.json'))
}

export async function loadAllowlist(): Promise<string[]> {
  const raw = await readJsonList('live-optimizer-allowlist.json')
  const filtered: string[] = []
  for (const name of raw) {
    if (NEVER_TOUCH_PROCESSES.has(name)) {
      logger.warn(`live-optimizer: ignoring ${name} from allowlist; it is on the never-touch list`)
      continue
    }
    filtered.push(name)
  }
  return filtered
}
```

- [ ] **9.3: Write the default trigger and allowlist JSON files.**

`resources/live-optimizer-triggers.json`:

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

`resources/live-optimizer-allowlist.json`:

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

- [ ] **9.4: Configure electron-builder to include `resources/` as `extraResources`.**

In the builder config:

```json
"extraResources": [
  { "from": "resources/", "to": "resources/" }
]
```

- [ ] **9.5: Write the state store.**

`src/main/live-optimizer/state-store.ts`:

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import os from 'node:os'

interface StateEntry {
  pid: number
  imageName: string
  originalPriority: number
  currentPriority: number
}

const stateFile = () => join(app.getPath('userData'), 'live-optimizer-state.json')

export async function read(): Promise<StateEntry[]> {
  try {
    const text = await fs.readFile(stateFile(), 'utf-8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export async function write(entries: StateEntry[]): Promise<void> {
  await fs.writeFile(stateFile(), JSON.stringify(entries, null, 2), 'utf-8')
}

export async function clear(): Promise<void> {
  try {
    await fs.unlink(stateFile())
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}

export type { StateEntry }
```

Lowered-priority classes (the ones eligible for crash recovery). The spec calls these "BELOW_NORMAL" and "IDLE" using Windows priority-class names; Node's `os.constants.priority` exposes them as `PRIORITY_BELOW_NORMAL` and `PRIORITY_LOW` (Node maps `PRIORITY_LOW` to Windows' `IDLE_PRIORITY_CLASS`). Same values, different naming.

```ts
export const LOWERED_PRIORITY_CLASSES = new Set([
  os.constants.priority.PRIORITY_BELOW_NORMAL,
  os.constants.priority.PRIORITY_LOW, // maps to Windows IDLE_PRIORITY_CLASS
])
```

- [ ] **9.6: Write the state-store tests.**

`tests/live-optimizer/state-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
// Tests for round-trip and ENOENT handling. Mock fs.readFile / writeFile.
```

(Three or four tests. Round-trip a sample entry list. ENOENT returns `[]`. `clear` is idempotent.)

- [ ] **9.7: Commit the foundations.**

```bash
git add -A
git commit -m "live optimizer: never-touch list, allowlist loader, state store"
```

- [ ] **9.8: Write the activity log.**

`src/main/live-optimizer/activity-log.ts`. Rolling buffer of last 10 sessions, persisted as JSON. Each session: `{ activatedAt, deactivatedAt, lowered: [name], raised: [name], notes: [string] }`.

API surface: `appendSession(session)`, `loadRecent(): Promise<Session[]>`. That's it.

- [ ] **9.9: Write the main optimizer.**

`src/main/live-optimizer/optimizer.ts`. Replace the existing implementation entirely. Key behaviors:

- Polls every 2 seconds (configurable via a constant in the file, not in user-editable JSON).
- On VR-trigger detected: lower allowlisted bg processes (capped at 25 by file order), raise the trigger to HIGH (fall back to ABOVE_NORMAL on failure), write state file on every priority change.
- On all triggers exited: read state, restore original priorities, clear state, append to activity log.
- On startup: if state file exists, do crash-recovery (only restore lowered processes that match name AND are currently at a lowered priority class).

```ts
import psList from 'ps-list'
import os from 'node:os'
import { logger } from '../logger'
import { loadTriggers, loadAllowlist } from './allowlist'
import { NEVER_TOUCH_PROCESSES, NEVER_TOUCH_DIR_PREFIXES } from './never-touch'
import * as state from './state-store'
import * as activity from './activity-log'

const POLL_INTERVAL_MS = 2000
const MAX_LOWERED = 25

let running = false
let pollTimer: NodeJS.Timeout | null = null
let triggers: Set<string> = new Set()
let allowlist: string[] = []

export async function start(): Promise<void> {
  if (running) return
  running = true
  triggers = await loadTriggers()
  allowlist = await loadAllowlist()
  await crashRecover()
  schedulePoll()
}

export async function stop(): Promise<void> {
  running = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  await restoreAll()
}

async function crashRecover(): Promise<void> {
  const entries = await state.read()
  if (entries.length === 0) return
  const live = await psList()
  const liveByPid = new Map(live.map(p => [p.pid, p]))
  for (const entry of entries) {
    const proc = liveByPid.get(entry.pid)
    if (!proc) continue
    if (proc.name !== entry.imageName) continue
    const current = os.getPriority(entry.pid)
    if (!state.LOWERED_PRIORITY_CLASSES.has(current)) continue
    try {
      os.setPriority(entry.pid, entry.originalPriority)
    } catch (err) {
      logger.warn(`live-optimizer: crash-recover failed for pid ${entry.pid}: ${(err as Error).message}`)
    }
  }
  await state.clear()
}

// ... main poll loop, lower/raise helpers, activate/deactivate ...
```

The full file is ~150 lines. Don't pad it past that; if you're hitting 300 you've over-architected.

- [ ] **9.10: Write the optimizer tests.**

`tests/live-optimizer/optimizer.test.ts`. Mock `ps-list` and `os.setPriority`. Test:
- Activates when a trigger appears.
- Lowers allowlisted bg processes.
- Skips never-touch matches in the allowlist.
- Caps at 25.
- Falls back to ABOVE_NORMAL when HIGH throws.
- Restores on trigger exit.
- Crash-recovery only restores lowered, image-name-matching entries.

Five to seven tests. Not 50.

- [ ] **9.11: Run all tests; verify everything green.**

- [ ] **9.12: Commit the rewrite.**

```bash
git add -A
git commit -m "rewrite live optimizer on Node stdlib

Replaces the PowerShell-spawning, NtSuspendProcess-using legacy
optimizer with a Node-native implementation: ps-list for enumeration,
os.setPriority for changes. Lower-bg / raise-VR posture; no
suspension. Hard never-touch list. Allowlist file with code-side
filter. Concurrency cap at 25. State file with crash recovery on
lowered processes only. HIGH falls back to ABOVE_NORMAL on failure.

Reported by @aldrichhecc (cold-start overhead), the public audit
(NtSuspendProcess malware silhouette), and @BlakeVRCC (idle CPU)."
```

- [ ] **9.13: Delete the old `service-recovery.ts`.**

```bash
git rm src/main/live-optimizer/service-recovery.ts
git commit -m "remove old service-recovery; replaced by state-store"
```

---

## Chunk 10: Live Optimizer UI

**Goal:** Pre-enable disclosure modal + Settings page additions for the optimizer.

**Files:**
- Modify or create: renderer Settings page component(s).
- Modify: renderer state store (Zustand) if optimizer state needs to flow through.
- Add: IPC handlers in `src/main/index.ts` for enable/disable, view-trigger-list, view-allowlist, read-activity-log.

**Vibeslop traps for this chunk:**
- The disclosure modal copy is verbatim from the spec appendix. Copy it exactly. Do not paraphrase, condense, or "polish."
- The activity log panel shows the last 10 sessions. It's a `<ul>`, not a virtualized infinite scroll.
- Don't introduce a `LiveOptimizerProvider` React context if the existing settings page reads state through Zustand directly.

### Steps

- [ ] **10.1: Add IPC handlers for the Live Optimizer in `src/main/index.ts`.**

`live-optimizer:enable`, `live-optimizer:disable`, `live-optimizer:open-trigger-file`, `live-optimizer:open-allowlist-file`, `live-optimizer:read-activity-log`.

- [ ] **10.2: Add a Live Optimizer card to the Settings page.**

Off-by-default toggle. Below it, four buttons: View trigger list, View allowlist, Activity log (which expands inline or opens a modal), and a "What does this do?" link that opens the disclosure modal.

- [ ] **10.3: Implement the disclosure modal.**

Copy the verbatim text from the spec's appendix. Add a checkbox: "I've read the above. Enable Live Optimizer." The Enable button is disabled until the box is checked.

- [ ] **10.4: Implement the activity log panel.**

Renders the array returned by `live-optimizer:read-activity-log` as a list of session entries with collapsible details.

- [ ] **10.5: Smoke-test the full enable flow.**

Run dev mode. Open Settings. Click Enable. Verify the disclosure modal appears and blocks until the box is checked. Enable. Run a VR title (or fake one by renaming a binary to `vrchat.exe` for testing). Verify activation. Close it. Verify deactivation.

- [ ] **10.6: Commit.**

```bash
git add -A
git commit -m "live optimizer Settings UI + disclosure modal

Off-by-default toggle, pre-enable disclosure modal with verbatim copy
from the spec, View trigger list / View allowlist buttons that open
the JSON files in the user's default editor, activity log panel
showing the last 10 sessions."
```

---

## Chunk 11: Drop admin requirement

**Goal:** Installer no longer requests UAC; app no longer prompts. All remaining auto-fixes work as a standard user.

**Files:**
- Modify: `electron-builder.yml` / `.json5` / wherever the builder config lives.
- Modify: NSIS installer template if one is customized.
- Audit: any code path that checks `isElevated()` or assumes admin. Most should be in deleted fix code, but verify.

**Vibeslop traps for this chunk:**
- This is mostly a config change. Don't refactor `src/main/index.ts` while you're in there.
- If a code path genuinely needs admin (none should remain after Chunks 3 and 9), surface the case in this commit's PR description so it can be discussed before merge.

### Steps

- [ ] **11.1: Locate the builder config's `requestedExecutionLevel` field.**

Likely under `nsis` config or in the app manifest reference. Change to `asInvoker`.

- [ ] **11.2: Build the installer.**

```bash
npm run build:win
```

- [ ] **11.3: Install on a test box (or VM) and verify no UAC prompt during install.**

- [ ] **11.4: Launch the app. Verify no UAC prompt and no "Run as administrator" requirement to function.**

- [ ] **11.5: Run a full scan; verify everything works as standard user.**

- [ ] **11.6: Test Live Optimizer enable + a VR session; verify priority changes work without admin (they should, for same-user processes).**

- [ ] **11.7: Test the Steam launch-option fix; verify it can write `localconfig.vdf` (it lives under the user's Steam directory, no admin needed).**

- [ ] **11.8: Commit the manifest change.**

```bash
git add -A
git commit -m "drop admin requirement; run as standard user

The new auto-fix surface only does file edits in user-writable paths
and process priority changes on user-owned processes. Neither needs
elevation. GPU driver installers self-elevate via their own UAC
prompt when launched.

Eliminates the bulk of the security audit's critical findings, since
local privilege escalation requires elevated context."
```

---

## Chunk 12: Steam X3D launch option (per-CPU affinity)

**Goal:** Replace the hardcoded `/affinity FFFF` with per-CPU logic driven by the existing CPU database.

**Files:**
- Modify: `src/main/data/cpu-database.ts` — add `vcacheAffinityMask` to X3D entries.
- Modify: `src/main/fixes/engine.ts` — the launch-option fix.
- Create: `tests/x3d-affinity.test.ts`

**Vibeslop traps for this chunk:**
- The mask is a string in the database (`'FF'`, `'FF00'`, etc.), not a bitfield class. The CLI takes a hex string.
- Don't add validation that "checks if the mask makes sense for the core count." The database is curated; bad data is a database bug, not a runtime concern.

### Steps

- [ ] **12.1: Audit the existing CPU database for X3D entries.**

For v0.2.9, ship the launch option for SINGLE-CCD X3D parts only. The mask is unambiguously `FF` (8 cores) on these:

- 5800X3D
- 7800X3D
- 9800X3D

Dual-CCD X3D parts (7900X3D, 7950X3D, 9950X3D) are deferred to v0.3. The V-cache CCD's processor index isn't fixed across BIOSes on these chips; getting the mask wrong silently de-optimizes the user's setup, which is exactly the kind of confidently-wrong-AI-tweak the public audit called out. Real runtime CCD detection lands in v0.3.

For dual-CCD X3D parts in v0.2.9, the launch option falls back to `cmd /c start /high "" %command%` with no `/affinity` portion. The user still gets the priority bump; they just don't get the CCD pinning until VOS can do it correctly.

Add `vcacheAffinityMask: 'FF'` to the three single-CCD X3D entries. Leave dual-CCD entries with `vcacheAffinityMask: null` (or no field at all) so the launch-option builder knows to omit the affinity portion.

- [ ] **12.2: Write the failing test.**

`tests/x3d-affinity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildLaunchOption } from '../src/main/fixes/x3d-launch-option'

describe('buildLaunchOption', () => {
  it('emits affinity for 7800X3D', () => {
    expect(buildLaunchOption({ model: 'AMD Ryzen 7 7800X3D' })).toBe(
      'cmd /c start /affinity FF /high "" %command%'
    )
  })

  it('omits affinity for dual-CCD X3D in v0.2.9', () => {
    // Dual-CCD V-cache CCD detection is deferred to v0.3.
    expect(buildLaunchOption({ model: 'AMD Ryzen 9 7950X3D' })).toBe(
      'cmd /c start /high "" %command%'
    )
  })

  it('omits affinity for non-X3D AMD CPUs', () => {
    expect(buildLaunchOption({ model: 'AMD Ryzen 7 7700X' })).toBe(
      'cmd /c start /high "" %command%'
    )
  })

  it('returns null for unknown CPUs', () => {
    expect(buildLaunchOption({ model: 'Unknown CPU' })).toBeNull()
  })
})
```

- [ ] **12.3: Implement `buildLaunchOption`.**

It looks up the CPU model in the database, reads `vcacheAffinityMask`, returns the constructed string (or null if no entry / no mask).

- [ ] **12.4: Run the test.**

- [ ] **12.5: Update the launch-option fix in `engine.ts` to use `buildLaunchOption`.**

- [ ] **12.6: Add the Steam-running check.**

In the fix's `preview` and `apply` paths:

```ts
import psList from 'ps-list'

async function isSteamRunning(): Promise<boolean> {
  const procs = await psList()
  return procs.some(p => p.name.toLowerCase() === 'steam.exe')
}
```

If Steam is running, the preview returns a friendly error: "Close Steam before applying this fix. Steam rewrites the config file on exit and would overwrite VOS's change."

- [ ] **12.7: Add the VDF read/write using the `vdf` package (installed in Chunk 1).**

The fix:
1. Reads `<SteamPath>/userdata/<accountId>/config/localconfig.vdf`.
2. Locates the App ID 438100 entry (VRChat).
3. Stores the previous `LaunchOptions` value in the fix-history backup.
4. Sets the new value.
5. Writes back.

Undo restores the previous value verbatim (including blank).

- [ ] **12.8: Commit.**

```bash
git add -A
git commit -m "Steam X3D launch option: per-CPU affinity mask

Replaces hardcoded /affinity FFFF with mask computed from the CPU
database per model. 7800X3D writes /affinity FF, 7950X3D writes the
V-cache CCD mask, non-X3D AMD writes only /high.

Adds Steam-running check: refuses to apply while Steam is running,
since Steam rewrites localconfig.vdf on exit and would clobber the
change.

Reported by the public audit."
```

---

## Chunk 13: README + CHANGELOG

**Goal:** README reflects the new posture; CHANGELOG documents v0.2.9 with per-handle credits.

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Vibeslop traps for this chunk:**
- The README rewrite is voice-driven copy. Avoid em-dashes, parallel three-bullet structures, "TL;DR" sections, and marketing flourishes.
- Don't add a "What's new in v0.2.9" section in the README itself; that's what the CHANGELOG is for.
- Don't reorder or restructure the existing README sections beyond what the new posture requires.
- The AI-assistance disclaimer that was added in an earlier session stays. Don't remove it.

### Steps

- [ ] **13.1: Rewrite the README's feature description.**

The current copy talks about "scans your PC for VR perf issues" plus a feature table. Update to reflect:
- Detection is comprehensive.
- Auto-fix is a small set of reversible app-scoped changes.
- Aggressive Windows tweaks are gone; VOS doesn't change Defender, Windows Update, Hyper-V, MSI, ASPM, or HAGS for you.
- Live Optimizer is opt-in.

Keep the AV-false-positive section, the SHA-256 verification instructions, and the AI-assistance disclaimer.

- [ ] **13.2: Update the "What it does" / "What it doesn't" sections to match the posture.**

- [ ] **13.3: Add a "Recent changes" line that links to the CHANGELOG.**

- [ ] **13.4: Write the v0.2.9 CHANGELOG entry.**

Structure:

```markdown
## v0.2.9

This is the safe-by-default release. Detection stays comprehensive;
the auto-fix surface narrowed to a small set of app-scoped reversible
changes. Aggressive Windows tweaks are removed entirely.

### Removed
- The Defender-exclusions fix.
- The SystemResponsiveness=0 / MMCSS fix (myth fix; modern Windows
  normalizes the value). Reported by @yeusep3 via @xNanochip's
  optimization writeup.
- The standby-list purge timer (net-negative outside long VR
  sessions). Removed per the public audit.
- The Steam compositor priority change (priority-inversion
  antipattern).
- The DODownloadMode HTTP-only setting (marginal gain, security
  implication).
- The "upgrade your storage controller driver" rule. Reported by
  @BlakeVRCC.

### Demoted to detection-only
Hyper-V/VBS, Windows Update deferral, MSI mode, ASPM, HAGS, and
Windows Power Plan. The scan still detects these and explains the
trade-off. There is no Apply button; if you want to change them,
research the specific change yourself.

### Bug fixes
- GTX 1060 detection now distinguishes 3 GB and 6 GB variants.
  Reported by @BlakeVRCC.
- "Fake RAM" UI label renamed to "page file" / "virtual memory."
  Reported by @BlakeVRCC.
- Single-channel detection rewritten against DIMM population data.
  Reported by @BlakeVRCC.
- Idle CPU 100% spike fixed (was caused by the live optimizer cold-
  starting a fresh PowerShell process every poll cycle). Reported by
  @aldrichhecc and @BlakeVRCC.

### Architecture
- Admin requirement dropped. Installer and app run as the standard
  user. Removes the local-privilege-escalation surface from the
  public audit.
- WMI dropped. Hardware identification moved to direct registry
  reads. Works on Win10 and all Win11 builds, including those without
  wmic.exe.
- PowerShell removed entirely from the codebase.
- execSync template-literal calls converted to execFile with
  parameterized arg arrays. Closes command-injection vectors named in
  the public audit.

### Live Optimizer
- Rewritten on Node stdlib (os.setPriority, ps-list). No
  NtSuspendProcess. No PowerShell.
- Off by default. Opt-in via a pre-enable disclosure modal.
- Hardcoded never-touch list (System processes, anti-cheat services,
  headset runtime, anything in System32/SysWOW64, the VOS process
  itself).
- Allowlist file editable by users; entries that match the never-
  touch list are silently filtered at runtime.
- 25-process concurrency cap.
- State file with crash recovery (lowered processes only).
- HIGH priority falls back to ABOVE_NORMAL on permission failure.

### Steam launch option
- /affinity now computed per-CPU from the topology database, not
  hardcoded as FFFF. 7800X3D gets FF, 7950X3D gets V-cache CCD mask,
  non-X3D AMD gets /high only.
- Refuses to apply while Steam is running.

### Auto-updater
Stays disabled until code-signing is in place. Updates are manual
download from GitHub Releases with SHA-256 verification.

### Reviewed by
- @VixenVRC

### Reported by (in addition to those credited above)
- @ChadHendrixs (called for an AI-assistance disclaimer; added).
- @insomnyawolf (PhysBones / Dynamic Bones terminology; landed earlier).
- @yeusep3 / @xNanochip (broader posture critique).
- The author of the public audit whitepaper.
```

- [ ] **13.5: Commit the README + CHANGELOG.**

```bash
git add README.md CHANGELOG.md
git commit -m "README + CHANGELOG for v0.2.9

Posture pivot to safe-by-default. Per-handle credits for everyone
whose feedback shaped the release."
```

---

## Chunk 14: Release prep

**Goal:** Build the v0.2.9 installer, generate the SHA-256, prepare the GitHub Release draft.

**Files:**
- Build artifact: `dist/VOS-Setup-0.2.9.exe`
- Modify: `package.json` version field.

**Vibeslop traps for this chunk:**
- Don't write a release-automation script. The release is manual through the GitHub UI for v0.2.9.

### Steps

- [ ] **14.1: Bump version in `package.json`.**

```json
"version": "0.2.9"
```

- [ ] **14.2: Build the installer.**

```bash
npm run build:win
```

- [ ] **14.3: Compute the SHA-256.**

```bash
sha256sum dist/VOS-Setup-0.2.9.exe
```

(Or `Get-FileHash` on Windows.)

- [ ] **14.4: Prepare the GitHub Release draft.**

Title: `v0.2.9: safe-by-default`
Body: Lift the v0.2.9 section from CHANGELOG.md, add the SHA-256 line, add a "verify before installing" pointer to the README.

- [ ] **14.5: VixenVRC review pass.**

Send VixenVRC the branch + a link to the spec. Wait for sign-off before tagging.

- [ ] **14.6: Tag and push.**

```bash
git tag v0.2.9
git push origin v0.2.9
```

(Don't push to main yet; the branch protection rules in place require a PR. Open the PR, get VixenVRC's review on the PR, merge.)

- [ ] **14.7: Publish the GitHub Release.**

Upload the installer. Publish.

- [ ] **14.8: Post the v0.2.9 announcement on X.**

Short post. Link to release notes. Tag credited reporters.

- [ ] **14.9: DM Blake with PR/commit links to each fix from his original list.**

---

## v0.3.0 follow-ups (separate plan)

The v0.3.0 release scope is much smaller than originally envisioned because v0.2.9 absorbed the architecture work. v0.3 contains:

- UI polish on the manual-fix info-only display, refined based on v0.2.9 user feedback.
- Updated install/usage video matching the new UX.
- Code signing if SignPath or Microsoft Trusted Signing has cleared.
- Auto-updater re-enabled if signing is in place.

These don't need a full plan document. Each is a small task or a content production task. Treat them as TODO items added directly to the issue tracker after v0.2.9 ships.

---

## Done criteria

v0.2.9 is ready when:

- [ ] All chunks above are complete.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build:win` produces an installer.
- [ ] Installing the artifact on a fresh VM does not prompt for UAC and the app launches as the standard user.
- [ ] Running the app, doing a scan, applying a kept fix, and undoing it all work end-to-end.
- [ ] Live Optimizer enables behind the disclosure modal, activates on a VR trigger, restores cleanly on exit.
- [ ] VixenVRC has signed off.
- [ ] Per-handle credits are present in CHANGELOG and Release notes.
- [ ] No `pwsh.exe`, `Add-Type`, or `wmic` references survive in `src/`.
- [ ] No `execSync(\`...\${...}...\`)` patterns survive in `src/`.
- [ ] Grep for `// ────` returns no hits in `src/`.

---

## Plan-document review

This plan should be reviewed before execution begins. Dispatch a plan-document-reviewer subagent with:
- The full plan content
- Path to the spec (`docs/superpowers/specs/2026-04-30-vos-remediation-design.md`)
- Anti-vibeslop directive emphasis

Iterate up to five times on reviewer feedback before surfacing to the human.

---

## Execution

After the plan is reviewed and signed off:

- Use `superpowers:subagent-driven-development` if subagents are available (Claude Code).
- Otherwise use `superpowers:executing-plans` in the current session.
- Each chunk is a logical breakpoint; commit after every step the chunk specifies.
- Skip the per-step `npm test` calls only if you've already verified the test suite is green within the last few minutes; otherwise run them.
