import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin, isSupabaseConfigured, ADMIN_EMAIL } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// TASK 20: site health snapshot for the admin panel "الصحة والأخطاء" tab.
// Answers the owner's question "هل الموقع شغال كويس؟" with facts:
// DB reachable + latency, config status (booleans only — values never leak),
// error volume. 

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const t0 = Date.now()
    const admin = await getSupabaseAdmin()
    let dbLatencyMs: number | null = null
    let dbOk = false
    let dbError: string | null = null

    const config = {
      supabase: isSupabaseConfigured(),
      serviceKey: !!(await getSupabaseAdmin()),
      adminEmail: !!ADMIN_EMAIL,
      sentry: !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    }

    let errorLogsMissing = false
    let errors24h = 0
    let totalUsers: number | null = null

    if (admin) {
      const sb = admin as any
      try {
        const { error } = await sb.from('profiles').select('id', { count: 'exact', head: true })
        dbLatencyMs = Date.now() - t0
        if (error) { dbError = error.message; dbOk = false }
        else { dbOk = true }
      } catch (e: any) {
        dbError = String(e?.message || e)
      }

      // exact users count (cheap head count)
      try {
        const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true })
        totalUsers = count ?? 0
      } catch { totalUsers = null }

      // error_logs presence + 24h volume (optional table — migration 011)
      try {
        const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        const { count, error } = await sb
          .from('error_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since24h)
        if (error) errorLogsMissing = true
        else errors24h = count ?? 0
      } catch {
        errorLogsMissing = true
      }
    }

    return NextResponse.json({
      ok: dbOk,
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
      config,
      errors24h,
      errorLogsMissing,
      totalUsers,
      serverTime: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      checkedInMs: Date.now() - t0,
    })
  } catch (error) {
    console.error('[admin/health] error:', error)
    return NextResponse.json({ ok: false, error: 'فحص الصحة فشل' }, { status: 500 })
  }
}
