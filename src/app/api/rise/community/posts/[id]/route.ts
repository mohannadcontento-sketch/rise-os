import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityPostUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { signMediaForApi, deleteMediaObject } from '@/lib/cloudinary'
import { tursoUpsertPost, tursoDeletePost } from '@/lib/community-sync'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/posts/[id] — تفاصيل/تعديل/حذف منشور
//
// GET    : RPC get_community_post (المنشور المنشور، أو المخفي
//          لصاحبه فقط — القرار داخل الدالة).
// PATCH  : تعديل صاحب المنشور المنشور (RLS update-own +
//          إذونات أعمدة: title/body/edited_at فقط).
// DELETE : حذف صاحب المنشور (RLS delete-own؛ التعليقات
//          تُحذف بالـCASCADE والعدادات بالتريجر).
// ============================================================

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('get_community_post', { p_post_id: id })
  if (error) {
    console.warn('[community/posts/id] post RPC failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل المنشور' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'المنشور غير موجود أو غير متاح' }, { status: 404 })

  // روابط صور Cloudinary من المفاتيح (url=null عند غياب الإعداد)
  const detail = data as any
  if (Array.isArray(detail.media) && detail.media.length > 0) {
    detail.media = await signMediaForApi(detail.media)
  }
  return NextResponse.json(detail)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, communityPostUpdateSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { error } = await (client as any)
    .from('community_posts')
    .update({ ...parsed.data, edited_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.warn('[community/posts/id] update failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحديث المنشور — تأكد أنه منشورك وهو منشور' }, { status: 400 })
  }

  await logAudit(req, userId, 'community-post-update', {
    resource: 'community_posts',
    resourceId: id,
  })

  // مرآة Turso (fire-and-forget — no-op بدون مفاتيح Turso)
  void tursoUpsertPost(id)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // مفاتيح صور المنشور قبل الحذف (لتنظيف Cloudinary والحساب لاحقًا)
  const admin = await getSupabaseAdmin()
  let mediaKeys: string[] = []
  if (admin) {
    const { data: row } = await (admin as any)
      .from('community_posts')
      .select('media')
      .eq('id', id)
      .maybeSingle()
    if (row?.media && Array.isArray(row.media)) {
      mediaKeys = row.media.map((m: any) => m?.key).filter((k: unknown): k is string => typeof k === 'string')
    }
  }

  const { error } = await (client as any).from('community_posts').delete().eq('id', id)
  if (error) {
    console.warn('[community/posts/id] delete failed:', error.message)
    return NextResponse.json({ error: 'تعذّر حذف المنشور' }, { status: 400 })
  }

  // ── تنظيف مرفقات Cloudinary: تحرير الحصة + حذف الكائنات best-effort ──
  // (إزالة المشرف الإدارية تبقي الصور عمدًا كدليل مراجعة — هنا
  // الحذف الذاتي فقط، حيث يطلب المستخدم تحرير مساحته)
  if (mediaKeys.length > 0 && admin) {
    try {
      await (admin as any)
        .from('media_objects')
        .update({ status: 'deleted', post_id: null })
        .eq('user_id', userId)
        .in('object_key', mediaKeys)
    } catch { /* best-effort */ }
    for (const key of mediaKeys) {
      void deleteMediaObject(key)
    }
  }

  await logAudit(req, userId, 'community-post-delete', {
    resource: 'community_posts',
    resourceId: id,
  })

  // مرآة Turso — حذف متسلسل (منشور + تعليقاته + تفاعلاته)
  void tursoDeletePost(id)

  return NextResponse.json({ ok: true })
}
