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
//   VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT (اختياري —
//   بدونها تُقرأ من app_config التي زرعتها الهجرة 028)
//   CRON_SECRET (اختياري — بديل المصادقة للمجدول)
// ============================================================

import { Postgrest } from '../_shared/postgrest.ts'
import { runPushSweep, forceDispatch } from '../_shared/push-core.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const db = new Postgrest({ baseUrl: supabaseUrl, serviceKey: serviceKey })

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

/** المصادقة: مفتاح الخدمة (Bearer) أو سر المجدول (x-cron-secret) */
function authorized(req: Request): boolean {
  if (!serviceKey && !cronSecret) return false // غير مهيأ = مغلق
  const auth = req.headers.get('authorization') || ''
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true
  return false
}

Deno.serve(
  // PORT للتشغيل المحلي والاختبارات — المنصة تدير المنفذ بنفسها
  { port: Number(Deno.env.get('PORT') || 8000) },
  async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return json({ error: 'هذه الوظيفة تقبل POST فقط' }, 405)
    }
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'الوظيفة غير مهيأة: متغيرات Supabase مفقودة' }, 500)
    }
    if (!authorized(req)) {
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
