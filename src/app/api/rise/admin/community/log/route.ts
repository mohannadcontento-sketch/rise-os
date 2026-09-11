import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/community/log — سجل إجراءات الإشراف
// GET: آخر 100 إجراء (community_moderation_log — service_role
//      فقط قراءةً وكتابةً؛ المستخدم العادي يرى صفر صفوف).
// ============================================================

const ACTION_AR: Record<string, string> = {
  hide_post: 'إخفاء منشور',
  restore_post: 'استعادة منشور',
  remove_post: 'إزالة منشور',
  hide_comment: 'إخفاء تعليق',
  restore_comment: 'استعادة تعليق',
  remove_comment: 'إزالة تعليق',
  dismiss_report: 'استبعاد بلاغ',
  hide_reported: 'إخفاء محتوى مُبلغ',
  remove_reported: 'إزالة محتوى مُبلغ',
  ban_user: 'حظر مستخدم',
  unban_user: 'إلغاء حظر',
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req)
  if (!adminId) return NextResponse.json({ error: 'هذه الصفحة للمشرفين فقط' }, { status: 403 })

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'تكوين الخادم غير مكتمل' }, { status: 500 })

  const { data: log, error } = await (admin as any)
    .from('community_moderation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    console.warn('[admin/community/log] list failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل السجل' }, { status: 500 })
  }

  const modIds = [...new Set((log ?? []).map((l: any) => l.moderator_id).filter(Boolean))]
  const modsRes = modIds.length
    ? await (admin as any).from('profiles').select('id, name, handle').in('id', modIds)
    : { data: [] }
  const modsById = new Map<string, any>((modsRes.data ?? []).map((u: any) => [u.id, u]))

  const items = (log ?? []).map((l: any) => {
    const m = l.moderator_id ? modsById.get(l.moderator_id) : null
    return {
      id: l.id,
      action: l.action,
      actionAr: ACTION_AR[l.action] ?? l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      reason: l.reason,
      moderator: m ? `${m.name} (@${m.handle})` : 'النظام',
      createdAt: l.created_at,
    }
  })

  return NextResponse.json({ items })
}
