/**
 * Lazy Prisma client for local-only SQLite fallback.
 * On Vercel/Supabase deployments, this module is never actually called —
 * but it must not crash at import/build time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null
let _loadError = false

async function getDb() {
  if (_loadError) return null
  if (_db) return _db

  try {
    const mod = await import('../generated/prisma/client')
    const PrismaClient = mod.PrismaClient

    const globalForPrisma = globalThis as unknown as {
      prisma: any
    }

    _db = globalForPrisma.prisma ?? new PrismaClient()
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
    return _db
  } catch (err) {
    _loadError = true
    return null
  }
}

/**
 * Proxy-based db that lazily loads PrismaClient.
 * On Vercel (Supabase mode), all calls return null gracefully.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then' || typeof prop === 'symbol') return undefined
    // Return an async function that resolves to the real method or null
    return (...args: any[]) => getDb().then((client) => {
      if (!client) return null
      const val = client[prop]
      if (typeof val === 'function') return val.bind(client)(...args)
      return val
    })
  },
})
