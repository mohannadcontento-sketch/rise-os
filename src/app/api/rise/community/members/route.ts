import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/members — بحث أعضاء لاقتراحات @mention
// (RPC search_community_members: handle/name فقط — لا بريد
//  ولا أي بيانات خاصة؛ يستبعد نفسي والموقوفين؛ 20 نتيجة)
// ============================================================

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ members: [] })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 64)

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('search_community_members', { p_query: q })
  if (error) {
    console.warn('[community/members] RPC failed:', error.message)
    if (error.message.includes('search_community_members') || error.message.includes('PGRST202')) {
      return NextResponse.json({ members: [] })
    }
    return NextResponse.json({ error: 'تعذّر البحث' }, { status: 500 })
  }
  return NextResponse.json({ members: data ?? [] })
}
