'use client'

// ============================================================
// account-card.tsx — المرحلة 18: بطاقة الحساب السريعة (حسابي)
//
// حسم UX_FOUNDATION §9/6: «حسابي» في شريط الجوال = بطاقة حساب
// سريعة (الاسم/المستوى/السلسلة/تسجيل خروج) ثم الإعدادات الكاملة —
// لا شاشة بروفايل منفصلة الآن.
//
// النمط: نفس لغة الإضافة السريعة — sheet سفلي على الجوال /
// بطاقة مركّزة على سطح المكتب (CSS خالص، بلا Vaul — سياسة
// المكتبات «الافتراضي لا»).
//
// البيانات: من المتجر فقط (user يمتلئ من نداء الشريط الجانبي
// /api/rise/dashboard) — لا نداء إضافي عند فتح البطاقة. خطة
// الاشتراك تُضاف عند توفر API خفيف مستقبلًا (موثّق في phase-18).
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import { X, Settings2, LogOut, Flame, Sparkles } from 'lucide-react'
import { useRiseStore } from '@/store/app-store'
import { getUserStorage } from '@/lib/user-storage'
import { AVATARS } from '@/lib/avatars'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function toArabicNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '١'
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

export function AccountCard({
  open, onClose, onLogout,
}: {
  open: boolean
  onClose: () => void
  /** يفتح حوار تأكيد الخروج في الصدفة — البطاقة لا تسجّل الخروج مباشرة */
  onLogout: () => void
}) {
  const user = useRiseStore((s) => s.user)
  const auth = useRiseStore((s) => s.auth)
  const setActiveModule = useRiseStore((s) => s.setActiveModule)
  const firstActionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { firstActionRef.current?.focus() }, 120)
    // (المرحلة 18: مستمع document بطور الالتقاط — نفس نمط الإضافة السريعة)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey, true)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true) }
  }, [open, onClose])

  // الأفاتار المختار — يُقرأ مرة عند التركيب (نفس نمط الشريط الجانبي:
  // قراءة تخزين داخل useMemo، بلا state — الإعدادات تبث rise:avatar-changed
  // لو تغيّر الأفاتار والبطاقة مفتوحة نادرة الحدوث)
  const avatarId = useMemo(() => {
    try { return getUserStorage('rise-user-avatar') || null } catch { return null }
  }, [])

  if (!open) return null

  const name = user?.name || auth?.userName || 'مستخدم أوج'
  const level = user?.level || 1
  const streak = user?.streak || 0
  const progress = user?.progress || 0
  const avatar = avatarId ? AVATARS.find((a) => a.id === avatarId) : undefined

  const goSettings = () => {
    onClose()
    setActiveModule('settings')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="حسابي"
    >
      {/* الخلفية */}
      <button
        type="button"
        aria-label="إغلاق بطاقة الحساب"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] cursor-default"
        tabIndex={-1}
      />

      {/* البطاقة */}
      <div
        className="relative w-full sm:max-w-sm glass rounded-t-3xl sm:rounded-3xl border border-border/60
                   animate-[sheetUp_0.22s_ease-out] sm:animate-[scaleIn_0.18s_ease-out]"
      >
        {/* مقبض السحب (جوال) */}
        <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">حسابي</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* الهوية — أفاتار + اسم + بريد */}
          <div className="flex items-center gap-3 mb-4">
            {avatar ? (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md shadow-gold/20 overflow-hidden shrink-0"
                style={avatar.style}
              >
                <span className="scale-75">{avatar.svg}</span>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center text-lg font-bold text-white shadow-md shrink-0">
                {String(name || 'م').charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate" dir="ltr">{auth?.userEmail}</p>
            </div>
          </div>

          {/* شرائح الهوية: مستوى + سلسلة */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-gold to-gold-light text-[10px] px-2.5 py-0.5 font-bold shadow-md shadow-gold/20 text-forest-dark">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              المستوى {toArabicNum(level)}
            </span>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 text-[10px] px-2.5 py-0.5 font-bold text-orange-500">
                <Flame className="w-3 h-3" aria-hidden="true" />
                {toArabicNum(streak)} أيام متتالية
              </span>
            )}
          </div>

          {/* شريط الخبرة المصغّر */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>الخبرة</span>
              <span dir="ltr">
                {toArabicNum(user?.currentXp || 0)} / {toArabicNum(user?.xpToNext || 100)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="تقدم المستوى"
            >
              <div
                className="h-full rounded-full bg-gradient-to-l from-gold to-gold-light transition-all duration-700"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          {/* الإجراءات */}
          <div className="space-y-2">
            <Button
              ref={firstActionRef}
              variant="outline"
              className="w-full h-11 justify-start gap-2"
              onClick={goSettings}
              aria-label="افتح الإعدادات الكاملة"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
              الإعدادات الكاملة
            </Button>
            <Button
              variant="ghost"
              className={cn(
                'w-full h-11 justify-start gap-2 text-destructive hover:text-destructive',
                'hover:bg-destructive/10',
              )}
              onClick={() => {
                onClose()
                onLogout()
              }}
              aria-label="تسجيل الخروج من أوج"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              تسجيل الخروج
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-3">
            بياناتك محفوظة على السحابة وتتزامن تلقائيًا
          </p>
        </div>
      </div>
    </div>
  )
}
