import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ADMIN PRO — audit trail viewer.
// logAudit() writes admin actions into notifications (type='audit').
// This route reads them back (service client — RLS-free by design).

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ entries: [] })
    const sb = admin as any

    const { data, error } = await sb
      .from('notifications')
      .select('id, user_id, title, body, created_at')
      .eq('type', 'audit')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.warn('[admin/audit] query error:', error.message)
      return NextResponse.json({ entries: [] })
    }

    // Resolve admin names (single profiles lookup for the distinct admins)
    const adminIds = [...new Set((data || []).map((n: any) => n.user_id).filter(Boolean))]
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
        adminId: n.user_id,
        adminName: nameMap.get(n.user_id) || 'أدمن',
        action: n.title,          // "Admin: suspend" etc.
        detail: n.body,           // "profiles:uuid" etc.
        createdAt: n.created_at,
      })),
    })
  } catch (error) {
    console.error('[admin/audit] error:', error)
    return NextResponse.json({ error: 'فشل تحميل السجل' }, { status: 500 })
  }
}
