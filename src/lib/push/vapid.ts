// ============================================================
// vapid.ts — مفاتيح VAPID (المرحلة 06 — Web Push)
//
// ترتيب القراءة (env أولًا — مسار الترقية للمالك):
//   1. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
//      (متغيرات بيئة Vercel — لو حطها المالك لاحقًا تُستخدم فورًا)
//   2. جدول app_config في Supabase (زرعها Super-Z في الهجرة 028؛
//      قراءة service_role فقط — RLS بلا policies = fail-closed).
//
// المفتاح العام ليس سرًا (يذهب للمتصفح في subscribe)؛ الخاص لا
// يظهر في أي ملف بالمستودع ولا لأي مستخدم — فقط خادم أوج.
//
// كاش 10 دقائق لكل نسخة (serverless instance) حتى لا نضرب DB
// مع كل إرسال.
// ============================================================

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

let cached: { at: number; config: VapidConfig | null } | null = null
const CACHE_MS = 10 * 60 * 1000

/** المفتاح العام لعرضه للعميل (route عام — ليس سرًا بحكم التصميم) */
export async function getVapidPublicKey(): Promise<{ configured: boolean; publicKey?: string }> {
  const cfg = await getVapidConfig()
  if (!cfg) return { configured: false }
  return { configured: true, publicKey: cfg.publicKey }
}

export async function getVapidConfig(): Promise<VapidConfig | null> {
  // 1) متغيرات البيئة أولًا
  const envPublic = process.env.VAPID_PUBLIC_KEY || ''
  const envPrivate = process.env.VAPID_PRIVATE_KEY || ''
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: process.env.VAPID_SUBJECT || 'mailto:awj@awj.life',
    }
  }

  // 2) كاش
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config

  // 3) app_config عبر service_role
  const config = await readFromDb()
  cached = { at: Date.now(), config }
  return config
}

async function readFromDb(): Promise<VapidConfig | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    const { data, error } = await (admin as any)
      .from('app_config')
      .select('key, value')
      .in('key', ['vapid_public_key', 'vapid_private_key', 'vapid_subject'])

    if (error) {
      // الهجرة 028 غير مطبقة (أو جدول غير موجود) — Push متوقف بأمان
      console.warn('[push/vapid] app_config unavailable:', error.message)
      return null
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value

    if (!map.vapid_public_key || !map.vapid_private_key) return null

    return {
      publicKey: map.vapid_public_key,
      privateKey: map.vapid_private_key,
      subject: map.vapid_subject || 'mailto:awj@awj.life',
    }
  } catch (err) {
    console.warn('[push/vapid] read failed:', (err as Error)?.message)
    return null
  }
}

/** اختبار الوحدة: إبطال الكاش بعد تحديث المفاتيح */
export function resetVapidCache(): void {
  cached = null
}
