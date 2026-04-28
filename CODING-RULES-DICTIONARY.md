# Vryionics VR Optimization Suite — Coding Rules Dictionary

> **Purpose:** Exhaustive reference for every technology in the codebase.
> Read the relevant section BEFORE writing any code of that type.
> All agents and future code rewrites MUST follow these rules.
> Last updated: 2026-04-17

---

## ⚠ Adding New Technologies

If you are writing code with a technology, library, or protocol that **does not have a section below**, you MUST:

1. **Research it online first** — official docs, known pitfalls, best practices, API quirks
2. **Append a new numbered section** to the end of this file with your findings (follow the format of existing sections)
3. **Add a row to the Table of Contents** below with the new section number, name, and when to read it
4. **Then** write the actual code

This dictionary must grow with the project. Never write code for an uncovered technology without documenting its rules here first.

---

## Table of Contents

| # | Section | When to Read |
|---|---------|-------------|
| 1 | [React (TSX) Rules](#1-react-tsx-rules) | Writing ANY renderer component |
| 2 | [React Hooks Rules](#2-react-hooks-rules) | Using useState, useEffect, useCallback, useMemo |
| 3 | [Electron Main Process](#3-electron-main-process) | Writing main process code (src/main/) |
| 4 | [Electron IPC](#4-electron-ipc) | Adding new IPC channels between main ↔ renderer |
| 5 | [Electron Preload](#5-electron-preload) | Adding new API methods to window.api |
| 6 | [TypeScript Patterns](#6-typescript-patterns) | Any TypeScript code |
| 7 | [Zustand Stores](#7-zustand-stores) | Modifying renderer state stores |
| 8 | [CSS / Tailwind / Glassmorphic](#8-css--tailwind--glassmorphic) | Styling components |
| 9 | [Windows Registry Access](#9-windows-registry-access) | Reading or writing registry keys |
| 10 | [PowerShell Execution](#10-powershell-execution) | Running PowerShell from Node.js |
| 11 | [nvidia-smi Integration](#11-nvidia-smi-integration) | Querying NVIDIA GPU telemetry |
| 12 | [WMI Queries](#12-wmi-queries) | Querying Windows Management Instrumentation |
| 13 | [Process Management](#13-process-management) | Enumerating, querying, or modifying processes |
| 14 | [Network Diagnostics](#14-network-diagnostics) | Wi-Fi scanning, latency testing, adapter queries |
| 15 | [Scan Module Architecture](#15-scan-module-architecture) | Writing or modifying scan modules |
| 16 | [Rule Engine](#16-rule-engine) | Writing or modifying diagnostic rules |
| 17 | [Fix Engine](#17-fix-engine) | Writing automated fix operations |
| 18 | [Headset Profiles](#18-headset-profiles) | Adding or modifying headset JSON profiles |
| 19 | [Electron Builder / Packaging](#19-electron-builder--packaging) | Building installers |
| 20 | [Common Pitfalls & Bug Patterns](#20-common-pitfalls--bug-patterns) | Review before ANY code change |

---

## 1. React (TSX) Rules

**React version:** 18.2 (concurrent mode available but not used)

### Component Structure
- All components are **function components** (no class components)
- Export with `export function ComponentName()` or `export default function`
- Props interfaces defined inline or above the component
- Components in `src/renderer/components/` organized by feature

### JSX Rules
- Self-closing tags for void elements: `<img />`, `<input />`, `<br />`
- Use `className` not `class`
- Use `htmlFor` not `for`
- Use `onClick` not `onclick` (camelCase all event handlers)
- Inline styles use objects: `style={{ color: 'red' }}` not `style="color: red"`
- Boolean attributes: `disabled` not `disabled={true}`

### Conditional Rendering
- `{condition && <Component />}` — renders Component when condition is truthy
- `{condition ? <A /> : <B />}` — ternary for if/else
- **NEVER** use IIFEs `(() => { ... })()` with hooks inside conditional blocks — this violates Rules of Hooks
- For complex conditional logic with hooks, extract into a separate named component

### Keys
- Every element in a `.map()` must have a unique `key` prop
- Use stable IDs, not array indices (unless list is static)
- Key must be on the outermost element returned by the map callback

---

## 2. React Hooks Rules

### THE TWO RULES (NEVER BREAK THESE)
1. **Only call hooks at the top level** — never inside conditions, loops, or nested functions
2. **Only call hooks from React function components or custom hooks** — never from regular JS functions

### What This Means In Practice

**WRONG — hooks inside IIFE in conditional render:**
```tsx
{condition && (() => {
  const [state, setState] = useState(0)  // CRASH: "Rendered more hooks"
  return <div>{state}</div>
})()}
```

**RIGHT — extract to component:**
```tsx
function ConditionalComponent() {
  const [state, setState] = useState(0)
  return <div>{state}</div>
}
{condition && <ConditionalComponent />}
```

### useState
- `const [value, setValue] = useState(initialValue)`
- `setValue(prev => prev + 1)` for updates based on previous value
- State updates are batched in React 18

### useEffect
- Runs AFTER render
- Return a cleanup function for subscriptions/timers
- `[]` = run once on mount
- **ALL** variables referenced inside the effect should be in the dependency array
- Cleanup runs BEFORE the next effect and on unmount

### useCallback / useMemo
- Use `useCallback` when passing callbacks to child components
- Use `useMemo` for expensive computations
- **NEVER** call useMemo after a conditional return — violates Rules of Hooks

---

## 3. Electron Main Process

**Electron version:** 33.4.11

### Architecture
- Main process: `src/main/index.ts` — app lifecycle, window management, IPC handlers
- Runs in Node.js context — full filesystem, child_process, network access
- NO DOM access — cannot use document, window, or any browser APIs
- Communicates with renderer via IPC (see Section 4)

### BrowserWindow
- Use `titleBarOverlay` or custom frameless window with proper drag regions
- Set `backgroundThrottling: false` for windows that need timers when minimized
- `webPreferences.contextIsolation: true` — mandatory security
- `webPreferences.sandbox: false` — needed for preload script access

### Process Safety
- Wrap all async operations in try/catch — unhandled promise rejections crash the app
- Use `try/finally` for cleanup (timers, file handles, temp files)
- Emergency stop flags should be checked between long operations

### File Paths
- Use `path.join()` not string concatenation
- `app.getPath('userData')` for config/data storage (`%APPDATA%/vryionics-vr-optimization-suite/`)
- Paths with spaces need quoting in subprocess commands

---

## 4. Electron IPC

### Pattern: Main ↔ Renderer Communication

**Main process:**
```typescript
// Request/response (renderer awaits result):
ipcMain.handle('scan:runFull', async (_event) => {
  return await scanEngine.runFullScan()
})

// Fire-and-forget:
ipcMain.on('app:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})
```

**Preload:**
```typescript
// Request/response:
scan: {
  runFull: () => ipcRenderer.invoke('scan:runFull'),
}

// Event listener (main → renderer):
on: (channel: string, callback: (...args: any[]) => void) => {
  const handler = (_: unknown, ...args: unknown[]) => callback(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
```

### Rules
- Channel names use colon-separated namespaces: `'scan:runFull'`, `'fix:apply'`, `'system:isAdmin'`
- `ipcMain.handle` = async with return value (use `invoke` in preload)
- `ipcMain.on` = fire-and-forget (use `ipcRenderer.send` in preload)
- Return cleanup functions from event listeners to prevent memory leaks
- Never pass non-serializable objects through IPC (no functions, no circular refs)

### Adding a New IPC Channel (Checklist)
1. Add handler in `src/main/ipc/*.ts`
2. Add preload bridge in `src/preload/index.ts`
3. Call from renderer via `window.api.namespace.method()`

---

## 5. Electron Preload

**File:** `src/preload/index.ts`

### Rules
- Groups API methods by namespace: `api.scan.runFull()`, `api.fix.apply(id)`
- Uses `contextBridge.exposeInMainWorld('api', { ... })`
- Keep the preload thin — no business logic, just IPC forwarding
- Always return cleanup functions for `ipcRenderer.on` listeners

---

## 6. TypeScript Patterns

### Types vs Interfaces
- Use `interface` for object shapes that might be extended
- Use `type` for unions, intersections, and primitives
- No `I` prefix — use plain names: `ScanData` not `IScanData`

### Enums
- **NOT used** — use string literal unions: `type Severity = 'critical' | 'warning' | 'info' | 'ok'`

### Optional Properties
- `field?: Type` — may be undefined
- `field: Type | null` — exists but may be null
- Use `??` for defaults: `value ?? defaultValue`
- Use `?.` for optional chaining: `obj?.nested?.field`

### Error Handling
- Always `try/catch` async operations
- Return `{ error: string, partial: true }` from failing scan modules, don't throw
- Log errors with context: `console.error('[scan:cpu]', error.message)`

---

## 7. Zustand Stores

**Location:** `src/renderer/stores/`

### Pattern
```typescript
import { create } from 'zustand'

interface MyState {
  value: number
  setValue: (n: number) => void
}

export const useMyStore = create<MyState>((set) => ({
  value: 0,
  setValue: (n) => set({ value: n }),
}))
```

### Rules
- Access in components: `const value = useMyStore(s => s.value)` — select only what you need
- Mutations always go through actions defined in the store
- Access outside React: `useMyStore.getState().setValue(5)`
- Don't destructure the entire store — causes unnecessary re-renders

---

## 8. CSS / Tailwind / Glassmorphic

### Design System (inherited from VMSC Universal)
- Background: `#0a0a14` (--bg-color)
- Glass panels: `rgba(15, 15, 25, 0.85)` + `backdrop-filter: blur(20px)` + `1px solid rgba(255,255,255,0.08)`
- Text hierarchy: `#e2e8f0` (primary) → `#9ca3af` (secondary) → `#6b7280` (muted)
- Accent: `var(--accent-primary)` with `var(--accent-rgb)` for opacity variants

### Custom Classes (defined in globals.css)
- `glass-panel` — main container panels
- `glass-panel-sm` — smaller/nested panels
- `glass-input` — form inputs with focus glow
- `glass-button` — accent-colored buttons with spring press animation
- `glass-button-danger` / `glass-button-success` — semantic variants
- `hover-lift` — card hover effect (translateY + shadow)
- `panel-animate` + `panel-animate-delay-{1,2,3,4}` — staggered entrance
- `page-enter` — page transition animation
- `status-dot-connected` / `status-dot-error` — status indicators with glow

### VR-Specific Accent Colors (in tailwind.config.js)
```
vr-healthy: '#4ade80'    (green — no issues)
vr-warning: '#fbbf24'    (amber — suboptimal)
vr-critical: '#f87171'   (red — major bottleneck)
vr-scanning: '#60a5fa'   (blue — scan in progress)
vr-fixed: '#a78bfa'      (purple — issue resolved)
```

### WebkitAppRegion
- `WebkitAppRegion: 'drag'` on titlebar for window dragging
- `WebkitAppRegion: 'no-drag'` on ALL interactive elements within drag regions
- Forgetting this = buttons/inputs become unclickable

---

## 9. Windows Registry Access

**Location:** `src/main/utils/registry.ts`

### Reading Registry
```typescript
import { execSync } from 'child_process'

// Use reg.exe for simple reads (no elevation needed for HKLM reads):
function readRegistry(hive: string, path: string, name: string): string | null {
  try {
    const cmd = `reg query "${hive}\\${path}" /v "${name}"`
    const output = execSync(cmd, { encoding: 'utf8', timeout: 5000 })
    // Parse the REG_SZ / REG_DWORD value from output
    const match = output.match(/REG_(SZ|DWORD|QWORD|EXPAND_SZ|MULTI_SZ)\s+(.+)/i)
    return match ? match[2].trim() : null
  } catch {
    return null
  }
}
```

### Writing Registry (REQUIRES ELEVATION)
- NEVER write to registry without user consent and preview
- Always backup the current value BEFORE writing
- Use the elevated helper process (see Fix Engine, Section 17)
- Log all registry modifications to fix-history.json

### Registry Path Rules
- Use backslash `\` separators in registry paths
- Hive abbreviations: `HKLM` = HKEY_LOCAL_MACHINE, `HKCU` = HKEY_CURRENT_USER
- DWORD values: parse hex `0x` prefix → decimal
- Multi-string values: separated by `\0`

### Common Registry Paths (VR Optimization)
```
MMCSS:
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games

AMD V-Cache:
  HKLM\SYSTEM\CurrentControlSet\Services\amd3dvcacheSvc\Parameters\Preferences\App\*

GPU Interrupt Affinity:
  HKLM\SYSTEM\CurrentControlSet\Enum\PCI\*\Device Parameters\Interrupt Management\Affinity Policy

Game Mode:
  HKCU\Software\Microsoft\GameBar (AllowAutoGameMode, AutoGameModeEnabled)

Network Throttling:
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile (NetworkThrottlingIndex)

HAGS:
  HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers (HwSchMode)
```

### Pitfalls
- `reg query` outputs vary between Windows versions — parse defensively
- Some keys require elevation to read (GPU affinity policies)
- REG_DWORD values may be returned as hex (`0x14`) — always parse both formats
- Enumerating subkeys: use `reg query "HKLM\path" /s` for recursive, parse output line-by-line

---

## 10. PowerShell Execution

**Location:** `src/main/utils/powershell.ts`

### Execution Pattern
```typescript
import { execFile } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function runPowerShell(script: string, timeout = 30000): Promise<string> {
  const tmpFile = join(tmpdir(), `vros-${Date.now()}.ps1`)
  writeFileSync(tmpFile, script, 'utf8')
  return new Promise((resolve, reject) => {
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile
    ], { timeout }, (error, stdout, stderr) => {
      try { unlinkSync(tmpFile) } catch {}
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}
```

### CRITICAL RULES
- **ALWAYS write scripts to temp .ps1 files** — never pass scripts inline via `-Command`
  - Reason: Bash/cmd.exe mangles `$_`, `$env:`, and other PS variables when passed inline
  - This was a lesson learned the hard way during the Python scanner development
- **ALWAYS use `-NoProfile -NonInteractive -ExecutionPolicy Bypass`**
- **ALWAYS set a timeout** (default 30 seconds)
- **ALWAYS clean up temp files** in a `finally` block
- **NEVER use `-File` and `-Command` together** — they are mutually exclusive

### Variable Escaping in Temp Files
- Inside `.ps1` files, PowerShell variables work normally (`$_`, `$env:TEMP`, etc.)
- No bash escaping issues because the script is read from a file, not passed as a string
- If you MUST use `-Command` (rare), escape `$` as `` `$ `` for PowerShell in Node

### Common PowerShell Commands (VR Optimization)
```powershell
# Performance counters
Get-Counter '\Processor(*)\% DPC Time'
Get-Counter '\Memory\Pool Nonpaged Bytes'

# Service enumeration
Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object Name, DisplayName, StartType

# Scheduled tasks
Get-ScheduledTask | Where-Object { $_.State -eq 'Ready' }

# Network adapters
Get-NetAdapter | Select-Object Name, InterfaceDescription, LinkSpeed, Status
Get-NetAdapterAdvancedProperty -Name 'Wi-Fi' -DisplayName 'Green Ethernet'

# Process info
Get-Process | Select-Object Name, Id, CPU, WorkingSet64, HandleCount
```

### Pitfalls
- PowerShell startup time is 200-500ms — batch multiple queries into one script
- `Get-Counter` requires admin for some counters — wrap in try/catch
- PowerShell output encoding can vary — always use `-Encoding UTF8` when writing files
- `$env:TEMP` in PowerShell may differ from Node's `os.tmpdir()` when running elevated

---

## 11. nvidia-smi Integration

**Location:** `src/main/utils/nvidia-smi.ts`

### Query Pattern
```typescript
function nvidiaSmi(query: string): Promise<string[][]> {
  const cmd = `nvidia-smi --query-gpu=${query} --format=csv,noheader,nounits`
  // Returns rows of comma-separated values
}
```

### Common Queries
```
Basic info:      name,driver_version,pci.bus_id
Utilization:     utilization.gpu,utilization.memory,encoder.stats.sessionCount,encoder.stats.averageFps
Temperature:     temperature.gpu,temperature.memory
Memory:          memory.total,memory.used,memory.free
Power:           power.draw,power.limit
PCIe:            pcie.link.gen.current,pcie.link.width.current
Clock:           clocks.current.graphics,clocks.current.memory
```

### Advanced Monitoring
- `nvidia-smi dmon -s pucvmet -d 1 -c N` — device monitoring (N samples at 1-second intervals)
- `nvidia-smi pmon -s um -c N` — per-process GPU monitoring
- `nvidia-smi -q` — full text dump (parse specific sections)

### Pitfalls
- **nvidia-smi may not be on PATH** — check `C:\Windows\System32\nvidia-smi.exe` as fallback
- **AMD GPUs**: nvidia-smi doesn't exist. Detect GPU vendor FIRST, skip NVIDIA-specific checks for AMD.
- **Multi-GPU**: nvidia-smi returns rows for ALL GPUs. Parse by index or bus ID.
- **encoder.stats fields**: Only available on NVIDIA GPUs with NVENC. Returns `[N/A]` on older cards.
- **Timeout**: nvidia-smi can hang if GPU is under extreme load. Always set timeout (10 seconds).
- **CSV parsing**: Some values contain commas (e.g., GPU names like "NVIDIA GeForce RTX 4070 Ti"). Use `--format=csv,noheader,nounits` and split carefully.

---

## 12. WMI Queries

### From Node.js
Use PowerShell to query WMI (more reliable than native Node WMI bindings on Windows):

```powershell
# GPU info (works for both NVIDIA and AMD):
Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, PNPDeviceID

# CPU info:
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed

# Memory:
Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, MemoryType, ConfiguredClockSpeed

# Disk:
Get-CimInstance Win32_DiskDrive | Select-Object Model, MediaType, Size
Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, FreeSpace, Size, DriveType
```

### Rules
- Use `Get-CimInstance` not `Get-WmiObject` (deprecated in PS 5.1+)
- Always pipe through `Select-Object` to limit output size
- Format output as JSON for easy parsing: `| ConvertTo-Json`
- WMI queries can be slow (1-3 seconds) — batch into a single PowerShell invocation

---

## 13. Process Management

### Enumeration
- Use PowerShell `Get-Process` for basic info (Name, PID, CPU, RAM, Handles)
- Use WMI `Win32_Process` for advanced info (CommandLine, CreationDate, ThreadCount)
- Use `nvidia-smi pmon` for per-process GPU usage (NVIDIA only)

### Affinity & Priority
- **EAC-protected processes** (VRChat, etc.) CANNOT be modified after launch
  - Workaround: Set affinity at creation time via Steam launch options: `cmd /c start /affinity FFFF "" %command%`
  - The `start /affinity` command applies the mask before EAC loads
- **Non-protected processes**: Use PowerShell `$p = Get-Process -Id PID; $p.ProcessorAffinity = MASK; $p.PriorityClass = 'High'`
- Affinity masks are hexadecimal bitmasks: `0xFFFF` = cores 0-15, `0xFF` = cores 0-7, `0xFF00` = cores 8-15

### Process Classification
The scanner classifies processes into categories:
- `vrCritical`: VRChat, vrcompositor, vrserver, vrmonitor, Virtual Desktop Streamer
- `vrOverlay`: XSOverlay, fpsVR, OVR Advanced Settings
- `vrTracking`: VRCFaceTracking, SlimeVR
- `streaming`: OBS, Medal, GeForce Experience
- `bloat`: Cortana, GameBar, Widgets, OneDrive, Discord, Spotify (when VR is running)
- `audio`: VoiceMeeter, VoiceMod, audiodg

### Pitfalls
- `Get-Process` CPU value is total processor time (seconds), NOT current percentage
- To get current CPU %, sample twice with a delay and compute delta
- Process names are case-insensitive on Windows
- Some system processes (audiodg.exe) cannot have their priority changed even with admin

---

## 14. Network Diagnostics

### Wi-Fi Information
```cmd
netsh wlan show interfaces
```
Returns: SSID, BSSID, channel, radio type, signal, receive/transmit rate, band

```cmd
netsh wlan show networks mode=bssid
```
Returns: List of visible networks with SSID, channel, signal strength (best-effort, adapter must support scanning)

### Latency Testing
```cmd
ping -n 3 -w 1000 <gateway_ip>
```
Parse min/max/avg from the "Minimum = Xms, Maximum = Yms, Average = Zms" summary line.

### Router Vendor Detection
- Extract gateway MAC from `arp -a` output
- Look up first 3 octets (OUI) in bundled MAC OUI database (~500KB CSV)
- This gives vendor (e.g., "TP-Link", "ASUS", "Netgear") — NOT the model
- Show as "Router Vendor: TP-Link (from MAC)" with a caveat that model is best-effort

### Pitfalls
- `netsh wlan show interfaces` returns nothing if no Wi-Fi adapter exists — handle gracefully
- `netsh wlan show networks mode=bssid` may return stale data or be empty if adapter doesn't support scanning
- Channel numbers differ between 2.4GHz (1-13) and 5GHz (36-165) — use channel number to infer band
- Signal strength is in percentage (0-100%) from netsh, not dBm — convert if needed
- `netsh` output format varies by Windows locale — parse defensively with regex, not fixed positions

---

## 15. Scan Module Architecture

**Location:** `src/main/scanner/modules/`

### Module Interface
Every scan module exports a single async function:

```typescript
import { ScanModuleResult } from '../types'

export async function scanCpu(): Promise<ScanModuleResult<'cpu'>> {
  try {
    // ... data collection ...
    return { success: true, data: { /* CpuData */ } }
  } catch (error) {
    return { success: false, error: (error as Error).message, partial: true }
  }
}
```

### Rules
- Each module is **independent** — a failing module does NOT abort the scan
- Each module populates ONE key of `ScanData` (e.g., `cpu`, `gpu`, `ram`)
- Modules MUST catch all errors and return `{ success: false, error, partial: true }`
- Modules should log progress: `console.log('[scan:cpu] Sampling per-core usage...')`
- Modules should complete within 30 seconds — use timeouts on all subprocess calls
- Modules that need admin should degrade gracefully: collect what they can, flag `requiresAdmin: true`

### Module Registration
The scan engine discovers modules by importing them from `modules/index.ts`:
```typescript
export const scanModules = {
  cpu: scanCpu,
  gpu: scanGpu,
  ram: scanRam,
  // ... etc
}
```

---

## 16. Rule Engine

**Location:** `src/main/rules/`

### Rule Structure
```typescript
interface Rule {
  id: string                    // e.g. 'mmcss-priority-low'
  category: string              // e.g. 'os-config'
  name: string                  // Human-readable
  appliesTo?: {
    connectionArchetypes?: string[]  // Filter by connection type
    headsetBrands?: string[]         // Filter by headset brand
  }
  evaluate: (data: ScanData, profile: HeadsetProfile | null) => RuleResult | null
}

interface RuleResult {
  severity: 'critical' | 'warning' | 'info' | 'ok'
  explanation: {
    simple: string              // Plain English for Simple Mode
    advanced: string            // Technical detail for Advanced Mode
  }
  fixId?: string                // Reference to an automated fix
}
```

### Rules for Writing Rules
- Rules return `null` if they don't apply (e.g., NVIDIA rule on an AMD system)
- Rules MUST have both `simple` and `advanced` explanations
- Simple explanations: no jargon, no registry paths, no hex values. Write like explaining to a friend.
- Advanced explanations: include exact values, registry paths, expected vs actual, and what the fix changes.
- Rule IDs use kebab-case: `mmcss-priority-low`, `wifi-band-24ghz`, `vcache-missing-vrchat`
- Rules are stateless — they evaluate scan data, they don't modify it

### Explanation Writing Guidelines
**Simple Mode** (for average users):
```
"Your system is configured to share too many resources with background tasks,
which means VR gets less processing power than it should. This can cause
frame drops and stuttering."
```

**Advanced Mode** (for power users):
```
"MMCSS SystemResponsiveness is set to 20 (default). This reserves 20% of CPU
time for non-multimedia tasks. Setting to 0 dedicates maximum CPU time to VR.
Registry: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\SystemResponsiveness
Current: 20 → Recommended: 0"
```

---

## 17. Fix Engine

**Location:** `src/main/fixes/`

### Fix Safety Protocol (MANDATORY)
Every fix follows this sequence:
1. **Preview** — Show user exactly what will change
2. **Backup** — Save current value before modifying
3. **Apply** — Make the change
4. **Verify** — Confirm the change took effect
5. **Log** — Record in fix-history.json with timestamp
6. **Undo** — Every fix MUST be reversible

### Fix Interface
```typescript
interface Fix {
  id: string
  name: string
  description: string
  requiresAdmin: boolean
  requiresReboot: boolean
  preview: () => Promise<FixPreview>    // What will change
  apply: () => Promise<FixResult>       // Do it
  undo: () => Promise<FixResult>        // Reverse it
}
```

### Registry Fix Pattern
```typescript
// 1. Read current value (backup)
const current = readRegistry('HKLM', path, name)
// 2. Save to fix history
saveFixBackup(fixId, { path, name, value: current })
// 3. Apply via elevated helper
await runElevated(`reg add "${hive}\\${path}" /v "${name}" /t REG_DWORD /d ${newValue} /f`)
// 4. Verify
const verified = readRegistry('HKLM', path, name)
if (verified !== String(newValue)) throw new Error('Verification failed')
```

### Admin Elevation
- Fixes requiring admin use a UAC-elevated helper process
- The helper is invoked via `Start-Process powershell -Verb RunAs`
- Batch multiple fixes into a single elevated invocation (one UAC prompt)
- NEVER cache admin tokens or bypass UAC

---

## 18. Headset Profiles

**Location:** `src/main/headsets/profiles/`

### File Format
- One JSON file per headset: `meta-quest-3.json`, `valve-index.json`
- File names use kebab-case, matching the profile `id` field
- Schema defined in `src/main/headsets/types.ts` (HeadsetProfile interface)

### Required Fields
Every profile MUST include:
- `id`, `brand`, `model`, `type`, `releaseYear`
- `display` (resolution, refresh rates, panel type, FOV)
- `connections` (at least one ConnectionMethod)
- `runtimes` (at least one VRRuntime)
- `tracking` (type, controllers, eye/face/body tracking booleans)
- `requirements` (min/recommended GPU, CPU, RAM, ports)

### Contributing New Profiles
- Copy `_template.json` and fill in all fields
- Test the profile by running the wizard and verifying the headset appears
- Connection archetypes MUST match one of: `tethered-dp`, `usb-encoded`, `wifi-wireless`, `wigig`
- Validate JSON syntax before committing

---

## 19. Electron Builder / Packaging

### Build Pipeline
1. `npx electron-vite build` — compiles TS → JS into `out/`
2. `npx electron-builder --win` — packages into `dist/` (NSIS installer + unpacked)

### Rules
- Close the running app before building — file locks cause build failures
- `electron-builder.yml` — modify for version, product name, publish config
- The NSIS installer is for distribution — the unpacked exe works for testing

---

## 20. Common Pitfalls & Bug Patterns

### React Hooks Violation (MOST COMMON)
- **Symptom:** "Rendered more hooks than during the previous render"
- **Cause:** Using useState/useEffect inside an IIFE or conditional block
- **Fix:** Extract into a named component

### IPC Method Missing
- **Symptom:** `Cannot read properties of undefined (reading 'methodName')`
- **Cause:** Method exists in IPC handler but not in preload (or vice versa)
- **Fix:** Check all 3 files: ipc handler, preload, renderer call site

### PowerShell Variable Mangling
- **Symptom:** PowerShell script fails with "variable not found" or empty values
- **Cause:** Running PS script inline via `-Command` where bash/cmd eats `$` characters
- **Fix:** ALWAYS write scripts to temp `.ps1` files and use `-File` flag

### nvidia-smi Not Found
- **Symptom:** GPU scan module returns no data
- **Cause:** nvidia-smi not on PATH, or AMD GPU
- **Fix:** Check `C:\Windows\System32\nvidia-smi.exe` fallback. Detect GPU vendor first.

### Registry Access Denied
- **Symptom:** Scan module returns partial data for OS config
- **Cause:** Some HKLM keys require admin elevation to read
- **Fix:** Degrade gracefully — return partial data with `requiresAdmin: true` flag

### Window Click Freeze
- **Symptom:** Window becomes unresponsive to clicks
- **Cause 1:** Interactive elements inside `WebkitAppRegion: 'drag'` → add `'no-drag'`
- **Cause 2:** HTML5 `new Audio()` in renderer → use Web Audio API
- **Fix:** Add `WebkitAppRegion: 'no-drag'` to all buttons/inputs in titlebar

### Temp File Cleanup Deleting Output
- **Symptom:** Scan results or script output disappears
- **Cause:** Temp folder cleanup deletes files used by currently-running operations
- **Fix:** Use unique temp file names with process ID, clean up in `finally` blocks only

### EAC Blocking Process Modification
- **Symptom:** Access Denied (error 5) when setting VRChat affinity/priority
- **Cause:** EasyAntiCheat blocks OpenProcess handles from external processes
- **Fix:** Cannot modify after launch. Use Steam launch options: `cmd /c start /affinity FFFF "" %command%`

### Git Bash Path Expansion
- **Symptom:** PowerShell commands fail with unexpected paths like `C:/Program Files/Git/Query`
- **Cause:** Git bash expands `/Query`, `/File` etc. as Unix paths
- **Fix:** Use PowerShell execution via temp files (Section 10), not inline commands through bash
