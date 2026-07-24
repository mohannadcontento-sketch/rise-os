'use client'

import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'

// ============================================================
// P2#11: Offline strategy — React Query + localStorage persistence
// ------------------------------------------------------------
// Persists query cache to localStorage so data is available offline.
// When connection restores, React Query refetches in background.
// ============================================================

let _persister: ReturnType<typeof createSyncStoragePersister> | null = null

/** Get or create the localStorage persister. */
export function getPersister() {
  if (typeof window === 'undefined') return null
  if (!_persister) {
    _persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: 'riseos-query-cache',
      // Only persist GET queries (no mutations)
      serialize: (data) => JSON.stringify(data),
      deserialize: (str) => JSON.parse(str),
    })
  }
  return _persister
}

/** Setup offline persistence for a QueryClient. */
export function setupOfflinePersistence(queryClient: QueryClient) {
  const persister = getPersister()
  if (!persister) return

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
}
