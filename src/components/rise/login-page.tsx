'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Mail, Lock, User, Eye, EyeOff, Sparkles, Shield, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api-fetch'

interface LoginPageProps {
  onLogin: (data: { user: { id: string; email: string; isAdmin: boolean; name?: string; avatar?: string | null } }) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
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

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    setLoading(true)
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const body = mode === 'login' ? { email, password } : { email, password, name }
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
        } else {
          setError(data.error || 'حدث خطأ')
        }
        return
      }
      if (data.needsConfirmation) {
        setError('تم إرسال رابط تأكيد إلى بريدك الإلكتروني')
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
        onLogin({ user: userInfo })
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
                onClick={() => { setMode(tab.id); setError(''); setNotice('') }}
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
                onClick={() => { setMode('login'); setError(''); setNotice('') }}
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
              {mode === 'login' && (
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setNotice('') }}
                    className="text-xs text-violet-accent hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Notice (نجاح استعادة) */}
            {notice && mode === 'forgot' && (
              <div className="text-sm text-success bg-success/10 border border-success/20 rounded-xl px-4 py-3 text-center" role="status">
                <p>{notice}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-center" role="alert">
                <p>{error}</p>
                {(error.includes('تأكيد') || error.includes('لم يتم تأكيده')) && (
                  <button
                    type="button"
                    disabled={resendLoading}
                    onClick={async () => {
                      setResendLoading(true)
                      try {
                        await apiPost('/api/auth/resend', { email })
                        setError('تم إعادة إرسال رابط التأكيد!')
                      } catch {
                        setError('فشل إعادة الإرسال')
                      }
                      setResendLoading(false)
                    }}
                    className="mt-2 text-xs text-violet-accent hover:underline flex items-center gap-1 mx-auto"
                  >
                    {resendLoading ? (
                      <span className="w-3 h-3 border border-violet-accent/30 border-t-violet-accent rounded-full inline-block animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    إعادة إرسال رابط التأكيد
                  </button>
                )}
              </div>
            )}

            {/* Submit — violet, ink text (AA verified) */}
            <Button
              type="submit"
              disabled={loading || !email || (mode !== 'forgot' && !password) || (mode === 'signup' && !name)}
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
                  <Sparkles className="w-4 h-4" />
                  دخول
                </span>
              ) : mode === 'forgot' ? (
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  إرسال رابط الاستعادة
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
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
