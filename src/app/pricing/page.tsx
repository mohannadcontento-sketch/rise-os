// ============================================================
// src/app/pricing/page.tsx — الأسعار (المرحلة 11: Landing)
//
// الباقات الثلاث كما هي مطبقة فعليًا: Free بإعلانات، Plus ٣٠ ج
// بدون إعلانات بحدود أعلى، Max ٥٠ ج بـ MCP وحدود أعلى ضمن
// الاستخدام العادل. مع JSON-LD (Product + Offers) لنتائج بحث
// أغنى، وأسئلة الدفع الشائعة.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/components/rise/legal-shell";
import { SITE_URL, SUPPORT_EMAIL, pageOg, pageTwitter } from "@/lib/site";

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

type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlighted: boolean;
  cta: string;
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
  },
];

const PAYMENT_FAQ: Array<[string, string]> = [
  [
    "إزاي أدفع؟",
    "من داخل التطبيق: طلب الترقية ← تعليمات الدفع مع رقم مرجعي ← ترسل الإيصال على بريد الدعم ← الإدارة تفعل باقتك خلال يوم عمل. مفيش بيانات بطاقة بتدخل الموقع.",
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

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      className="mt-1 shrink-0 text-emerald-500"
    >
      <path
        d="m5 13 4.2 4.2L19 7.4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={[
        "relative flex flex-col rounded-3xl border-2 p-7",
        plan.highlighted
          ? "border-emerald-500/60 bg-surface-2 shadow-[0_0_40px_-12px_rgba(16,185,129,0.45)]"
          : "border-ink/10 bg-surface-2/60",
      ].join(" ")}
    >
      {plan.highlighted && (
        <span className="absolute -top-3.5 right-6 rounded-full bg-emerald-500 px-3.5 py-1 text-xs font-black text-white">
          الأكثر قيمة ⚡
        </span>
      )}
      <h2 className="font-display text-xl font-black text-foreground">{plan.name}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

      <p className="mt-5 flex items-baseline gap-2" dir="ltr">
        <span className="font-display text-5xl font-black text-foreground" dir="rtl">
          {plan.price}
        </span>
        <span className="text-xs font-bold text-muted-foreground" dir="rtl">
          {plan.period}
        </span>
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <CheckMark />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/app"
        className={[
          "mt-7 block rounded-full py-3 text-center text-sm font-black transition-opacity hover:opacity-90",
          plan.highlighted
            ? "bg-emerald-500 text-white"
            : "bg-foreground text-background",
        ].join(" ")}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

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

export default function PricingPage() {
  return (
    <LegalShell
      showLastUpdated={false}
      title="الأسعار والباقات"
      description="ثلاث باقات واضحة بلا مفاجآت: ابدأ مجانًا، وادفع فقط لما المنصة تثبت قيمتها في يومك فعلًا — والإلغاء دائمًا بيدك."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground/80">
        الأسعار بالجنيه المصري. كل الحدود محسوبة في الخادم — لا «اختراق» من الواجهة
        يفتح ما لا يفتحه اشتراكك. أسئلة الدفع؟ راسلنا على{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-bold text-emerald-500 underline underline-offset-4"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>

      <LegalSection title="أسئلة الدفع الشائعة">
        <div className="space-y-3">
          {PAYMENT_FAQ.map(([q, a]) => (
            <details
              key={q}
              className="rounded-2xl border border-border/60 bg-surface-2/60 px-5 transition-colors"
            >
              <summary className="cursor-pointer select-none py-4 font-bold text-foreground">
                {q}
              </summary>
              <p className="pb-5 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="ماذا يحدث عند انتهاء الاشتراك؟">
        <p>
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
      </LegalSection>
    </LegalShell>
  );
}
