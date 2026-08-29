import type { Metadata } from "next";
import LandingPage from "@/components/rise/landing";

export const metadata: Metadata = {
  title: "RiseOS — امتلك صباحك. امتلك حياتك.",
  description:
    "نظام تشغيل حياتك الشخصي بالعربي: مهام، عادات، أهداف، عمل عميق، صحة، مالية وتعلّم — في مكان واحد ويعمل بدون إنترنت.",
  openGraph: {
    title: "RiseOS — امتلك صباحك. امتلك حياتك.",
    description:
      "كل حياتك في نظام واحد بالعربي: ٢٤ موديول متكامل، وضع ليلي ونهاري مختلفان تمامًا، ويعمل بدون إنترنت.",
    type: "website",
    locale: "ar_EG",
  },
};

export default function Home() {
  return <LandingPage />;
}
