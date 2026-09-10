import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const routeFiles: string[] = []
function walk(dir: string) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(rel)
    else if (entry.isFile() && entry.name === 'route.ts') routeFiles.push(rel)
  }
}
walk('src/app/api')

// Static regression checks intended to be run in CI without database credentials.
const clientFiles = [
  ...['src/components', 'src/app/app', 'src/hooks', 'src/store'].flatMap((d) => {
    const out: string[] = []
    const scan = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) scan(rel)
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
      }
    }
    scan(d)
    return out
  }),
]

for (const file of clientFiles) {
  const src = read(file)
  if (src.includes("@supabase/supabase-js") || src.includes("@/lib/supabase-client")) {
    throw new Error(`Browser Supabase client import detected: ${file}`)
  }
  if (/localStorage\.setItem\(['"]rise-auth/.test(src)) {
    throw new Error(`Browser auth token persistence detected: ${file}`)
  }
}

for (const route of routeFiles) {
  const src = read(route)
  const isAdmin = route.includes(`${path.sep}admin${path.sep}`)
  const isDeprecatedMcp = route.includes(`${path.sep}mcp${path.sep}call${path.sep}`)
  const methods = [...src.matchAll(/export async function (POST|PUT|PATCH|DELETE)\s*\(/g)].map((m) => m[1])
  if (!methods.length || isDeprecatedMcp) continue
  if (!route.includes(`${path.sep}auth${path.sep}`) && !route.endsWith('error-log/route.ts') && !route.endsWith('mcp/route.ts')) {
    if (isAdmin) {
      if (!src.includes('requireAdmin') || !src.includes('withIdempotency')) throw new Error(`Admin mutation boundary missing: ${route}`)
    } else {
      if (!src.includes('requireAuth') || !src.includes('withIdempotency')) throw new Error(`User mutation boundary missing: ${route}`)
    }
  }
}

for (const file of [
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/signup/route.ts',
  'src/app/api/auth/refresh/route.ts',
  'src/app/api/auth/resend/route.ts',
]) {
  const src = read(file)
  if (!src.includes('createSupabaseIsolatedClient')) throw new Error(`Shared auth client regression: ${file}`)
}

const cookieAuth = read('src/lib/cookie-auth.ts')
if (cookieAuth.includes('USER_COOKIE')) throw new Error('Readable user auth cookie regression')
if (!cookieAuth.includes('httpOnly: true') || !cookieAuth.includes("sameSite: 'lax'")) throw new Error('Cookie security flags missing')

const adminQuery = read('src/app/api/rise/admin/query/route.ts')
if (adminQuery.includes('exec_sql') || adminQuery.includes('request.body.sql') || !adminQuery.includes("queryId")) {
  throw new Error('Arbitrary admin SQL regression')
}

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((x) => x.endsWith('.sql'))
const finalMigration = read('supabase/migrations/019_final_privilege_hardening.sql')
for (const fn of ['admin_broadcast_notifications_atomic', 'admin_delete_user_data_atomic', 'admin_read', 'award_xp_atomic']) {
  if (!finalMigration.includes(fn)) throw new Error(`Final privilege/atomic migration missing: ${fn}`)
}
if (migrations.length < 19) throw new Error('Unexpected migration chain truncation')
console.log(`Final security invariants: PASS (${routeFiles.length} API routes, ${migrations.length} Supabase migrations)`)
