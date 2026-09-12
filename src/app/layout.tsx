import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { PWAInit } from "@/components/pwa-init";
import { QueryProvider } from "@/components/query-provider";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { ErrorCapture } from "@/components/error-capture";
import { AuthProvider } from "@/components/auth-provider";

// ============================================================
// app/layout.tsx — الجذر العام للتطبيق كله
//
// يضبط lang="ar" وdir="rtl" ويحمّل الهوية البصرية (globals.css:
// Tajawal/El Messiri + الوضعان الليلي والنهاري المختلفان)، ثم
// يثبّت سلسلة المزودات: ThemeProvider → QueryProvider (كاش مشفّر)
// → AuthProvider (استعادة الجلسة) → PWAInit + ErrorCapture +
// PerformanceMonitor. الـmanifest ديناميكي من /api/manifest.
// ============================================================

export const metadata: Metadata = {
  title: "أوج | awj.life — امتلك صباحك. امتلك حياتك.",
  description: "أوج — نظام حياتك الشخصي المتكامل: إنتاجية، عادات، أهداف، عمل عميق، صحة، مالية وتعلم. يعمل بدون إنترنت!",
  metadataBase: new URL("https://awj.life"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icon-192.png",
  },
  manifest: "/api/manifest",
  applicationName: "أوج",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "أوج",
  },
  // P3#7: Additional meta tags in <head> below
  other: {},
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility but prevent accidental zoom
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce is generated per-request in middleware (x-nonce) and applied to
  // Next's own scripts automatically; next-themes needs it explicitly so its
  // blocking theme-init inline script is not blocked by 'strict-dynamic'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Tajawal: proper Arabic glyph coverage — Inter has none, app is RTL/Arabic-first */}
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
        {/* El Messiri: display face with Arabic character, used sparingly for headings/hero moments */}
        <link
          href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* P3#7: DNS prefetch for Supabase (faster API calls) */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        ) : null}
        <meta name="theme-color" content="#0a1628" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="أوج" />
        <meta name="description" content="أوج — نظام حياتك الشخصي المتكامل، يعمل بدون إنترنت" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
          nonce={nonce}
        >
          <QueryProvider>
            <AuthProvider>
              <PWAInit />
              <PerformanceMonitor />
              <ErrorCapture />
              {children}
              {/* Unified toast system — sonner only (single system, Phase-2 design decision) */}
              <SonnerToaster position="top-center" richColors closeButton={false} />
              {/* Vercel Analytics — privacy-friendly pageview/web-vitals tracking */}
              <Analytics />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
