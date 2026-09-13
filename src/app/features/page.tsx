// ============================================================
// src/app/features/page.tsx — المميزات (المرحلة 11: Landing+SEO)
//
// صفحة تسويقية مستقلة للمميزات تخدم ثلاث أغراض: مرجع كامل
// للزائر القادم من نتائج البحث، صفحة هبوط للحملات، وتقوية
// الفهرسة عبر ربط داخلي من تذييل كل صفحة عامة. Server Component
// خالص — صفر JavaScript إضافي على العميل.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/components/rise/legal-shell";
import { SITE_URL, pageOg, pageTwitter } from "@/lib/site";

export const metadata: Metadata = {
  title: "المميزات | أوج — ٢٤ وحدة لحياتك كلها",
  description:
    "استكشف مميزات أوج: مهام وعادات وسلاسل إنجاز، عمل عميق ببومودورو، أهداف ومشاريع، صحة ونوم، مالية بالجنيه المصري، دماغ ثانٍ، مجتمع عربي، وربط MCP مع ChatGPT في باقة ماكس.",
    openGraph: pageOg(
    "المميزات | أوج — ٢٤ وحدة لحياتك كلها",
    "استكشف مميزات أوج: مهام وعادات وسلاسل إنجاز، عمل عميق ببومودورو، أهداف ومشاريع، صحة ونوم، مالية بالجنيه المصري، دماغ ثانٍ، مجتمع عربي، وربط MCP مع ChatGPT في باقة ماكس.",
    "/features"
  ),
  twitter: pageTwitter(
    "المميزات | أوج — ٢٤ وحدة لحياتك كلها",
    "استكشف مميزات أوج: مهام وعادات وسلاسل إنجاز، عمل عميق ببومودورو، أهداف ومشاريع، صحة ونوم، مالية بالجنيه المصري، دماغ ثانٍ، مجتمع عربي، وربط MCP مع ChatGPT في باقة ماكس."
  ),
  alternates: { canonical: "/features" },
};

/* الركائز الست الأساسية — نفس محتوى الصفحة الرئيسية موسّعًا. */
const PILLARS: { hue: string; title: string; desc: string }[] = [
  {
    hue: "bg-blue-500",
    title: "مهام وعادات تصنع الفرق",
    desc: "نظام مهام ذكي مع عادات يومية وسلاسل إنجاز لا تنقطع، وتذكيرات تصل في وقتها عبر إشعارات التطبيق وWeb Push. كل مهمة قابلة للتكرار والجدولة، وكل عادة ترسم سلسلتها يومًا بيوم حتى يتحول الالتزام إلى طبيعة ثانية.",
  },
  {
    hue: "bg-violet-500",
    title: "عمل عميق بلا تشتيت",
    desc: "مؤقتات بومودورو بجلسات تركيز مصحوبة بصوتيات محيطية، وإحصائيات ساعات عملك الحقيقية على مدار الأسبوع والشهر. تعرف بالضبط أين تذهب طاقتك، وتقارن جلسات اليوم بالأمس لتتطور بثبات بدل الحدس.",
  },
  {
    hue: "bg-fuchsia-500",
    title: "أهداف ومشاريع حقيقية",
    desc: "حوّل أحلامك الكبيرة إلى مشاريع بخطوات واضحة ومعالم قابلة للقياس. تابع نسبة تقدم كل مشروع، اربط مهامه بجلسات العمل العميق، واحتفل بكل إنجاز بنقاط خبرة تراكمية تحفزك على الاستمرار.",
  },
  {
    hue: "bg-rose-500",
    title: "صحة ونوم وطاقة",
    desc: "تابع نومك وماءك ورياضتك وطاقتك اليومية في سجل واحد — لأن الإنتاجية تبدأ من الجسم قبل الجدول. المراجعة الأسبوعية تجمع هذه المؤشرات مع إنجازك لتكشف أنماطك الحقيقية بدل التخمين.",
  },
  {
    hue: "bg-lime-500",
    title: "مالية وميزانية واعية",
    desc: "دخلك ومصاريفك وميزانياتك في لوحة واحدة تحسب لك كل قرش بالجنيه المصري، مع تصنيف تلقائي للمصاريف ومقارنة شهر بشهر. الوعي بالمال يبدأ من رؤيته مسجلًا لا متفرقًا في رأسك.",
  },
  {
    hue: "bg-cyan-500",
    title: "تعلّم ودماغ ثانٍ",
    desc: "ملخصات قراءاتك ومعارفك المرتبطة ومذكراتك اليومية في ذاكرتك الخارجية. اربط كل فكرة بمصدرها، وابحث في كل ما جمعته بضغطة واحدة عبر البحث الشامل الذي يغوص في كل الأقسام.",
  },
];

/* وحدات المنصة كما تظهر في شريط الوحدات بالصفحة الرئيسية. */
const MODULES: string[] = [
  "لوحة التحكم", "الروتين الصباحي", "المخطط", "المخطط اليومي",
  "المهام", "المشاريع", "الأهداف", "العادات",
  "التذكيرات", "القراءة", "الدماغ الثاني", "المذكرات",
  "الصحة", "العمل العميق", "التركيز", "التعلم",
  "العمل", "المالية", "التقويم", "التحليلات",
  "المراجعة الأسبوعية", "المراجعة الشهرية", "الإشعارات", "الإعدادات",
];

const featuresJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "مميزات أوج",
  description: "الركائز الست الأساسية لمنصة أوج لإدارة الحياة الشخصية بالعربية.",
  itemListElement: PILLARS.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: p.title,
    description: p.desc,
  })),
  url: `${SITE_URL}/features`,
};

export default function FeaturesPage() {
  return (
    <LegalShell
      showLastUpdated={false}
      title="المميزات"
      description="كل حياتك في نظام واحد — مش مجرد تطبيق مهام، ده نظام تشغيل كامل لحياتك بُني من الصفر بالعربي، ويعمل على موبايلك وكمبيوترك بنفس السلاسة."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featuresJsonLd) }}
      />

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {PILLARS.map((p) => (
          <article
            key={p.title}
            className="rounded-3xl border-2 border-ink/10 bg-surface-2/60 p-6 transition-colors hover:border-ink/20"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-full ${p.hue} shadow-[0_0_12px_currentColor]`}
            />
            <h2 className="mt-3 text-lg font-extrabold text-foreground">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
          </article>
        ))}
      </div>

      <LegalSection title="٢٤ وحدة لكل شيء يهمك">
        <p>
          وراء الركائز الست تقبع أربع وعشرون وحدة متكاملة تغطي يومك من أول روتين
          الصباح حتى مراجعة نهاية الشهر — كلها تتحدث العربية أصلًا لا ترجمة،
          وتفهم تقويم القاهرة وأوقاتها، وتتصل ببعضها: مهمة تأتي من مشروع،
          وعادة تلتهم جدولك، ومراجعتك الأسبوعية تجمع خيوطها كلها في صورة واحدة.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <span
              key={m}
              className="rounded-full border border-border/60 bg-surface-2/60 px-4 py-1.5 text-sm font-bold text-foreground"
            >
              {m}
            </span>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="ذكاء اصطناعي يعمل على بياناتك — بأمان">
        <p>
          في باقة ماكس يفتح أوج باب <strong className="text-foreground">MCP</strong>{" "}
          (Model Context Protocol): اربط ChatGPT وأي عميل MCP آخر بحسابك ليتحدث
          مع بياناتك مباشرة — ينشئ مهامك، يسجل يومياتك، يراجع أسبوعك، ويسألك
          عن عاداتك. <strong className="text-foreground">٨٢ أداة</strong> تغطي كل
          قسم من أقسام المنصة، وكل مفتاح API شخصي قابل للإبطال الفوري من
          إعداداتك في أي لحظة.
        </p>
        <p>
          عزلك محفوظ على مستوى الخادم: لا يرى أي مفتاح إلا بيانات صاحبه،
          وعمليات الحذف تطلب تأكيدًا صريحًا، وكل استدعاء يمر على حدود
          الاستخدام العادل. الذكاء الاصطناعي مساعد لديك — ليس بابًا خلفيًا.
        </p>
      </LegalSection>

      <LegalSection title="مجتمع عربي حقيقي">
        <p>
          شارك تجربتك في مجتمع أوج: منشورات وتعليقات وتقدير من أشخاص يمشون
          نفس الطريق. الإشراف على المحتوى يعمل ببلاغات المستخدمين ومراجعة
          الإدارة، وإرشادات مجتمع واضحة تحمي الفضاء من أي إساءة قبل أن تبدأ.
        </p>
      </LegalSection>

      <LegalSection title="خصوصيتك في الصدارة">
        <p>
          بياناتك لك: صمّمنا أوج بعزل صارم على مستوى قاعدة البيانات (RLS)
          بحيث لا يمكن لأي استعلام أن يلمس صفًا ليس لك مهما حدث. الكلمات
          السرية مشفرة، والجلسات محمية بكوكيز httpOnly، ولا تشارك الجلسة
          تفاصيلها مع المتصفح. وتقدر تصدّر بياناتك أو تحذف حسابك بالكامل
          متى شئت من الإعدادات — بدون خطوات تعجيزية ولا رسائل احتجاج.
        </p>
      </LegalSection>

      <div className="mt-10 rounded-3xl border-2 border-emerald-500/60 bg-surface-2 p-7 text-center shadow-[0_0_40px_-12px_rgba(16,185,129,0.45)]">
        <h2 className="font-display text-2xl font-black text-foreground">
          جرب كل ده بنفسك — مجانًا
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          ابدأ بالباقة المجانية بلا بطاقة ولا التزام، وارتقِ فقط لما تثبت
          المنصة قيمتها في يومك فعلًا.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-black text-white transition-opacity hover:opacity-90"
          >
            ابدأ مجانًا
          </Link>
          <Link
            href="/pricing"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-black text-background transition-opacity hover:opacity-90"
          >
            شوف الباقات
          </Link>
        </div>
      </div>
    </LegalShell>
  );
}
