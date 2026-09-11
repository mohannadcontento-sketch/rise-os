import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityCommentUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/comments/[id] — تعديل/حذف تعليقي
// (RLS update-own/delete-own + إذونات أعمدة body/edited_at فقط)
// ============================================================

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const parsed = await parseBody(req, communityCommentUpdateSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { error } = await (client as any)
    .from('community_comments')
    .update({ body: parsed.data.body, edited_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.warn('[community/comments/id] update failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحديث التعليق — تأكد أنه تعليقك وهو منشور' }, { status: 400 })
  }

  await logAudit(req, userId, 'community-comment-update', {
    resource: 'community_comments',
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

  const { error } = await (client as any).from('community_comments').delete().eq('id', id)
  if (error) {
    console.warn('[community/comments/id] delete failed:', error.message)
    return NextResponse.json({ error: 'تعذّر حذف التعليق' }, { status: 400 })
  }

  await logAudit(req, userId, 'community-comment-delete', {
    resource: 'community_comments',
    resourceId: id,
  })
  return NextResponse.json({ ok: true })
}
