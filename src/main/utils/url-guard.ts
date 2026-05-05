// Anything that calls shell.openExternal needs to know the URL won't be
// a custom-protocol payload. https only. http promoted to https implicitly
// is something we deliberately don't do here, since the original audit
// flagged http schemes too.

export function isHttpsUrl(input: unknown): boolean {
  if (typeof input !== 'string') return false
  if (input.length > 4096) return false
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return false
  }
  return parsed.protocol === 'https:'
}
