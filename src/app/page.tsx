import type { Metadata } from "next";
import LandingPage from "@/components/rise/landing";

// ============================================================
// app/page.tsx — نقطة الدخول الجذر (/)
//
// صفحة الهبوط العامة بلا جلسة: تعرض LandingPage فقط — الوحدات
// الحقيقية خلف /app بمصادقة. الـmetadata هنا هو بطاقة المشاركة
// (OG) العربية للموقع كله.
// ============================================================

export const metadata: Metadata = {
  title: "أوج | awj.life — امتلك صباحك. امتلك حياتك.",
  description:
    "أوج — نظام حياتك الشخصي بالعربي: مهام، عادات، أهداف، عمل عميق، صحة، مالية وتعلّم — في مكان واحد ويعمل بدون إنترنت.",
  openGraph: {
    title: "أوج | awj.life — امتلك صباحك. امتلك حياتك.",
    description:
      "كل حياتك في نظام واحد بالعربي: ٢٤ موديول متكامل، وضع ليلي ونهاري مختلفان تمامًا، ويعمل بدون إنترنت.",
    type: "website",
    locale: "ar_EG",
  },
};

export default function Home() {
  return <LandingPage />;
}
