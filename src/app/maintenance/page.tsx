// ============================================================
// src/app/maintenance/page.tsx — صفحة قفل الصيانة (Beta)
//
// طلب المالك: عندما وضع الصيانة مفعّل، يرى أي زائر غير الأدمن
// هذه الصفحة بدل التطبيق — التطبيق كله مقفول (الـmiddleware يحوّل
// /app إلى هنا ويرفض طفرات /api/rise/* بـ503)، بينما الأدمن
// يستخدم كل شيء طبيعيًا (استثناء في middleware عبر isAdminRequester).
//
// التصميم: نفس عالم توكنات أوج (شفقية + بئر أيقونة + الوضعان
// الليلي/النهاري). Server Component خالص + مكون مراقبة client
// صغير يعيد المستخدم تلقائيًا فور انتهاء الصيانة.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { RiseGlyphIcon } from "@/components/rise/icons";
import { MaintenanceWatch } from "@/components/rise/maintenance-watch";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `تحت الصيانة | ${SITE_NAME}`,
  description: "أوج تحت الصيانة حاليًا — كل بياناتك سليمة ونرجع لك بعد قليل.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* هالة شفقية خلفية — نفس عالم صفحة الهبوط */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_55%_45%_at_70%_20%,rgba(124,108,255,0.20),transparent_62%),radial-gradient(ellipse_50%_45%_at_20%_85%,rgba(214,255,61,0.10),transparent_60%),radial-gradient(ellipse_40%_35%_at_50%_50%,rgba(16,185,129,0.08),transparent_65%)]"
      />

      <main className="relative mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        {/* بئر الأيقونة */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-4 rounded-full bg-emerald-500/25 blur-2xl animate-pulse"
          />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border-2 border-emerald-500/40 bg-surface-2 shadow-[0_0_40px_-10px_rgba(16,185,129,0.55)]">
            <RiseGlyphIcon glyph="sunrise" size={44} className="text-emerald-500" />
          </div>
        </div>

        <h1 className="font-display mt-8 text-3xl font-black text-foreground sm:text-4xl">
          {SITE_NAME} تحت الصيانة
        </h1>

        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
          بنجهّزلك حاجات أحسن — نرجع لك في أقرب وقت.
          <span className="mt-2 block text-base">
            كل بياناتك سليمة زي ما هي، محدش يلمس حاجة.
          </span>
        </p>

        {/* رسالة الأدمن المخصصة (إن وُجدت) + الرجوع التلقائي عند الانتهاء */}
        <MaintenanceWatch />

        <div className="mt-10 flex items-center gap-2 rounded-full border border-border/60 bg-surface-2/60 px-5 py-2.5 text-sm font-bold text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          هترجع للتطبيق تلقائيًا أول ما نخلص
        </div>

        <nav className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold" aria-label="روابط">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            العودة للرئيسية
          </Link>
          <span aria-hidden="true" className="text-border">·</span>
          <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
            الباقات والأسعار
          </Link>
          <span aria-hidden="true" className="text-border">·</span>
          <Link href="/" className="text-muted-foreground/70 transition-colors hover:text-foreground">
            دخول الإدارة
          </Link>
        </nav>
      </main>
    </div>
  );
}
