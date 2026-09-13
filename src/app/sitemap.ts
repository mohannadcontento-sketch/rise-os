// ============================================================
// src/app/sitemap.ts — خريطة الموقع للفهرسة (المرحلة 11)
//
// تولّد /sitemap.xml تلقائيًا عبر Next Metadata API وتشمل صفحات
// التسويق والقانونية العامة فقط — مسارات التطبيق المحمية (/app)
// وصفحات تدفق OAuth (mcp/authorize) و reset-password مستثناة.
// ============================================================

import type { MetadataRoute } from "next";
import { SITE_URL, LEGAL_LAST_UPDATED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date(LEGAL_LAST_UPDATED);

  const marketing: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
  ];

  const legal: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/community-guidelines`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [...marketing, ...legal];
}
