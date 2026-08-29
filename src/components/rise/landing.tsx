"use client";

/**
 * RiseOS — Landing Page (Neo design language)
 * ------------------------------------------------------------
 * Same token world as the app: Day "Dawn Paper" / Night "Obsidian Aurora".
 * Built entirely from the app's own components (KpiTile, ActivityRing,
 * HeartbeatChart, RainbowCheckbox, BoltBadge, ComicButton, RiseIcon wells)
 * so the landing previews the REAL product feel, day and night.
 *
 * Sections: glass nav · hero with live product mock · stats · features grid
 * · 24-module marquee · day/night showcase · steps · FAQ · final CTA · footer
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RiseIcon, MODULE_ICONS, type RiseGlyph, type RiseHue } from "@/components/rise/icons";
import {
  ComicButton,
  ActivityRing,
  HeartbeatChart,
  RainbowCheckbox,
  BoltBadge,
} from "@/components/rise/kit-v2";
import { KpiTile, Pill, LiveBadge, ThemeToggle } from "@/components/rise/neo";
import { cn } from "@/lib/utils";

/* ============================================================
   Reveal-on-scroll (IntersectionObserver → .reveal-in)
   ============================================================ */
function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("landing-reveal", seen && "landing-reveal-in", className)}
    >
      {children}
    </Tag>
  );
}

/* ============================================================
   Brand mark — lime bolt well + wordmark
   ============================================================ */
function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="icon-well iw-lime h-10 w-10">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <path
            d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-xl font-black tracking-tight text-foreground">RiseOS</span>
      )}
    </span>
  );
}

/* ============================================================
   1) Glass nav
   ============================================================ */
function LandingNav() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "landing-nav-scrolled" : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" aria-label="RiseOS — الرئيسية">
          <BrandMark />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="أقسام الصفحة">
          {[
            ["#features", "المميزات"],
            ["#modules", "الوحدات"],
            ["#modes", "النهار والليل"],
            ["#faq", "الأسئلة"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeToggle className="scale-90" />
          <ComicButton tone="lime" onClick={() => router.push("/app")} className="!px-4 !py-2 !text-sm">
            ابدأ الآن
          </ComicButton>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   2) Hero — headline + live product mock built from real parts
   ============================================================ */
function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      {/* aurora glow behind the mock */}
      <div className="landing-hero-glow" />

      {/* main mini-dashboard */}
      <div className="neo-card relative z-10 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <Pill tone="muted">يومك في لمحة</Pill>
          <LiveBadge />
        </div>

        <KpiTile
          label="إنتاجية الأسبوع"
          value="٨٤٪"
          delta="+١٢٪"
          deltaDir="up"
          spark={[35, 52, 41, 66, 58, 74, 84]}
          sparkTone="lime"
        />

        <div className="space-y-2.5 rounded-2xl border border-border/70 bg-surface-2 p-3.5">
          <p className="eyebrow-ar">عادات الصباح</p>
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
            <span>قراءة ٢٠ صفحة</span>
            <RainbowCheckbox checked onChange={() => {}} label="قراءة" />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground">
            <span>رياضة ١٥ دقيقة</span>
            <RainbowCheckbox checked={false} onChange={() => {}} label="رياضة" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <ActivityRing percent={84} size={84} label="٨٤٪" />
          <HeartbeatChart
            values={[62, 71, 58, 80, 66, 90, 74]}
            className="h-16 flex-1"
          />
        </div>
      </div>

      {/* floating XP badge */}
      <div className="landing-float z-20 absolute -top-5 left-[-14px]" style={{ animationDelay: "0.8s" }}>
        <BoltBadge value="+١٢٠ XP" />
      </div>

      {/* floating success toast */}
      <div className="landing-float z-20 absolute -bottom-6 right-[-10px]" style={{ animationDelay: "1.6s" }}>
        <div className="neo-card flex items-center gap-2.5 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-ink shadow-[0_0_16px_-2px_var(--lime)]">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="text-right">
            <p className="text-sm font-extrabold text-foreground">أنجزت روتينك! 🔥</p>
            <p className="text-xs text-muted-foreground">١٢ يومًا متتاليًا</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const router = useRouter();
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10">
        {/* copy */}
        <div className="text-center lg:text-right">
          <Reveal>
            <Pill tone="lime" className="mb-5 !px-4 !py-1.5 !text-sm">
              ⚡ نظام تشغيل حياتك الشخصي
            </Pill>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="font-display text-[2.6rem] font-black leading-[1.15] text-foreground sm:text-6xl">
              امتلك صباحك.
              <br />
              <span className="relative inline-block text-foreground">
                امتلك حياتك.
                <span className="absolute inset-x-0 -bottom-1 -z-10 h-3.5 rounded-full bg-lime/70 dark:bg-lime/40" />
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground lg:mx-0">
              مهام، عادات، أهداف، عمل عميق، صحة، مالية وتعلّم — كل حياتك في مكان واحد،
              بالعربي بالكامل، ويعمل حتى بدون إنترنت.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
              <ComicButton tone="lime" onClick={() => router.push("/app")} className="!px-7 !py-3 !text-lg">
                ابدأ رحلتك مجانًا
              </ComicButton>
              <a
                href="#features"
                className="rounded-xl border-2 border-border px-6 py-3 text-base font-extrabold text-foreground transition-all hover:-translate-y-0.5 hover:border-foreground/30"
              >
                استكشف المميزات
              </a>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground lg:justify-start">
              <span>✓ مجاني للبداية</span>
              <span>✓ بدون بطاقة بنكية</span>
              <span>✓ بياناتك ملكك وحدك</span>
            </p>
          </Reveal>
        </div>

        {/* live product mock */}
        <Reveal delay={200} className="lg:justify-self-end">
          <HeroMock />
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   3) Stats strip
   ============================================================ */
const STATS: [string, string, string][] = [
  ["٢٤+", "موديول متكامل", "كل جوانب حياتك"],
  ["١٠٠٪", "عربي و RTL", "مكتوب ليك أصلًا"],
  ["أوفلاين", "يعمل بدون نت", "PWA كاملة"],
  ["ليل ونهار", "وضعان مختلفان", "Aurora & Dawn"],
];

function Stats() {
  return (
    <section className="border-y border-border/60 bg-surface-2/60">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
        {STATS.map(([big, label, sub], i) => (
          <Reveal key={label} delay={i * 70} className="text-center">
            <p className="num text-3xl font-black text-foreground sm:text-4xl">{big}</p>
            <p className="mt-1 text-sm font-extrabold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   4) Features grid — six pillars, Neo duotone wells
   ============================================================ */
const FEATURES: { glyph: RiseGlyph; hue: RiseHue; title: string; desc: string }[] = [
  {
    glyph: "tasks",
    hue: "blue",
    title: "مهام وعادات تصنع الفرق",
    desc: "نظام مهام ذكي مع عادات يومية، سلاسل إنجاز، وتذكيرات ذكية لا تدعك تنقطع.",
  },
  {
    glyph: "focus",
    hue: "violet",
    title: "عمل عميق بلا تشتيت",
    desc: "مؤقتات بومودورو، جلسات تركيز بصوتيات محيطية، وإحصائيات ساعات عملك الحقيقية.",
  },
  {
    glyph: "projects",
    hue: "violet",
    title: "أهداف ومشاريع حقيقية",
    desc: "حوّل أحلامك لمشاريع بخطوات واضحة، تابع تقدمها، واحتفل بكل إنجاز.",
  },
  {
    glyph: "health",
    hue: "rose",
    title: "صحة ونوم وطاقة",
    desc: "تابع نومك، ماءك، رياضتك وطاقتك اليومية — لأن الإنتاجية تبدأ من جسمك.",
  },
  {
    glyph: "finance",
    hue: "lime",
    title: "مالية وميزانية واعية",
    desc: "دخلك، مصاريفك، وميزانياتك في لوحة واحدة تحسب لك كل قرش بالجنيه المصري.",
  },
  {
    glyph: "brain",
    hue: "cyan",
    title: "تعلّم ودماغ ثانٍ",
    desc: "ملخصات قراءاتك، معارفك المرتبطة، ومذكراتك اليومية — ذاكرتك الخارجية.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <Reveal className="text-center">
        <Pill tone="lime" className="mb-4">المميزات</Pill>
        <h2 className="font-display text-3xl font-black text-foreground sm:text-5xl">
          كل حياتك في نظام واحد
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          مش مجرد تطبيق مهام — ده نظام تشغيل كامل لحياتك بُني من الصفر بالعربي.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 60}>
            <article className="neo-card card-lift group h-full p-6">
              <RiseIcon glyph={f.glyph} hue={f.hue} size="lg" lift />
              <h3 className="mt-4 text-lg font-extrabold text-foreground">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{f.desc}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   5) Modules marquee — all 24 modules, infinite RTL scroll
   ============================================================ */
const MODULE_AR: Record<string, string> = {
  dashboard: "لوحة التحكم",
  morning: "الروتين الصباحي",
  planner: "المخطط",
  "daily-planner": "المخطط اليومي",
  tasks: "المهام",
  projects: "المشاريع",
  goals: "الأهداف",
  habits: "العادات",
  "habit-reminders": "التذكيرات",
  reading: "القراءة",
  brain: "الدماغ الثاني",
  "second-brain": "الدماغ الثاني",
  journal: "المذكرات",
  health: "الصحة",
  deepwork: "العمل العميق",
  "deep-work": "العمل العميق",
  focus: "التركيز",
  learning: "التعلم",
  work: "العمل",
  finance: "المالية",
  calendar: "التقويم",
  analytics: "التحليلات",
  "monthly-review": "المراجعة الشهرية",
  "weekly-review": "المراجعة الأسبوعية",
  notifications: "الإشعارات",
  "ai-coach": "المدرب الذكي",
  "admin-panel": "الإدارة",
  admin: "الإدارة",
  settings: "الإعدادات",
};

const MARQUEE_KEYS = [
  "morning", "planner", "tasks", "projects", "goals", "habits", "reading",
  "second-brain", "journal", "health", "deep-work", "work", "finance",
  "calendar", "analytics", "weekly-review", "ai-coach", "learning",
];

function ModulesMarquee() {
  const items = [...MARQUEE_KEYS, ...MARQUEE_KEYS];
  return (
    <section id="modules" className="overflow-hidden border-y border-border/60 py-14">
      <Reveal className="mx-auto mb-8 max-w-6xl px-4 text-center sm:px-6">
        <Pill tone="info" className="mb-4">٢٤ موديول</Pill>
        <h2 className="font-display text-3xl font-black text-foreground sm:text-4xl">
          وحدة لكل شيء يهمك
        </h2>
      </Reveal>

      <div className="landing-marquee group" dir="ltr">
        <div className="landing-marquee-track">
          {items.map((key, i) => {
            const m = MODULE_ICONS[key];
            if (!m) return null;
            return (
              <span key={`${key}-${i}`} className="landing-marquee-chip" dir="rtl">
                <RiseIcon glyph={m.glyph} hue={m.hue} size="sm" />
                <span className="whitespace-nowrap text-sm font-bold text-foreground">
                  {MODULE_AR[key] ?? key}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   6) Day / Night showcase — two literal mini-worlds (fixed palettes)
   ============================================================ */
function ModeCard({ mode }: { mode: "day" | "night" }) {
  const day = mode === "day";
  return (
    <div
      className="relative overflow-hidden rounded-3xl border-2 p-6 transition-transform duration-500 hover:-translate-y-1.5"
      style={{
        background: day ? "#F4F2EA" : "#070B14",
        borderColor: day ? "#DDD7C6" : "#1D2B47",
      }}
    >
      {/* aurora blobs */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: day
            ? "radial-gradient(ellipse 60% 45% at 85% 0%, rgba(201,154,62,0.14), transparent 60%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(27,52,43,0.10), transparent 55%)"
            : "radial-gradient(ellipse 60% 45% at 85% 0%, rgba(124,108,255,0.25), transparent 60%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(34,211,238,0.14), transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold"
            style={{ background: "#D6FF3D", color: "#0B1015" }}
          >
            {day ? "☀️ النهار" : "🌙 الليل"}
          </span>
          <span
            className="text-xs font-bold"
            style={{ color: day ? "#5A6A60" : "#9AAECB" }}
          >
            {day ? "Dawn Paper" : "Obsidian Aurora"}
          </span>
        </div>

        <p
          className="font-display mt-4 text-2xl font-black"
          style={{ color: day ? "#0B1015" : "#F2F5F7" }}
        >
          {day ? "ورق دافئ وغابة هادية" : "أوبسيديان متوهج وشفق بنفسجي"}
        </p>

        {/* fake ui lines */}
        <div className="mt-5 space-y-2.5">
          <div
            className="h-3 w-3/4 rounded-full"
            style={{ background: day ? "#DDD7C6" : "#1D2B47" }}
          />
          <div
            className="h-3 w-1/2 rounded-full"
            style={{ background: day ? "#E8EDF2" : "#16213A" }}
          />
        </div>

        <div className="mt-5 flex items-center gap-2.5">
          <span
            className="num rounded-xl px-3 py-2 text-lg font-black"
            style={{ background: "#D6FF3D", color: "#0B1015", boxShadow: day ? "3px 3px 0 rgba(11,16,21,0.85)" : "0 0 18px -2px rgba(214,255,61,0.5)" }}
          >
            ٨٤٪
          </span>
          <div className="flex flex-1 items-end gap-1.5" style={{ height: 40 }}>
            {[35, 55, 42, 70, 60, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md"
                style={{
                  height: `${h}%`,
                  background: day ? "rgba(27,52,43,0.28)" : "rgba(214,255,61,0.55)",
                  boxShadow: day ? "none" : "0 0 8px rgba(214,255,61,0.25)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Modes() {
  return (
    <section id="modes" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <Reveal className="text-center">
        <Pill tone="muted" className="mb-4">نهار وليل</Pill>
        <h2 className="font-display text-3xl font-black text-foreground sm:text-5xl">
          وضعان مختلفان تمامًا
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          مش مجرد عكس ألوان — النهار ورق صباحي دافئ، والليل عالم أوبسيديان متوهج بشفق بنفسجي.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <Reveal delay={60}><ModeCard mode="day" /></Reveal>
        <Reveal delay={140}><ModeCard mode="night" /></Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   7) How it works — three steps
   ============================================================ */
const STEPS: [string, string, string][] = [
  ["١", "أنشئ حسابك في دقيقة", "إيميل وكلمة سر وبس — من غير بطاقة ولا تعقيد."],
  ["٢", "فعّل روتينك وعاداتك", "اختار عاداتك اليومية وأهدافك، وحدد ميزانيتك وصحتك."],
  ["٣", "شاهد حياتك تتقدم", "إحصائيات يومية، سلاسل إنجاز، ومراجعات أسبوعية تريك الفرق."],
];

function Steps() {
  return (
    <section className="border-y border-border/60 bg-surface-2/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-black text-foreground sm:text-4xl">
            تبدأ في ٣ خطوات
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map(([n, title, desc], i) => (
            <Reveal key={n} delay={i * 90} className="text-center">
              <span
                className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border-2 border-ink bg-lime text-2xl font-black text-ink"
                style={{ boxShadow: "4px 4px 0 rgba(11,16,21,0.85)" }}
              >
                {n}
              </span>
              <h3 className="mt-4 text-lg font-extrabold text-foreground">{title}</h3>
              <p className="mx-auto mt-2 max-w-xs leading-relaxed text-muted-foreground">{desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   8) FAQ — native details/summary, styled
   ============================================================ */
const FAQS: [string, string][] = [
  ["هل RiseOS مجاني؟", "تقدر تبدأ وتجرب كل الموديولات مجانًا. خطط مدفوعة اختيارية لو حبيت تدعم التطوير وتحصل على مزايا إضافية."],
  ["هل بياناتي آمنة؟", "بياناتك مشفّرة ومحمية بمصادقة Supabase، وخصوصيتك أولوية — بياناتك ملكك وحدك ولا تُشارك مع أي طرف ثالث."],
  ["هل يعمل بدون إنترنت؟", "أيوة — RiseOS تطبيق PWA كامل: ثبّته على موبايلك واشتغل براحتك، وبياناتك بتتزامن تلقائيًا لما يرجع النت."],
  ["هل التطبيق عربي بالكامل؟", "مكتوب ومصمم عربي من أول سطر — واجهة RTL أصلية، أرقام عربية، وخطوط مختارة بعناية للعربي."],
];

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <Reveal className="text-center">
        <Pill tone="muted" className="mb-4">الأسئلة الشائعة</Pill>
        <h2 className="font-display text-3xl font-black text-foreground sm:text-4xl">
          أسئلة بتتكرر كتير
        </h2>
      </Reveal>

      <div className="mt-10 space-y-3">
        {FAQS.map(([q, a], i) => (
          <Reveal key={q} delay={i * 60}>
            <details className="landing-faq group">
              <summary className="landing-faq-q">
                <span className="font-extrabold text-foreground">{q}</span>
                <span className="landing-faq-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <p className="px-5 pb-5 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   9) Final CTA + 10) Footer
   ============================================================ */
function FinalCta() {
  const router = useRouter();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <Reveal>
        <div className="landing-cta relative overflow-hidden rounded-[2rem] border-2 border-ink/10 p-10 text-center sm:p-14">
          <div className="landing-cta-glow" />
          <div className="relative">
            <h2 className="font-display mx-auto max-w-2xl text-3xl font-black text-foreground sm:text-5xl">
              جاهز تمتلك صباحك؟
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              انضم لرحلة RiseOS ودوّر حياتك صفحة جديدة — تبدأ في أقل من دقيقة.
            </p>
            <div className="mt-8 flex justify-center">
              <ComicButton tone="lime" onClick={() => router.push("/app")} className="!px-8 !py-3.5 !text-lg">
                ابدأ رحلتك الآن ⚡
              </ComicButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const router = useRouter();
  return (
    <footer className="border-t border-border/60 bg-surface-2/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:px-6 md:flex-row">
        <BrandMark />
        <p className="text-sm text-muted-foreground">امتلك صباحك. امتلك حياتك.</p>
        <nav className="flex items-center gap-5 text-sm font-bold" aria-label="روابط التذييل">
          <button onClick={() => router.push("/app")} className="text-muted-foreground transition-colors hover:text-foreground">
            التطبيق
          </button>
          <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">المميزات</a>
          <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">الأسئلة</a>
        </nav>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        RiseOS © {new Date().getFullYear()} — صُنع بشغف للمستخدم العربي
      </p>
    </footer>
  );
}

/* ============================================================
   Export — page composition
   ============================================================ */
export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <Hero />
      <Stats />
      <Features />
      <ModulesMarquee />
      <Modes />
      <Steps />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
