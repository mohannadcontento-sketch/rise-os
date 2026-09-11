import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/notifications — مركز الإشعارات (المرحلة 05)
//
// GET   ?mode=count                      → { unreadCount } فقط
//       (شارة خفيفة — أرخص من جلب الخلاصة)
//       ?filter=all|unread|high|account|activity
//       ?unreadOnly=true (توافق خلفي)    → خلاصة + unreadCount
//       + حذف كسول للإشعارات المنتهية (داخل feed RPC)
// POST  إنشاء إشعار (نفسه — احتفالات الواجهة). الأنواع الجديدة
//       للمرحلة 05 + priority اختياري.
// PUT   { ids: [...] } | { all: true }   → تحديد كمقروء / الكل
//       (all عبر RPC ذري، مع fallback للمسار القديم).
// DELETE ?id | ?ids=a,b,c | ?all=true    → حذف.
// ============================================================

// P1#5: Zod validation for notifications
// NOTE: type values MUST match the DB CHECK constraint on notifications.type
// — المرحلة 05 وسّعت القائمة (migration 026). أي قيمة أخرى تُرفض هنا
// قبل لمس قاعدة البيانات.
const NOTIFICATION_TYPES = [
  'info', 'success', 'warning', 'error', 'achievement', 'reminder', 'system',
  'subscription', 'usage', 'community', 'mention', 'background',
] as const

const NotificationCreateSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  body: z.string().max(1000).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  icon: z.string().max(10).optional(),
  actionUrl: z.string().max(500).optional().nullable(),
  priority: z.enum(['normal', 'high']).optional(),
}).strict()

const NotificationUpdateSchema = z.union([
  z.object({ ids: z.array(z.string()).min(1, 'معرّفات مطلوبة').max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
])

function normalizeNotification(n: any) {
  return {
    ...n,
    // DB column is `read` (single word) so toCamel keeps it as `read`,
    // but the client bell reads `isRead`. Map once — otherwise every
    // notification renders as "unread" forever.
    isRead: !!(n.isRead ?? n.read),
    priority: n.priority ?? 'normal',
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)

    // ── mode=count: شارة خفيفة فقط (badge polling كل 5 دقائق) ──
    if (searchParams.get('mode') === 'count') {
      const unreadCount = await data.notifications.unreadCount(userId)
      return NextResponse.json({ unreadCount })
    }

    // ── الخلاصة: فلترة + عدّاد + حذف المنتهي (RPC 026) ──
    const filterRaw = searchParams.get('filter') ?? 'all'
    const filter = (['all', 'unread', 'high', 'account', 'activity'] as const).includes(filterRaw as any)
      ? (filterRaw as 'all' | 'unread' | 'high' | 'account' | 'activity')
      : 'all'
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limitRaw = Number(searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50

    const feed = await data.notifications.feed(userId, { filter, unreadOnly, limit })
    const notifications = feed.notifications.map(normalizeNotification)

    return NextResponse.json({
      notifications,
      unreadCount: feed.unreadCount,
      degraded: feed.degraded,
    })
  } catch (error) {
    console.error('Notifications GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل الإشعارات' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = NotificationCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    try {
      const notification = await data.notifications.create(userId, {
        ...parsed.data,
        read: false,
      })
      return NextResponse.json({ success: true, notification: normalizeNotification(notification) })
    } catch (insertError) {
      // توافق تنازلي: قبل الهجرة 026 عمود priority غير موجود —
      // أعد المحاولة بأعمدة ما قبل المرحلة بدل فشل كامل.
      const msg = String((insertError as Error)?.message || '')
      if (parsed.data.priority && msg.includes('column')) {
        const { priority, ...rest } = parsed.data
        const notification = await data.notifications.create(userId, { ...rest, read: false })
        return NextResponse.json({ success: true, notification: normalizeNotification(notification) })
      }
      throw insertError
    }
  })} catch (error) {
    console.error('Notifications POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input — { ids } أو { all: true } (المرحلة 05)
    const parsed = NotificationUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    if ('all' in parsed.data) {
      const updated = await data.notifications.markAllRead(userId)
      return NextResponse.json({ success: true, updated })
    }

    const updated = await data.notifications.updateMany(parsed.data.ids, userId, { read: true })
    return NextResponse.json({ success: true, updated })

  })} catch (error) {
    console.error('Notifications PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    // Batch delete: ?id=<uuid> (single) | ?ids=a,b,c | ?all=true
    const { searchParams } = new URL(req.url)
    const all = searchParams.get('all') === 'true'
    const idsParam = searchParams.get('ids')
    const id = searchParams.get('id')

    if (all) {
      const deleted = await data.notifications.removeAll(userId)
      return NextResponse.json({ success: true, deleted })
    }

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100)
      const deleted = await data.notifications.removeMany(ids, userId)
      return NextResponse.json({ success: true, deleted })
    }

    if (!id) {
      return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })
    }

    await data.notifications.remove(id, userId)
    return NextResponse.json({ success: true })
  
  })} catch (error) {
    console.error('Notifications DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
