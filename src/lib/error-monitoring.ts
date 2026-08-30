// ============================================================
// P2#8: Error monitoring utility
// ------------------------------------------------------------
// Lightweight error reporting. Uses Sentry if SENTRY_DSN is set,
// otherwise falls back to console + /api/error-log endpoint.
// No heavy dependency — works in all environments.
// ============================================================

interface ErrorContext {
  [key: string]: any
}

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || ''

/** Report an error to monitoring (Sentry or fallback logger). */
export function reportError(error: Error | string, context: ErrorContext = {}) {
  const errorObj = typeof error === 'string' ? new Error(error) : error

  // Always log to console (development + fallback)
  console.error('[RiseOS Error]', errorObj.message, context)

  // If Sentry DSN configured, send to Sentry
  if (SENTRY_DSN && typeof window !== 'undefined') {
    try {
      // Use Sentry's ingest API directly (no SDK needed)
      const event = {
        message: errorObj.message,
        level: 'error',
        platform: 'javascript',
        timestamp: Date.now() / 1000,
        environment: process.env.NODE_ENV,
        extra: context,
        tags: { source: 'riseos-client' },
      }
      // Fire-and-forget — don't block UI
      fetch(SENTRY_DSN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentry_event: JSON.stringify(event),
        }),
      }).catch(() => {})
    } catch { /* silent fail */ }
  }

  // Server-side: also POST to /api/error-log for persistence
  if (typeof window !== 'undefined') {
    try {
      fetch('/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: errorObj.message,
          stack: errorObj.stack,
          context,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    } catch { /* silent fail */ }
  }
}

/** Report a warning (non-blocking). */
export function reportWarning(message: string, context: ErrorContext = {}) {
  console.warn('[RiseOS Warning]', message, context)
}

/** Wrap an async function with error reporting. */
export function withErrorReporting<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: ErrorContext = {}
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      reportError(error as Error, { ...context, args: args.slice(0, 2) })
      throw error
    }
  }) as T
}
