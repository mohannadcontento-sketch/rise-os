/**
 * push-notifications.ts — Web Push للعميل (المرحلة 06).
 *
 * الفرق عن نسخة المرحلة 01 القديمة:
 *   • المفتاح العام يأتي من الخادم (/api/rise/push/vapid-key) —
 *     لا NEXT_PUBLIC_VAPID_KEY في env (المفتاح مزروع في DB).
 *   • كل جهاز/متصفح يُسجّل بمفرده (upsert by endpoint) — ليست
 *     خانة JSON واحدة لكل مستخدم.
 *   • الصلاحية تُطلب فقط من إيماءة مستخدم صريحة (زر في
 *     الإعدادات أو شريحة الدرج) — أبدًا تلقائيًا عند التحميل.
 *   • pwa-init يقوم فقط بإعادة مزامنة اشتراك قائم (لو الصلاحية
 *     ممنوحة أصلًا) دون طلب شيء.
 */

'use client'

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export interface PushStatus {
  permission: PushPermissionState
  /** يوجد subscription فعّال في المتصفح الآن */
  subscribed: boolean
  /** الخادم مهيأ بمفاتيح VAPID (لو false فالميزة متوقفة لدينا) */
  serverConfigured: boolean
  /** push مدعوم في هذا المتصفح (Service Worker + PushManager) */
  supported: boolean
}

export type EnableResult =
  | { ok: true; resynced?: boolean }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'permission_denied' | 'server_not_configured' | 'server_error'; message?: string }

/** قراءة الحالة الكاملة (لا تطلب أي صلاحية ولا تعدّل شيئًا) */
export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') {
    return { permission: 'unsupported', subscribed: false, serverConfigured: false, supported: false }
  }
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof (window as any).Notification !== 'undefined'

  if (!supported) return { permission: 'unsupported', subscribed: false, serverConfigured: false, supported: false }

  const permission = (Notification.permission as PushPermissionState) || 'default'
  let subscribed = false
  try {
    const reg = await navigator.serviceWorker.ready
    subscribed = !!(await reg.pushManager.getSubscription())
  } catch {
    subscribed = false
  }

  let serverConfigured = false
  try {
    const { apiGet } = await import('@/lib/api-fetch')
    const res = await apiGet('/api/rise/push/vapid-key')
    const j = await res.json().catch(() => ({}))
    serverConfigured = !!j?.configured
  } catch {
    serverConfigured = false
  }

  return { permission, subscribed, serverConfigured, supported }
}

/**
 * التفعيل — من إيماءة مستخدم فقط.
 * تسلسل: صلاحية → SW → subscribe (مفتاح الخادم) → POST
 * /api/rise/push/subscribe. لو يوجد subscription بالفعل نعيد
 * مزامنته فقط (resync) ولا نطلب صلاحية من جديد.
 */
export async function enablePush(): Promise<EnableResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof (window as any).Notification === 'undefined') {
    return { ok: false, reason: 'unsupported', message: 'متصفحك لا يدعم إشعارات الويب' }
  }

  if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return { ok: false, reason: 'insecure', message: 'إشعارات الويب تتطلب اتصالًا آمنًا (HTTPS)' }
  }

  // 1) الصلاحية — طلب صريح (default فقط؛ denied لا يُطلب ثانية)
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') {
      return { ok: false, reason: 'permission_denied', message: 'لم تُمنح صلاحية الإشعارات للمتصفح' }
    }
  } else if (Notification.permission === 'denied') {
    return {
      ok: false,
      reason: 'permission_denied',
      message: 'الإشعارات محظورة من إعدادات المتصفح — اسمح للموقع ثم أعد المحاولة',
    }
  }

  // 2) مفتاح VAPID من الخادم
  const { apiGet, apiPost } = await import('@/lib/api-fetch')
  const vapidRes = await apiGet('/api/rise/push/vapid-key').catch(() => null)
  const vapid = vapidRes ? await vapidRes.json().catch(() => null) : null
  if (!vapid?.configured || !vapid?.publicKey) {
    return { ok: false, reason: 'server_not_configured', message: 'خدمة الإشعارات غير مهيأة على الخادم حاليًا' }
  }

  // 3) Service Worker جاهز + اشتراك
  const registration = await navigator.serviceWorker.ready
  if (!registration.pushManager) return { ok: false, reason: 'unsupported' }

  let subscription = await registration.pushManager.getSubscription()
  let resynced = true
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
    })
    resynced = false
  }

  // 4) تسجيل/تجديد على الخادم
  const json = subscription.toJSON()
  const res = await apiPost('/api/rise/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    label: deviceLabel(),
  }).catch(() => null)

  if (!res || !res.ok) {
    // الخادم رفض — نفك الاشتراك المحلي حتى لا نظن أننا مفعلون
    try { await subscription.unsubscribe() } catch { /* ignore */ }
    const message = res ? await res.json().catch(() => null) : null
    return {
      ok: false,
      reason: 'server_error',
      message: message?.error || 'تعذّر تسجيل الجهاز لدى الخادم — أعد المحاولة',
    }
  }

  return { ok: true, resynced }
}

/**
 * الإيقاف — يبطل الاشتراك محليًا وعلى الخادم. يمنع القناة فقط:
 * مركز الإشعارات داخل الموقع يستمر كما هو (DoD).
 */
export async function disablePush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      const { apiFetch } = await import('@/lib/api-fetch')
      await apiFetch('/api/rise/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }).catch(() => null)
    }
    return true
  } catch {
    return false
  }
}

/**
 * إعادة مزامنة اشتراك قائم (يستدعيها pwa-init عند الإقلاع لو
 * الصلاحية ممنوحة أصلًا) — لا تطلب صلاحية ولا تنشئ شيئًا.
 */
export async function resyncPushSubscription(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
    if (typeof (window as any).Notification === 'undefined' || Notification.permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    if (!registration.pushManager) return false
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return false

    const { apiPost } = await import('@/lib/api-fetch')
    const json = subscription.toJSON()
    const res = await apiPost('/api/rise/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      label: deviceLabel(),
    }).catch(() => null)
    return !!res?.ok
  } catch {
    return false
  }
}

/** تسمية ودّية للجهاز من user-agent (لعرضها في قائمة الأجهزة) */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'جهاز'
  const ua = navigator.userAgent
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'متصفح'
  const os =
    /Android/i.test(ua) ? 'أندرويد' :
    /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
    /Windows/i.test(ua) ? 'ويندوز' :
    /Mac OS X/i.test(ua) ? 'ماك' :
    /Linux/i.test(ua) ? 'لينكس' : ''
  return os ? `${browser} · ${os}` : browser
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
