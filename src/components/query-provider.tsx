'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, ReactNode, useEffect } from 'react'
import { setupOfflinePersistence } from '@/lib/offline-persist'

// ============================================================
// P2#1: React Query setup — centralized cache, stale-while-revalidate,
// automatic refetching, and mutation invalidation.
// P2#11: Offline persistence — cache survives page reloads.
// ============================================================

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes — data is fresh for 5 min
            // FIX: Increased gcTime from 5 min to 24 hours. The old 5-minute
            // GC time was aggressively evicting cached queries, causing the UI
            // to show empty states when the user navigated between modules.
            gcTime: 24 * 60 * 60 * 1000, // 24 hours — keep cache for a day
            retry: 2, // Retry failed requests twice before giving up
            refetchOnMount: false, // Don't refetch when component mounts if cache exists
            // FIX: throwOnError: false is CRITICAL. Without it, a failed fetch
            // (e.g. 503, network error) throws an error that clears the UI.
            // With throwOnError: false, React Query keeps showing the cached
            // data and silently retries in the background.
            throwOnError: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  )

  // P2#11: Setup offline persistence after mount
  useEffect(() => {
    setupOfflinePersistence(queryClient)
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
