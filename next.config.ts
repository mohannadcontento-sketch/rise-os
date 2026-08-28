import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ `output: "standalone"` breaks Vercel builds (Next 16 Turbopack):
  // ENOENT .next/next-server.js.nft.json during onBuildComplete.
  // Keep it ONLY for self-hosting (Docker/Node server) — never on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,

  // P3#7: Performance optimizations
  poweredByHeader: false, // Remove X-Powered-By header (security + saves bytes)
  compress: true, // Enable gzip compression

  // P3#5: Image optimization
  images: {
    formats: ['image/avif', 'image/webp'], // Modern formats
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    minimumCacheTTL: 86400, // 24h cache
  },

  // P3#6: Experimental optimizations for mobile + desktop
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      'recharts',
      'date-fns',
    ],
    optimizeCss: true, // Minify CSS
    scrollRestoration: true, // Better UX on back/forward
  },

  // P3#7: Headers for caching static assets
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
