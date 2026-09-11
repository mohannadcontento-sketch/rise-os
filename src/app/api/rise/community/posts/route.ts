import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityPostCreateSchema } from '@/lib/validators'
import { processMentions } from '@/lib/community-mentions'
import { logAudit } from '@/lib/audit'
import { consumeUsage, limitReachedResponse } from '@/lib/billing/entitlements'
import { signMediaForApi, verifyMediaUploads, publicIdFromKey, extFromKey } from '@/lib/cloudinary'
import { tursoUpsertPost, tursoUpsertMember } from '@/lib/community-sync'
import { MAX_MEDIA_PER_POST } from '@/lib/media-constants'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/posts — المرحلة 07 (المجتمع) + 07-ب
//
// GET  : خلاصة المنشورات (RPC get_community_feed — نداء واحد:
//        عناصر + total + hasMore + liked_by_me + media).
//        ?page=1&filter=latest|top
//        روابط صور Cloudinary (CDN) تُبنى خادميًا من المفاتيح.
// POST : نشر منشور/سؤال (zod + rate limit) → حد الخطة أولًا
//        (المجانية 3 منشورات/يوم — consume_usage داخل DB)
//        → RLS insert-own + إذونات أعمدة (لا يمكن تعيين العدادات)
//        → إرفاق مرفقات Cloudinary (media) عبر service_role بعد
//        التحقق من ملكية media_objects (لا نثق بقوائم العميل)
//        والتأكد عبر Admin API أن الرفع تم فعلًا وبالحجم/الصيغة
//        الحقيقيين → تحليل @mentions خادميًا → إشعار mention
//        → مزامنة مرآة Turso (فصل مسار البيانات العامة —
//          قرار المالك في وثيقة النطاق §4؛ fire-and-forget).
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
  const payload = (data ?? { items: [], total: 0, page, perPage: 20, hasMore: false }) as any
  // روابط صور Cloudinary من المفاتيح (غير مضبوط → url=null — العميل
  // يعرض حالة «غير متاح»، والنص يعمل كالسابق)
  if (Array.isArray(payload.items)) {
    await Promise.all(
      payload.items.map(async (item: any) => {
        if (item && Array.isArray(item.media) && item.media.length > 0) {
          item.media = await signMediaForApi(item.media)
        }
      }),
    )
  }
  return NextResponse.json(payload)
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

  const { title, body, media } = parsed.data

  // ── حد الخطة (وثيقة النطاق §5: المجانية «قراءة + 3 منشورات/يوم») ──
  // القرار الذري داخل consume_usage في DB؛ عند المنع → 402 مع
  // الاستخدام → واجهة المستخدم تعرض upgrade prompt (نفس مسار export).
  const usage = await consumeUsage(req, 'community.post')
  if (!usage.allowed) {
    return limitReachedResponse(usage)
  }

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // ── التحقق من مرفقات Cloudinary قبل النشر (لا نثق بقوائم العميل) ──
  // صفوف media_objects: ملكيتي + status pending/active + غير
  // معلّقة بمنشور آخر + المفتاح المُرسَل يطابق صف القاعدة.
  const admin = await getSupabaseAdmin()
  let mediaRows: Array<{ id: string; object_key: string; bytes: number; declared_bytes?: number; content_type: string }> = []
  if (media && media.length > 0) {
    if (media.length > MAX_MEDIA_PER_POST) {
      return NextResponse.json({ error: `حتى ${MAX_MEDIA_PER_POST} صور في المنشور` }, { status: 400 })
    }
    if (!admin) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    const ids = media.map((m: { mediaId: string }) => m.mediaId)
    const { data: objs } = await (admin as any)
      .from('media_objects')
      .select('id, object_key, bytes, content_type, user_id, status, post_id')
      .in('id', ids)
    const byId = new Map<string, any>((objs ?? []).map((o: any) => [o.id, o]))
    const valid: any[] = []
    for (const m of media) {
      const o = byId.get(m.mediaId)
      if (
        !o ||
        o.user_id !== userId ||
        !['pending', 'active'].includes(o.status) ||
        o.post_id != null ||
        o.object_key !== m.key
      ) {
        return NextResponse.json(
          { error: 'مرفق غير صالح أو مستخدم بالفعل — أعد رفع الصورة وأعد المحاولة', code: 'INVALID_MEDIA' },
          { status: 400 },
        )
      }
      valid.push(o)
    }
    mediaRows = valid

    // ── تحقق Admin API: الرفع تم فعلًا؟ الصيغة والحجم الحقيقيان؟ ──
    // (ترقية على سلوك R2: كنا نكتفي بوجود الصف؛ الآن نتأكد أن
    //  الملف موجود فعلًا في Cloudinary ونحسب الحصة من حجمه الموثوق)
    const verified = await verifyMediaUploads(mediaRows.map((o) => o.object_key))
    if (verified) {
      for (const o of mediaRows) {
        const info = verified.get(publicIdFromKey(o.object_key))
        if (!info) {
          return NextResponse.json(
            { error: 'الصورة لم تُرفع فعليًا إلى التخزين — أعد رفعها وأعد المحاولة', code: 'INVALID_MEDIA' },
            { status: 400 },
          )
        }
        if (info.format !== extFromKey(o.object_key)) {
          return NextResponse.json(
            { error: 'نوع الصورة الفعلي لا يطابق المُعلَن — أعد رفعها', code: 'INVALID_MEDIA' },
            { status: 400 },
          )
        }
        if (!(info.bytes >= 1 && info.bytes <= 8388608)) {
          return NextResponse.json(
            { error: 'حجم الصورة الفعلي خارج الحدود المسموحة', code: 'INVALID_MEDIA' },
            { status: 400 },
          )
        }
        o.declared_bytes = o.bytes
        o.bytes = info.bytes
      }
    }
  }

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
    details: { title: title.slice(0, 80), mediaCount: mediaRows.length },
  })

  // ── إرفاق المرفقات عبر service_role (عمود media خارج إذونات
  // المستخدم — لا يمكن تزويره حتى عبر PostgREST مباشرة) ──
  if (mediaRows.length > 0 && admin) {
    const mediaJson = mediaRows.map((o) => ({
      key: o.object_key,
      contentType: o.content_type,
      bytes: Number(o.bytes) || 0,
    }))
    const { error: attachErr } = await (admin as any)
      .from('community_posts')
      .update({ media: mediaJson })
      .eq('id', created.id)
    if (attachErr) {
      // المنشور نُشر نصيًا؛ فشل الإرفاق لا يفسده — يُسجّل فقط
      console.warn('[community/posts] media attach failed:', attachErr.message)
    } else {
      await (admin as any)
        .from('media_objects')
        .update({ status: 'active', post_id: created.id })
        .in('id', mediaRows.map((o) => o.id))
      // الحجم الموثوق من Cloudinary يُحفظ في صف الحساب (حصة دقيقة)
      for (const o of mediaRows) {
        if (o.declared_bytes != null && o.declared_bytes !== o.bytes) {
          await (admin as any).from('media_objects').update({ bytes: o.bytes }).eq('id', o.id)
        }
      }
    }
  }

  // mentions — فشلها لا يفشّل النشر أبدًا (admin جاهز من بلوك المرفقات)
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

  // ── مرآة Turso (قرار المالك — فصل مسار البيانات العامة §4) ──
  // no-op بدون مفاتيح Turso؛ fire-and-forget لا يكسر الطلب أبدًا.
  void tursoUpsertMember(userId)
  void tursoUpsertPost(created.id)

  return NextResponse.json({ id: created.id }, { status: 201 })
}
