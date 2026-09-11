// ============================================================
// turso.ts — عميل Turso (libSQL) لمسار بيانات المجتمع العام.
//
// القرار المعماري (وثيقة النطاق §4 — قرار المالك 11 سبتمبر):
//   «المجتمع على Turso من اليوم الأول — لتخفيف الضغط عن Supabase
//    وفصل مسار البيانات العامة منذ البداية».
//
// الوضع الحالي (شيد: dual-write مع سلوك fail-open):
//   • Supabase يبقى مصدر الحقيقة (RLS، الحظر داخل DB، العدادات،
//     الإشعارات) — كل الكتابات تنجح أولًا هناك.
//   • Turso نسخة مرآة للبيانات العامة (members/posts/comments/
//     reactions) تُكتب بعد كل نجاح (انظر community-sync.ts).
//   • بدون إعداد Turso: كل المزامنة تتعطل بأمان (no-op) —
//     لا شيء ينكسر.
//   • القراءة تبقى من Supabase حتى التحقق من المزامنة ثم قلب
//     TURSO_READ_MODE لاحقًا (خطوة موثقة، غير مفعلة عمدًا).
//
// ترتيب قراءة الإعداد (env أولًا — مسار الترقية للمالك):
//   1. TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (متغيرات بيئة
//      في Vercel)
//   2. جدول app_config في Supabase (زرعها Super-Z — قراءة
//      service_role فقط؛ RLS بلا policies = fail-closed.
//      نفس نمط مفاتيح VAPID في المرحلة 06)
//
// للخادم فقط. يدعم كذلك url بصيغة file: للاختبار المحلي.
// ============================================================

import { createClient, type Client } from '@libsql/client'

interface TursoConfig {
  url: string
  token: string
}

let cachedCfg: { at: number; cfg: TursoConfig | null } | null = null
let cachedClient: Client | null = null
let cacheUrl: string | null = null
const CACHE_MS = 10 * 60 * 1000

export async function isTursoConfigured(): Promise<boolean> {
  return (await resolveTursoConfig()) !== null
}

async function resolveTursoConfig(): Promise<TursoConfig | null> {
  // 1) متغيرات البيئة أولًا
  const envUrl = process.env.TURSO_DATABASE_URL?.trim()
  if (envUrl) {
    return { url: envUrl, token: process.env.TURSO_AUTH_TOKEN?.trim() || '' }
  }

  // 2) كاش (يشمل null — لا نضرب DB مع كل كتابة)
  if (cachedCfg && Date.now() - cachedCfg.at < CACHE_MS) return cachedCfg.cfg

  // 3) app_config عبر service_role
  const cfg = await readFromDb()
  cachedCfg = { at: Date.now(), cfg }
  return cfg
}

async function readFromDb(): Promise<TursoConfig | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    const { data, error } = await (admin as any)
      .from('app_config')
      .select('key, value')
      .in('key', ['turso_database_url', 'turso_auth_token'])

    if (error) {
      console.warn('[turso] app_config unavailable:', error.message)
      return null
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value

    if (!map.turso_database_url) return null
    return { url: map.turso_database_url, token: map.turso_auth_token || '' }
  } catch (err) {
    console.warn('[turso] read failed:', (err as Error)?.message)
    return null
  }
}

/** اختبار الوحدة: إبطال الكاش بعد تحديث المفاتيح */
export function resetTursoCache(): void {
  cachedCfg = null
  cachedClient = null
  cacheUrl = null
}

/** عميل مفرد كسول — null عند غياب الإعداد */
export async function getTursoClient(): Promise<Client | null> {
  const cfg = await resolveTursoConfig()
  if (!cfg) return null
  if (!cachedClient || cacheUrl !== cfg.url) {
    cachedClient = createClient({
      url: cfg.url,
      authToken: cfg.token || undefined,
    })
    cacheUrl = cfg.url
  }
  return cachedClient
}

/** حالة الربط (للأدمن/التشخيص — المضيف فقط، لا الرمز السري) */
export async function tursoStatus(): Promise<{
  configured: boolean
  host: string | null
  readMode: boolean
}> {
  const cfg = await resolveTursoConfig()
  let host: string | null = null
  if (cfg) {
    try {
      host = new URL(cfg.url).host || cfg.url.replace(/^[a-z]+:\/\//, '').split('/')[0] || 'local-file'
    } catch {
      host = 'local-file'
    }
  }
  return {
    configured: !!cfg,
    host,
    readMode: process.env.TURSO_READ_MODE === 'true',
  }
}
