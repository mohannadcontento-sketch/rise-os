// ============================================================
// src/components/rise/legal-shell.tsx — هيكل مشترك للصفحات العامة
//
// غلاف موحّد لصفحات التسويق والقانونية (خصوصية/شروط/إرشادات/
// استرجاع/تواصل/عن أوج) بنفس هوية أوج البصرية: Tajawal/El Messiri
// عبر font-display، والوضعان الليلي والنهاري من نفس التوكنات.
// Server Component خالص (روابط <a> عادية — لا hooks).
// ============================================================

import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME, LEGAL_LAST_UPDATED } from "@/lib/site";

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function lastUpdatedArabic(): string {
  const d = new Date(LEGAL_LAST_UPDATED);
  return `${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** شعار نصي صغير — نفس روح BrandMark بدون استيراد كود client. */
function Wordmark() {
  return (
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
  );
}

/** تذييل الصفحات العامة بروابط قانونية. */
export function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface-2/60 mt-16">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold"
          aria-label="روابط قانونية"
        >
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">الرئيسية</Link>
          <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">الأسعار</Link>
          <Link href="/features" className="text-muted-foreground transition-colors hover:text-foreground">المميزات</Link>
          <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">الخصوصية</Link>
          <Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">الشروط</Link>
          <Link href="/community-guidelines" className="text-muted-foreground transition-colors hover:text-foreground">إرشادات المجتمع</Link>
          <Link href="/refund-policy" className="text-muted-foreground transition-colors hover:text-foreground">الاسترجاع</Link>
          <Link href="/contact" className="text-muted-foreground transition-colors hover:text-foreground">تواصل معنا</Link>
        </nav>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {SITE_NAME} © {new Date().getFullYear()} — امتلك صباحك. امتلك حياتك.
        </p>
      </div>
    </footer>
  );
}

/** قسم داخل صفحة قانونية: عنوان + محتوى. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10 scroll-mt-24">
      <h2 className="font-display text-2xl font-black text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** قائمة نقاط بتنسيق موحد (محاذاة يمين — بدون justify). */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-2.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
          />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** الغلاف الكامل للصفحة العامة. */
export default function LegalShell({
  title,
  description,
  showLastUpdated = true,
  children,
}: {
  title: string;
  description: string;
  showLastUpdated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-4 text-sm font-bold">
            <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
              الأسعار
            </Link>
            <Link
              href="/app"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90"
            >
              ابدأ الآن
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
        <div className="pt-12 pb-2">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-500">
            {SITE_NAME}
          </p>
          <h1 className="font-display mt-2 text-3xl font-black text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">{description}</p>
          {showLastUpdated && (
            <p className="mt-2 text-sm text-muted-foreground/70">
              آخر تحديث: {lastUpdatedArabic()}
            </p>
          )}
        </div>
        <article className="pb-8">{children}</article>
      </main>

      <PublicFooter />
    </div>
  );
}
