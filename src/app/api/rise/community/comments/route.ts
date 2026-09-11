import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityCommentCreateSchema } from '@/lib/validators'
import { processMentions } from '@/lib/community-mentions'
import { notifyUser, communityCommentMessage, communityReplyMessage } from '@/lib/notifications-service'
import { logAudit } from '@/lib/audit'
import { tursoUpsertComment, tursoUpsertPost, tursoUpsertMember } from '@/lib/community-sync'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/comments — تعليق أو رد (المرحلة 07)
//
// POST : zod (postId/parentId?/body) + rate limit 10/min.
//        RLS insert-own + إذونات أعمدة. بعد الإنشاء (ناجحًا فقط):
//          1) إشعار «تعليق جديد» لصاحب المنشور (ليس نفسي)
//          2) إشعار «رد جديد» لصاحب التعليق الأب (ليس نفسي،
//             وليس صاحب المنشور تفاديًا للتكرار)
//          3) mentions خادمية + إشعار mention لكل مذكور
//        كل الإشعارات dedup per-comment — إعادة الإرسال بسبب
//        فشل شبكة عابر لا تكرر الإشعار.
//        التعليق على منشور غير منشور → 404 (لا نكشف حالة
//        المحتوى المخفي لغير صاحبه).
// ============================================================

function snippet(text: string, max = 90) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, communityCommentCreateSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { postId, parentId, body } = parsed.data
  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // المنشور موجود ومنشور؟ (قراءة عبر جلسة المستخدم — RLS يتكفل)
  const { data: post } = await (client as any)
    .from('community_posts')
    .select('id, title, user_id, status')
    .eq('id', postId)
    .maybeSingle()
  if (!post || post.status !== 'published') {
    return NextResponse.json({ error: 'المنشور غير متاح للتعليق' }, { status: 404 })
  }

  // الأب صالح ويتبع نفس المنشور؟
  let parentAuthorId: string | null = null
  if (parentId) {
    const { data: parent } = await (client as any)
      .from('community_comments')
      .select('id, post_id, user_id, status')
      .eq('id', parentId)
      .maybeSingle()
    if (!parent || parent.post_id !== postId || parent.status !== 'published') {
      return NextResponse.json({ error: 'التعليق المستهدف غير متاح' }, { status: 404 })
    }
    parentAuthorId = parent.user_id
  }

  const { data: created, error } = await (client as any)
    .from('community_comments')
    .insert({ post_id: postId, user_id: userId, parent_comment_id: parentId ?? null, body })
    .select('id')
    .single()

  if (error) {
    if (error.message.includes('community_banned')) {
      return NextResponse.json({ error: 'حسابك محظور من المجتمع' }, { status: 403 })
    }
    console.warn('[community/comments] insert failed:', error.message)
    return NextResponse.json({ error: 'تعذّر إضافة التعليق — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'community-comment-create', {
    resource: 'community_comments',
    resourceId: created.id,
    details: { postId, parentId: parentId ?? null },
  })

  // ─── الإشعارات الاجتماعية (service client — المصدر الموحد) ───
  const admin = await getSupabaseAdmin()
  if (admin) {
    const { data: me } = await (admin as any)
      .from('profiles')
      .select('name, handle')
      .eq('id', userId)
      .maybeSingle()
    const actorName = me?.name ?? 'مستخدم'
    const actorHandle = me?.handle ?? 'user'

    // 1) صاحب المنشور (ليس أنا، وليس صاحب الأب — سياسته تحت)
    if (post.user_id !== userId && post.user_id !== parentAuthorId) {
      void notifyUser(admin as any, {
        userId: post.user_id,
        ...communityCommentMessage(actorName, actorHandle, post.title, snippet(body), postId, created.id),
        dedupKey: `community-comment-${created.id}`,
      })
    }
    // 2) صاحب التعليق الأب (ليس أنا، وليس صاحب المنشور)
    if (parentAuthorId && parentAuthorId !== userId && parentAuthorId !== post.user_id) {
      void notifyUser(admin as any, {
        userId: parentAuthorId,
        ...communityReplyMessage(actorName, actorHandle, snippet(body), postId, created.id),
        dedupKey: `community-reply-${created.id}`,
      })
    }
    // 3) mentions
    void processMentions({
      authorId: userId,
      authorName: actorName,
      authorHandle: actorHandle,
      text: body,
      postId,
      source: 'comment',
      sourceId: created.id,
    })
  }

  // ── مرآة Turso: تعليق جديد + تحديث عدادات المنشور + لقطة العضو ──
  // (fire-and-forget — no-op بدون مفاتيح Turso، لا تكسر الطلب أبدًا)
  void tursoUpsertMember(userId)
  void tursoUpsertComment(created.id)
  void tursoUpsertPost(postId)

  return NextResponse.json({ id: created.id }, { status: 201 })
}
