import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// TASK 20: admin error feed — persisted client errors from error_logs.
// GET  → last 100 errors + 24h count + top repeated messages
// DELETE → clear the log (admin action)

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ errors: [], total24h: 0, topMessages: [] })
    }
    const sb = admin as any

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    const [recent, dayCount] = await Promise.all([
      sb.from('error_logs')
        .select('id, user_id, message, url, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      sb.from('error_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h),
    ])

    if (recent.error) {
      // 42P01 = table missing (migration 011 not applied yet)
      console.warn('[admin/errors] query error:', recent.error.message)
      return NextResponse.json({ errors: [], total24h: 0, topMessages: [], tableMissing: true })
    }

    // Top repeated messages (from the 100-row sample — cheap, no extra trips)
    const counts = new Map<string, number>()
    for (const row of recent.data || []) {
      const key = String(row.message || '').slice(0, 120)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const topMessages = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }))

    return NextResponse.json({
      errors: (recent.data || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        message: r.message,
        url: r.url,
        createdAt: r.created_at,
      })),
      total24h: dayCount.count ?? 0,
      topMessages,
    })
  } catch (error) {
    console.error('[admin/errors] error:', error)
    return NextResponse.json({ errors: [], total24h: 0, topMessages: [] })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ success: true, cleared: 0 })
    const sb = admin as any

    // Supabase requires a filter for DELETE — epoch bound = "all rows"
    const { count, error } = await sb
      .from('error_logs')
      .delete({ count: 'exact' })
      .gte('created_at', '1970-01-01T00:00:00Z')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, cleared: count ?? 0 })
  } catch (error) {
    console.error('[admin/errors] clear error:', error)
    return NextResponse.json({ error: 'فشل مسح السجل' }, { status: 500 })
  }
}
