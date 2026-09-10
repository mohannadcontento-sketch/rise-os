import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withIdempotency } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

// ADMIN PRO — broadcast announcements.
// Sends a notification to ALL users (or selected ones). Inserted directly
// into the notifications table via the service client (bypasses RLS by
// design) — users see it in their bell on next load.

const BroadcastSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(120),
  body: z.string().min(1, 'النص مطلوب').max(1000),
  targetUserIds: z.array(z.string().uuid()).max(500).optional(), // absent = ALL users
}).strict()

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

  return withIdempotency(request, adminId, async () => {
    const body = await request.json().catch(() => null)
    const parsed = BroadcastSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 })
    }
    const { title, bodyText, targetUserIds } = { ...parsed.data, bodyText: parsed.data.body }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 503 })
    }
    const sb = admin as any

    // Resolve recipients
    let recipientIds: string[] = []
    if (targetUserIds && targetUserIds.length > 0) {
      const { data, error } = await sb.from('profiles').select('id').in('id', targetUserIds)
      if (error) return NextResponse.json({ error: 'فشل تحديد المستلمين' }, { status: 500 })
      recipientIds = (data || []).map((r: any) => r.id)
    } else {
      const { data, error } = await sb.from('profiles').select('id')
      if (error) return NextResponse.json({ error: 'فشل جلب المستخدمين' }, { status: 500 })
      recipientIds = (data || []).map((r: any) => r.id)
    }

    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'لا يوجد مستلمون' }, { status: 400 })
    }

    // Single database-side insert keeps broadcast atomic. A partial broadcast
    // must never be reported as success because Idempotency-Key would replay it.
    const { data: sent, error: broadcastError } = await sb.rpc('admin_broadcast_notifications_atomic', {
      p_admin_user_id: adminId,
      p_target_user_ids: targetUserIds?.length ? targetUserIds : null,
      p_title: title,
      p_body: bodyText,
    })
    if (broadcastError) {
      console.error('[admin/broadcast] atomic broadcast failed:', broadcastError.message)
      return NextResponse.json({ error: 'فشل إرسال الإعلان بالكامل' }, { status: 503 })
    }

    const sentCount = Number(sent || 0)
    await logAudit(request, adminId, 'broadcast', {
      resource: 'notifications',
      resourceId: `${sentCount} recipients`,
      details: { title, targeted: !!targetUserIds?.length },
    })

    return NextResponse.json({ success: true, sent: sentCount, recipients: recipientIds.length })
  
  })} catch (error) {
    console.error('[admin/broadcast] error:', error)
    return NextResponse.json({ error: 'فشل إرسال الإعلان' }, { status: 500 })
  }
}
