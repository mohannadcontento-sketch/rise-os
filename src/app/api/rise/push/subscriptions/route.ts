import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/rise/push/subscriptions — أجهزتي (المرحلة 06)
//
// RPC list_push_subscriptions: صفوف المستخدم فقط (RLS عبر
// SECURITY DEFINER + auth.uid)، و endpoint يظهر كأصل فقط
// (مثل fcm.googleapis.com) — لا يُكشف المسار الكامل.
// ============================================================

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ subscriptions: [] })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('list_push_subscriptions')

  if (error) {
    // الهجرة 028 غير مطبقة → قائمة فارغة (متدرج بأمان)
    console.warn('[push/subscriptions] RPC failed:', error.message)
    return NextResponse.json({ subscriptions: [] })
  }

  const subscriptions = (data ?? []).map((s: any) => ({
    id: s.id,
    label: s.label ?? 'جهاز بدون اسم',
    origin: s.endpoint_origin,
    createdAt: s.created_at,
    lastPushAt: s.last_push_at ?? null,
    revokedAt: s.revoked_at ?? null,
    revokedReason: s.revoked_reason ?? null,
    active: !s.revoked_at,
  }))

  return NextResponse.json({ subscriptions })
}
