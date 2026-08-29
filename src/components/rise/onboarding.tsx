'use client'

/**
 * Onboarding v2 — شاشة تعريف غنية أول ما تدخل (طلب المستخدم: "طورها جدا وحسن شكلها").
 * 5 خطوات: ترحيب شخصي → يومك (الرحلة اليومية) → الوحدات → قاعدة المعارف والتحفيز → نصائح وبدء.
 * تدعم أسهم الكيبورد، وشريط تقدم علوي، وخلفيات متدرجة لكل خطوة.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRiseStore } from '@/store/app-store'
import { toast } from 'sonner'
import { RiseIcon, type RiseGlyph, type RiseHue } from '@/components/rise/icons'
import {
  Flame,
  BookOpen,
  Brain,
  Heart,
  Sparkles,
  Sun,
  Trophy,
  Zap,
  Award,
  Star,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Smartphone,
  Search,
  X,
  Rocket,
  Library,
  ListOrdered,
  Sunrise,
  Target,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'rise-onboarding-done'
const TOTAL_STEPS = 5

/* ═══════════════════════════════════════════════════════
   useOnboarding hook
   ═══════════════════════════════════════════════════════ */

export function useOnboarding() {
  const auth = useRiseStore((s) => s.auth)

  const showOnboarding = (() => {
    if (typeof window === 'undefined') return false
    if (!auth) return false
    return !localStorage.getItem(STORAGE_KEY)
  })()

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  return { showOnboarding, dismissOnboarding }
}

/* ═══════════════════════════════════════════════════════
   Step gradients + titles
   ═══════════════════════════════════════════════════════ */

const stepThemes: { gradient: string; accentText: string }[] = [
  { gradient: 'from-forest/10 via-lime/5 to-transparent', accentText: 'text-forest dark:text-lime' },
  { gradient: 'from-gold/10 via-gold/4 to-transparent', accentText: 'text-gold' },
  { gradient: 'from-emerald-accent/10 via-forest/4 to-transparent', accentText: 'text-emerald-accent' },
  { gradient: 'from-violet-accent/10 via-gold/4 to-transparent', accentText: 'text-violet-accent' },
  { gradient: 'from-rose-accent/10 via-forest/4 to-transparent', accentText: 'text-rose-accent' },
]

const stepTitles = [
  'أهلاً بك',
  'يومك مع Rise OS',
  'استكشف الوحدات',
  'قاعدة المعارف والتحفيز',
  'نصائح سريعة',
]

/* ═══════════════════════════════════════════════════════
   Step 1 — Welcome (personal + stats)
   ═══════════════════════════════════════════════════════ */

function WelcomeStep({ userName }: { userName?: string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-2">
      {/* Icon cluster */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-accent/25 via-forest/10 to-gold/25 blur-2xl scale-150" />
        <div className="relative grid grid-cols-3 grid-rows-3 gap-1 p-2">
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-forest/10 p-2.5 float" style={{ animationDelay: '0s' }}>
              <Target className="size-5 text-forest" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-emerald-accent/10 p-2.5 float" style={{ animationDelay: '0.2s' }}>
              <Sparkles className="size-5 text-emerald-accent" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-gold/10 p-2.5 float" style={{ animationDelay: '0.4s' }}>
              <Trophy className="size-5 text-gold" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-gold/10 p-2.5 float" style={{ animationDelay: '0.6s' }}>
              <Flame className="size-5 text-gold" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-2xl bg-forest dark:bg-lime p-4 shadow-glow">
              <Rocket className="size-7 text-paper-soft dark:text-ink" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-emerald-accent/10 p-2.5 float" style={{ animationDelay: '0.8s' }}>
              <Brain className="size-5 text-emerald-accent" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-emerald-accent/10 p-2.5 float" style={{ animationDelay: '1s' }}>
              <BookOpen className="size-5 text-emerald-accent" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-forest/10 p-2.5 float" style={{ animationDelay: '1.2s' }}>
              <Heart className="size-5 text-forest" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-forest/10 p-2.5 float" style={{ animationDelay: '1.4s' }}>
              <Library className="size-5 text-forest" />
            </div>
          </div>
        </div>
      </div>

      <div className="text-center space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold text-gradient-forest">
          {userName ? `أهلاً ${userName} 👋` : 'مرحباً بك في Rise OS'}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
          مش مجرد تطبيق مهام —{' '}
          <span className="font-semibold text-foreground">نظام كامل لامتلاك صباحك ويومك وحياتك</span>.
          خلينا نعرفك بسرعة على اللي جوه في 4 خطوات قصيرة.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {[
          { icon: LayersIcon, label: 'وحدة متكاملة', value: '+20' },
          { icon: Library, label: 'مقالة معارف من كتب', value: '+80' },
          { icon: Zap, label: 'نظام نقاط ومستويات', value: 'XP' },
        ].map((item) => (
          <div key={item.label} className="neo-card p-3 flex flex-col items-center gap-1.5 text-center">
            <div className="rounded-lg bg-emerald-accent/10 p-2">
              <item.icon className="size-4 text-emerald-accent" />
            </div>
            <span className="text-sm font-bold text-forest dark:text-lime num" dir="ltr">{item.value}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Small wrapper to avoid another direct lucide import duplication */
function LayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 2 — Your Day (the daily journey)
   ═══════════════════════════════════════════════════════ */

const dayJourney = [
  {
    glyph: 'sunrise' as RiseGlyph,
    hue: 'amber' as RiseHue,
    time: 'الصبح',
    title: 'ابدأ بروتين صباحي',
    desc: 'تأكيدات، عادات صباحية، ودرجة صباح تحدد نبرة يومك',
  },
  {
    glyph: 'planner' as RiseGlyph,
    hue: 'cyan' as RiseHue,
    time: 'قبل الشغل',
    title: 'خطّط يومك في 5 دقايق',
    desc: 'رتب مهامك على اليوم في مخطط يومي بسيط وواضح',
  },
  {
    glyph: 'tasks' as RiseGlyph,
    hue: 'lime' as RiseHue,
    time: 'خلال اليوم',
    title: 'نفّذ وتابع لحظة بلحظة',
    desc: 'مهام، عادات ببومودورو وسلاسل — والداشبورد يتحدث فوراً',
  },
  {
    glyph: 'review' as RiseGlyph,
    hue: 'violet' as RiseHue,
    time: 'الليل',
    title: 'راجع وطوّر',
    desc: 'مراجعات أسبوعية وشهرية + تحليلات تعرفك على نفسك',
  },
]

function DayJourneyStep() {
  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-2">
        <span className="pill bg-gold/10 text-gold mb-1">
          <Sun className="size-3 me-1" />
          الرحلة اليومية
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">يومك مع Rise OS — أربع محطات</h2>
        <p className="text-sm text-muted-foreground">ده الإيقاع اللي التطبيق بيمشي بيه معاك كل يوم</p>
      </div>

      {/* Vertical journey timeline */}
      <div className="relative max-w-sm mx-auto">
        {/* connecting line */}
        <div className="absolute top-4 bottom-4 start-[26px] w-0.5 bg-gradient-to-b from-gold via-emerald-accent to-violet-accent opacity-30" aria-hidden />
        <div className="space-y-3">
          {dayJourney.map((st, i) => (
            <div
              key={st.title}
              className="relative flex items-start gap-3 animate-[fadeSlideIn_0.35s_ease-out]"
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'both' }}
            >
              <div className="shrink-0 relative z-10">
                <RiseIcon glyph={st.glyph} hue={st.hue} size="md" lift />
              </div>
              <div className="flex-1 neo-card card-lift p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">{st.time}</span>
                  <span className="text-[9px] font-bold text-muted-foreground/50">الخطوة <span className="num" dir="ltr">{i + 1}</span></span>
                </div>
                <h4 className="text-sm font-bold mt-1.5">{st.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 3 — Modules (duotone icon wells)
   ═══════════════════════════════════════════════════════ */

const moduleShowcase: { glyph: RiseGlyph; hue: RiseHue; name: string; desc: string }[] = [
  { glyph: 'tasks', hue: 'blue', name: 'المهام', desc: 'مهام يومية + مهام مشاريع منفصلة' },
  { glyph: 'habits', hue: 'lime', name: 'العادات', desc: 'سلاسل وتذكيرات تثبت عاداتك' },
  { glyph: 'focus', hue: 'violet', name: 'العمل العميق', desc: 'جلسات تركيز وبومودورو' },
  { glyph: 'goals', hue: 'rose', name: 'الأهداف', desc: 'أهداف قابلة للقياس مع تقدم' },
  { glyph: 'journal', hue: 'cyan', name: 'اليوميات', desc: 'اكتب أفكارك وتابع مزاجك' },
  { glyph: 'health', hue: 'rose', name: 'الصحة', desc: 'نوم وماء وتمارين' },
  { glyph: 'finance', hue: 'lime', name: 'المالية', desc: 'ميزانية وادخار بذكاء' },
  { glyph: 'brain', hue: 'violet', name: 'الدماغ الثاني', desc: 'ملاحظات وربط أفكار' },
]

function ModulesStep() {
  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-2">
        <span className="pill bg-emerald-accent/10 text-emerald-accent mb-1">
          <LayersIcon className="size-3 me-1" />
          كل الوحدات
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">استكشف الوحدات</h2>
        <p className="text-sm text-muted-foreground">أكثر من 20 وحدة — دي أشهرها، والباقي اكتشفه بنفسك من القائمة الجانبية</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {moduleShowcase.map((mod, i) => (
          <div
            key={mod.name}
            className="animate-[fadeSlideIn_0.3s_ease-out]"
            style={{ animationDelay: `${i * 55}ms`, animationFillMode: 'both' }}
          >
            <div className="neo-card card-lift group p-3.5 text-center h-full">
              <div className="flex flex-col items-center gap-2">
                <RiseIcon glyph={mod.glyph} hue={mod.hue} size="md" lift />
                <h4 className="text-xs font-bold leading-tight">{mod.name}</h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{mod.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-gold" />
        كمان في: القراءة، التعلم، التقويم، الشغل، المشاريع، المراجعات، والتحليلات
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 4 — Knowledge Base highlight + Gamification
   ═══════════════════════════════════════════════════════ */

function KnowledgeStep() {
  return (
    <div className="space-y-4 py-2">
      <div className="text-center space-y-2">
        <span className="pill bg-violet-accent/10 text-violet-accent mb-1">
          <Library className="size-3 me-1" />
          الميزة المميزة
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">قاعدة المعارف — مدربك من الكتب</h2>
        <p className="text-sm text-muted-foreground">بدون أي ذكاء اصطناعي — خلاصات عملية من أشهر كتب التنمية والإنتاجية</p>
      </div>

      {/* KB feature card */}
      <div className="neo-card p-4 bg-gradient-to-l from-emerald-accent/10 via-transparent to-gold/10">
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <RiseIcon glyph="coach" hue="violet" size="lg" lift />
          </div>
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: ListOrdered, text: 'أزرار معروفة — تضغط وتأخذ خطوات جاهزة' },
                { icon: Library, text: '+80 مقالة من +40 كتاباً حقيقياً' },
                { icon: Search, text: 'بحث عربي ذكي يفهم الهمزات والتشكيل' },
                { icon: Sparkles, text: 'شارك معرفتك — أضف فائدة من عندك' },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <f.icon className="size-3.5 text-forest dark:text-lime shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-snug text-muted-foreground">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gamification */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-center text-gold flex items-center justify-center gap-1.5">
          <Star className="size-3.5" />
          ونظام تحفيز يخلّيك تكمل
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: Zap, label: 'نقاط XP', desc: 'من كل نشاط تنجزه' },
            { icon: Trophy, label: 'مستويات', desc: 'تتقدم كل ما تكمل' },
            { icon: Flame, label: 'سلاسل', desc: 'لا تكسر استمراريتك' },
            { icon: Award, label: 'شارات', desc: 'اجمع الإنجازات' },
          ].map((item, i) => (
            <div
              key={item.label}
              className="animate-[fadeSlideIn_0.3s_ease-out]"
              style={{ animationDelay: `${300 + i * 60}ms`, animationFillMode: 'both' }}
            >
              <div className="neo-card card-lift p-3 text-center">
                <div className="space-y-1.5">
                  <item.icon className="size-5 text-gold mx-auto" />
                  <p className="text-xs font-semibold leading-tight">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 5 — Quick Tips + CTA
   ═══════════════════════════════════════════════════════ */

const keyboardShortcuts = [
  { keys: ['Ctrl', 'K'], desc: 'فتح البحث السريع عن أي شيء' },
  { keys: ['Esc'], desc: 'إغلاق القوائم والنوافذ' },
]

function QuickTipsStep() {
  return (
    <div className="space-y-4 py-2">
      <div className="text-center space-y-2">
        <span className="pill bg-forest/10 text-forest mb-1">
          <Keyboard className="size-3 me-1" />
          نصائح سريعة
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">جاهز تنطلق؟</h2>
        <p className="text-sm text-muted-foreground">حاجات صغيرة هتفرق معاك كل يوم</p>
      </div>

      {/* Tips row */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="neo-card card-lift p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
            <Keyboard className="size-4 text-forest" />
            اختصارات
          </h3>
          <div className="space-y-2.5">
            {keyboardShortcuts.map((shortcut) => (
              <div key={shortcut.desc} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{shortcut.desc}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <kbd className="inline-flex items-center rounded-md border bg-muted/50 px-2 py-0.5 text-[10px] font-mono font-medium text-foreground shadow-sm">
                        {key}
                      </kbd>
                      {i < shortcut.keys.length - 1 && <span className="text-muted-foreground text-[10px]">+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neo-card card-lift p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
            <Smartphone className="size-4 text-emerald-accent" />
            على موبايلك
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            ثبّت Rise OS كتطبيق من قائمة المتصفح (&quot;تثبيت التطبيق&quot;) — وتشتغل حتى بلا إنترنت، والإشعارات توصلك في وقتها.
          </p>
        </div>
      </div>

      {/* First-day suggestion */}
      <div className="neo-card p-4 bg-gradient-to-l from-gold/10 to-transparent">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Sunrise className="size-4 text-gold" />
          </div>
          <div>
            <h4 className="text-sm font-bold">اقتراح لأول يوم</h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              ابدأ بالروتين الصباحي، ثم أضف 3 مهام بس في المخطط، واكمل عادة واحدة — لما تخلصهم هتلاقي الداشبورد احتفل بيك 🔥
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center pt-1 animate-[fadeSlideUp_0.5s_ease-out_0.2s_both]">
        <div className="inline-flex flex-col items-center gap-2.5">
          <div className="relative">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-forest via-gold to-glass opacity-20 blur-md" />
            <Button
              size="lg"
              className="relative bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg rounded-xl px-8 text-base font-semibold"
            >
              <Rocket className="size-5 me-2" />
              يلا نبدأ
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            أول خطوة صغيرة النهاردة &gt; خطة كبيرة بكره
          </p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Onboarding Component
   ═══════════════════════════════════════════════════════ */

export default function Onboarding() {
  const auth = useRiseStore((s) => s.auth)
  const [currentStep, setCurrentStep] = useState(0)
  const [open, setOpen] = useState(false)
  const hasShownRef = useRef(false)

  useEffect(() => {
    if (hasShownRef.current || !auth) return
    hasShownRef.current = true
    if (!localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setOpen(true), 400)
      return () => clearTimeout(timer)
    }
  }, [auth])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
    toast.success('مرحباً بك! ابدأ استكشاف Rise OS 🚀')
  }, [])

  const handleNext = useCallback(() => {
    setCurrentStep((s) => {
      if (s < TOTAL_STEPS - 1) return s + 1
      handleDismiss()
      return s
    })
  }, [handleDismiss])

  const handlePrev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1))
  }, [])

  const handleSkip = useCallback(() => {
    handleDismiss()
  }, [handleDismiss])

  /* Keyboard: arrows + Enter to advance */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { handleNext() }
      else if (e.key === 'ArrowRight') { handlePrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleNext, handlePrev])

  const isLastStep = currentStep === TOTAL_STEPS - 1
  const isFirstStep = currentStep === 0
  const theme = stepThemes[currentStep]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss() }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'sm:max-w-2xl max-h-[92vh] overflow-y-auto neo-scroll p-0 border border-border bg-card shadow-lift',
          'bg-gradient-to-b',
          theme.gradient
        )}
        dir="rtl"
      >
        {/* Accessibility */}
        <DialogTitle className="sr-only">
          مرحباً بك في Rise OS — الخطوة {currentStep + 1} من {TOTAL_STEPS}: {stepTitles[currentStep]}
        </DialogTitle>
        <DialogDescription className="sr-only">
          جولة تعريفية سريعة بوحدات وميزات Rise OS
        </DialogDescription>

        {/* Top progress bar */}
        <div className="h-1.5 bg-muted/60 rounded-t-2xl overflow-hidden" aria-hidden>
          <div
            className="h-full bg-gradient-to-l from-forest via-emerald-accent to-lime transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Header row: step pill + skip */}
        <div className="px-6 pt-4 flex items-center justify-between">
          <span className="pill pill-muted text-[10px] gap-1.5">
            <span className="num" dir="ltr">{currentStep + 1}</span> / <span className="num" dir="ltr">{TOTAL_STEPS}</span>
            <span className="text-muted-foreground/60">—</span>
            {stepTitles[currentStep]}
          </span>
          <button
            onClick={handleSkip}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1 text-xs"
            aria-label="تخطي التعريف"
          >
            تخطي
            <X className="size-3.5" />
          </button>
        </div>

        {/* Step content with animation */}
        <div
          key={currentStep}
          className="animate-[fadeSlideIn_0.3s_ease-out] px-5 sm:px-6 pt-3 pb-2"
        >
          {currentStep === 0 ? (
            <WelcomeStep userName={auth?.userName} />
          ) : currentStep === 1 ? (
            <DayJourneyStep />
          ) : currentStep === 2 ? (
            <ModulesStep />
          ) : currentStep === 3 ? (
            <KnowledgeStep />
          ) : (
            <QuickTipsStep />
          )}
        </div>

        {/* Footer: dots + navigation */}
        <div className="px-5 sm:px-6 pb-5 pt-2 space-y-4">
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                aria-label={`الخطوة ${i + 1}`}
                className={cn(
                  'h-2 rounded-full transition-all duration-400 ease-out',
                  i === currentStep
                    ? 'w-8 bg-forest dark:bg-lime'
                    : i < currentStep
                      ? 'w-2 bg-forest/50 dark:bg-lime/50'
                      : 'w-2 bg-foreground/15 hover:bg-foreground/25'
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="text-muted-foreground"
            >
              <ChevronRight className="size-4 me-1" />
              السابق
            </Button>

            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              استخدم <kbd className="px-1.5 py-0.5 rounded border bg-muted/50 font-mono text-[9px]">←</kbd>
              للتنقل
            </span>

            <Button
              size="sm"
              onClick={handleNext}
              className="min-w-[96px] bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
            >
              {isLastStep ? (
                <>
                  <Rocket className="size-3.5 me-1" />
                  يلا نبدأ
                </>
              ) : (
                <>
                  التالي
                  <ChevronLeft className="size-4 ms-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
