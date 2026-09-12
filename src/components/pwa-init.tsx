'use client'

// ============================================================
// pwa-init.tsx — تهيئة PWA (طبقة التطبيق)
//
// مكوّن أثري يُرجع null ويُركَّب مرة واحدة في layout الجذر
// (src/app/layout.tsx): يسجّل service worker (/sw.js)، يدير
// دورة تحديثه (رسالة SKIP_WAITING ثم إعادة تحميل الصفحة عند
// جاهزية نسخة جديدة)، ويعيد مزامنة اشتراك push قائمًا فقط
// عندما تكون صلاحية الإشعارات ممنوحة أصلًا (resyncPushSubscription).
//
// البنية الداخلية:
//   1) isStandaloneMode — كشف وضع التطبيق المثبّت (آمن لـ SSR
//      لأنه يتحقق من window أولًا)
//   2) PWAInit — تسجيل SW + updatefound/statechange + مزامنة
//      الاشتراك + قراءة ?module= إلى rise-start-module
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
 * PWA initialization.
 *
 * Registers the service worker for push notifications support,
 * requests notification permission, and subscribes to push.
 */
export function PWAInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (reg) => {
      // If a new version is waiting, activate it
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' })
              window.location.reload()
            }
          })
        }
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

    // Handle URL shortcuts (e.g., ?module=tasks)
    const params = new URLSearchParams(window.location.search)
    const startModule = params.get('module')
    if (startModule) {
      sessionStorage.setItem('rise-start-module', startModule)
    }
  }, [])

  return null
}
