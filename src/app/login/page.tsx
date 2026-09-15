import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Zap } from 'lucide-react'
import LoginPage from '@/components/rise/login-page'

// ============================================================
// /login — مسار الدخول المستقل (المرحلة 20)
//
// نفس بوابة الدخول المعروضة داخل /app (وضع الاستعلام) — لكن
// بعنوان URL واضح قابل للمشاركة والتذكر. التوافق الرجعي محفوظ:
// /app يبقى يعمل كما هو (بلا جلسة يعرض البوابة داخل الصدفة).
// بعد الدخول الناجح: تحويل حملة كاملة إلى /app لتلتقط الكوكيز
// httpOnly من جهة الخادم (onLogin غير مُمرَّر — وضع التحويل).
// noindex: صفحات المصادقة لا مكان لها في محركات البحث.
// ============================================================

export const metadata: Metadata = {
  title: 'تسجيل الدخول — أوج',
  description: 'سجّل دخولك إلى أوج — نظامك اليومي للإنتاجية والتوازن.',
  robots: { index: false, follow: false },
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
      <div className="w-14 h-14 rounded-2xl bg-lime flex items-center justify-center shadow-lg shadow-lime/25 animate-pulse">
        <Zap className="w-7 h-7 text-ink" aria-hidden="true" />
      </div>
    </div>
  )
}

export default function LoginRoute() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <LoginPage defaultMode="login" />
    </Suspense>
  )
}
