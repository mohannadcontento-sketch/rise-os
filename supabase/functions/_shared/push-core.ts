// ============================================================
// push-core.ts — مكنسة/مرسل طابور Web Push (Edge Function)
//
// الدور (مكمّل وليس بديلًا لمسار Vercel السريع):
//   • إرسال الإشعارات التي أنشأها التطبيق لكن لم يُرسِلها أحد
//     (انهيار نسخة السيرفر قبل الإرسال، فشل مؤقت للشبكة…)
//   • إرسال إشعارات أُنشئت مباشرة في القاعدة (لوحة الأدمن أو
//     SQL) — لا يوجد من يرسلها غير هذه الدالة
//   • الإرسال المجدول عبر pg_cron → pg_net (الهجرة 033)
//
// التصميم:
//   1) VAPID من env (إن وُجد) ثم app_config (زرع الهجرة 028)
//      — نفس ترتيب src/lib/push/vapid.ts
//   2) المرشّحون: notifications بلا pushed_at أُنشئت خلال آخر
//      15 دقيقة (نافذة قابلة للضبط) وغير مُسجَّل لها نتيجة نهائية
//      في push_dispatch_log
//   3) لكل مرشّح: بوابة gate_push_for_notification نفسها (ادعاء
//      ذري لـpushed_at + تفضيلات + سقوف 10/س و30/ي) — المتزامن
//      مع مسار Vercel يذوب بأمان: من يدّعي أولًا يرسل
//   4) الإرسال عبر webpush.ts الأصيل: TTL 4h/عالي 24h/عادي،
//      حمولة بعقد sw.js نفسه، 404/410 → إبطال الاشتراك
//   5) كل نتيجة تُسجَّل في push_dispatch_log (إعادة المحاولة
//      لحالة error فقط ضمن النافذة)
//
// الاستدعاء: POST من pg_cron (مصادقة Bearer بمفتاح الخدمة من
// vault أو x-cron-secret) — أو يدويًا بمفتاح الخدمة، مع
// ?notification_id=<uuid> لفرض إرسال إشعار بعينه (تشخيص).
// ============================================================

import { Postgrest } from './postgrest.ts'
import { VapidConfig, sendWebPush, PushSubscriptionTarget } from './webpush.ts'

// ── القسم: الأنواع ─────────────────────

export interface SweepOptions {
  /** نافذة المرشحين بالدقائق (افتراضي 15) */
  windowMin?: number
  /** سقف الإشعارات في الجولة الواحدة (افتراضي 25) */
  maxNotifications?: number
  /** fetch قابلة للاستبدال (اختبارات) */
  fetchImpl?: typeof fetch
}

export interface SweepNotificationResult {
  notificationId: string
  status: 'sent' | 'denied' | 'no-subscriptions' | 'error' | 'claimed-elsewhere' | 'not-found'
  attempted: number
  sent: number
  revoked: number
  reason?: string
}

export interface SweepSummary {
  ok: boolean
  reason?: 'no_vapid' | 'not_configured'
  scanned: number
  processed: number
  attempted: number
  sent: number
  revoked: number
  results: SweepNotificationResult[]
  startedAt: string
  finishedAt: string
}

// ── القسم: قراءة VAPID (env ثم app_config) ─────────────────────

export async function loadVapidConfig(db: Postgrest, env: Record<string, string | undefined>): Promise<VapidConfig | null> {
  const envPublic = env.VAPID_PUBLIC_KEY ?? ''
  const envPrivate = env.VAPID_PRIVATE_KEY ?? ''
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: env.VAPID_SUBJECT || 'mailto:awj@awj.life',
    }
  }

  try {
    const rows = ((await db.select('app_config', {
      select: 'key,value',
      filters: { key: 'in.("vapid_public_key","vapid_private_key","vapid_subject")' },
    })) ?? []) as { key: string; value: string }[]
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = String(r.value ?? '')
    if (!map.vapid_public_key || !map.vapid_private_key) return null
    return {
      publicKey: map.vapid_public_key,
      privateKey: map.vapid_private_key,
      subject: map.vapid_subject || 'mailto:awj@awj.life',
    }
  } catch (err) {
    console.warn('[push/edge] vapid read failed:', (err as Error)?.message)
    return null
  }
}

// ── القسم: رابط الفتح (عقد sw.js نفسه) ─────────────────────

/** تحويل action_url الإشعار إلى رابط فتح حقيقي للمتصفح */
export function deepLinkFor(actionUrl: string | null | undefined, notificationId: string): string {
  if (!actionUrl) return `/app?notification=${notificationId}`
  if (actionUrl.startsWith('/')) return actionUrl
  return `/app?module=${encodeURIComponent(actionUrl)}&notification=${notificationId}`
}

// ── القسم: الجولة الرئيسية ─────────────────────

/**
 * جولة مكنسة واحدة. لا ترمي أبدًا — كل خطأ يظهر في الملخص.
 */
export async function runPushSweep(
  db: Postgrest,
  env: Record<string, string | undefined>,
  opts: SweepOptions = {},
): Promise<SweepSummary> {
  const startedAt = new Date().toISOString()
  // ok = true فقط لجولة نظيفة بلا سبب (مرشّحون صفرويون)
  // no_vapid/not_configured = مشكلة إعداد يجب أن تظهر للمشغل
  const empty = (reason: SweepSummary['reason']): SweepSummary => ({
    ok: reason === undefined,
    reason,
    scanned: 0,
    processed: 0,
    attempted: 0,
    sent: 0,
    revoked: 0,
    results: [],
    startedAt,
    finishedAt: new Date().toISOString(),
  })

  const vapid = await loadVapidConfig(db, env)
  if (!vapid) return empty('no_vapid')
  const windowMin = opts.windowMin ?? 15
  const maxN = opts.maxNotifications ?? 25
  const since = new Date(Date.now() - windowMin * 60_000).toISOString()

  // 1) المرشحون: حديث + غير مرسَل
  let candidates: { id: string }[] = []
  try {
    candidates = ((await db.select('notifications', {
      select: 'id',
      filters: { pushed_at: 'is.null', created_at: `gte.${since}` },
      order: ['created_at.asc'],
      limit: maxN * 2,
    })) ?? []) as { id: string }[]
  } catch (err) {
    console.warn('[push/edge] candidates query failed:', (err as Error)?.message)
    return empty('not_configured')
  }
  if (candidates.length === 0) return empty(undefined)

  // 2) استبعاد من لهم نتيجة نهائية سابقة (error وحدها تُعاد محاولتها)
  const ids = candidates.map((c) => String(c.id))
  let terminal = new Set<string>()
  try {
    const logs = ((await db.select('push_dispatch_log', {
      select: 'notification_id,status',
      filters: { notification_id: `in.(${ids.map((i) => `"${i}"`).join(',')})` },
    })) ?? []) as { notification_id: string; status: string }[]
    for (const l of logs) {
      if (l.status !== 'error') terminal.add(String(l.notification_id))
    }
  } catch {
    // الجدول غير موجود بعد (قبل الهجرة 033) — نتابع بلا استبعاد
    // (الادعاء الذري في البوابة يمنع الإرسال المزدوج أصلًا)
  }
  const queue = candidates.filter((c) => !terminal.has(String(c.id))).slice(0, maxN)
  if (queue.length === 0) return { ...empty(undefined), scanned: candidates.length }

  // 3) المعالجة
  const results: SweepNotificationResult[] = []
  let attempted = 0
  let sent = 0
  let revoked = 0

  for (const candidate of queue) {
    const notificationId = String(candidate.id)
    const res = await dispatchOne(db, vapid, notificationId, opts.fetchImpl)
    results.push(res)
    attempted += res.attempted
    sent += res.sent
    revoked += res.revoked

    // التسجيل في push_dispatch_log (أفضل جهد — إخفاقه لا يوقف الجولة)
    try {
      await db.upsert(
        'push_dispatch_log',
        {
          notification_id: notificationId,
          status: res.status,
          detail: {
            attempted: res.attempted,
            sent: res.sent,
            revoked: res.revoked,
            reason: res.reason ?? null,
            channel: 'supabase-edge',
          },
        },
        'notification_id',
      )
    } catch (err) {
      console.warn('[push/edge] log write failed:', (err as Error)?.message)
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed: queue.length,
    attempted,
    sent,
    revoked,
    results,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
}

// ── القسم: إرسال إشعار واحد ─────────────────────

interface GateResult {
  ok: boolean
  reason?: string
  user_id?: string
  title?: string
  body?: string
  priority?: string
  action_url?: string | null
}

/** إرسال إشعار واحد عبر البوابة الذرية (تكافؤ dispatch.ts) */
export async function dispatchOne(
  db: Postgrest,
  vapid: VapidConfig,
  notificationId: string,
  fetchImpl?: typeof fetch,
): Promise<SweepNotificationResult> {
  const base: SweepNotificationResult = {
    notificationId,
    status: 'error',
    attempted: 0,
    sent: 0,
    revoked: 0,
  }

  // 1) البوابة (ادعاء ذري pushed_at) — المتزامن مع Vercel يذوب هنا
  let gate: GateResult
  try {
    gate = (await db.rpc('gate_push_for_notification', {
      p_notification_id: notificationId,
    })) as GateResult
  } catch (err) {
    return { ...base, reason: `gate-error:${(err as Error)?.message}` }
  }

  if (!gate || gate.ok !== true) {
    const reason = gate?.reason ?? 'unknown'
    if (reason === 'not_found') return { ...base, status: 'not-found', reason }
    if (reason === 'already_pushed') return { ...base, status: 'claimed-elsewhere', reason }
    return { ...base, status: 'denied', reason }
  }

  // 2) الاشتراكات النشطة للمستخدم
  let subs: PushSubscriptionTarget[] = []
  try {
    const rows = ((await db.select('push_subscriptions', {
      select: 'endpoint,p256dh,auth',
      filters: { user_id: `eq.${gate.user_id}`, revoked_at: 'is.null' },
      limit: 20,
    })) ?? []) as PushSubscriptionTarget[]
    subs = rows
  } catch (err) {
    return { ...base, reason: `subs-error:${(err as Error)?.message}` }
  }
  if (subs.length === 0) return { ...base, status: 'no-subscriptions', reason: 'no_subscriptions' }

  // 3) الحمولة — عقد sw.js نفسه (title/body/icon/badge/tag/url)
  const isHigh = gate.priority === 'high'
  const payload = JSON.stringify({
    title: String(gate.title ?? 'أوج'),
    body: String(gate.body ?? ''),
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: `awj-${notificationId}`,
    url: deepLinkFor(gate.action_url, notificationId),
  })

  let sent = 0
  let revoked = 0
  let lastError: string | undefined

  for (const sub of subs) {
    const outcome = await sendWebPush(
      sub,
      payload,
      vapid,
      { ttlSec: isHigh ? 4 * 3600 : 24 * 3600, urgency: isHigh ? 'high' : 'normal' },
      fetchImpl,
    )
    if (outcome.kind === 'sent') {
      sent += 1
      // نجاح → تحديث last_push_at (أفضل جهد)
      try {
        await db.rpc('touch_push_subscription', { p_endpoint: sub.endpoint })
      } catch { /* أفضل جهد */ }
    } else if (outcome.kind === 'expired') {
      // الاشتراك مات عند المزود → إبطال دائم
      revoked += 1
      try {
        await db.rpc('revoke_push_subscription', {
          p_endpoint: sub.endpoint,
          p_reason: 'expired',
        })
      } catch { /* أفضل جهد */ }
    } else if (outcome.kind === 'temp-fail') {
      // خطأ مؤقت (شبكة/مزود 500/429) — نتركه لمرات قادمة
      lastError = `temp-fail:${outcome.status ?? outcome.message ?? ''}`
    } else {
      lastError = `send-error:${outcome.message}`
    }
  }

  // لم يصل أي جهاز؟ → حالة error للرصد (ملاحظة at-most-once:
  // البوابة ادّعت pushed_at قبل الإرسال، فالإعادة الفعلية
  // مستحيلة — لكن السجل يوثّق الحقيقة للمشغل)
  if (sent === 0) {
    return {
      ...base,
      status: 'error',
      attempted: subs.length,
      sent,
      revoked,
      reason: lastError ?? 'no-delivery',
    }
  }
  return { ...base, status: 'sent', attempted: subs.length, sent, revoked }
}

/** فرض إرسال إشعار بعينه (تشخيص يدوي بمفتاح الخدمة) */
export async function forceDispatch(
  db: Postgrest,
  env: Record<string, string | undefined>,
  notificationId: string,
  fetchImpl?: typeof fetch,
): Promise<SweepNotificationResult> {
  const vapid = await loadVapidConfig(db, env)
  if (!vapid) {
    return {
      notificationId,
      status: 'error',
      attempted: 0,
      sent: 0,
      revoked: 0,
      reason: 'no_vapid',
    }
  }
  const res = await dispatchOne(db, vapid, notificationId, fetchImpl)
  try {
    await db.upsert(
      'push_dispatch_log',
      {
        notification_id: notificationId,
        status: res.status,
        detail: {
          attempted: res.attempted,
          sent: res.sent,
          revoked: res.revoked,
          reason: res.reason ?? null,
          channel: 'supabase-edge-forced',
        },
      },
      'notification_id',
    )
  } catch { /* أفضل جهد */ }
  return res
}
