import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/community/bans — قائمة المحظورين النشطين
// GET: bans + بياناتهم (service_role). ?all=1 يشمل المنتهي
//      (للأرشيف — المستخدم النشط فقط يظهر افتراضيًا).
// ============================================================

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req)
  if (!adminId) return NextResponse.json({ error: 'هذه الصفحة للمشرفين فقط' }, { status: 403 })

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'تكوين الخادم غير مكتمل' }, { status: 500 })

  const all = req.nextUrl.searchParams.get('all') === '1'

  let query = (admin as any)
    .from('community_bans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!all) query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

  const { data: bans, error } = await query
  if (error) {
    console.warn('[admin/community/bans] list failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل قائمة الحظر' }, { status: 500 })
  }

  const userIds = (bans ?? []).map((b: any) => b.user_id)
  const usersRes = userIds.length
    ? await (admin as any).from('profiles').select('id, name, handle, email').in('id', userIds)
    : { data: [] }
  const usersById = new Map<string, any>((usersRes.data ?? []).map((u: any) => [u.id, u]))

  const items = (bans ?? []).map((b: any) => {
    const u = usersById.get(b.user_id)
    return {
      id: b.user_id,
      name: u?.name ?? '—',
      handle: u?.handle ?? '—',
      email: u?.email ?? '—',
      reason: b.reason,
      expiresAt: b.expires_at,
      active: !b.expires_at || new Date(b.expires_at) > new Date(),
      createdAt: b.created_at,
    }
  })

  return NextResponse.json({ items })
}
