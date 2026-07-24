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
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
            refetchOnMount: false,
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
