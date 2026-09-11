// ============================================================
// أوج (Awj) — Server-side PKCE for email-link auth flows
// (المرحلة 03 — hotfix: password recovery was unreachable)
// ------------------------------------------------------------
// PROBLEM (root cause of the broken reset link):
//   resetPasswordForEmail was called on a server-side client with
//   the default flowType 'implicit'. Supabase then sends the
//   recovery email WITHOUT a code_challenge, so the email link
//   redirects to /auth/callback#access_token=... — tokens in the
//   URL *hash fragment*, which browsers never send to servers.
//   The callback route could never see a `code`, so the user was
//   dumped on /app and the reset page was unreachable. Always.
//
// FIX — server-authoritative PKCE with a cookie-carried verifier:
//   1) reset-password API: PKCE client + capture-storage → the
//      code_verifier auth-js generates is captured and stored in
//      an httpOnly cookie on the *requesting browser* (SameSite=Lax
//      survives the top-level navigation of clicking an email link).
//   2) callback route: PKCE client + source-storage seeded with that
//      verifier → exchangeCodeForSession(code) succeeds server-side,
//      tokens land ONLY in httpOnly cookies (never localStorage).
//
// WHY persistSession: true on the factory below: auth-js honors a
// custom `auth.storage` ONLY when persistSession is true — its
// constructor otherwise discards it for an in-memory adapter
// (verified against @supabase/auth-js 2.110.7 source). Session
// "writes" into these shims are discarded by design; callers read
// the session from the auth-call return value.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/** Minimal localStorage-like adapter auth-js accepts as `storage`. */
export interface AuthStorageShim {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

/** auth-js writes the PKCE verifier at `<storageKey>-code-verifier`. */
const VERIFIER_KEY_SUFFIX = '-code-verifier'

/** httpOnly cookie that carries the PKCE verifier from request → link click. */
export const PKCE_VERIFIER_COOKIE = 'rise-pkce-verifier'
/** Verifier TTL — matches Supabase's recovery-link validity window (1 hour). */
export const PKCE_VERIFIER_TTL = 60 * 60

/** Marker proving the session was born from a real recovery email click. */
export const RECOVERY_COOKIE = 'rise-pwd-recovery'
/** Recovery session TTL — enough to type a new password, nothing more. */
export const RECOVERY_TTL = 10 * 60

/** States surfaced to /reset-password when the link can't be honored. */
export type ResetLinkState = 'expired' | 'device' | 'invalid'

function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

function safeJsonParse(value: string): string {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : value
  } catch {
    return value
  }
}

/**
 * PKCE-enabled Supabase client bound to a custom storage adapter.
 * Used by BOTH ends of the recovery flow (request + exchange).
 */
export async function createSupabasePkceClient(storage: AuthStorageShim) {
  if (!isSupabaseConfigured()) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: true, // REQUIRED: auth-js ignores custom storage otherwise
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
    },
  })
}

/**
 * Storage shim for the reset REQUEST side: captures the verifier
 * written by auth-js during resetPasswordForEmail (before the email
 * is even sent). auth-js stores it as JSON: `"<verifier>/recovery"`.
 */
export function createVerifierCapture(): {
  storage: AuthStorageShim
  getVerifier(): string | null
} {
  let verifier: string | null = null
  return {
    storage: {
      getItem: async () => null,
      setItem: async (key, value) => {
        if (key.endsWith(VERIFIER_KEY_SUFFIX)) {
          verifier = safeJsonParse(value)
        }
      },
      removeItem: async () => {},
    },
    getVerifier: () => verifier,
  }
}

/**
 * Storage shim for the CALLBACK side: pre-seeded with the verifier
 * read from the httpOnly cookie. exchangeCodeForSession reads
 * `<storageKey>-code-verifier`, splits on '/' into
 * [code_verifier, redirectType] — so seeding the full
 * "<verifier>/recovery" string also makes the exchange report
 * redirectType='recovery' (our authoritative flow signal).
 */
export function createVerifierSource(verifierWithFlow: string): AuthStorageShim {
  return {
    getItem: async (key: string) =>
      key.endsWith(VERIFIER_KEY_SUFFIX) ? JSON.stringify(verifierWithFlow) : null,
    setItem: async () => {},
    removeItem: async () => {},
  }
}

/** True when the value looks like a recovery-flavored PKCE verifier. */
export function isRecoveryVerifier(value: string): boolean {
  // "<43+ url-safe chars>/recovery"
  return /^[A-Za-z0-9\-._~]{20,}\/recovery$/.test(value)
}

/** True when the value looks like a bare (non-recovery) PKCE verifier. */
export function isBareVerifier(value: string): boolean {
  return /^[A-Za-z0-9\-._~]{20,}$/.test(value)
}
