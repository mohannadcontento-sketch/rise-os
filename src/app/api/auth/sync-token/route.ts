import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// Deprecated security boundary. Production authentication is server-owned and
// tokens must never be accepted back from browser JavaScript.
export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ ok: false, deprecated: true }, { status: 410 })
  return clearAuthCookies(res)
}
