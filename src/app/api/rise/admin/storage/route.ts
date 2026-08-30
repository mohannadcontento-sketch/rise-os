import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isAdmin } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/rise/admin/storage — admin updates user's storage limit
 * Body: { userId, storageLimit }
 */
export async function PUT(req: NextRequest) {
  try {
    const adminId = await requireAuth(req)
    if (!adminId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // Check admin
    const admin = await isAdmin(adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح — الأدمن فقط' }, { status: 403 })

    const { userId, storageLimit } = await req.json()
    if (!userId || !storageLimit || storageLimit < 1024) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const sb = await getSupabaseAdmin()
    if (sb) {
      const { error } = await sb
        .from('user_storage')
        .update({ storage_limit: storageLimit })
        .eq('user_id', userId)
      if (error) throw error
    } else {
      // Mock mode
      const { db } = await import('@/lib/db')
      await (db as any).userStorage.update({
        where: { userId },
        data: { storageLimit },
      })
    }

    return NextResponse.json({ success: true, storageLimit })
  } catch (error) {
    console.error('Admin storage PUT error:', error)
    return NextResponse.json({ error: 'Failed to update storage limit' }, { status: 500 })
  }
}
