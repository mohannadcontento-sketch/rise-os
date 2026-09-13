// ============================================================
// system-config.ts — إعدادات النظام المركزية (المرحلة 11 — System:
// maintenance mode / feature flags / status)
//
// نفس نمط ads/config.ts و vapid.ts (قراءة أسبقية):
//   1) متغيرات البيئة (Vercel) — SYSTEM_MAINTENANCE_MODE تسمح
//      بإيقاف الطفرات من لوحة Vercel دون فتح اللوحة (kill-switch
//      عندما تكون قاعدة البيانات نفسها متعطلة).
//   2) جدول app_config في Supabase (maintenance_mode /
//      maintenance_message / feature_flags) — يُقرأ بـservice_role
//      فقط (RLS بلا policies = fail-closed).
//   3) الافتراضي: لا صيانة، لا أعلام — كل شيء يعمل.
//
// التنفيذ (enforcement) ليس هنا فقط:
//   • middleware.ts يمنع طفرات /api/rise/* (503 MAINTENANCE_MODE)
//     لغير مسارات الأدمن — بغضّ النظر عن هوية المستخدم.
//   • /api/rise/system/status نقطة عامة تعرض الحالة (للواجهة
//     والمونيتورينج الخارجي) دون كشف أي سر.
//   • الأدمن يفعّل/يعطّل من تاب «النظام» عبر /api/rise/admin/system.
// ============================================================

export interface SystemConfig {
  /** وضع الصيانة — يوقف كل طفرات /api/rise غير الإدارية */
  maintenanceMode: boolean
  /** رسالة تظهر للمستخدمين أثناء الصيانة */
  maintenanceMessage: string
  /** أعلام الميزات (boolean لكل مفتاح) — غير سرية بحكم التصميم */
  featureFlags: Record<string, boolean>
}

/** كاش 30 ثانية (نفس منطق middleware — لا نضرب DB مع كل طلب) */
const CACHE_MS = 30 * 1000
let cached: { at: number; config: SystemConfig } | null = null

/** الأعلام المدعومة رسميًا (العرض في اللوحة) — قبول مفاتيح جديدة آمن */
export const KNOWN_FEATURE_FLAGS: Array<{ key: string; labelAr: string }> = [
  { key: 'community_enabled', labelAr: 'المجتمع' },
  { key: 'push_enabled', labelAr: 'إشعارات Web Push' },
  { key: 'mcp_enabled', labelAr: 'خادم MCP' },
  { key: 'signup_enabled', labelAr: 'التسجيل الجديد' },
]

const DEFAULT_MESSAGE = 'أوج تحت الصيانة حاليًا — نرجو المحاولة بعد قليل.'

async function readDbConfig(): Promise<Partial<SystemConfig> | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    const { data, error } = await (admin as any)
      .from('app_config')
      .select('key, value')
      .in('key', ['maintenance_mode', 'maintenance_message', 'feature_flags'])

    if (error) {
      // جدول app_config غير مهيأ (هجرة 028/035 غير مطبقة) — الافتراضي
      // المدمج يكفي؛ لا شيء ينكسر
      console.warn('[system-config] app_config unavailable:', error.message)
      return null
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value

    let featureFlags: Record<string, boolean> = {}
    if (map.feature_flags) {
      try {
        const parsed = JSON.parse(map.feature_flags)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // نقبل القيم المنطقية فقط — أي قيمة أخرى تُهمل
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'boolean') featureFlags[k] = v
          }
        }
      } catch {
        console.warn('[system-config] feature_flags JSON invalid — ignored')
      }
    }

    return {
      maintenanceMode: map.maintenance_mode === 'true',
      maintenanceMessage: map.maintenance_message || undefined,
      featureFlags,
    }
  } catch (err) {
    console.warn('[system-config] readDbConfig failed:', (err as Error).message)
    return null
  }
}

/** الإعدادات المدمجة بعد دمج env ثم app_config */
export async function getSystemConfig(): Promise<SystemConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config

  const db = await readDbConfig()

  const config: SystemConfig = {
    maintenanceMode:
      process.env.SYSTEM_MAINTENANCE_MODE !== undefined
        ? process.env.SYSTEM_MAINTENANCE_MODE === 'true'
        : db?.maintenanceMode ?? false,
    maintenanceMessage: db?.maintenanceMessage || DEFAULT_MESSAGE,
    featureFlags: db?.featureFlags ?? {},
  }

  cached = { at: Date.now(), config }
  return config
}

/** إبطال الكاش (بعد كتابة الأدمن — يسرّع نفس النسخة فقط) */
export function resetSystemConfigCache(): void {
  cached = null
}
