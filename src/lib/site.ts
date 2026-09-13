// ============================================================
// src/lib/site.ts — ثوابت الموقع العامة (المرحلة 11: Landing+SEO+Legal)
//
// مصدر واحد لاسم الموقع وعنوانه وقنوات التواصل والباقات — تستخدمه
// sitemap.ts و robots.ts وصفحات التسويق والقانونية وميتاداتا OG.
// الافتراضي = رابط الإنتاج الحالي على Vercel. عند شراء awj.life
// وتثبيته اضبط NEXT_PUBLIC_SITE_URL=https://awj.life من لوحة Vercel
// (Settings → Environment Variables) بدون تعديل الكود.
// ============================================================

/** الدومين الأساسي للموقع (يُقرأ من البيئة عند توفرها). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rise-os-gamma.vercel.app"
).replace(/\/+$/, "");

/** اسم المنتج بالعربي. */
export const SITE_NAME = "أوج";

/** اسم المنتج باللاتيني (للمقارنة والبرمجية). */
export const SITE_NAME_LATIN = "Awj";

/** بريد الدعم الرسمي. */
export const SUPPORT_EMAIL = "support@awj.life";

/** بريد الشؤون التجارية والإعلانات. */
export const BUSINESS_EMAIL = "business@awj.life";

/** تاريخ آخر تحديث للصفحات القانونية (ISO). */
export const LEGAL_LAST_UPDATED = "2026-09-14";

/** رابط صفحة داخل الموقع بشكل مطلق. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** الباقات الثلاث كما هي مطبقة في نظام الاشتراكات. */
export const PLANS = {
  free: { key: "free", name: "المجانية", priceEGP: 0, ads: true, mcp: false },
  plus: { key: "plus", name: "بلس", priceEGP: 30, ads: false, mcp: false },
  max: { key: "max", name: "ماكس", priceEGP: 50, ads: false, mcp: true },
} as const;
