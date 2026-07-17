import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')

    // No token — return empty session (200, not 401)
    // This follows NextAuth convention and prevents console errors on initial load
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // Try Supabase — if not configured, return empty session
    const { getSupabase } = await import('@/lib/supabase')
    let supabaseClient
    try {
      supabaseClient = getSupabase()
    } catch {
      // Supabase not configured — return empty session (not 401)
      return NextResponse.json({ user: null, expires: null })
    }

    const { data, error } = await supabaseClient.auth.getUser(token)

    if (error || !data.user) {
      // Invalid/expired token — return empty session (not 401)
      return NextResponse.json({ user: null, expires: null })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.email === ADMIN_EMAIL,
      },
    })
  } catch {
    // Any error — return empty session gracefully
    return NextResponse.json({ user: null, expires: null })
  }
}