import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getSupabaseWithAuth, isSupabaseConfigured, handleRouteError } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface Notification {
  id: string
  title: string
  body?: string
  type?: string
  icon?: string
  action_url?: string
  is_read: boolean
  user_id: string
  created_at: string
}

// In-memory cache for offline fallback
const _localStore = new Map<string, Notification[]>()

function getLocalNotifications(userId: string): Notification[] {
  if (!_localStore.has(userId)) {
    _localStore.set(userId, [])
  }
  return _localStore.get(userId)!
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ notifications: [], unreadCount: 0 })

    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    // Try Supabase first
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseWithAuth(req)
      if (supabase) {
        let query = supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)

        if (unreadOnly) {
          query = query.eq('is_read', false)
        }

        const { data, error } = await query

        if (!error && data) {
          const notifications: Notification[] = data.map((n: any) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            type: n.type,
            icon: n.icon,
            action_url: n.action_url,
            is_read: n.is_read,
            user_id: n.user_id,
            created_at: n.created_at,
          }))

          const unreadCount = notifications.filter(n => !n.is_read).length
          return NextResponse.json({ notifications, unreadCount })
        }
      }
    }

    // Fallback: local memory store
    const local = getLocalNotifications(userId)
    let filtered = unreadOnly
      ? local.filter(n => !n.is_read)
      : local

    const unreadCount = local.filter(n => !n.is_read).length
    return NextResponse.json({ notifications: filtered, unreadCount })
  } catch (error) {
    return handleRouteError(error, 'notifications-get')
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { title, body: notifBody, type, icon, action_url } = body

    if (!title) {
      return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
    }

    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const now = new Date().toISOString()

    const notification: Notification = {
      id,
      title,
      body: notifBody || '',
      type: type || 'info',
      icon: icon || '🔔',
      action_url: action_url || '',
      is_read: false,
      user_id: userId,
      created_at: now,
    }

    // Try Supabase
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseWithAuth(req)
      if (supabase) {
        const { error } = await supabase.from('notifications').insert({
          id,
          user_id: userId,
          title,
          body: notifBody || '',
          type: type || 'info',
          icon: icon || '🔔',
          action_url: action_url || '',
          is_read: false,
          created_at: now,
        })
        if (!error) {
          return NextResponse.json({ success: true, notification })
        }
      }
    }

    // Fallback: local memory
    const local = getLocalNotifications(userId)
    local.unshift(notification)
    _localStore.set(userId, local)

    return NextResponse.json({ success: true, notification })
  } catch (error) {
    return handleRouteError(error, 'notifications-post')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'معرّفات مطلوبة' }, { status: 400 })
    }

    // Try Supabase
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseWithAuth(req)
      if (supabase) {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('id', ids)
          .eq('user_id', userId)
        if (!error) {
          return NextResponse.json({ success: true })
        }
      }
    }

    // Fallback: local memory
    const local = getLocalNotifications(userId)
    const updated = local.map(n =>
      ids.includes(n.id) ? { ...n, is_read: true } : n
    )
    _localStore.set(userId, updated)

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'notifications-put')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })
    }

    // Try Supabase
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseWithAuth(req)
      if (supabase) {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)
        if (!error) {
          return NextResponse.json({ success: true })
        }
      }
    }

    // Fallback: local memory
    const local = getLocalNotifications(userId)
    _localStore.set(userId, local.filter(n => n.id !== id))

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'notifications-delete')
  }
}