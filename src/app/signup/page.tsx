import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Zap } from 'lucide-react'
import LoginPage from '@/components/rise/login-page'

// ============================================================
// /signup — مسار إنشاء الحساب المستقل (المرحلة 20)
//
// يفتح بوابة الدخول على تبويب «حساب جديد» مباشرة — مع موافقة
// صراحة على الشروط وسياسة الخصوصية (نسخة محددة + رفض خادمي)
// ومؤشر متطلبات كلمة المرور. بعد النجاح: تحويل إلى /app.
// التوافق الرجعي محفوظ: /app (وضع الاستعلام) كما هو.
// noindex: صفحات المصادقة لا مكان لها في محركات البحث.
// ============================================================

export const metadata: Metadata = {
  title: 'حساب جديد — أوج',
  description: 'أنشئ حسابك في أوج — امتلك صباحك، امتلك حياتك.',
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

export default function SignupRoute() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <LoginPage defaultMode="signup" />
    </Suspense>
  )
}
