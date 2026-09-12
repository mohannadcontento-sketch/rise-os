'use client'

// ============================================================
// app/offline/page.tsx — صفحة «غير متصل» (fallback التنقل في sw.js)
//
// آخر حلقة في سلسلة offline للـPWA: عندما يفشل طلب تنقّل (صفحة)
// لانعدام الشبكة يقدّمها service worker من الكاش، وإن لم تكن
// مخزّنة أصلاً يفتح هذه الصفحة بدل صفحة المتصفح البدائية
// «لا يوجد اتصال بالإنترنت».
//
// المبادئ:
//   • صفر طلبات شبكة و صفر بيانات مستخدم — الصفحة تعمل حتى لو
//     فشل كل شيء حولها (لهذا هي client ثابتة بلا جلب).
//   • إعادة المحاولة يدوية بزر، وتلقائية فور عودة الاتصال
//     (حدث online) بعد مهلة أمان قصيرة.
//   • «رجوع» يحاول history.back() فإن لم توجد سابقة يسقط إلى /app.
// ============================================================

import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OfflinePage() {
  const [justCameBack, setJustCameBack] = useState(false)

  // عند عودة الاتصال: نبض قصير ثم إعادة تحميل الصفحة الأصلية
  // (المهلة 800ms تمنع سباق عودة الاتصال الجزئي «flaky»)
  useEffect(() => {
    const handleOnline = () => {
      setJustCameBack(true)
      window.setTimeout(() => window.location.reload(), 800)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  const handleRetry = () => window.location.reload()

  const handleGoBack = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/app')
  }

  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="glass rounded-3xl max-w-md w-full p-8 text-center shadow-2xl border border-white/10">
        {/* رمز الحالة — نفس عائلة التصميم (توهج ناعم + أيقونة) */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-5">
          <WifiOff className="w-8 h-8 text-orange-500" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-foreground">
          {justCameBack ? 'رجع الاتصال — بنرجعك…' : 'مفيش اتصال بالإنترنت'}
        </h1>

        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          أوج شغال على جهازك، بس الصفحة دي محتاجة إنترنت مرة عشان تتحمّل.
          بياناتك محفوظة محلياً وبتتزامن أول ما الشبكة ترجع.
        </p>

        <div className="flex flex-col gap-2 mt-6">
          <Button
            onClick={handleRetry}
            className="h-11 rounded-xl bg-gradient-to-r from-emerald-accent to-forest text-white"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            إعادة المحاولة
          </Button>
          <Button
            onClick={handleGoBack}
            variant="outline"
            className="h-11 rounded-xl"
          >
            <ArrowRight className="w-4 h-4 ml-2" />
            رجوع
          </Button>
        </div>
      </div>
    </main>
  )
}
