import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { title, body: notifBody, type, icon, actionUrl } = body

    if (!title) {
      return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
    }

    const notification = await data.notifications.create(userId, {
      title,
      body: notifBody || '',
      type: type || 'info',
      icon: icon || '🔔',
      actionUrl: actionUrl || '',
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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'معرّفات مطلوبة' }, { status: 400 })
    }

    for (const id of ids) {
      await data.notifications.update(id, { isRead: true })
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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
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