import type { Metadata } from "next";
import LandingPage from "@/components/rise/landing";
import { FAQS } from "@/lib/landing-faq";
import { SITE_URL, SITE_NAME } from "@/lib/site";

// ============================================================
// app/page.tsx — نقطة الدخول الجذر (/)
//
// صفحة الهبوط العامة بلا جلسة: تعرض LandingPage فقط — الوحدات
// الحقيقية خلف /app بمصادقة. الـmetadata هنا هو بطاقة المشاركة
// (OG/Twitter) العربية للموقع كله + canonical + بيانات JSON-LD
// منظمة (SoftwareApplication + Organization + FAQPage) لنتائج
// بحث أغنى (المرحلة 11: Landing+SEO+Legal).
// ============================================================

const TITLE = "أوج | awj.life — امتلك صباحك. امتلك حياتك.";
const DESCRIPTION =
  "أوج — نظام حياتك الشخصي بالعربي: مهام، عادات، أهداف، عمل عميق، صحة، مالية وتعلّم — في مكان واحد ويعمل بدون إنترنت.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  keywords: [
    "أوج",
    "awj",
    "إدارة الحياة",
    "إنتاجية",
    "مهام",
    "عادات",
    "أهداف",
    "عمل عميق",
    "يوميات",
    "تطبيق عربي",
    "منظم شخصي",
  ],
  openGraph: {
    title: TITLE,
    description:
      "كل حياتك في نظام واحد بالعربي: ٢٤ موديول متكامل، وضع ليلي ونهاري مختلفان تمامًا، ويعمل بدون إنترنت.",
    type: "website",
    locale: "ar_EG",
    siteName: SITE_NAME,
    url: SITE_URL,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "أوج — امتلك صباحك. امتلك حياتك.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

/** بيانات منظمة (Schema.org) لنتائج بحث أغنى. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "أوج (Awj)",
      alternateName: "Awj",
      url: SITE_URL,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web",
      inLanguage: "ar",
      description: DESCRIPTION,
      featureList: [
        "المهام والقوائم",
        "العادات مع سلاسل الالتزام",
        "الأهداف والمعالم",
        "العمل العميق وجلسات التركيز",
        "اليوميات",
        "الصحة والمالية والتعلم",
        "تتبع القراءة",
        "المجتمع",
        "بروتوكول MCP لعملاء الذكاء الاصطناعي",
      ],
      offers: [
        { "@type": "Offer", name: "المجانية", price: "0", priceCurrency: "EGP" },
        { "@type": "Offer", name: "بلس", price: "30", priceCurrency: "EGP" },
        { "@type": "Offer", name: "ماكس", price: "50", priceCurrency: "EGP" },
      ],
    },
    {
      "@type": "Organization",
      name: "أوج (Awj)",
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
