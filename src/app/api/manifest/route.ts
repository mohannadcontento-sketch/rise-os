import { NextResponse } from 'next/server'

// ============================================================
// /api/manifest — بيان PWA (واجهة التثبيت)
//
// يقدّم manifest.json ديناميكياً بدل الملف الثابت في /public:
// الثابت كان يعطّل إعادة توجيه Vercel SSO لغياب رؤوس CORS،
// والمسار الديناميكي يضبطها صراحة مع كل استجابة.
//
// المسار عام: مورد تثبيت عام لا يتطلب جلسة.
// الطرق: GET — بيان عربي RTL (أيقونات + اختصارات) مع كاش
//        ساعة وstale-while-revalidate يوماً.
//        OPTIONS — preflight لـ CORS (204).
// ============================================================

/**
 * Serves the PWA manifest.json with proper CORS headers.
 * This fixes Vercel SSO redirect CORS issues that occur with static /public/manifest.json.
 */
export async function GET() {
  const manifest = {
    id: "/app",
    name: "أوج | awj.life — نظام حياتك الشخصي",
    short_name: "أوج",
    description: "نظام تشغيل الحياة الشامل - إنتاجية، عادات، أهداف، عمل عميق، صحة، مالية وتعلم.",
    lang: "ar",
    dir: "rtl",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#070B14",
    theme_color: "#0B1015",
    orientation: "any",
    categories: ["productivity", "lifestyle", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "المهام",
        url: "/app?module=tasks",
        description: "فتح المهام مباشرة",
      },
      {
        name: "اليوميات",
        url: "/app?module=journal",
        description: "كتابة يومية جديدة",
      },
      {
        name: "قاعدة المعارف",
        url: "/app?module=brain",
        description: "تصفح قاعدة المعارف",
      },
    ],
  }

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}