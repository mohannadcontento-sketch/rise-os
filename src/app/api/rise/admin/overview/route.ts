import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

// ADMIN PRO — Overview / Command Center endpoint.
// One round trip feeding the default admin tab: KPIs, activity,
// error trend, latest audit entries and latest signups.

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}
function daysAgoDate(days: number): string {
  return daysAgoISO(days).slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }
    setCurrentAuthToken(request.headers.get('Authorization')?.replace('Bearer ', ''))

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 503 })
    }
    const sb = admin as any
    const t0 = Date.now()

    const today = daysAgoDate(0)
    const d7 = daysAgoDate(7)
    const d30 = daysAgoDate(30)

    // ── KPI queries (parallel, cheap head-counts / narrow selects) ──
    const [usersQ, todayScoresQ, weekScoresQ, weekSignupsQ, suspendedQ, adminsQ] = await Promise.all([
      sb.from('profiles').select('id', { count: 'exact', head: true }),
      sb.from('daily_scores').select('user_id').gte('date', today),
      sb.from('daily_scores').select('user_id').gte('date', d7),
      sb.from('profiles').select('id, name, email, created_at, role, suspended').gte('created_at', daysAgoISO(7)).order('created_at', { ascending: false }),
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('suspended', true),
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    ])

    const usersTotal = usersQ.count ?? 0
    const usersActiveToday = new Set((todayScoresQ.data || []).map((r: any) => r.user_id)).size
    const usersActive7d = new Set((weekScoresQ.data || []).map((r: any) => r.user_id)).size
    const usersNew7d = weekSignupsQ.count ?? (weekSignupsQ.data || []).length
    const recentSignups = (weekSignupsQ.data || []).slice(0, 5).map((p: any) => ({
      id: p.id, name: p.name, email: p.email, createdAt: p.created_at,
      role: p.role, suspended: p.suspended === true,
    }))

    // ── Errors: 24h total + 7-day trend (7 head-count queries) ──
    const errorCounts = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const day = daysAgoDate(i)
        return sb.from('error_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${day}T00:00:00Z`)
          .lt('created_at', `${day}T23:59:59Z`)
          .then((r: any) => ({ date: day, count: r.count ?? 0 }))
          .catch(() => ({ date: day, count: 0 }))
      })
    )
    const errors7d = errorCounts.reverse() // oldest → newest
    const errors24h = errors7d[errors7d.length - 1]?.count ?? 0
    const errorLogsMissing = errors7d.every(d => d.count === 0)
      ? undefined // can't distinguish — errors tab reports tableMissing explicitly
      : undefined

    // ── Latest audit entries (notifications type='audit') ──
    let recentAudit: any[] = []
    try {
      const { data } = await sb
        .from('notifications')
        .select('id, user_id, title, body, created_at')
        .eq('type', 'audit')
        .order('created_at', { ascending: false })
        .limit(8)
      recentAudit = (data || []).map((n: any) => ({
        id: n.id, adminId: n.user_id, action: n.title, detail: n.body, createdAt: n.created_at,
      }))
    } catch { /* table/type missing */ }

    // ── Content totals (head counts, parallel) ──
    const countTable = async (t: string) => {
      try {
        const { count } = await sb.from(t).select('*', { count: 'exact', head: true })
        return count ?? 0
      } catch { return 0 }
    }
    const [tasksTotal, habitsTotal, journalsTotal, focusTotal] = await Promise.all([
      countTable('tasks'), countTable('habits'), countTable('journals'), countTable('focus_sessions'),
    ])

    return NextResponse.json({
      kpis: {
        usersTotal,
        usersActiveToday,
        usersActive7d,
        usersNew7d,
        usersSuspended: suspendedQ.count ?? 0,
        usersAdmins: adminsQ.count ?? 0,
        errors24h,
        tasksTotal, habitsTotal, journalsTotal, focusTotal,
      },
      errors7d,
      recentSignups,
      recentAudit,
      dbLatencyMs: Date.now() - t0,
    })
  } catch (error) {
    console.error('[admin/overview] error:', error)
    return NextResponse.json({ error: 'فشل تحميل النظرة العامة' }, { status: 500 })
  }
}
