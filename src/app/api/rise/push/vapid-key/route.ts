import { NextRequest, NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push/vapid'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/rise/push/vapid-key — المفتاح العام للعميل (عام)
//
// المفتاح العام ليس سرًا بحكم التصميم (يذهب للمتصفح في
// pushManager.subscribe). نتركه عامًا حتى يعمل فحص التوفر قبل
// تسجيل الدخول إن رغبت الواجهة.
// تخزين مؤقت 5 دقائق — لا حساسية هنا.
// ============================================================

export async function GET(_req: NextRequest) {
  const { configured, publicKey } = await getVapidPublicKey()
  // ملاحظة: مع force-dynamic يضبط Next ترويسة no-cache بنفسه —
  // الكاش الحقيقي عند vapid.ts (10 دقائق لكل نسخة خادم) فلا
  // حاجة لترويسة CDN هنا (force-dynamic = لا تخزين طرفي أصلًا).
  return NextResponse.json({ configured, publicKey: publicKey ?? null })
}
