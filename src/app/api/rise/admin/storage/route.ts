import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin, logAudit } from '@/lib/audit'
import { withIdempotency } from '@/lib/idempotency'
import { parseBody, storageLimitSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/rise/admin/storage — admin updates user's storage limit
 * Body: { userId, storageLimit }
 */
export async function PUT(req: NextRequest) {
  try {
    const adminId = await requireAdmin(req)
    if (!adminId) return NextResponse.json({ error: 'غير مصرح — الأدمن فقط' }, { status: 403 })

  return withIdempotency(req, adminId, async () => {
    const parsed = await parseBody(req, storageLimitSchema)
    if (!parsed.ok) return parsed.response!
    const { userId, storageLimit } = parsed.data!

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

    await logAudit(req, adminId, 'update-storage-limit', {
      resource: 'user_storage',
      resourceId: userId,
      details: { storageLimit },
    })

    return NextResponse.json({ success: true, storageLimit })
  
  })} catch (error) {
    console.error('Admin storage PUT error:', error)
    return NextResponse.json({ error: 'Failed to update storage limit' }, { status: 500 })
  }
}
