import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

// P1#5: Zod validation for notifications
const NotificationCreateSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  body: z.string().max(1000).optional(),
  type: z.enum(['info', 'success', 'warning', 'error', 'achievement']).optional(),
  icon: z.string().max(10).optional(),
  actionUrl: z.string().max(500).optional().nullable(),
}).strict()

const NotificationUpdateSchema = z.object({
  ids: z.array(z.string()).min(1, 'معرّفات مطلوبة').max(100),
}).strict()

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ notifications: [], unreadCount: 0 })

    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    const notifications = await data.notifications.list(userId)

    let filtered = notifications
    if (unreadOnly) {
      filtered = notifications.filter((n: any) => !n.isRead)
    }

    const unreadCount = notifications.filter((n: any) => !n.isRead).length
    return NextResponse.json({ notifications: filtered, unreadCount })
  } catch (error) {
    console.error('Notifications GET error:', error)
    return NextResponse.json({ notifications: [], unreadCount: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

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

    const notification = await data.notifications.create(userId, {
      ...parsed.data,
      isRead: false,
    })

    return NextResponse.json({ success: true, notification })
  } catch (error) {
    console.error('Notifications POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = NotificationUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    for (const id of parsed.data.ids) {
      await data.notifications.update(id, userId, { isRead: true })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notifications PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })
    }

    await data.notifications.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notifications DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
