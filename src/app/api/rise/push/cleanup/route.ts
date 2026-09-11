import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, hasServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/push/cleanup — المرحلة 06 (صيانة دورية)
//
// «إدارة unsubscribe وإبطال الـsubscription القديمة»:
// Vercel Cron أسبوعي (vercel.json) → RPC cleanup_stale_
// push_subscriptions(30) — إبطال (وليس حذف) الأجهزة التي لم
// يُرسل عبرها أي إشعار منذ 30 يومًا. الأثر يبقى للمدقّق، ولو
// عاد المتصفح نفسه (نفس endpoint) يُجدّد upsert الاشتراك
// ويلغي الإبطال تلقائيًا.
//
// GET فقط (idempotent — النتيجة نفسها مهما تكرر)؛ بوابة
// service_role (خادم أوج فقط) عبر RPC. لا بيانات مستخدمين في
// الاستجابة — عدّاد فقط.
// ============================================================

export async function GET(req: NextRequest) {
  if (!hasServiceRole()) {
    return NextResponse.json({ cleaned: 0, reason: 'server_not_configured' })
  }

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ cleaned: 0, reason: 'server_not_configured' })

  const { data, error } = await (admin as any).rpc('cleanup_stale_push_subscriptions', { p_days: 30 })

  if (error) {
    // الهجرة 028 غير مطبقة → لا تنظيف (متدرج بأمان)
    console.warn('[push/cleanup] RPC failed:', error.message)
    return NextResponse.json({ cleaned: 0, reason: 'migration_missing' })
  }

  const isCron = req.headers.get('x-vercel-cron') === '1' || req.headers.get('x-vercel-cron') === 'true'
  console.log('[push/cleanup] source:', isCron ? 'vercel-cron' : 'manual', 'cleaned:', data)

  return NextResponse.json({ cleaned: data ?? 0 })
}
