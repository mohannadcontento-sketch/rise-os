import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityPostUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

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
  return NextResponse.json(data)
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

  const { error } = await (client as any).from('community_posts').delete().eq('id', id)
  if (error) {
    console.warn('[community/posts/id] delete failed:', error.message)
    return NextResponse.json({ error: 'تعذّر حذف المنشور' }, { status: 400 })
  }

  await logAudit(req, userId, 'community-post-delete', {
    resource: 'community_posts',
    resourceId: id,
  })
  return NextResponse.json({ ok: true })
}
