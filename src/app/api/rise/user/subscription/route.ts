import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/rise/user/subscription
// Phase 3 — قراءة plan/status للمستخدم الحالي.
//
// المصدر: جدول user_subscriptions (migration 024) — القراءة فقط عبر
// RLS (صف المستخدم وحده)، والكتابة حكر على service_role: لا يوجد
// أي مسار يسمح للعميل بتعديل الخطة أو الحالة (مهمة المرحلة 03:
// "حفظ plan/status بطريقة لا يمكن للمستخدم تعديلها من Client").
// ============================================================

const DEFAULT_SUBSCRIPTION = { plan: 'free', status: 'active', expiresAt: null }

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ subscription: DEFAULT_SUBSCRIPTION })
    }

    const token = getAccessToken(req)
    if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

    const client = await createSupabaseUserClient(token)
    if (!client) {
      return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    }

    // RLS: يستطيع رؤية صفه فقط — أي محاولة لقراءة صف مستخدم آخر تفشل
    // (تُرجع صفر صفوف) وهو سلوك Security Gate المطلوب.
    const { data, error } = await (client as any)
      .from('user_subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[user/subscription] read failed:', error.message)
      // الجدول قد لا يكون رُحّل بعد — التراجع الآمن هو free/active.
      return NextResponse.json({ subscription: DEFAULT_SUBSCRIPTION })
    }

    const sub = (data as { plan?: string; status?: string; expires_at?: string | null } | null) ?? null
    return NextResponse.json({
      subscription: {
        plan: sub?.plan || 'free',
        status: sub?.status || 'active',
        expiresAt: sub?.expires_at ?? null,
      },
    })
  } catch (error) {
    console.error('[user/subscription] error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
