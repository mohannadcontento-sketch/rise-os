import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/cookie-auth'
import { createSupabaseIsolatedClient, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/auth/logout
// Phase 3: الخروج الآن يبطل الجلسة على الخادم أيضًا (إبطال
// refresh token الحالي عبر عميل معزول) — مسح الكوكيز وحده كان
// يترك التوكن صالحًا حتى انتهاء عمره.
// يُستدعى من AuthProvider عند SIGNED_OUT أو زر الخروج.
// ============================================================

export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ ok: true })

  // إبطال توكن التحديث على الخادم — أفضل جهد، لا يفشل الخروج إن تعذّر.
  try {
    const accessToken = _request.cookies.get('rise-access')?.value
    const refreshToken = _request.cookies.get('rise-refresh')?.value
    if (isSupabaseConfigured() && accessToken && refreshToken) {
      const isolated = await createSupabaseIsolatedClient()
      if (isolated) {
        await isolated.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        await isolated.auth.signOut() // local scope: يبطل توكن الجلسة الحالية
      }
    }
  } catch (error) {
    console.error('[auth/logout] server-side revocation failed (non-fatal):', error)
  }

  return clearAuthCookies(res)
}
