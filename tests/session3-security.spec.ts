import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const login = read('src/app/api/auth/login/route.ts')
const signup = read('src/app/api/auth/signup/route.ts')
const refresh = read('src/app/api/auth/refresh/route.ts')
const authProvider = read('src/components/auth-provider.tsx')
const loginPage = read('src/components/rise/login-page.tsx')
const adminQuery = read('src/app/api/rise/admin/query/route.ts')
const migration = read('supabase/migrations/015_admin_read_allowlist.sql')
const apiFetch = read('src/lib/api-fetch.ts')
const auth = read('src/lib/auth.ts')

const checks: Array<[string, boolean]> = [
  ['login response contains no session payload', !/NextResponse\.json\(\{\s*user:[\s\S]{0,1000}session:/.test(login)],
  ['signup cannot self-provision admin', !/profiles\s*\n?[\s\S]*role:\s*'admin'/.test(signup) && !/isAdmin:\s*email\s*===/.test(signup)],
  ['refresh response contains no session payload', !/NextResponse\.json\(\{\s*session:/.test(refresh)],
  ['browser auth provider has no Supabase client', !/@\/lib\/supabase-client/.test(authProvider)],
  ['login page does not import Supabase browser client', !/@\/lib\/supabase-client/.test(loginPage)],
  ['admin query does not accept sql input', !/z\.object\(\{[\s\S]*sql:/.test(adminQuery)],
  ['admin query calls allowlisted RPC', /rpc\('admin_read'/.test(adminQuery)],
  ['old exec_sql access revoked', /proname\s*=\s*'exec_sql'/.test(migration) && /REVOKE ALL ON FUNCTION/.test(migration)],
  ['cookie-only refresh client expects user, not session', /if \(data\.user\)/.test(apiFetch)],
  ['withAuth binds whole request context', /setCurrentAuthToken\(req\)/.test(auth)],
]

let failed = false
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
