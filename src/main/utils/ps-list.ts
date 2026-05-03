// ps-list went ESM-only at v8 and the main bundle is still CJS. We can't
// `require('ps-list')` from a CJS file but `import()` works fine, so this
// wrapper does the dynamic load once, caches it, and exposes a callable
// that looks like the original default export.

type PsListModule = typeof import('ps-list')
type PsList = PsListModule['default']

let cached: PsList | null = null

async function load(): Promise<PsList> {
  if (cached) return cached
  const mod = await import('ps-list')
  cached = mod.default
  return cached
}

export default async function psList(): Promise<Awaited<ReturnType<PsList>>> {
  const fn = await load()
  return fn()
}
