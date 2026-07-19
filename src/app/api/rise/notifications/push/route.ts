import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST — Save push subscription
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Push not configured' }, { status: 400 })
    }

    const { subscription } = await req.json()
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Store or update push subscription in user_settings
    const { error } = await admin
      .from('user_settings')
      .update({
        push_subscription: JSON.stringify(subscription),
      })
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}

// DELETE — Remove push subscription
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    await admin
      .from('user_settings')
      .update({ push_subscription: null })
      .eq('user_id', userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}