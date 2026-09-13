// ============================================================
// supabase/functions/push-dispatch/index.ts — مرسل Web Push
//
// نقطة الدخول: مكنسة طابور Web Push على Supabase Edge
// Functions. النواة في _shared/push-core.ts والتشفير الأصيل
// (VAPID + RFC 8291) في _shared/webpush.ts.
//
// طرق الاستدعاء:
//   1) مجدولًا: pg_cron → pg_net كل دقيقتين (الهجرة 033)
//      بمصادقة Bearer بمفتاح الخدمة (من vault) أو x-cron-secret
//   2) يدويًا: POST بمفتاح الخدمة — إجبار إشعار بعينه عبر
//      ?notification_id=<uuid> (تشخيص/اختبار)
//
// المصادقة (2026): نظام مفاتيح Supabase انتقل من JWT القديم
// (service_role) إلى sb_publishable_/sb_secret_ — والمنصة قد تحقن
// في الوظيفة صيغة تختلف عن المخزن في vault. لذا نقبل مفتاح الخدمة
// بأي صيغة: تطابق حرفي مع بيئة المنصة (القديمة والجديدة) أو تحقق
// حي عند PostgREST نفسه (قراءة app_config = دور خدمة).
//
// النشر — مساران:
//   أ) CLI (كامل البنية): supabase functions deploy
//      push-dispatch --no-verify-jwt
//   ب) لوحة Dashboard (ملف واحد فقط): الصق الملف المدموج
//      supabase/dist/push-dispatch.dashboard.ts — وُلّد بـ
//      scripts/build-dashboard-bundles.mjs (لا تحرره يدويًا)
//      التفاصيل الكاملة + خطوات الجدولة: supabase/DEPLOY.md
//
// متغيرات البيئة:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (حقن تلقائي)
//   SUPABASE_SECRET_KEYS (حقن تلقائي — نظام 2026 JSON بأسماء المفاتيح)
//   VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT (اختياري —
//   بدونها تُقرأ من app_config التي زرعتها الهجرة 028)
//   CRON_SECRET (اختياري — بديل المصادقة للمجدول)
// ============================================================

import { Postgrest } from '../_shared/postgrest.ts'
import { runPushSweep, forceDispatch } from '../_shared/push-core.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

// مفاتيح الخدمة من بيئة المنصة — بصيغتيها (Legacy JWT + 2026 sb_secret):
// القديمة نص واحد، والجديدة JSON بأسماء المفاتيح مثل {"default":"sb_secret_…"}
const serviceKeys: string[] = [
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  ...parseSecretKeys(Deno.env.get('SUPABASE_SECRET_KEYS')),
].filter(Boolean)

function parseSecretKeys(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.values(parsed).filter((v) => typeof v === 'string' && v.length > 0)
  } catch {
    return [] // ليست JSON — تجاهل بأمان (fail-closed)
  }
}

const db = new Postgrest({ baseUrl: supabaseUrl, serviceKey: serviceKeys[0] ?? '' })

function env(): Record<string, string | undefined> {
  return {
    VAPID_PUBLIC_KEY: Deno.env.get('VAPID_PUBLIC_KEY'),
    VAPID_PRIVATE_KEY: Deno.env.get('VAPID_PRIVATE_KEY'),
    VAPID_SUBJECT: Deno.env.get('VAPID_SUBJECT'),
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * تحقق حي عند PostgREST: المفتاح المعروض يقرأ app_config (RLS بلا
 * سياسات = دور خدمة فقط يتخطىها)؟ إذن مفتاح خدمة فاعل بصيغة أي
 * نظام مفاتيح — anon/publishable يرى قائمة فارغة، والرمز المرفوض 401.
 */
async function isServiceCredential(bearer: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/app_config?select=key&limit=1`, {
      headers: { apikey: bearer, Authorization: `Bearer ${bearer}` },
    })
    if (res.status !== 200) return false // مفتاح مرفوض من المنصة
    const rows = (await res.json()) as unknown[]
    return Array.isArray(rows) && rows.length > 0 // الفارغ = مفتاح عام
  } catch {
    return false // فشل الشبكة = رفض (fail-closed)
  }
}

/**
 * المصادقة: سر المجدول (x-cron-secret) أو مفتاح خدمة Bearer بأي صيغة:
 * (1) تطابق حرفي مع بيئة المنصة (سريع — بلا طلبات إضافية)
 * (2) تحقق حي عند PostgREST (يغطي اختلاف الصيغة بين vault والحقن)
 */
async function authorized(req: Request): Promise<boolean> {
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!bearer) return false // بلا Bearer — لا شيء للتحقق منه
  if (serviceKeys.includes(bearer)) return true
  return await isServiceCredential(bearer)
}

Deno.serve(
  // PORT للتشغيل المحلي والاختبارات — المنصة تدير المنفذ بنفسها
  { port: Number(Deno.env.get('PORT') || 8000) },
  async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return json({ error: 'هذه الوظيفة تقبل POST فقط' }, 405)
    }
    if (!supabaseUrl || serviceKeys.length === 0) {
      return json({ error: 'الوظيفة غير مهيأة: متغيرات Supabase مفقودة' }, 500)
    }
    if (!(await authorized(req))) {
      return json({ error: 'غير مصرح — مطلوب مفتاح الخدمة أو سر المجدول' }, 401)
    }

    // فرض إشعار بعينه؟ (تشخيص)
    const url = new URL(req.url)
    const notificationId = url.searchParams.get('notification_id')
    if (notificationId) {
      if (!/^[0-9a-f-]{36}$/i.test(notificationId)) {
        return json({ error: 'notification_id غير صالح (uuid)' }, 400)
      }
      const result = await forceDispatch(db, env(), notificationId)
      return json({ forced: true, result })
    }

    // جولة المكنسة العادية
    try {
      const summary = await runPushSweep(db, env())
      return json(summary)
    } catch (err) {
      return json({ ok: false, error: (err as Error)?.message ?? 'خطأ غير معروف' }, 200)
    }
  },
)
