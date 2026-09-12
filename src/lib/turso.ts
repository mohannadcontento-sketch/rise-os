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

// ============================================================
// turso.ts — عميل Turso (libSQL): مرآة قراءة بيانات المجتمع
//
// الغرض: مصنع عميل libSQL للخادم — كل وصول لمزامنة المجتمع
// (community-sync.ts) يمر عبر getTursoClient().
//
// المسؤوليات:
//   1) حلّ الإعداد من env ثم جدول app_config (كاش 10 دقائق)
//   2) إنشاء عميل مفرد وإعادة استخدامه ما دام url ثابتاً
//   3) null آمن عند غياب الإعداد (fail-open — لا شيء ينكسر)
//
// قرار مهم: dual-write مع fail-open — كتابة Supabase أولاً ثم
// المزامنة للمرآة؛ غياب Turso يعطّل المزامنة فقط لا التطبيق.
// ============================================================
interface TursoConfig {
  url: string
  token: string
}

// ── القسم: حالة الكاش الداخلية ─────────────────────
// كاش الإعداد والعميل — يبطل بعد 10 دقائق أو عبر resetTursoCache
let cachedCfg: { at: number; cfg: TursoConfig | null } | null = null
let cachedClient: Client | null = null
let cacheUrl: string | null = null
const CACHE_MS = 10 * 60 * 1000

// ── القسم: حلّ الإعداد (env ثم كاش ثم DB) ─────────────────────
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

// ── القسم: قراءة الإعداد من app_config ─────────────────────
async function readFromDb(): Promise<TursoConfig | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    // قراءة service_role فقط: RLS بلا policies على app_config = fail-closed
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

// ── القسم: العميل المفرد وحالة الربط ─────────────────────
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
  // نعيد استخدام العميل نفسه ما لم يتغير url — لا اتصالات جديدة بلا داعٍ
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
      // نعرض المضيف فقط (لا الرمز السري)؛ فشل التحليل (صيغة file:) → local-file
      host = new URL(cfg.url).host || cfg.url.replace(/^[a-z]+:\/\//, '').split('/')[0] || 'local-file'
    } catch {
      host = 'local-file'
    }
  }
  return {
    configured: !!cfg,
    host,
    // TURSO_READ_MODE غير مفعّل عمداً — القراءة من Supabase حتى التحقق من المزامنة
    readMode: process.env.TURSO_READ_MODE === 'true',
  }
}
