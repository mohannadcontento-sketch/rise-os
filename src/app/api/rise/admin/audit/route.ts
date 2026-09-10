import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ADMIN PRO — immutable audit trail viewer.
// Reads the dedicated audit_logs ledger (service client — RLS-free by design).

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'سجل التدقيق غير متاح' }, { status: 503 })
    const sb = admin as any

    const { data, error } = await sb
      .from('audit_logs')
      .select('id, actor_user_id, action, target_type, target_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[admin/audit] query error:', error.message)
      return NextResponse.json({ error: 'سجل التدقيق غير متاح حالياً' }, { status: 503 })
    }

    // Resolve admin names (single profiles lookup for the distinct admins)
    const adminIds = [...new Set((data || []).map((n: any) => n.actor_user_id).filter(Boolean))]
    const nameMap = new Map<string, string>()
    if (adminIds.length > 0) {
      const { data: admins } = await sb
        .from('profiles')
        .select('id, name, email')
        .in('id', adminIds)
      for (const a of admins || []) nameMap.set(a.id, a.name || a.email || 'أدمن')
    }

    return NextResponse.json({
      entries: (data || []).map((n: any) => ({
        id: n.id,
        adminId: n.actor_user_id,
        adminName: nameMap.get(n.actor_user_id) || 'أدمن',
        action: n.action,
        resource: n.target_type || null,
        resourceId: n.target_id || null,
        detail: [n.target_type, n.target_id].filter(Boolean).join(':') || JSON.stringify(n.metadata || {}),
        metadata: n.metadata || {},
        createdAt: n.created_at,
      })),
    })
  } catch (error) {
    console.error('[admin/audit] error:', error)
    return NextResponse.json({ error: 'فشل تحميل السجل' }, { status: 500 })
  }
}
