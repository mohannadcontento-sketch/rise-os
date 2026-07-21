import { NextResponse } from 'next/server'

/**
 * Serves the PWA manifest.json with proper CORS headers.
 * This fixes Vercel SSO redirect CORS issues that occur with static /public/manifest.json.
 */
export async function GET() {
  const manifest = {
    name: "RiseOS — نظام حياتك التشغيلي",
    short_name: "RiseOS",
    description: "نظام تشغيل الحياة الشامل - إنتاجية، عادات، أهداف، عمل عميق، صحة، مالية وتعلم.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a1f15",
    theme_color: "#166534",
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
        url: "/?module=tasks",
        description: "فتح المهام مباشرة",
      },
      {
        name: "اليوميات",
        url: "/?module=journal",
        description: "كتابة يومية جديدة",
      },
      {
        name: "المدرب الذكي",
        url: "/?module=ai-coach",
        description: "التحدث مع المدرب الذكي",
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