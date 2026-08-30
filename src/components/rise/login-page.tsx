'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Mail, Lock, User, Eye, EyeOff, Sparkles, Shield, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api-fetch'
import { supabaseClient, isSupabaseClientConfigured } from '@/lib/supabase-client'

interface LoginPageProps {
  onLogin: (data: { user: { id: string; email: string; isAdmin: boolean }; session: { access_token: string; refresh_token: string; expires_at: number } }) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side validation (mirrors server Zod messages) — the Supabase
    // client path below bypasses /api/auth/*, whose Zod schema normally
    // returns these, so without this check users get a misleading
    // "wrong email or password" for validation failures.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('بريد إلكتروني غير صالح')
      return
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setLoading(true)

    try {
      // MODE 1: Supabase client (production)
      // autoRefreshToken refreshes the JWT ~60s before expiry, preventing 401.
      if (isSupabaseClientConfigured && supabaseClient) {
        if (mode === 'login') {
          const { data, error: sbError } = await supabaseClient.auth.signInWithPassword({
            email, password,
          })
          if (sbError) {
            if (sbError.message.includes('Email not confirmed')) {
              setError('البريد الإلكتروني لم يتم تأكيده بعد. تحقق من صندوق البريد.')
            } else {
              setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
            }
            setLoading(false)
            return
          }
          if (data.session && data.user) {
            // PERF FIX: was POST /api/auth/login — the server re-ran a FULL
            // Supabase signInWithPassword round-trip just to set the httpOnly
            // cookie. We already hold a valid session from the client-side
            // sign-in above — /api/auth/sync-token sets the same cookies with
            // ZERO extra Supabase calls.
            try {
              await fetch('/api/auth/sync-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                }),
                credentials: 'include',
              })
            } catch { /* non-fatal */ }
            const userInfo = {
              id: data.user.id,
              email: data.user.email || email,
              name: (data.user as any).user_metadata?.name || email.split('@')[0],
              isAdmin: email === process.env.NEXT_PUBLIC_ADMIN_EMAIL,
            }
            const sessionData = {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at || 0,
            }
            localStorage.setItem('rise-auth', JSON.stringify(sessionData))
            localStorage.setItem('rise-user-info', JSON.stringify(userInfo))
            onLogin({ user: userInfo, session: sessionData })
          }
        } else {
          const { data, error: sbError } = await supabaseClient.auth.signUp({
            email, password,
            options: { data: { name: name || email.split('@')[0] } },
          })
          if (sbError) {
            if (sbError.message.includes('already registered') || sbError.message.includes('already been registered')) {
              setError('هذا البريد مسجل بالفعل. استخدم تسجيل الدخول.')
            } else {
              setError(`خطأ في التسجيل: ${sbError.message}`)
            }
            setLoading(false)
            return
          }
          if (!data.session && data.user?.confirmed_at === null) {
            setError('تم إرسال رابط تأكيد إلى بريدك الإلكتروني')
            setLoading(false)
            return
          }
          if (data.session && data.user) {
            // PERF FIX: was POST /api/auth/signup — the user was ALREADY
            // created by the client-side signUp above, so the server route
            // always re-attempted signup and answered 409 (a wasted Supabase
            // round-trip + a console error on every new account).
            // /api/auth/sync-token sets the httpOnly cookies directly from
            // the session we already have.
            try {
              await fetch('/api/auth/sync-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                }),
                credentials: 'include',
              })
            } catch { /* non-fatal */ }
            const userInfo = {
              id: data.user.id,
              email: data.user.email || email,
              name: name || (data.user as any).user_metadata?.name || email.split('@')[0],
              isAdmin: email === process.env.NEXT_PUBLIC_ADMIN_EMAIL,
            }
            const sessionData = {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at || 0,
            }
            localStorage.setItem('rise-auth', JSON.stringify(sessionData))
            localStorage.setItem('rise-user-info', JSON.stringify(userInfo))
            onLogin({ user: userInfo, session: sessionData })
          }
        }
        return
      }

      // MODE 2: Mock/dev (no Supabase env vars)
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const body = mode === 'login'
        ? { email, password }
        : { email, password, name }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'حدث خطأ')
        setLoading(false)
        return
      }

      if (data.needsConfirmation) {
        setError('تم إرسال رابط تأكيد إلى بريدك الإلكتروني')
        setLoading(false)
        return
      }

      if (data.errorType === 'email_not_confirmed') {
        setError(data.error)
        setLoading(false)
        return
      }

      if (data.session) {
        localStorage.setItem('rise-auth', JSON.stringify(data.session))
        localStorage.setItem('rise-user-info', JSON.stringify(data.user))
        onLogin({ user: data.user, session: data.session })
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
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">RiseOS</h1>
            <p className="eyebrow mt-1.5">Life Operating System</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">امتلك صباحك. امتلك حياتك.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border mb-5 sm:mb-6" role="tablist">
            {[
              { id: 'login' as const, label: 'تسجيل الدخول' },
              { id: 'signup' as const, label: 'حساب جديد' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => { setMode(tab.id); setError('') }}
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

            {/* Password */}
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
            </div>

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
              disabled={loading || !email || !password || (mode === 'signup' && !name)}
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
          RiseOS v1.0 — صُنع بـ ❤️
        </p>
      </div>
    </div>
  )
}
