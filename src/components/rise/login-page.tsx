'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Mail, Lock, User, Eye, EyeOff, Sparkles, Shield, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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
    setLoading(true)

    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const body = mode === 'login'
        ? { email, password }
        : { email, password, name }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" dir="rtl">
      {/* Animated background */}
      <div className="absolute inset-0 gradient-bg" />
      <div className="absolute inset-0 noise-bg opacity-20" />

      {/* Floating orbs */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className={cn(
            'absolute rounded-full blur-3xl opacity-20',
            i % 2 === 0 ? 'bg-emerald-accent' : 'bg-gold'
          )}
          style={{
            width: 200 + i * 100,
            height: 200 + i * 100,
            top: `${20 + i * 15}%`,
            left: `${10 + i * 20}%`,
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{
            duration: 15 + i * 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="glass rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <motion.div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-accent via-forest to-emerald-accent flex items-center justify-center shadow-lg shadow-emerald-accent/30 mb-4"
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Zap className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-gradient-forest">RiseOS</h1>
            <p className="text-sm text-muted-foreground mt-1">نظام حياتك التشغيلي</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-6">
            {[
              { id: 'login' as const, label: 'تسجيل الدخول' },
              { id: 'signup' as const, label: 'حساب جديد' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id); setError('') }}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
                  mode === tab.id
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === 'signup' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'signup' ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Name (signup only) */}
              <AnimatePresence>
                {mode === 'signup' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Label htmlFor="name" className="text-sm font-medium mb-1.5 block">الاسم</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="اسمك الكريم"
                        className="pr-10 h-11 rounded-xl bg-background/50 border-border/50 focus:border-emerald-accent/50"
                        dir="rtl"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email */}
              <div>
                <Label htmlFor="email" className="text-sm font-medium mb-1.5 block">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="pr-10 h-11 rounded-xl bg-background/50 border-border/50 focus:border-emerald-accent/50"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="password" className="text-sm font-medium mb-1.5 block">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10 pl-10 h-11 rounded-xl bg-background/50 border-border/50 focus:border-emerald-accent/50"
                    dir="ltr"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3 text-center"
                  >
                    <p>{error}</p>
                    {(error.includes('تأكيد') || error.includes('لم يتم تأكيده')) && (
                      <button
                        type="button"
                        disabled={resendLoading}
                        onClick={async () => {
                          setResendLoading(true)
                          try {
                            await fetch('/api/auth/resend', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email }),
                            })
                            setError('تم إعادة إرسال رابط التأكيد!')
                          } catch {
                            setError('فشل إعادة الإرسال')
                          }
                          setResendLoading(false)
                        }}
                        className="mt-2 text-xs text-emerald-accent hover:underline flex items-center gap-1 mx-auto"
                      >
                        {resendLoading ? (
                          <motion.div className="w-3 h-3 border border-emerald-accent/30 border-t-emerald-accent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        إعادة إرسال رابط التأكيد
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading || !email || !password || (mode === 'signup' && !name)}
                className={cn(
                  'w-full h-11 rounded-xl text-white font-medium transition-all',
                  'bg-gradient-to-br from-emerald-accent to-forest',
                  'hover:shadow-lg hover:shadow-emerald-accent/25',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading ? (
                  <motion.div
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
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
            </motion.form>
          </AnimatePresence>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs text-muted-foreground">أو</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* Guest mode */}
          <Button
            variant="ghost"
            className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={() => {
              const guestSession = {
                access_token: 'guest',
                refresh_token: 'guest',
                expires_at: 9999999999,
              }
              const guestUser = {
                id: 'guest',
                email: 'ضيف',
                isAdmin: false,
              }
              localStorage.setItem('rise-auth', JSON.stringify(guestSession))
              localStorage.setItem('rise-user-info', JSON.stringify(guestUser))
              onLogin({ user: guestUser, session: guestSession })
            }}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              متابعة كضيف
            </span>
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          RiseOS v1.0 — صُنع بـ ❤️
        </p>
      </motion.div>
    </div>
  )
}