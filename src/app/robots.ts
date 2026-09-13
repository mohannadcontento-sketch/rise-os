// ============================================================
// src/app/robots.ts — سياسة الزحف (المرحلة 11)
//
// يستبدل ملف public/robots.txt الثابت بنسخة دينامية تربط الزاحف
// بخريطة الموقع تلقائيًا — يسمح لكل الروبوتات بفهرسة الصفحات
// العامة ويشير إلى /sitemap.xml.
// ============================================================

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/api/", "/mcp/", "/reset-password", "/offline"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
