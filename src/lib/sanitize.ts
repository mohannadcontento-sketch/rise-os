/**
 * Whitelist incoming write payloads down to the columns each table actually
 * has. The data layer forwards every key it receives (camelCase → snake_case)
 * straight to PostgREST, so any extra/legacy field a client sends (e.g. from
 * a stale cached JS bundle) surfaces as a PGRST204 "column not found" 500.
 * Picking explicitly makes writes immune to client-side field drift.
 */
export function pickAllowed(body: unknown, allowed: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const src = body as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in src) out[key] = src[key]
  }
  return out
}
