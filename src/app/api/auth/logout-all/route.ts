import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { clearAuthCookies } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/auth/logout-all
// Phase 3 — "تسجيل الخروج من جميع الأجهزة"
// Revokes EVERY refresh token for the user (Supabase admin
// signOut = global revocation) then clears this browser's
// cookies. All other devices lose their session on their next
// token refresh — stolen cookies stop working immediately.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      // وضع التطوير المحلي: لا جلسات خادم لإبطالها — مسح الكوكيز يكفي.
      const res = NextResponse.json({ success: true })
      return clearAuthCookies(res)
    }

    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }

    try {
      await admin.auth.signOut(userId)
    } catch (error) {
      console.error('[auth/logout-all] global signOut failed:', error)
      return NextResponse.json({ error: 'تعذر إبطال الجلسات، حاول لاحقاً' }, { status: 503 })
    }

    const res = NextResponse.json({ success: true })
    return clearAuthCookies(res)
  } catch (error) {
    console.error('[auth/logout-all] error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
