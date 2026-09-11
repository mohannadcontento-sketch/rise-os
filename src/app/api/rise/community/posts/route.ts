import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityPostCreateSchema } from '@/lib/validators'
import { processMentions } from '@/lib/community-mentions'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/posts — المرحلة 07 (المجتمع)
//
// GET  : خلاصة المنشورات (RPC get_community_feed — نداء واحد:
//        عناصر + total + hasMore + liked_by_me).
//        ?page=1&filter=latest|top
// POST : نشر منشور/سؤال (zod + rate limit 5/min في الـmiddleware)
//        → RLS insert-own + إذونات أعمدة (لا يمكن تعيين العدادات)
//        → تحليل @mentions خادميًا → إشعار mention لكل مذكور.
// ============================================================

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ items: [], total: 0, page: 1, perPage: 20, hasMore: false })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const page = Math.max(1, Math.min(500, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1))
  const filter = req.nextUrl.searchParams.get('filter') === 'top' ? 'top' : 'latest'

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('get_community_feed', {
    p_page: page,
    p_per_page: 20,
    p_filter: filter,
  })
  if (error) {
    console.warn('[community/posts] feed RPC failed:', error.message)
    // الهجرة غير مطبقة → مجتمع فارغ (متدرج بأمان)
    if (error.message.includes('get_community_feed') || error.message.includes('PGRST202')) {
      return NextResponse.json({ items: [], total: 0, page, perPage: 20, hasMore: false })
    }
    return NextResponse.json({ error: 'تعذّر تحميل المجتمع — أعد المحاولة' }, { status: 500 })
  }
  return NextResponse.json(data ?? { items: [], total: 0, page, perPage: 20, hasMore: false })
}

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, communityPostCreateSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { title, body } = parsed.data
  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data: created, error } = await (client as any)
    .from('community_posts')
    .insert({ user_id: userId, title, body })
    .select('id')
    .single()

  if (error) {
    // رسائل معروفة → عربية واضحة
    if (error.message.includes('community_banned')) {
      return NextResponse.json({ error: 'حسابك محظور من المجتمع' }, { status: 403 })
    }
    console.warn('[community/posts] insert failed:', error.message)
    return NextResponse.json({ error: 'تعذّر نشر المنشور — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'community-post-create', {
    resource: 'community_posts',
    resourceId: created.id,
    details: { title: title.slice(0, 80) },
  })

  // mentions — فشلها لا يفشّل النشر أبدًا
  const admin = await getSupabaseAdmin()
  if (admin) {
    const { data: me } = await (admin as any)
      .from('profiles')
      .select('name, handle')
      .eq('id', userId)
      .maybeSingle()
    if (me) {
      void processMentions({
        authorId: userId,
        authorName: me.name ?? 'مستخدم',
        authorHandle: me.handle ?? 'user',
        text: `${title}\n${body}`,
        postId: created.id,
        source: 'post',
        sourceId: created.id,
      })
    }
  }

  return NextResponse.json({ id: created.id }, { status: 201 })
}
