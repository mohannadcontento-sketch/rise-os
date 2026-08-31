import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { PWAInit } from "@/components/pwa-init";
import { QueryProvider } from "@/components/query-provider";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { ErrorCapture } from "@/components/error-capture";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "RiseOS — امتلك صباحك. امتلك حياتك.",
  description: "نظام تشغيل الحياة الشامل - إنتاجية، عادات، أهداف، عمل عميق، صحة، مالية وتعلم. يعمل بدون إنترنت!",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icon-192.png",
  },
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RiseOS",
  },
  // P3#7: Additional meta tags in <head> below
  other: {},
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility but prevent accidental zoom
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preload main font to prevent CLS from font swap */}
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
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
        <meta name="apple-mobile-web-app-title" content="RiseOS" />
        <meta name="description" content="نظام تشغيل الحياة الشامل - يعمل بدون إنترنت" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <QueryProvider>
            <AuthProvider>
              <PWAInit />
              <PerformanceMonitor />
              <ErrorCapture />
              {children}
              <Toaster />
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
