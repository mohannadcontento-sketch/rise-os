import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/posts/[id]/comments — تعليقات المنشور
//
// GET : RPC get_community_comments (?page=N) — الأحدث أولًا مع
//       liked_by_me + مؤلف الرد الأب لعرض «ردًا على @handle».
// ============================================================

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ items: [], total: 0, page: 1, perPage: 20, hasMore: false })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const page = Math.max(1, Math.min(500, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1))

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('get_community_comments', {
    p_post_id: id,
    p_page: page,
    p_per_page: 20,
  })
  if (error) {
    console.warn('[community/comments-get] RPC failed:', error.message)
    if (error.message.includes('get_community_comments') || error.message.includes('PGRST202')) {
      return NextResponse.json({ items: [], total: 0, page, perPage: 20, hasMore: false })
    }
    return NextResponse.json({ error: 'تعذّر تحميل التعليقات' }, { status: 500 })
  }
  return NextResponse.json(data ?? { items: [], total: 0, page, perPage: 20, hasMore: false })
}
