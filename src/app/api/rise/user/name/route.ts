import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { name } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const trimmed = name.trim()

    // Update Supabase profile
    if (isSupabaseConfigured()) {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { error } = await admin
          .from('profiles')
          .update({ name: trimmed })
          .eq('id', userId)
        if (error) console.error('[user/name] Supabase error:', error)
      }
    }

    return NextResponse.json({ name: trimmed })
  } catch (error) {
    console.error('[user/name] error:', error)
    return NextResponse.json({ error: 'Failed to update name' }, { status: 500 })
  }
}