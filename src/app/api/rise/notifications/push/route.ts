import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase'
import { withIdempotency } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

// POST — Save push subscription
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    // Fail soft: the client cannot know the server's push config —
    // a 400 here surfaced as a console network error. Report status
    // via 200 payloads so the UI can react without error noise.
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, reason: 'not-configured' })
    }

    const { subscription } = await req.json().catch(() => ({}))
    if (!subscription) {
      return NextResponse.json({ success: false, reason: 'subscription-required' })
    }
    await data.userSettings.update(userId, {
      pushSubscription: JSON.stringify(subscription),
    })

    return NextResponse.json({ success: true })
  
  })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}

// DELETE — Remove push subscription
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    await data.userSettings.update(userId, { pushSubscription: null })

    return NextResponse.json({ success: true })
  
  })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}