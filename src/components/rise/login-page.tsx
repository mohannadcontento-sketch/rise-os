'use client'

// ============================================================
// login-page.tsx — بوابة الدخول (مصادقة) — المرحلة 20
//
// شاشة ملء الشاشة تُعرض إما من مُوجِّه الوحدات (app/page.tsx قبل
// قيام الجلسة — وضع الاستعلام) أو من مساري /login و /signup
// المستقلين (defaultMode يحدد التبويب الابتدائي)؛ تبويبا
// «تسجيل الدخول / حساب جديد» + وضع «نسيت كلمة المرور»، يستدعي
// مسارات /api/auth/* مباشرة بـ fetch ثم يسلم بيانات المستخدم
// للأم عبر onLogin (يخزنها في store) — أو يحوّل إلى /app إن
// غاب onLogin (وضع المسارات المستقلة).
// يقرأ الروابط العميقة ?forgot=1 (من صفحة رابط الاستعادة
// المنتهي) و ?authError= (من /auth/callback) لتهيئة الوضع
// والرسالة الأولى.
//
// البنية الداخلية:
//   1) الحالة: mode (login/signup/forgot) + خطأ/إشعار/بطاقة
//      تأكيد بريد + إظهار كلمة المرور + إعادة إرسال بعدّاد
//      تهدئة + قبول السياسات + نسخ السياسات الحالية
//   2) handleSubmit — تحقق بريد/كلمة مرور (٨+ حرف+رقم) ثم POST
//      للمسار المناسب مع { acceptedTerms, policyVersions } في
//      وضع الحساب الجديد؛ معالجة needsConfirmation و
//      email_not_confirmed و CONSENT_REQUIRED و
//      POLICY_VERSION_MISMATCH (تحديث النسخ ثم إعادة قبول)
//   3) الواجهة: هالة ambient ثلاثية + بطاقة neo + تبويبات
//      role=tablist + حقول بأيقونات start + زر إرسال بأيقونة
//      مختلفة لكل وضع + checkbox موافقة بروابط واضحة +
//      مؤشر متطلبات كلمة المرور الحي
//
// مبادئ UX/تقنية: زر «إعادة إرسال رابط التأكيد» يظهر في بطاقة
// التأكيد الزرقاء (وبطاقة الخطأ عند email_not_confirmed) مع
// عدّاد تهدئة ٣٠ث لمنع الإزعاج؛ رسالة الاستعادة لا تكشف هل
// البريد مسجل؛ إظهار/إخفاء كلمة المرور بـ aria-label عربي؛
// الزر معطل أثناء الإرسال ولا تحقق HTML مخصص (noValidate).
// ============================================================

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Zap, Mail, Lock, User, Eye, EyeOff, Sparkles, Shield, RefreshCw, Check, X, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api-fetch'
import { REQUIRED_POLICY_VERSIONS } from '@/lib/policy-versions'

interface LoginPageProps {
  onLogin?: (data: { user: { id: string; email: string; isAdmin: boolean; name?: string; avatar?: string | null } }) => void
  /** التبويب الابتدائي — تستخدمه مسارات /login و /signup المستقلة */
  defaultMode?: 'login' | 'signup'
}

/** أرقام شرقية لعرض نسخة السياسة (قاعدة §7/4) */
function easternDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
}

export default function LoginPage({ onLogin, defaultMode = 'login' }: LoginPageProps) {
  // روابط عميقة: ?forgot=1 (من صفحة رابط الاستعادة المنتهي) و ?authError= (من /auth/callback)
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(
    () => (searchParams.get('forgot') === '1' ? 'forgot' : defaultMode)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    const authError = searchParams.get('authError')
    if (authError === 'expired') return 'انتهت صلاحية رابط البريد أو تم استخدامه من قبل. اطلب رابطًا جديدًا.'
    if (authError === 'unavailable') return 'خدمة المصادقة غير متوفرة حالياً، حاول بعد قليل.'
    if (authError === 'unsupported') return 'تسجيل الدخول غير متاح في وضع التطوير المحلي.'
    if (authError === 'unknown') return 'تعذر إتمام العملية، حاول مرة أخرى.'
    return ''
  })
  const [notice, setNotice] = useState(
    () => (searchParams.get('forgot') === '1' ? 'أدخل بريدك وسنرسل لك رابط إعادة تعيين كلمة المرور' : '')
  )
  // بطاقة تأكيد البريد (حالة معلومات — ليست خطأ)
  const [confirmation, setConfirmation] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  // ── موافقة السياسات (signup فقط) ──
  const [accepted, setAccepted] = useState(false)
  const [policyVersions, setPolicyVersions] = useState(REQUIRED_POLICY_VERSIONS)

  // عدّاد تهدئة إعادة الإرسال (٣٠ ثانية)
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  const switchMode = (next: 'login' | 'signup' | 'forgot') => {
    setMode(next)
    setError('')
    setNotice('')
    setConfirmation('')
  }

  // متطلبات كلمة المرور — تُعرض حية في وضع الحساب الجديد
  const pwChecks = {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    digit: /[0-9]/.test(password),
  }
  const pwValid = pwChecks.length && pwChecks.letter && pwChecks.digit

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return
    setResendLoading(true)
    try {
      await apiPost('/api/auth/resend', { email })
      setResendCooldown(30)
      setConfirmation('تم إرسال رابط تأكيد جديد إلى بريدك الإلكتروني.')
    } catch {
      setError('تعذر إعادة الإرسال — حاول بعد قليل')
    } finally {
      setResendLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setConfirmation('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('بريد إلكتروني غير صالح')
      return
    }

    // وضع «نسيت كلمة المرور»: إرسال بريد الاستعادة فقط.
    if (mode === 'forgot') {
      setLoading(true)
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'تعذر إرسال رسالة الاستعادة')
          return
        }
        setNotice(data.message || 'إذا كان هذا البريد مسجلًا لدى أوج، ستصلك رسالة تحتوي رابط إعادة تعيين كلمة المرور.')
      } catch {
        setError('تعذر الاتصال بالخادم')
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'signup') {
      // بوابة الموافقة العميلية — الخادم يرفض أيضًا (دفاع عميق)
      if (!accepted) {
        setError('يجب قبول الشروط وسياسة الخصوصية لإنشاء الحساب')
        return
      }
      if (!pwValid) {
        setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفًا ورقمًا')
        return
      }
    } else if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setLoading(true)
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, name, acceptedTerms: accepted, policyVersions }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.errorType === 'email_not_confirmed') {
          setError(data.error || 'البريد الإلكتروني لم يتم تأكيده بعد. تحقق من صندوق البريد.')
          return
        }
        if (data.errorType === 'POLICY_VERSION_MISMATCH') {
          // حدّث النسخ المعروضة واطلب قبولًا جديدًا للنسخة السارية
          if (data.requiredPolicyVersions) setPolicyVersions(data.requiredPolicyVersions)
          setAccepted(false)
          setError(data.error || 'تحديثت الشروط أو سياسة الخصوصية — راجعها ثم اقبل النسخة الجديدة')
          return
        }
        if (data.errorType === 'CONSENT_REQUIRED') {
          setError(data.error || 'يجب قبول الشروط وسياسة الخصوصية لإنشاء الحساب')
          return
        }
        setError(data.error || 'حدث خطأ')
        return
      }
      if (data.needsConfirmation) {
        // بطاقة معلومات هادئة (ليست خطأ) — مع إعادة إرسال وتهدئة
        setConfirmation(data.message || 'تم إرسال رابط تأكيد إلى بريدك الإلكتروني')
        setPassword('')
        return
      }
      if (data.user) {
        const userInfo = {
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.name || name || email.split('@')[0],
          isAdmin: !!data.user.isAdmin,
          avatar: data.user.avatar ?? null,
        }
        localStorage.setItem('rise-user-info', JSON.stringify(userInfo))
        if (onLogin) {
          onLogin({ user: userInfo })
        } else {
          // وضع المسارات المستقلة (/login، /signup): حملة كاملة
          // تلتقط الكوكيز httpOnly من جهة الخادم — عمدًا وليس
          // router.push: الصدفة تُقلَع من الصفر بجلسة مُثبتة
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign('/app')
        }
      } else {
        setError('تعذر إنشاء جلسة صالحة')
      }
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background" dir="rtl">
      {/* Ambient glow — violet aurora + forest floor */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-accent/15 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-glass/10 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-forest/25 to-transparent" />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-4 px-2">
        <div className="rounded-3xl neo-card shadow-lift bg-card/95 p-6 sm:p-8 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="press w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-lime flex items-center justify-center shadow-lg shadow-lime/25 mb-3 sm:mb-4">
              <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-ink" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">أوج</h1>
            <p className="eyebrow mt-1.5" dir="ltr">awj.life</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">امتلك صباحك. امتلك حياتك.</p>
          </div>

          {/* Tabs (تُخفى في وضع استعادة كلمة المرور) */}
          {mode !== 'forgot' && (
          <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border mb-5 sm:mb-6" role="tablist">
            {[
              { id: 'login' as const, label: 'تسجيل الدخول' },
              { id: 'signup' as const, label: 'حساب جديد' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => switchMode(tab.id)}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all press',
                  mode === tab.id
                    ? 'bg-violet-accent/15 text-violet-accent shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-5 sm:mb-6 text-center">
              <h2 className="text-base sm:text-lg font-bold text-foreground">استعادة كلمة المرور</h2>
              <p className="text-xs text-muted-foreground mt-1">أدخل بريدك وسنرسل لك رابط إعادة التعيين</p>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="mt-3 text-xs text-violet-accent hover:underline"
              >
                ← العودة لتسجيل الدخول
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name (signup only) */}
            {mode === 'signup' && (
              <div>
                <Label htmlFor="name" className="text-sm font-medium mb-1.5 block text-foreground">الاسم</Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اسمك الكريم"
                    className="ps-10 h-11 rounded-xl bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-violet-accent focus-visible:ring-violet-accent/30"
                    dir="rtl"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium mb-1.5 block text-foreground">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="ps-10 h-11 rounded-xl bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-violet-accent focus-visible:ring-violet-accent/30"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {/* Password (ليست مطلوبة في وضع الاستعادة) */}
            {mode !== 'forgot' && (
            <div>
              <Label htmlFor="password" className="text-sm font-medium mb-1.5 block text-foreground">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ps-10 pe-10 h-11 rounded-xl bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-violet-accent focus-visible:ring-violet-accent/30"
                  dir="ltr"
                  required
                  minLength={8}
                  aria-describedby={mode === 'signup' ? 'pw-requirements' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* مؤشر متطلبات كلمة المرور — حي في وضع الحساب الجديد */}
              {mode === 'signup' && password.length > 0 && (
                <div
                  id="pw-requirements"
                  role="status"
                  aria-label="متطلبات كلمة المرور"
                  className="mt-2.5 rounded-xl bg-muted/50 border border-border/60 px-3 py-2.5 space-y-1.5"
                >
                  {[
                    { ok: pwChecks.length, label: '٨ محارف على الأقل' },
                    { ok: pwChecks.letter, label: 'حرف واحد على الأقل' },
                    { ok: pwChecks.digit, label: 'رقم واحد على الأقل' },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center gap-2 text-xs">
                      {c.ok ? (
                        <Check className="w-3.5 h-3.5 text-emerald-accent shrink-0" aria-hidden="true" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
                      )}
                      <span className={c.ok ? 'text-emerald-accent' : 'text-muted-foreground'}>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {mode === 'login' && (
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-violet-accent hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}
            </div>
            )}

            {/* موافقة الشروط والخصوصية — إلزامية في وضع الحساب الجديد */}
            {mode === 'signup' && (
              <div className="rounded-xl bg-muted/40 border border-border/60 px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={accepted}
                    aria-label="الموافقة على الشروط وسياسة الخصوصية"
                    onClick={() => setAccepted(!accepted)}
                    className={cn(
                      'mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all press',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-accent/40',
                      accepted
                        ? 'bg-violet-accent border-violet-accent text-ink'
                        : 'border-border bg-background hover:border-violet-accent/60'
                    )}
                  >
                    {accepted && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                  <p className="text-xs leading-relaxed text-foreground">
                    أوافق على{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-accent font-semibold hover:underline"
                    >
                      الشروط
                    </a>{' '}
                    و{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-accent font-semibold hover:underline"
                    >
                      سياسة الخصوصية
                    </a>{' '}
                    — بما فيها كيفية معالجة بياناتك وحفظ خصوصيتك.
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 ps-8">
                  النسخة السارية: {easternDigits(policyVersions.terms)}
                </p>
              </div>
            )}

            {/* Notice (نجاح استعادة) */}
            {notice && mode === 'forgot' && (
              <div className="text-sm text-success bg-success/10 border border-success/20 rounded-xl px-4 py-3 text-center" role="status">
                <p>{notice}</p>
              </div>
            )}

            {/* بطاقة تأكيد البريد — معلومات هادئة وليست خطأ */}
            {confirmation && (
              <div
                className="text-sm rounded-xl px-4 py-3.5 bg-violet-accent/10 border border-violet-accent/25"
                role="status"
              >
                <div className="flex items-center gap-2.5">
                  <MailCheck className="w-5 h-5 text-violet-accent shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="font-bold text-foreground">تحقق من بريدك الإلكتروني</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{confirmation}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-3">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || resendLoading}
                    onClick={handleResend}
                    className="text-xs text-violet-accent hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1.5"
                  >
                    {resendLoading ? (
                      <span className="w-3 h-3 border border-violet-accent/30 border-t-violet-accent rounded-full inline-block animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    )}
                    {resendCooldown > 0 ? `إعادة الإرسال بعد ${easternDigits(String(resendCooldown))} ثانية` : 'إعادة إرسال رابط التأكيد'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-xs text-foreground/80 hover:text-foreground"
                  >
                    وصلتك الرسالة؟ سجّل دخولك
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-center" role="alert">
                <p>{error}</p>
                {(error.includes('تأكيد') || error.includes('لم يتم تأكيده')) && (
                  <button
                    type="button"
                    disabled={resendLoading || resendCooldown > 0}
                    onClick={handleResend}
                    className="mt-2 text-xs text-violet-accent hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1 mx-auto"
                  >
                    {resendLoading ? (
                      <span className="w-3 h-3 border border-violet-accent/30 border-t-violet-accent rounded-full inline-block animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    )}
                    {resendCooldown > 0 ? `إعادة الإرسال بعد ${easternDigits(String(resendCooldown))} ثانية` : 'إعادة إرسال رابط التأكيد'}
                  </button>
                )}
              </div>
            )}

            {/* Submit — violet, ink text (AA verified) */}
            <Button
              type="submit"
              disabled={
                loading ||
                !email ||
                (mode !== 'forgot' && !password) ||
                (mode === 'signup' && (!name || !accepted || !pwValid))
              }
              className={cn(
                'w-full h-11 rounded-xl bg-violet-accent text-ink font-bold transition-all press',
                'hover:shadow-lg hover:shadow-violet-accent/25 hover:bg-[#B8A2FB] dark:hover:bg-[#C4B5FD]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full inline-block animate-spin" />
              ) : mode === 'login' ? (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  دخول
                </span>
              ) : mode === 'forgot' ? (
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  إرسال رابط الاستعادة
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  إنشاء حساب
                </span>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-5 sm:mt-6">
          أوج v1.0 — صُنع بـ ❤️
        </p>
      </div>
    </div>
  )
}
