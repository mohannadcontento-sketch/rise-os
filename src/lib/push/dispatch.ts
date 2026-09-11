// ============================================================
// dispatch.ts — إرسال Web Push (المرحلة 06)
//
// «ربط Push event بـnotification event نفسه بدل كتابة منطق
//  منفصل لكل قناة»: هذه الدالة هي القناة الوحيدة لإرسال Push،
//  وتُستدعى من notifications-service بعد إنشاء إشعار جديد
//  (فقط عندما created=true — أي لم يمنعه dedup). لا يستدعيها
//  أي مسار بشكل مباشر.
//
// التسلسل (فشل أي خطوة لا يفشّل الإشعار داخل الموقع أبدًا):
//   0) VAPID متاح؟ لا → خروج صامت (push غير مهيأ).
//   1) لا اشتراكات نشطة للمستخدم؟ خروج مبكر — بلا ادعاء
//      pushed_at (وذلك يحمي سقوف المعدل من التضخيم).
//   2) RPC gate_push_for_notification (service_role):
//      فئة مسموحة؟ push_enabled؟ سقوف 10/ساعة و30/يوم؟
//      ادعاء ذري pushed_at (مرة واحدة فقط لكل إشعار).
//   3) إرسال web-push لكل اشتراك نشط:
//      TTL 4 ساعات للعالي / 24 ساعة للعادي؛ urgency مقابلة.
//      payload يطابق عقد sw.js (title/body/icon/badge/tag/url).
//   4) 404/410 → RPC revoke («expired») — إدارة unsubscribe
//      وإبطال القديم تلقائيًا. النجاح → RPC touch (last_push_at).
// ============================================================

import type { VapidConfig } from './vapid'
import { getVapidConfig } from './vapid'

export interface PushDispatchResult {
  attempted: number
  sent: number
  revoked: number
  reason?: 'no_vapid' | 'no_subscriptions' | 'gate_denied' | 'not_found' | 'error'
  gateReason?: string
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  label: string | null
}

/** تحويل action_url الإشعار إلى رابط فتح حقيقي للمتصفح */
export function deepLinkFor(actionUrl: string | null | undefined, notificationId: string): string {
  if (!actionUrl) return `/app?notification=${notificationId}`
  // مسار داخلي كامل (يبدأ بـ /) — كما هو
  if (actionUrl.startsWith('/')) return actionUrl
  // اسم وحدة داخل أوج (مثل 'settings') — آلية ?module= الموجودة أصلًا
  return `/app?module=${encodeURIComponent(actionUrl)}&notification=${notificationId}`
}

async function loadWebPush(): Promise<any | null> {
  try {
    const mod = await import('web-push')
    return (mod as any).default ?? mod
  } catch {
    console.warn('[push/dispatch] web-push unavailable')
    return null
  }
}

/**
 * إرسال Push لإشعار واحد (بوابة مركزية — لا نداء مباشر من المسارات).
 * لا يرفع استثناء أبدًا؛ النتيجة للتشخيص/الاختبار فقط.
 */
export async function dispatchPushForNotification(notificationId: string): Promise<PushDispatchResult> {
  const empty = (reason: PushDispatchResult['reason'], extra?: Partial<PushDispatchResult>): PushDispatchResult =>
    ({ attempted: 0, sent: 0, revoked: 0, reason, ...extra })

  try {
    // 0) VAPID
    const vapid: VapidConfig | null = await getVapidConfig()
    if (!vapid) return empty('no_vapid')

    const webpush = await loadWebPush()
    if (!webpush) return empty('no_vapid')

    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return empty('error')

    // 1) البوابة أولاً (تُرجع user_id + المحتوى + الادعاء الذري
    //    pushed_at) — service_role فقط. لو المستخدم بلا اشتراكات
    //    سنكتشف ذلك بعدها مباشرة.
    const { data: gate, error: gateErr } = await (admin as any).rpc('gate_push_for_notification', {
      p_notification_id: notificationId,
    })
    if (gateErr || !gate || gate.ok !== true) {
      const reason = gate?.reason || gateErr?.message || 'error'
      return empty(reason === 'not_found' ? 'not_found' : 'gate_denied', { gateReason: reason })
    }

    // 2) اشتراكات المستخدم النشطة
    const { data: rows } = await (admin as any)
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, label')
      .eq('user_id', gate.user_id)
      .is('revoked_at', null)
      .limit(20)

    const subscriptions: SubscriptionRow[] = rows ?? []
    if (subscriptions.length === 0) return empty('no_subscriptions')

    // 3) الإرسال
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

    const isHigh = gate.priority === 'high'
    const options = {
      TTL: isHigh ? 4 * 3600 : 24 * 3600,
      urgency: isHigh ? 'high' : 'normal',
      timeout: 6000,
    } as Record<string, unknown>

    const payload = JSON.stringify({
      title: String(gate.title ?? 'أوج'),
      body: String(gate.body ?? ''),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `awj-${gate.notification_id}`,
      url: deepLinkFor(gate.action_url, gate.notification_id),
    })

    let sent = 0
    let revoked = 0

    const results = await Promise.allSettled(
      subscriptions.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            options,
          )
          sent += 1
          // نجاح → تحديث last_push_at
          await (admin as any).rpc('touch_push_subscription', { p_endpoint: s.endpoint })
        } catch (err: any) {
          const status = err?.statusCode
          if (status === 404 || status === 410) {
            // الاشتراك مات عند مزود الخدمة → إبطال دائم
            revoked += 1
            await (admin as any).rpc('revoke_push_subscription', {
              p_endpoint: s.endpoint,
              p_reason: 'expired',
            })
          } else {
            // خطأ مؤقت (شبكة/مزود) — نتركه لمرات قادمة
            console.warn('[push/dispatch] send failed (temp):', status || err?.message)
          }
        }
      }),
    )

    return {
      attempted: subscriptions.length,
      sent,
      revoked,
      reason: sent === 0 && revoked > 0 ? 'error' : undefined,
    }
  } catch (err) {
    console.warn('[push/dispatch] unexpected:', (err as Error)?.message)
    return empty('error')
  }
}
