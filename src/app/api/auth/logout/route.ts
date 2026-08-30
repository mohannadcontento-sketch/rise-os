import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/auth/logout
// Clears the httpOnly auth cookies. Called by AuthProvider
// when the Supabase client fires SIGNED_OUT, or when the user
// clicks the logout button.
// ============================================================

export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ ok: true })
  return clearAuthCookies(res)
}
