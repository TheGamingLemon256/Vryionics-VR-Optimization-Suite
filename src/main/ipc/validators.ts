// Renderer-payload validators. Pulled out of the IPC handler files so that
// tests can exercise them without bringing the Electron runtime.

const ALLOWED_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'theme',
  'theme.accent',
  'theme.glassOpacity',
  'theme.reducedMotion',
  'advancedMode',
  'tour.seen',
  'tour.dismissed',
  'sessions.recordingEnabled',
  'firstLaunchAt',
])

export function isAllowedConfigKey(key: string): boolean {
  return ALLOWED_CONFIG_KEYS.has(key)
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// The wizard sends UserSetupConfig over IPC. We can't trust the renderer
// to send a well-formed payload, but we also don't need to schema-check
// every byte — just rule out the obvious shapes that would corrupt the
// persisted store.
export function validateSetupConfig(input: unknown): Record<string, unknown> | null {
  if (!isObj(input)) return null
  const required = ['headsetId', 'connectionArchetype']
  for (const k of required) {
    const v = input[k]
    if (typeof v !== 'string' || v.length === 0 || v.length > 200) return null
  }
  const skill = input.skillLevel
  if (skill !== undefined && skill !== 'beginner' && skill !== 'intermediate' && skill !== 'advanced') {
    return null
  }
  return input
}
