'use client'

// ============================================================
// offline-persist.ts — مداومة React Query المشفّرة
//
// يربط persistQueryClient بـ secure-offline-db (IndexedDB مشفّر بمفتاح
// AES-GCM لكل مستخدم) بدلاً من localStorage، فيبقى عرض البيانات متاحاً
// دون اتصال. يستهلكه query-provider عند إقلاع التطبيق.
//
// المسؤوليات:
//   1) getPersister: واجهة persistClient/restoreClient/removeClient
//      مقيدة بمعرّف المستخدم الحالي — تُرجع null في SSR أو بلا جلسة
//      (لا مداومة بلا هوية).
//   2) setupOfflinePersistence: تركيب المداومة بحدّ عمر 7 أيام
//      وbuster يُبطل أي ذاكرة من صيغة بنية أقدم.
//
// حدود: لا يلمس localStorage إطلاقاً — كل بيانات التطبيق تمر عبر
// التخزين المشفّر؛ طابور الطفرات دون اتصال مسؤولية api-fetch.
// ============================================================

import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { QueryClient } from '@tanstack/react-query'
import { loadQueryCache, saveQueryCache, clearQueryCacheStore } from '@/lib/secure-offline-db'

interface PersistedClientStorage {
  persistClient: (client: any) => Promise<void>
  restoreClient: () => Promise<any | undefined>
  removeClient: () => Promise<void>
}

function getCurrentUserId(): string {
  if (typeof window === 'undefined') return ''
  try { return JSON.parse(localStorage.getItem('rise-user-info') || '{}').id || '' } catch { return '' }
}

/**
 * User-bound encrypted React Query persistence.
 * No application data is stored in localStorage anymore.
 */
export function getPersister(): PersistedClientStorage | null {
  if (typeof window === 'undefined') return null
  const userId = getCurrentUserId()
  if (!userId) return null

  return {
    persistClient: async (client) => {
      await saveQueryCache(userId, client)
    },
    restoreClient: async () => {
      return await loadQueryCache<any>(userId) ?? undefined
    },
    removeClient: async () => {
      await clearQueryCacheStore(userId)
    },
  }
}

/** Setup encrypted, user-scoped offline persistence for a QueryClient. */
export function setupOfflinePersistence(queryClient: QueryClient) {
  const persister = getPersister()
  if (!persister) return

  return persistQueryClient({
    queryClient,
    persister,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    buster: 'riseos-secure-cache-v2',
  })
}
