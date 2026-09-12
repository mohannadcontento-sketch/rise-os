'use client'

// ============================================================
// pwa-init.tsx — تهيئة PWA (طبقة التطبيق)
//
// مكوّن أثري يُرجع null ويُركَّب مرة واحدة في layout الجذر
// (src/app/layout.tsx). المسؤوليات الثلاث:
//
//   1) تسجيل service worker (/sw.js) وإدارة دورة تحديثه:
//      عند ظهور نسخة جديدة نرسل SKIP_WAITING، وعند «تسلّم» النسخة
//      الجديدة للصفحة (controllerchange) نعيد التحميل مرة واحدة
//      فقط — الحارس refreshing يمنع حلقة إعادة التحميل المعروفة
//      (كان قبلًا: مسار waiting يفعّل بلا إعادة تحميل، ومسار
//      statechange يعيد التحميل فورًا — سلوكان متناقضان).
//
//   2) معالجة deep-link إشعارات Push: رابط الفتح من sw.js يحمل
//      ?notification=<id> — هنا نعلّمه كمقروء (PUT الهادئ) فيبثّ
//      apiFetch حدث rise:data-changed تلقائيًا فينبض شعار الجرس
//      فورًا، ثم ننظّف الرابط من العنوان حتى لا يعاد التعليم عند
//      كل refresh. (قبل هذه الحلقة كان النقر يفتح التطبيق فقط
//      والإشعار يظل «غير مقروء» رغم أن المستخدم رآه فعلاً.)
//
//   3) إعادة مزامنة اشتراك push قائم فقط عندما تكون صلاحية
//      الإشعارات ممنوحة أصلًا (resyncPushSubscription).
//
// مبادئ UX/تقنية: صلاحية الإشعارات لا تُطلب تلقائيًا أبدًا (الطلب
// الصريح من الإعدادات أو شريحة الدرج — المرحلة 06)؛ فشل تسجيل
// SW صامت لأنه طبيعي في التطوير؛ الاختصارات العميقة عبر
// ?module= تُخزَّن في sessionStorage ليستهلها مُوجِّه الوحدات.
// ============================================================

import { useEffect } from 'react'

/**
 * Detects if the app is running as an installed PWA (standalone mode).
 * Safe for SSR — returns false on server.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

/**
 * علامة التعليم الصامت لـdeep-link الإشعار — sessionStorage حتى لا
 * يتكرر التعليم للإشعار نفسه ضمن الجلسة (مثلاً عند refresh متتالٍ).
 */
const NOTIF_HANDLED_KEY = 'rise-notification-handled'

/** يعلّم الإشعار كمقروء ويبثّ نبضة البيانات (يرجع true عند النجاح). */
async function markNotificationFromDeepLink(id: string): Promise<boolean> {
  try {
    const { apiPut } = await import('@/lib/api-fetch')
    const res = await apiPut('/api/rise/notifications', { ids: [id] })
    return res.ok
  } catch {
    return false
  }
}

/**
 * PWA initialization.
 * Registers the service worker, manages its update lifecycle, resyncs
 * an existing push subscription (never asks permission), and completes
 * push deep-links (?notification=).
 */
export function PWAInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      handleNotificationDeepLink()
      handleModuleShortcut()
      return
    }

    // ── 1) دورة تحديث SW: إعادة تحميل واحدة عند controllerchange ──
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // ── 2) التسجيل ──
    let registration: ServiceWorkerRegistration | null = null
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (reg) => {
      registration = reg

      // نسخة جديدة تنتظر فعلاً؟ فعّلها — إعادة التحميل تأتي من
      // controllerchange أعلاه (المصدر الوحيد، بلا ازدواج).
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          // جاهزة وقصاد نسخة نشطة → طلب التفعيل فقط؛ التحميل
          // من controllerchange (وإن غاب المتحكم — أول تثبيت — لا
          // تحميل إطلاقاً).
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // المرحلة 06: لا نطلب صلاحية الإشعارات أبدًا تلقائيًا — فقط
      // إعادة مزامنة اشتراك قائم (الصلاحية ممنوحة أصلًا) مع
      // مسار التسجيل الجديد per-device. الطلب الصريح من زر
      // الإعدادات أو شريحة درج الإشعارات.
      if ('Notification' in window && Notification.permission === 'granted') {
        const { resyncPushSubscription } = await import('@/lib/push-notifications')
        await resyncPushSubscription()
      }
    }).catch(() => {
      // Service worker registration failed — silent (normal in dev)
    })

    // ── 3) استكمال deep-link الإشعار + اختصار الوحدة ──
    handleNotificationDeepLink()
    handleModuleShortcut()

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      void registration
    }
  }, [])

  return null
}

/**
 * ?notification=<uuid> من رابط فتح إشعار Push (sw.js notificationclick):
 * تعليم هادئ كمقروء → apiFetch يبث rise:data-changed → الجرس ينبض،
 * ثم تنظيف الرابط من شريط العنوان حتى لا يتكرر عند refresh.
 */
function handleNotificationDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search)
    const notificationId = params.get('notification')
    if (!notificationId) return

    // مرة واحدة لكل إشعار في الجلسة — refresh لا يعيد التعليم.
    const handled = sessionStorage.getItem(`${NOTIF_HANDLED_KEY}:${notificationId}`)
    if (handled) return
    sessionStorage.setItem(`${NOTIF_HANDLED_KEY}:${notificationId}`, '1')

    void markNotificationFromDeepLink(notificationId)

    // تنظيف الرابط (يبقى ?module= لو وُجد — يستخدمه مُوجِّه الوحدات).
    params.delete('notification')
    const qs = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    )
  } catch {
    // history/sessionStorage محجوبان (وضع خاص) — تجاهل صامت
  }
}

/**
 * ?module=<اسم> من اختصارات PWA/الروابط: تخزين في sessionStorage
 * ليستهلها مُوجِّه الوحدات في app/app/page.tsx.
 */
function handleModuleShortcut() {
  try {
    const params = new URLSearchParams(window.location.search)
    const startModule = params.get('module')
    if (startModule) {
      sessionStorage.setItem('rise-start-module', startModule)
    }
  } catch {
    // sessionStorage محجوب — تجاهل صامت
  }
}
