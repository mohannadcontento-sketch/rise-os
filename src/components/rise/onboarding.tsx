'use client'

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
import {
  LayoutDashboard,
  CheckSquare,
  Target,
  Flame,
  BookOpen,
  Brain,
  GraduationCap,
  Heart,
  Wallet,
  CalendarDays,
  Network,
  Sparkles,
  BarChart3,
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
  ArrowUpRight,
  TrendingUp,
  RotateCcw,
  Layers,
  Rocket,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'rise-onboarding-done'
const TOTAL_STEPS = 5

/* ═══════════════════════════════════════════════════════
   Data — Module definitions
   ═══════════════════════════════════════════════════════ */

const coreModules = [
  { icon: LayoutDashboard, name: 'لوحة التحكم', desc: 'نظرة شاملة على يومك وإنتاجيتك', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
  { icon: CheckSquare, name: 'المهام', desc: 'إدارة المهام اليومية والمشاريع', color: 'text-forest', bg: 'bg-forest/10' },
  { icon: Target, name: 'الأهداف', desc: 'تتبع أهدافك وقياس تقدمك', color: 'text-gold', bg: 'bg-gold/10' },
  { icon: Flame, name: 'العادات', desc: 'بناء عادات يومية صحية ومستدامة', color: 'text-gold', bg: 'bg-gold/10' },
  { icon: BookOpen, name: 'اليوميات', desc: 'اكتب أفكارك وردد تجاربك', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
  { icon: Brain, name: 'العمل العميق', desc: 'جلسات تركيز مع مؤقت بومودورو', color: 'text-forest', bg: 'bg-forest/10' },
]

const growthModules = [
  { icon: BookOpen, name: 'القراءة', desc: 'تتبع كتبك واستخراج الأفكار', color: 'text-forest', bg: 'bg-forest/10' },
  { icon: GraduationCap, name: 'التعلم', desc: 'خطط تعلم شخصية ومسارات نمو', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
  { icon: Heart, name: 'الصحة', desc: 'تتبع التمارين والنوم والتغذية', color: 'text-rose-accent', bg: 'bg-rose-accent/10' },
  { icon: Wallet, name: 'المالية', desc: 'إدارة المصاريف والميزانية الشهرية', color: 'text-gold', bg: 'bg-gold/10' },
  { icon: CalendarDays, name: 'التقويم', desc: 'جدولة المواعيد والأحداث', color: 'text-forest', bg: 'bg-forest/10' },
  { icon: Network, name: 'الدماغ الثاني', desc: 'ملاحظات وربط الأفكار الذكي', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
]

const smartFeatures = [
  { icon: Sparkles, name: 'مدرب الذكاء الاصطناعي', desc: 'مساعد ذكي يقدم نصائح مخصصة بناءً على بياناتك وأدائك', color: 'text-gold', bg: 'bg-gold/10' },
  { icon: BarChart3, name: 'التحليلات', desc: 'رؤى عميقة وتقارير مفصلة عن إنتاجيتك وعاداتك', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
  { icon: TrendingUp, name: 'المراجعات', desc: 'مراجعات أسبوعية وشهرية لضمان استمرارية التقدم', color: 'text-forest', bg: 'bg-forest/10' },
  { icon: Sun, name: 'روتين الصباح', desc: 'بداية يوم مُنظمة مع تأكيدات إيجابية وتتبع صحي', color: 'text-gold', bg: 'bg-gold/10' },
]

const gamificationItems = [
  { icon: Zap, label: 'نقاط الخبرة (XP)', desc: 'اكسب نقاط من كل نشاط تقوم به' },
  { icon: Trophy, label: 'المستويات', desc: 'تقدم عبر المستويات كلما أكملت المهام' },
  { icon: Flame, label: 'السلاسل', desc: 'حافظ على سلسلتك اليومية لتحفيز الاستمرارية' },
  { icon: Award, label: 'الشارات', desc: 'اجمع شارات إنجاز لفتح ميزات جديدة' },
]

const keyboardShortcuts = [
  { keys: ['Ctrl', 'K'], desc: 'فتح البحث السريع' },
  { keys: ['Esc'], desc: 'إغلاق الشريط الجانبي' },
]

/* ═══════════════════════════════════════════════════════
   Step gradients
   ═══════════════════════════════════════════════════════ */

const stepGradients = [
  'from-forest/8 via-gold/4 to-transparent',
  'from-glass/8 via-forest/4 to-transparent',
  'from-gold/8 via-glass/4 to-transparent',
  'from-violet-accent/8 via-gold/4 to-transparent',
  'from-rose-accent/8 via-forest/4 to-transparent',
]

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
   Module Card sub-component
   ═══════════════════════════════════════════════════════ */

function ModuleCard({ icon: Icon, name, desc, color, bg }: {
  icon: React.ElementType
  name: string
  desc: string
  color: string
  bg: string
}) {
  return (
    <div className="neo-card card-lift group cursor-default p-4 text-center">
      <div className="flex flex-col items-center gap-2.5">
        <div className={cn('rounded-xl p-3', bg)}>
          <Icon className={cn('size-6', color)} />
        </div>
        <h4 className="text-sm font-semibold leading-tight">{name}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step indicator dots
   ═══════════════════════════════════════════════════════ */

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 rounded-full transition-all duration-500 ease-out',
            i === current
              ? 'w-8 bg-forest dark:bg-lime'
              : 'w-2 bg-foreground/15'
          )}
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 1 — Welcome
   ═══════════════════════════════════════════════════════ */

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Visual illustration with icons */}
      <div className="relative flex items-center justify-center">
        {/* Background glow ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-accent/20 via-forest/10 to-gold/20 blur-2xl scale-150" />

        {/* Main icon cluster */}
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
          {/* Center — Rise OS branding */}
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
              <Layers className="size-5 text-forest" />
            </div>
          </div>
        </div>
      </div>

      <div className="text-center space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold text-gradient-forest">
          مرحباً بك في Rise OS
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
          نظام إنتاجية شامل يضم{' '}
          <span className="pill pill-muted mx-0.5 font-semibold">
            <span className="num" dir="ltr">20</span> وحدة
          </span>{' '}
          متكاملة لإدارة كل جوانب حياتك — من المهام اليومية إلى الأهداف طويلة المدى
        </p>
      </div>

      {/* Quick stats */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        {[
          { icon: Layers, label: 'وحدة متكاملة', value: '20' },
          { icon: Brain, label: 'مدرب ذكي', value: 'AI' },
          { icon: Zap, label: 'نظام تقدم', value: 'XP' },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <div className="rounded-lg bg-emerald-accent/10 p-2">
              <item.icon className="size-4 text-emerald-accent" />
            </div>
            <span className="text-xs font-bold text-forest num" dir="ltr">{item.value}</span>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 2 — Core Modules
   ═══════════════════════════════════════════════════════ */

function CoreModulesStep() {
  return (
    <div className="space-y-5 py-4">
      <div className="text-center space-y-2">
        <span className="pill bg-forest/10 text-forest mb-2">
          <Layers className="size-3 me-1" />
          الوحدات الأساسية
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">أدواتك اليومية الأساسية</h2>
        <p className="text-sm text-muted-foreground">ستة وحدات تغطي كل ما تحتاجه يومياً</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {coreModules.map((mod, i) => (
          <div
            key={mod.name}
            className="animate-[fadeSlideIn_0.3s_ease-out]"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
          >
            <ModuleCard {...mod} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 3 — Growth Tools
   ═══════════════════════════════════════════════════════ */

function GrowthToolsStep() {
  return (
    <div className="space-y-5 py-4">
      <div className="text-center space-y-2">
        <span className="pill bg-gold/10 text-gold mb-2">
          <TrendingUp className="size-3 me-1" />
          أدوات النمو
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">استثمر في نفسك ونمِّ ذكاءك</h2>
        <p className="text-sm text-muted-foreground">أدوات لتنمية مهاراتك وصحتك ومعرفتك</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {growthModules.map((mod, i) => (
          <div
            key={mod.name}
            className="animate-[fadeSlideIn_0.3s_ease-out]"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
          >
            <ModuleCard {...mod} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Step 4 — Smart Features
   ═══════════════════════════════════════════════════════ */

function SmartFeaturesStep() {
  return (
    <div className="space-y-5 py-4">
      <div className="text-center space-y-2">
        <span className="pill bg-emerald-accent/10 text-emerald-accent mb-2">
          <Sparkles className="size-3 me-1" />
          ميزات ذكية
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">ذكاء وتحليلات ولعب</h2>
        <p className="text-sm text-muted-foreground">ميزات متقدمة تجعل رحلتك ممتعة وفعّالة</p>
      </div>

      {/* Feature cards */}
      <div className="space-y-3">
        {smartFeatures.map((feat, i) => (
          <div
            key={feat.name}
            className="animate-[fadeSlideIn_0.3s_ease-out]"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
          >
            <div className="neo-card card-lift p-4">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-xl p-2.5 shrink-0', feat.bg)}>
                  <feat.icon className={cn('size-5', feat.color)} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{feat.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Gamification section */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-center text-gold">
          <Star className="size-3.5 inline-block me-1 -mt-0.5" />
          نظام اللعب والتحفيز
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {gamificationItems.map((item, i) => (
            <div
              key={item.label}
              className="animate-[fadeSlideIn_0.3s_ease-out]"
              style={{ animationDelay: `${400 + i * 60}ms`, animationFillMode: 'both' }}
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
   Step 5 — Quick Tips
   ═══════════════════════════════════════════════════════ */

function QuickTipsStep() {
  return (
    <div className="space-y-5 py-4">
      <div className="text-center space-y-2">
        <span className="pill bg-forest/10 text-forest mb-2">
          <Keyboard className="size-3 me-1" />
          نصائح سريعة
        </span>
        <h2 className="text-xl sm:text-2xl font-bold">ابدأ بسرعة</h2>
        <p className="text-sm text-muted-foreground">اختصارات وميزات لمساعدتك على الاستفادة القصوى</p>
      </div>

      {/* Keyboard shortcuts */}
      <div className="neo-card card-lift p-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Keyboard className="size-4 text-forest" />
            اختصارات لوحة المفاتيح
          </h3>
          <div className="space-y-2.5">
            {keyboardShortcuts.map((shortcut) => (
              <div key={shortcut.desc} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{shortcut.desc}</span>
                <div className="flex items-center gap-1.5">
                  {shortcut.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <kbd className="inline-flex items-center rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-mono font-medium text-foreground shadow-sm">
                        {key}
                      </kbd>
                      {i < shortcut.keys.length - 1 && (
                        <span className="text-muted-foreground text-xs">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile & PWA */}
      <div className="neo-card card-lift p-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Smartphone className="size-4 text-emerald-accent" />
            دعم الجوال
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            يمكنك تثبيت Rise OS كتطبيق على جهازك المحمول والوصول إليه في أي وقت، حتى بدون اتصال بالإنترنت. فقط افتح القائمة واختر &quot;تثبيت التطبيق&quot;.
          </p>
        </div>
      </div>

      {/* Start now CTA */}
      <div className="text-center pt-2 animate-[fadeSlideUp_0.5s_ease-out_0.2s_both]">
        <div className="inline-flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-forest via-gold to-glass opacity-20 blur-md" />
            <Button
              size="lg"
              className="relative bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg rounded-xl px-8 text-base font-semibold"
            >
              <Rocket className="size-5 me-2" />
              ابدأ الآن
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            مستعد لبدء رحلتك نحو الإنتاجية؟
          </p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Onboarding Component
   ═══════════════════════════════════════════════════════ */

const stepComponents = [
  WelcomeStep,
  CoreModulesStep,
  GrowthToolsStep,
  SmartFeaturesStep,
  QuickTipsStep,
]

export default function Onboarding() {
  const auth = useRiseStore((s) => s.auth)
  const [currentStep, setCurrentStep] = useState(0)
  const [open, setOpen] = useState(false)
  const hasShownRef = useRef(false)

  useEffect(() => {
    if (hasShownRef.current || !auth) return
    hasShownRef.current = true
    if (!localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setOpen(true), 300)
      return () => clearTimeout(timer)
    }
  }, [auth])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
    toast.success('مرحباً بك! ابدأ استكشاف Rise OS 🚀')
  }, [])

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      handleDismiss()
    }
  }, [currentStep, handleDismiss])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    handleDismiss()
  }, [handleDismiss])

  const StepComponent = stepComponents[currentStep]
  const isLastStep = currentStep === TOTAL_STEPS - 1
  const isFirstStep = currentStep === 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss() }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 border border-border bg-card shadow-lift',
          'bg-gradient-to-b',
          stepGradients[currentStep]
        )}
        dir="rtl"
      >
        {/* Accessibility */}
        <DialogTitle className="sr-only">
          مرحباً بك في Rise OS — الخطوة {currentStep + 1} من {TOTAL_STEPS}
        </DialogTitle>
        <DialogDescription className="sr-only">
          معرفة تعريفية بوحدات وميزات Rise OS
        </DialogDescription>

        {/* Skip button (top-left in RTL = top-right visually) */}
        <button
          onClick={handleSkip}
          className="absolute top-4 end-4 z-10 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="تخطي التعريف"
        >
          <X className="size-4" />
        </button>

        {/* Step content with animation */}
        <div
          key={currentStep}
          className="animate-[fadeSlideIn_0.3s_ease-out] px-6 pt-6"
        >
          <StepComponent />
        </div>

        {/* Footer: Navigation + dots */}
        <div className="px-6 pb-6 pt-2 space-y-4">
          {/* Step dots */}
          <StepDots current={currentStep} total={TOTAL_STEPS} />

          {/* Buttons */}
          <div className="flex items-center justify-between gap-3">
            {/* Previous */}
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

            {/* Step counter */}
            <span className="text-xs text-muted-foreground num" dir="ltr">
              {currentStep + 1} / {TOTAL_STEPS}
            </span>

            {/* Next / Start */}
            <Button
              size="sm"
              onClick={handleNext}
              className="min-w-[90px] bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
            >
              {isLastStep ? (
                <>
                  <Rocket className="size-3.5 me-1" />
                  ابدأ
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