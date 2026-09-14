// ============================================================
// src/app/pricing/page.tsx — الأسعار (Beta: إعادة تصميم كاملة)
//
// طلب المالك: «صفحة الأسعار محتاجة تحسين في الشكل أكتر» — أعيد
// بناءها من غلاف LegalShell الضيق (max-w-3xl) إلى صفحة تسويقية
// كاملة العرض (max-w-6xl) بنفس هوية أوج البصرية:
//   • ترويسة لاصقة + بطل بحجم أكبر + شارات ثقة
//   • بطاقات باقات أغنى (توهج + تمييز «الأكثر قيمة» + تكبير)
//   • مقارنة سريعة + صف ضمانات + أسئلة الدفع
// كل المحتوى والوعود كما هي (نفس أرقام الخطط ونصوصها) — الشكل
// فقط. Server Component خالص (SEO + JSON-LD محفوظة حرفيًا).
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/rise/legal-shell";
import { SITE_URL, SITE_NAME, SUPPORT_EMAIL, pageOg, pageTwitter } from "@/lib/site";

export const metadata: Metadata = {
  title: "الأسعار والباقات | أوج",
  description:
    "باقات أوج الثلاث: المجانية بإعلانات خفيفة، بلس ٣٠ جنيه/شهر بدون إعلانات بحدود أعلى، وماكس ٥٠ جنيه/شهر مع ربط MCP — والإلغاء بيدك في أي وقت.",
  openGraph: pageOg(
    "الأسعار والباقات | أوج",
    "باقات أوج الثلاث: المجانية بإعلانات خفيفة، بلس ٣٠ جنيه/شهر بدون إعلانات بحدود أعلى، وماكس ٥٠ جنيه/شهر مع ربط MCP — والإلغاء بيدك في أي وقت.",
    "/pricing"
  ),
  twitter: pageTwitter(
    "الأسعار والباقات | أوج",
    "باقات أوج الثلاث: المجانية بإعلانات خفيفة، بلس ٣٠ جنيه/شهر بدون إعلانات بحدود أعلى، وماكس ٥٠ جنيه/شهر مع ربط MCP — والإلغاء بيدك في أي وقت."
  ),
  alternates: { canonical: "/pricing" },
};

/* ─────────────────────────────────────────────────────────────
   البيانات — نفس أرقام ونصوص الخطط المطبقة فعليًا في الخادم
   ───────────────────────────────────────────────────────────── */
type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlighted: boolean;
  cta: string;
  footnote: string;
};

const PLANS: Plan[] = [
  {
    name: "المجانية",
    price: "٠",
    period: "جنيه / للأبد",
    tagline: "ابدأ حياتك المنظمة مجانًا — بلا بطاقة ولا التزام",
    features: [
      "الوحدات الأساسية كلها: مهام، عادات، أهداف، يوميات",
      "٧ وحدة يوميًا + استخدام شهري سخي",
      "إشعارات داخل التطبيق وWeb Push",
      "مجتمع أوج كامل",
      "تصدير بياناتك متى شئت",
      "إعلانات خفيفة في أماكن محددة",
    ],
    highlighted: false,
    cta: "ابدأ مجانًا",
    footnote: "مفيش بطاقة ولا أي التزام — مجانًا فعلًا",
  },
  {
    name: "بلس",
    price: "٣٠",
    period: "جنيه / شهريًا",
    tagline: "للمشتغل بجدية — مساحة أوسع وصفر إعلانات",
    features: [
      "كل مزايا المجانية، وبدون إعلانات نهائيًا",
      "حدود أعلى في كل الوحدات (٣ أضعاف)",
      "العمل العميق بجلسات غير محدودة عمليًا",
      "تقارير المراجعة الأسبوعية والشهرية",
      "وسائط مجتمع بحد أعلى",
      "دعم ذو أولوية",
    ],
    highlighted: false,
    cta: "ارتقِ لبلس",
    footnote: "تجديد نشط — قرارك كل شهر",
  },
  {
    name: "ماكس",
    price: "٥٠",
    period: "جنيه / شهريًا",
    tagline: "كل شيء مفتوح + اربط ذكاءك الاصطناعي بحياتك",
    features: [
      "كل مزايا بلس، بأعلى حدود الاستخدام العادل",
      "MCP: اربط ChatGPT وعملاء MCP ببياناتك",
      "٨٢ أداة: قراءة وتعديل بكل الأقسام بأمان",
      "مفاتيح API شخصية قابلة للإبطال",
      "أولوية دعم قصوى",
      "تجربة الجديد أولًا",
    ],
    highlighted: true,
    cta: "امتلك ماكس",
    footnote: "استرجاع كامل خلال أول ٤٨ ساعة",
  },
];

const COMPARISON: Array<{ label: string; free: string; plus: string; max: string }> = [
  { label: "الإعلانات", free: "خفيفة", plus: "صفر", max: "صفر" },
  { label: "حدود الوحدات اليومية", free: "أساسية", plus: "٣ أضعاف", max: "الأعلى (عادل)" },
  { label: "العمل العميق", free: "محدود", plus: "شبه مفتوح", max: "شبه مفتوح" },
  { label: "ربط MCP بالذكاء الاصطناعي", free: "—", plus: "—", max: "٨٢ أداة" },
  { label: "الأولوية في الدعم", free: "عادية", plus: "أولوية", max: "قصوى" },
];

const GUARANTEES: Array<{ title: string; body: string; glyph: string }> = [
  { title: "استرجاع ٤٨ ساعة", body: "غيرت رأيك في أول يومين؟ استرجاع كامل بلا أسئلة.", glyph: "shield" },
  { title: "إلغاء بيدك، في أي وقت", body: "من الإعدادات مباشرة — بلا وساطة ولا مكالمات.", glyph: "bolt" },
  { title: "بياناتك دايمًا معاك", body: "تصدير كامل متى شئت، ولو رجعت للمجانية تبقى سليمة.", glyph: "trophy" },
];

const PAYMENT_FAQ: Array<[string, string]> = [
  [
    "إزاي أدفع؟",
    "من داخل التطبيق: طلب الترقية ← تعليمات الدفع مع رقم مرجعي ← ترسل الإيصال على بريد الدعم ← الإدارة تفعّل باقتك خلال يوم عمل. مفيش بيانات بطاقة بتدخل الموقع.",
  ],
  [
    "هل التجديد تلقائي؟",
    "لا — التجديد قرارك النشط كل شهر. لو جددت، استمر؛ ولو لأ، ترجع تلقائيًا للمجانية وبياناتك كلها سليمة.",
  ],
  [
    "أقدر ألغي؟",
    "من الإعدادات في أي لحظة، بلا وساطة ولا مبرر. تستمر مزايا باقتك حتى آخر يوم دفعته. ولو غيرت رأيك خلال أول ٤٨ ساعة — استرجاع كامل بلا أسئلة.",
  ],
  [
    "ماكس «غير محدودة» يعني إيه؟",
    "أعلى حدود سخية ضمن الاستخدام العادل — الحدود موجودة لحماية جودة الخدمة للجميع من الاستخدام الآلي المفرط، ولا يقرب منها مستخدم حقيقي عادي.",
  ],
];

/* ─────────────────────────────────────────────────────────────
   عناصر العرض
   ───────────────────────────────────────────────────────────── */

/** علامة اختيار داخل دائرة خضراء — أوضح من الشرطة المجردة */
function CheckMark({ solid = false }: { solid?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        solid ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-500",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
        <path d="m5 13 4.2 4.2L19 7.4" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** أيقونة محرف بسيطة لعناصر الضمان (SVG مضمّن — بلا تبعيات) */
function GuaranteeIcon({ glyph }: { glyph: string }) {
  const paths: Record<string, string> = {
    shield: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z",
    bolt: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
    trophy: "M7 4h10v3a5 5 0 01-10 0V4zM5 5H3v2a4 4 0 004 4M19 5h2v2a4 4 0 01-4 4M9 20h6M12 12v8",
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" className="text-emerald-500">
      <path d={paths[glyph] ?? paths.shield} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={[
        "relative flex flex-col rounded-[1.75rem] border-2 p-7 transition-transform duration-300",
        plan.highlighted
          ? "z-10 border-emerald-500/70 bg-surface-2 shadow-[0_0_50px_-14px_rgba(16,185,129,0.5)] md:-translate-y-2 md:scale-[1.03]"
          : "border-ink/10 bg-surface-2/70 hover:-translate-y-1",
      ].join(" ")}
    >
      {plan.highlighted && (
        <span className="absolute -top-3.5 right-7 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black text-white shadow-lg shadow-emerald-500/40">
          الأكثر قيمة ⚡
        </span>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-black text-foreground">{plan.name}</h2>
        {plan.highlighted && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-500">
            MCP
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-2 border-b border-border/50 pb-6" dir="rtl">
        <span className="font-display text-5xl font-black leading-none text-foreground">{plan.price}</span>
        <span className="text-sm font-bold text-muted-foreground">{plan.period}</span>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <CheckMark solid={plan.highlighted} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/app"
        className={[
          "mt-7 block rounded-full py-3.5 text-center text-sm font-black transition-all hover:opacity-90 active:scale-[0.98]",
          plan.highlighted
            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
            : "bg-foreground text-background",
        ].join(" ")}
      >
        {plan.cta}
      </Link>

      <p className="mt-3.5 text-center text-xs text-muted-foreground/70">{plan.footnote}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   JSON-LD — محفوظ كما هو (نتائج بحث أغنى)
   ───────────────────────────────────────────────────────────── */
const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "أوج — نظام حياتك الشخصي",
  description:
    "منصة عربية متكاملة لإدارة الحياة الشخصية والإنتاجية: مهام وعادات وأهداف وعمل عميق وصحة ومالية وتعلم ومجتمع، مع MCP لعملاء الذكاء الاصطناعي في الباقة الأعلى.",
  brand: { "@type": "Brand", name: "أوج (Awj)" },
  url: SITE_URL,
  offers: [
    {
      "@type": "Offer",
      name: "المجانية",
      price: "0",
      priceCurrency: "EGP",
      description: "الوحدات الأساسية بإعلانات خفيفة وحدود منخفضة",
      url: `${SITE_URL}/pricing`,
    },
    {
      "@type": "Offer",
      name: "بلس",
      price: "30",
      priceCurrency: "EGP",
      description: "بدون إعلانات وحدود أعلى — شهريًا",
      url: `${SITE_URL}/pricing`,
    },
    {
      "@type": "Offer",
      name: "ماكس",
      price: "50",
      priceCurrency: "EGP",
      description: "أعلى حدود ضمن الاستخدام العادل + MCP — شهريًا",
      url: `${SITE_URL}/pricing`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────
   الصفحة
   ───────────────────────────────────────────────────────────── */
export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* الترويسة اللاصقة — نفس روح LegalShell بعرض أوسع */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="font-display flex items-center gap-1.5 text-xl font-black text-foreground"
            aria-label="أوج — الرئيسية"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
            />
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-4 text-sm font-bold">
            <Link href="/features" className="text-muted-foreground transition-colors hover:text-foreground">
              المميزات
            </Link>
            <span className="text-foreground" aria-current="page">الأسعار</span>
            <Link
              href="/app"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90"
            >
              ابدأ الآن
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        {/* هالة شفقية خلف البطل */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,108,255,0.16),transparent_65%),radial-gradient(ellipse_45%_40%_at_80%_10%,rgba(214,255,61,0.08),transparent_60%)]"
        />

        {/* البطل */}
        <section className="relative pt-14 pb-10 text-center sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-black text-emerald-500">
            أسعار واضحة · بالجنيه المصري
          </p>
          <h1 className="font-display mx-auto mt-5 max-w-2xl text-4xl font-black leading-tight text-foreground sm:text-5xl">
            باقات على قد يومك
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            ابدأ مجانًا، وادفع فقط لما المنصة تثبت قيمتها في يومك فعلًا —
            والإلغاء دائمًا بيدك.
          </p>

          {/* شارات الثقة */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              بلا بطاقة للبدء
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              إلغاء في أي وقت
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              استرجاع ٤٨ ساعة
            </span>
          </div>
        </section>

        {/* الباقات */}
        <section aria-label="الباقات" className="relative grid gap-6 pb-6 md:grid-cols-3 md:gap-5 lg:gap-6">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </section>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground/80">
          الأسعار بالجنيه المصري. كل الحدود محسوبة في الخادم — لا «اختراق» من الواجهة يفتح ما
          لا يفتحه اشتراكك. أسئلة الدفع؟ راسلنا على{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-bold text-emerald-500 underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>

        {/* مقارنة سريعة */}
        <section aria-label="مقارنة سريعة" className="mt-14">
          <h2 className="font-display text-center text-2xl font-black text-foreground sm:text-3xl">
            مقارنة سريعة
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            الفروقات الجوهرية في سطور — التفاصيل الكاملة داخل كل باقة أعلاه.
          </p>

          <div className="mx-auto mt-7 max-w-3xl overflow-hidden rounded-[1.5rem] border border-border/60 bg-surface-2/60">
            {/* رأس الجدول */}
            <div className="grid grid-cols-4 border-b border-border/60 bg-surface-2 text-center text-xs font-black">
              <div className="px-4 py-3.5 text-right text-muted-foreground">المقارنة</div>
              <div className="px-2 py-3.5 text-muted-foreground">المجانية</div>
              <div className="px-2 py-3.5 text-muted-foreground">بلس</div>
              <div className="px-2 py-3.5 text-emerald-500">ماكس</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div
                key={row.label}
                className={[
                  "grid grid-cols-4 items-center text-center text-sm",
                  i !== COMPARISON.length - 1 ? "border-b border-border/40" : "",
                ].join(" ")}
              >
                <div className="px-4 py-3.5 text-right font-bold text-foreground">{row.label}</div>
                <div className="px-2 py-3.5 text-muted-foreground">{row.free}</div>
                <div className="px-2 py-3.5 text-muted-foreground">{row.plus}</div>
                <div className="px-2 py-3.5 font-bold text-emerald-500">{row.max}</div>
              </div>
            ))}
          </div>
        </section>

        {/* الضمانات */}
        <section aria-label="ضماناتنا" className="mt-14">
          <div className="grid gap-4 sm:grid-cols-3">
            {GUARANTEES.map((g) => (
              <div
                key={g.title}
                className="flex items-start gap-3.5 rounded-[1.5rem] border border-border/60 bg-surface-2/60 p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <GuaranteeIcon glyph={g.glyph} />
                </span>
                <div>
                  <h3 className="font-black text-foreground">{g.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* أسئلة الدفع الشائعة */}
        <section aria-label="أسئلة الدفع الشائعة" className="mt-14">
          <h2 className="font-display text-center text-2xl font-black text-foreground sm:text-3xl">
            أسئلة الدفع الشائعة
          </h2>
          <div className="mx-auto mt-7 max-w-3xl space-y-3">
            {PAYMENT_FAQ.map(([q, a]) => (
              <details
                key={q}
                className="group rounded-[1.25rem] border border-border/60 bg-surface-2/60 px-5 transition-colors open:border-emerald-500/30"
              >
                <summary className="flex cursor-pointer select-none items-center justify-between py-4 font-bold text-foreground list-none [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform duration-300 group-open:rotate-45"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="pb-5 leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* عند انتهاء الاشتراك */}
        <section aria-label="ماذا يحدث عند انتهاء الاشتراك" className="mt-14">
          <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-border/60 bg-surface-2/60 p-7 sm:p-9">
            <h2 className="font-display text-xl font-black text-foreground sm:text-2xl">
              ماذا يحدث عند انتهاء الاشتراك؟
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              لا شيء مخيف: يعود حسابك تلقائيًا لحدود الباقة المجانية، وبياناتك كلها
              تبقى سليمة ومقروءة. ما تجاوز الحد المجاني يظل محفوظًا كما هو، ويستأنف
              الإنشاء الجديد عند أول تجديد. التفاصيل الكاملة في{" "}
              <Link href="/refund-policy" className="font-bold text-emerald-500 underline underline-offset-4">
                سياسة الاسترجاع والإلغاء
              </Link>
              {" "}والشروط الكاملة في{" "}
              <Link href="/terms" className="font-bold text-emerald-500 underline underline-offset-4">
                شروط الاستخدام
              </Link>
              .
            </p>
          </div>
        </section>

        {/* دعوة أخيرة */}
        <section className="mt-14 pb-8 text-center">
          <h2 className="font-display mx-auto max-w-xl text-2xl font-black text-foreground sm:text-3xl">
            جرّب أوج الأول — بعدين قرر
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            الباقة المجانية مش نسخة تجريبية محدودة الأيام — هي أوج نفسه، مجانًا للأبد.
          </p>
          <Link
            href="/app"
            className="mt-7 inline-block rounded-full bg-emerald-500 px-9 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/30 transition-all hover:opacity-90 active:scale-[0.98]"
          >
            ابدأ مجانًا الآن ⚡
          </Link>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
