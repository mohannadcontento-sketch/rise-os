'use client'

import { useState } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck, Zap, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ============================================================
// /reset-password — صفحة تعيين كلمة مرور جديدة (المرحلة 03)
// يصل إليها المستخدم من رابط الاستعادة في بريده:
//   /auth/callback?flow=recovery → جلسة + marker cookie → هنا
// يرسل newPassword إلى /api/auth/update-password (بدون كلمة
// المرور الحالية — الإثبات هو marker الجلسة الناشئة من البريد).
// بعد النجاح تُبطل كل الجلسات ويعود المستخدم لتسجيل الدخول.
// ============================================================

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const passwordsMatch = password.length >= 8 && password === confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'تعذر تحديث كلمة المرور')
        return
      }
      setDone(true)
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background" dir="rtl">
      {/* Ambient glow — مطابق لصفحة الدخول */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-accent/15 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-glass/10 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-forest/25 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-4 px-2">
        <div className="rounded-3xl neo-card shadow-lift bg-card/95 p-6 sm:p-8 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="press w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-lime flex items-center justify-center shadow-lg shadow-lime/25 mb-3 sm:mb-4">
              <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-ink" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">كلمة مرور جديدة</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">أوج — awj.life</p>
          </div>

          {done ? (
            <div className="text-center space-y-4" role="status">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-success/15 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-success" />
              </div>
              <div>
                <p className="font-bold text-foreground">تم تغيير كلمة المرور بنجاح</p>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  تم إبطال جميع الجلسات السابقة حفاظًا على أمان حسابك.
                  سجّل الدخول من جديد بكلمة المرور الجديدة.
                </p>
              </div>
              <Button
                onClick={() => { window.location.href = '/app' }}
                className="w-full h-11 rounded-xl bg-violet-accent text-ink font-bold press"
              >
                الذهاب لتسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <Label htmlFor="new-password" className="text-sm font-medium mb-1.5 block text-foreground">
                  كلمة المرور الجديدة
                </Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="ps-10 pe-10 h-11 rounded-xl bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-violet-accent focus-visible:ring-violet-accent/30"
                    dir="ltr"
                    required
                    minLength={8}
                    autoComplete="new-password"
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
              </div>

              <div>
                <Label htmlFor="confirm-password" className="text-sm font-medium mb-1.5 block text-foreground">
                  تأكيد كلمة المرور
                </Label>
                <div className="relative">
                  <ShieldCheck className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className={cn(
                      'ps-10 h-11 rounded-xl bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-violet-accent focus-visible:ring-violet-accent/30',
                      confirm && !passwordsMatch && 'border-destructive/60 focus-visible:ring-destructive/20'
                    )}
                    dir="ltr"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                {confirm && !passwordsMatch && (
                  <p className="text-xs text-destructive mt-1.5">كلمتا المرور غير متطابقتين</p>
                )}
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-center" role="alert">
                  <p>{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !passwordsMatch}
                className={cn(
                  'w-full h-11 rounded-xl bg-violet-accent text-ink font-bold transition-all press',
                  'hover:shadow-lg hover:shadow-violet-accent/25 hover:bg-[#B8A2FB] dark:hover:bg-[#C4B5FD]',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full inline-block animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    تعيين كلمة المرور
                  </span>
                )}
              </Button>

              <button
                type="button"
                onClick={() => { window.location.href = '/app' }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                العودة دون التغيير
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5 sm:mt-6">
          أوج v1.0 — صُنع بـ ❤️
        </p>
      </div>
    </div>
  )
}
