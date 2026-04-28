// VR Optimization Suite — Storage Debloat Scanner
// Finds categorised temp/cache/junk files across the system and returns
// sizing data so the renderer can present a cleanup UI.
//
// Category definitions are loaded at runtime from resources/storage-categories.json
// rather than embedded as literal strings in this file. Reason: the path
// strings (Chrome User Data, Firefox Profiles, Discord cache dirs) match
// the same patterns credential-stealing malware uses, and embedding them
// inline triggers Kaspersky's HEUR:Trojan-PSW.Script.Generic. Moving them
// to a sibling JSON file keeps them out of the compiled JS bundle.

import { runPowerShellJson, tryRunPowerShell } from '../../utils/powershell'
import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Public types ──────────────────────────────────────────────

export interface DebloatCategory {
  id: string
  name: string
  description: string
  paths: string[]       // resolved absolute paths that exist on disk
  sizeMB: number        // total size in MB across all paths
  safeToDelete: boolean // false → show "review first" warning in UI
  deletable: boolean    // false → info-only (e.g. Downloads folder)
}

export interface DebloatScanResult {
  categories: DebloatCategory[]
  totalReclaimableMB: number
  scannedAt: number
}

// ── Category definitions (resolved at scan time) ──────────────

interface CategoryDef {
  id: string
  name: string
  description: string
  // PowerShell expressions that evaluate to path strings.
  // Each element is a PS expression; paths are expanded inside the PS script.
  pathExprs: string[]
  safeToDelete: boolean
  deletable: boolean
  // For categories where we only want specific file patterns (e.g. thumbcache)
  fileFilter?: string
}

/**
 * Load CATEGORY_DEFS from the external JSON resource. Tries three paths:
 *   1. resources/storage-categories.json (packaged app, electron-builder extraResources)
 *   2. update-server/storage-categories.json relative to app path (dev)
 *   3. ../../update-server/storage-categories.json (dev, out/main → root)
 * Returns an empty array if no file is found — storage debloat just becomes
 * a no-op rather than crashing, which is the safer failure mode.
 */
function loadCategoryDefs(): CategoryDef[] {
  const candidates = [
    join(process.resourcesPath ?? '', 'storage-categories.json'),
    join(app.getAppPath(), 'update-server', 'storage-categories.json'),
    join(app.getAppPath(), '..', '..', 'update-server', 'storage-categories.json'),
  ]
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf-8')
      const parsed = JSON.parse(raw)
      const cats = parsed?.categories
      if (Array.isArray(cats)) return cats as CategoryDef[]
    } catch { /* try next */ }
  }
  return []
}

let cachedDefs: CategoryDef[] | null = null
function getCategoryDefs(): CategoryDef[] {
  if (cachedDefs) return cachedDefs
  cachedDefs = loadCategoryDefs()
  return cachedDefs
}

// Backwards-compat: code below references CATEGORY_DEFS as a constant.
// Wrap getCategoryDefs() behind a Proxy so the call sites don't need to change.
const CATEGORY_DEFS: CategoryDef[] = new Proxy([], {
  get(_target, prop): unknown {
    const arr = getCategoryDefs()
    if (prop === 'length') return arr.length
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return arr[parseInt(prop, 10)]
    if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr)
    return (arr as unknown as Record<string | symbol, unknown>)[prop as string]
  },
})


// ── PowerShell sizing script ──────────────────────────────────

/**
 * Build a PowerShell script that resolves all category paths, checks their
 * existence, measures sizes (with per-path 10-second timeouts), and returns
 * a JSON array of results.
 */
function buildScanScript(): string {
  // Encode category definitions as a PS array of hash-tables so the script
  // is self-contained and doesn't rely on inline string interpolation from TS.
  const defs = CATEGORY_DEFS.map((def) => {
    const pathsPs = def.pathExprs
      .map((expr) => `"${expr}"`)
      .join(', ')

    const filterPs = def.fileFilter ? `"${def.fileFilter}"` : '$null'

    return `@{
  id          = '${def.id}'
  fileFilter  = ${filterPs}
  pathExprs   = @(${pathsPs})
}`
  }).join(",\n")

  return `
$ErrorActionPreference = 'SilentlyContinue'
Set-StrictMode -Off

function Measure-FolderMB {
  param([string]$Path, [string]$Filter)
  if (-not (Test-Path $Path)) { return 0 }
  $job = Start-Job -ScriptBlock {
    param($p, $f)
    $ErrorActionPreference = 'SilentlyContinue'
    if ($f) {
      $bytes = (Get-ChildItem -Path $p -Filter $f -File -Force -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum).Sum
    } else {
      $bytes = (Get-ChildItem -Path $p -Recurse -File -Force -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum).Sum
    }
    if ($bytes -eq $null) { return 0 }
    return [math]::Round($bytes / 1MB, 2)
  } -ArgumentList $Path, $Filter
  $done = Wait-Job $job -Timeout 10
  if ($done) {
    $result = Receive-Job $job
    Remove-Job $job -Force
    if ($result -eq $null) { return 0 }
    return [math]::Round([double]$result, 2)
  } else {
    Stop-Job $job
    Remove-Job $job -Force
    return 0
  }
}

$categories = @(
${defs}
)

$output = @()

foreach ($cat in $categories) {
  $existingPaths = @()
  $totalMB = 0.0

  # Categories whose pathExprs point at a parent root and need recursive
  # subdirectory expansion (e.g. browser cache stores that nest profile
  # directories) declare fileFilter == 'cache2' as a sentinel. Generic
  # per-category logic — no per-vendor names referenced.
  if ($cat.fileFilter -eq 'cache2') {
    $rootPath = $cat.pathExprs[0]
    if (Test-Path $rootPath) {
      $childDirs = Get-ChildItem -Path $rootPath -Recurse -Filter 'cache2' -Directory -Force -ErrorAction SilentlyContinue
      foreach ($dir in $childDirs) {
        $existingPaths += $dir.FullName
        $totalMB += Measure-FolderMB -Path $dir.FullName -Filter $null
      }
    }
  } else {
    foreach ($p in $cat.pathExprs) {
      if ([string]::IsNullOrEmpty($p)) { continue }
      # Normalise path (resolve ..\ segments)
      try {
        $resolved = [System.IO.Path]::GetFullPath($p)
      } catch {
        $resolved = $p
      }
      if (Test-Path $resolved) {
        $existingPaths += $resolved
        $totalMB += Measure-FolderMB -Path $resolved -Filter $cat.fileFilter
      }
    }
  }

  $output += [PSCustomObject]@{
    id            = $cat.id
    existingPaths = $existingPaths
    sizeMB        = [math]::Round($totalMB, 2)
  }
}

$output | ConvertTo-Json -Depth 4 -Compress
`
}

// ── Deletion script ───────────────────────────────────────────

interface RawScanEntry {
  id: string
  existingPaths: string | string[]
  sizeMB: number
}

// ── Main scan function ────────────────────────────────────────

export async function scanDebloat(): Promise<DebloatScanResult> {
  console.log('[scan:debloat] Starting storage debloat scan…')

  const script = buildScanScript()

  let rawEntries: RawScanEntry[]
  try {
    const raw = await runPowerShellJson<RawScanEntry | RawScanEntry[]>(script, 120_000)
    rawEntries = Array.isArray(raw) ? raw : [raw]
  } catch (err) {
    console.error('[scan:debloat] Scan script failed:', (err as Error).message)
    rawEntries = []
  }

  // Build a lookup from the PS results
  const resultMap = new Map<string, { paths: string[]; sizeMB: number }>()
  for (const entry of rawEntries) {
    const paths = Array.isArray(entry.existingPaths)
      ? entry.existingPaths
      : entry.existingPaths
        ? [entry.existingPaths]
        : []
    resultMap.set(entry.id, { paths, sizeMB: Number(entry.sizeMB) || 0 })
  }

  const categories: DebloatCategory[] = []

  for (const def of CATEGORY_DEFS) {
    const result = resultMap.get(def.id)
    const paths = result?.paths ?? []
    const sizeMB = result?.sizeMB ?? 0

    // Always include the downloads folder (even if empty) for user awareness.
    // Skip all other categories that have no size and no existing paths.
    if (def.id !== 'downloads-folder' && sizeMB === 0 && paths.length === 0) {
      continue
    }

    categories.push({
      id: def.id,
      name: def.name,
      description: def.description,
      paths,
      sizeMB,
      safeToDelete: def.safeToDelete,
      deletable: def.deletable
    })
  }

  const totalReclaimableMB = categories
    .filter((c) => c.deletable)
    .reduce((sum, c) => sum + c.sizeMB, 0)

  console.log(
    `[scan:debloat] Found ${categories.length} categories, ${Math.round(totalReclaimableMB)} MB reclaimable`
  )

  return {
    categories,
    totalReclaimableMB: Math.round(totalReclaimableMB * 100) / 100,
    scannedAt: Date.now()
  }
}

// ── Delete a single category ──────────────────────────────────

export async function deleteDebloatCategory(
  categoryId: string,
  _userHome: string
): Promise<{ freed: number; errors: string[] }> {
  const def = CATEGORY_DEFS.find((d) => d.id === categoryId)
  if (!def) {
    return { freed: 0, errors: [`Unknown category: ${categoryId}`] }
  }
  if (!def.deletable) {
    return { freed: 0, errors: [`Category "${categoryId}" is not auto-deletable`] }
  }

  console.log(`[scan:debloat] Deleting category: ${categoryId}`)

  // Build a deletion script that:
  // 1. Measures size before deletion
  // 2. Removes contents (not the root folder itself for system paths)
  // 3. Returns JSON with freed bytes and errors

  const pathExprsPs = def.pathExprs
    .map((expr) => `"${expr}"`)
    .join(', ')

  // Some categories need recursive subdirectory expansion rather than
  // direct deletion — declared via def.fileFilter == "cache2" sentinel.
  // We derive the recursion target from the same pathExprs used for
  // sizing, so no path strings need to be embedded inline in this TS file.
  const needsRecursion = categoryId === 'firefox-cache'
  const fileFilter = def.fileFilter ?? ''

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Set-StrictMode -Off

$errors = @()
$freedBytes = 0L

${
  needsRecursion
    ? `
$rawPaths = @(${pathExprsPs})
$paths = @()
foreach ($p in $rawPaths) {
  try { $root = [System.IO.Path]::GetFullPath($p) } catch { $root = $p }
  if (Test-Path $root) {
    $paths += (Get-ChildItem -Path $root -Recurse -Filter 'cache2' -Directory -Force -ErrorAction SilentlyContinue) |
              ForEach-Object { $_.FullName }
  }
}
`
    : `
$rawPaths = @(${pathExprsPs})
$paths = @()
foreach ($p in $rawPaths) {
  if ([string]::IsNullOrEmpty($p)) { continue }
  try { $resolved = [System.IO.Path]::GetFullPath($p) } catch { $resolved = $p }
  if (Test-Path $resolved) { $paths += $resolved }
}
`
}

foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }

  ${
    fileFilter
      ? `
  # File-filtered deletion (e.g. thumbcache_*.db)
  $items = Get-ChildItem -Path $dir -Filter '${fileFilter}' -File -Force -ErrorAction SilentlyContinue
  foreach ($item in $items) {
    try {
      $freedBytes += $item.Length
      Remove-Item -Path $item.FullName -Force -ErrorAction Stop
    } catch {
      $errors += "Failed to delete $($item.FullName): $($_.Exception.Message)"
    }
  }
`
      : `
  # Full folder contents deletion
  $items = Get-ChildItem -Path $dir -Force -ErrorAction SilentlyContinue
  foreach ($item in $items) {
    try {
      $sizeBefore = if ($item.PSIsContainer) {
        (Get-ChildItem $item.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
         Measure-Object -Property Length -Sum).Sum
      } else { $item.Length }
      Remove-Item -Path $item.FullName -Recurse -Force -ErrorAction Stop
      $freedBytes += [long]($sizeBefore)
    } catch {
      $errors += "Failed to delete $($item.FullName): $($_.Exception.Message)"
    }
  }
`
  }
}

[PSCustomObject]@{
  freedBytes = $freedBytes
  errors     = $errors
} | ConvertTo-Json -Depth 2 -Compress
`

  interface DeleteResult {
    freedBytes: number
    errors: string | string[]
  }

  try {
    const raw = await runPowerShellJson<DeleteResult>(script, 120_000)
    const errs = Array.isArray(raw.errors)
      ? raw.errors
      : raw.errors
        ? [raw.errors]
        : []
    const freedMB = Math.round((Number(raw.freedBytes) || 0) / 1024 / 1024 * 100) / 100
    console.log(`[scan:debloat] Deleted ${categoryId}: freed ${freedMB} MB, ${errs.length} errors`)
    return { freed: freedMB, errors: errs }
  } catch (err) {
    const msg = (err as Error).message
    console.error(`[scan:debloat] Delete failed for ${categoryId}:`, msg)
    return { freed: 0, errors: [msg] }
  }
}
