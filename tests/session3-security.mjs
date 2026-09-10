import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const login=read('src/app/api/auth/login/route.ts'), signup=read('src/app/api/auth/signup/route.ts'), refresh=read('src/app/api/auth/refresh/route.ts'), authProvider=read('src/components/auth-provider.tsx'), loginPage=read('src/components/rise/login-page.tsx'), adminQuery=read('src/app/api/rise/admin/query/route.ts'), migration=read('supabase/migrations/015_admin_read_allowlist.sql'), apiFetch=read('src/lib/api-fetch.ts'), auth=read('src/lib/auth.ts')
const checks=[
['login response has no session payload',!/NextResponse\.json\(\{\s*user:[\s\S]{0,1000}session:/.test(login)],
['signup cannot self-provision admin',!/role:\s*['"]admin['"]/.test(signup)&&!/isAdmin:\s*email\s*===/.test(signup)],
['refresh response has no session payload',!/NextResponse\.json\(\{\s*session:/.test(refresh)],
['browser auth provider has no Supabase client',!/@\/lib\/supabase-client/.test(authProvider)],
['login page has no browser Supabase client',!/@\/lib\/supabase-client/.test(loginPage)],
['admin query has no sql parameter',!/sql\s*:/.test(adminQuery)],
['admin query calls allowlisted RPC',/rpc\('admin_read'/.test(adminQuery)],
['old exec_sql is revoked',/proname\s*=\s*'exec_sql'/.test(migration)&&/REVOKE ALL ON FUNCTION/.test(migration)],
['refresh client expects user',/if \(data\.user\)/.test(apiFetch)],
['withAuth binds whole request',/setCurrentAuthToken\(req\)/.test(auth)],
]
let failed=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok) failed++} process.exit(failed?1:0)
