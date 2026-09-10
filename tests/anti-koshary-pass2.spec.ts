import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

describe('Anti-Koshary Pass 2 invariants', () => {
  it('uses shared user auth setup in non-admin Rise routes', () => {
    const files = routeFiles(join(ROOT, 'src/app/api/rise')).filter((p) => !p.includes('/admin/'))
    const violations = files.filter((p) => /requireAuth\(req\)|setCurrentAuthToken\(req\)/.test(readFileSync(p, 'utf8')))
    expect(violations).toEqual([])
  })
  it('uses batch notification data methods', () => {
    const route = readFileSync(join(ROOT, 'src/app/api/rise/notifications/route.ts'), 'utf8')
    expect(route).toContain('data.notifications.updateMany')
    expect(route).toContain('data.notifications.removeMany')
    expect(route).toContain('data.notifications.removeAll')
    expect(route).not.toMatch(/for \(const .* of .*ids\)/)
  })
  it('contains the broadcast schema correction', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/020_broadcast_schema_fix.sql'), 'utf8')
    expect(sql).toContain('(user_id, title, body, type, icon, action_url, read)')
    expect(sql).toContain("'system'")
    expect(sql).not.toContain('is_read')
    expect(sql).not.toContain("'announcement'")
  })
  it('scopes user-owned browser preferences', () => {
    for (const rel of [
      'src/components/rise/reminder-engine.tsx',
      'src/components/rise/daily-planner.tsx',
      'src/components/rise/ai-coach.tsx',
      'src/lib/notification-prefs.ts',
      'src/lib/sounds.ts',
    ]) {
      const text = readFileSync(join(ROOT, rel), 'utf8')
      expect(text).not.toMatch(/localStorage\.(getItem|setItem|removeItem)\(/)
    }
  })
})
