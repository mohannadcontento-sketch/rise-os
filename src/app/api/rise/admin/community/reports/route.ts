import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/community/reports — طابور مراجعة البلاغات
//
// GET : البلاغات المفتوحة (ثم المراجَعة) مع معاينة المحتوى
//      المُبلغ عنه + بيانات المُبلِّغ والصاحب — كلها عبر
//      service_role. ?status=open|resolved|all (افتراضي open).
//      تحل الروابط (post/comment) في TS لأن الهدف polymorphic.
// ============================================================

const REASON_AR: Record<string, string> = {
  spam: 'رسائل مزعجة/إعلانية',
  abuse: 'إساءة أو تنمّر',
  offensive: 'محتوى مسيء',
  off_topic: 'خارج الموضوع',
  other: 'أخرى',
}

const STATUS_AR: Record<string, string> = {
  open: 'مفتوح',
  resolved_dismissed: 'استُبعد',
  resolved_hidden: 'أُخفي المحتوى',
  resolved_removed: 'أُزيل المحتوى',
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req)
  if (!adminId) return NextResponse.json({ error: 'هذه الصفحة للمشرفين فقط' }, { status: 403 })

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'تكوين الخادم غير مكتمل' }, { status: 500 })

  const status = req.nextUrl.searchParams.get('status') || 'open'

  let query = (admin as any)
    .from('community_reports')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(100)
  if (status === 'open') query = query.eq('status', 'open')
  else if (status === 'resolved') query = query.neq('status', 'open')

  const { data: reports, error } = await query
  if (error) {
    console.warn('[admin/community/reports] list failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل البلاغات' }, { status: 500 })
  }

  // حلّ المحتوى المستهدف + أسماء الأطراف (batch)
  const postIds = (reports ?? []).filter((r: any) => r.target_type === 'post').map((r: any) => r.target_id)
  const commentIds = (reports ?? []).filter((r: any) => r.target_type === 'comment').map((r: any) => r.target_id)
  const userIds = [
    ...new Set((reports ?? []).flatMap((r: any) => [r.reporter_id, r.handled_by]).filter(Boolean)),
  ]

  const [postsRes, commentsRes, usersRes] = await Promise.all([
    postIds.length
      ? (admin as any).from('community_posts').select('id, title, body, user_id, status').in('id', postIds)
      : { data: [] },
    commentIds.length
      ? (admin as any).from('community_comments').select('id, post_id, body, user_id, status').in('id', commentIds)
      : { data: [] },
    userIds.length
      ? (admin as any).from('profiles').select('id, name, handle').in('id', userIds)
      : { data: [] },
  ])

  const postsById = new Map<string, any>((postsRes.data ?? []).map((p: any) => [p.id, p]))
  const commentsById = new Map<string, any>((commentsRes.data ?? []).map((p: any) => [p.id, p]))
  const usersById = new Map<string, any>((usersRes.data ?? []).map((u: any) => [u.id, u]))

  const items = (reports ?? []).map((r: any) => {
    const target = r.target_type === 'post' ? postsById.get(r.target_id) : commentsById.get(r.target_id)
    const owner = target ? usersById.get(target.user_id) : null
    // لو التعليق، اجلب عنوان المنشور الأب
    const parentPost = r.target_type === 'comment' && target ? postsById.get(target.post_id) : null
    return {
      id: r.id,
      reason: r.reason,
      reasonAr: REASON_AR[r.reason] ?? r.reason,
      details: r.details,
      status: r.status,
      statusAr: STATUS_AR[r.status] ?? r.status,
      createdAt: r.created_at,
      handledAt: r.handled_at,
      reporter: usersById.get(r.reporter_id)
        ? { name: usersById.get(r.reporter_id).name, handle: usersById.get(r.reporter_id).handle }
        : null,
      target: target
        ? {
            type: r.target_type,
            id: r.target_id,
            status: target.status,
            snippet: String(target.body ?? '').replace(/\s+/g, ' ').slice(0, 200),
            title: r.target_type === 'post' ? target.title : parentPost?.title ?? null,
            postId: r.target_type === 'post' ? target.id : target.post_id,
            owner: owner ? { name: owner.name, handle: owner.handle, userId: owner.id } : null,
          }
        : null, // المحتوى حُذف
    }
  })

  void logAudit(req, adminId, 'admin-community-reports-view', {
    resource: 'community_reports',
    details: { status, count: items.length },
  })

  return NextResponse.json({ items })
}
