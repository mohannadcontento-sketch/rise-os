/**
 * Prisma/SQLite client — local-only fallback.
 * On Vercel/Supabase deployments, Prisma is not available.
 * This module exports a no-op proxy so all `db.*` calls gracefully return null.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy({}, {
  get() {
    // Return a no-op proxy for any nested access (db.user.findMany, etc.)
    return new Proxy(async () => null as any, {
      get: () => async (..._args: any[]) => null as any,
      apply: async (_target: any, _thisArg: any, _args: any[]) => null as any,
    })
  },
})
