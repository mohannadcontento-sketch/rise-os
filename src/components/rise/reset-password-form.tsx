'use client'

import { useState } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ============================================================
// فورم تعيين كلمة المرور الجديدة (الجزء العميل من /reset-password)
// يصل إليه المستخدم فقط عبر /auth/callback برابط استعادة حقيقي —
// الحماية على السيرفر (server guard) في صفحة /reset-password.
// يرسل newPassword إلى /api/auth/update-password (flow recovery —
// الإثبات هو marker الجلسة المنشأة من رابط البريد + الجلسة الحية).
// بعد النجاح تُبطل كل الجلسات ويعود المستخدم لتسجيل الدخول.
// ============================================================

export default function ResetPasswordForm() {
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
        if (res.status === 401) {
          // انتهت جلسة الاستعادة (10 دقائق) — أعد التوجيه لحالة منتهية.
          window.location.href = '/reset-password?state=expired'
          return
        }
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

  if (done) {
    return (
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
    )
  }

  return (
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
            autoFocus
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
        <p className="text-xs text-muted-foreground mt-1.5">8 أحرف على الأقل — اجمع بين حروف وأرقام.</p>
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

      <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
        لأمانك، جلسة الاستعادة صالحة 10 دقائق من فتح الرابط.
        <button
          type="button"
          onClick={() => { window.location.href = '/app' }}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 w-full mt-1 text-xs"
        >
          <ArrowLeft className="w-3 h-3" />
          العودة دون التغيير
        </button>
      </p>
    </form>
  )
}
