import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import webpush from 'web-push'

// Configure web-push with VAPID keys
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:rise-os@localhost'
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || ''

if (VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export const dynamic = 'force-dynamic'

/**
 * POST /api/rise/notifications/send
 * Send a push notification to the authenticated user.
 * Body: { title: string, body?: string, tag?: string, url?: string, actions?: Array<{action: string, title: string}> }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'VAPID not configured on server' }, { status: 500 })
    }

    const { title, body, tag, url, actions } = await req.json()
    if (!title) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 })
    }

    // Get user's push subscription
    const { data: settings } = await admin
      .from('user_settings')
      .select('push_subscription')
      .eq('user_id', userId)
      .single()

    const subscriptionJson = settings?.push_subscription
    if (!subscriptionJson) {
      return NextResponse.json({ success: false, reason: 'no_subscription' })
    }

    const subscription = JSON.parse(subscriptionJson)
    const payload = JSON.stringify({
      title,
      body: body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || `rise-${Date.now()}`,
      url: url || '',
      actions: actions || [],
    })

    await webpush.sendNotification(subscription, payload)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[push/send] error:', error)

    // If subscription is invalid/expired, clear it
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      try {
        const admin = await getSupabaseAdmin()
        if (admin) {
          const userId = await requireAuth(req)
          if (userId) {
            await admin
              .from('user_settings')
              .update({ push_subscription: null })
              .eq('user_id', userId)
          }
        }
      } catch { /* ignore cleanup error */ }

      return NextResponse.json({ success: false, reason: 'subscription_expired' })
    }

    return NextResponse.json({ error: 'Failed to send push' }, { status: 500 })
  }
}