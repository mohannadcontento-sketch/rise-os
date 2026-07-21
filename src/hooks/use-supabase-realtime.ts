'use client'

import { useEffect, useRef } from 'react'

/**
 * useSupabaseRealtime — subscribes to Supabase Realtime changes on key
 * tables filtered by user_id.  When any INSERT / UPDATE / DELETE is
 * received it dispatches the existing `rise:data-changed` CustomEvent so
 * that every component already using `useDataRefresh()` re-fetches
 * automatically — zero changes needed in downstream components.
 *
 * The Supabase JS client is imported lazily (dynamic import) to keep
 * this module safe for SSR / bundle analysis — same pattern as
 * `next-themes` and the existing `src/lib/supabase.ts`.
 */

// ── Config ──
const SUPABASE_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : ''

const SUPABASE_ANON_KEY =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : ''

// Tables to watch for realtime changes
const WATCHED_TABLES = [
  'tasks',
  'habits',
  'projects',
  'goals',
  'journals',
  'health_logs',
  'finance_records',
  'books',
  'knowledge_items',
] as const

// Use `any` for the client & channel since we dynamic-import Supabase
// and defining exact generics would require importing the types at module
// level (which defeats the lazy-load purpose).
type AnyChannel = any
type AnyClient = any

export function useSupabaseRealtime(
  userId: string | null,
  accessToken: string | null,
): void {
  const channelsRef = useRef<AnyChannel[]>([])
  const mountedRef = useRef(true)

  // Track previous userId/accessToken to re-subscribe on auth change
  const prevRef = useRef({ userId, accessToken })

  useEffect(() => {
    mountedRef.current = true

    // Cleanup helper
    function cleanup() {
      channelsRef.current.forEach((ch: AnyChannel) => {
        try {
          ch.unsubscribe()
        } catch {
          /* channel may already be closed */
        }
      })
      channelsRef.current = []
    }

    // Guard: need URL, anon key, userId and accessToken
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !userId || !accessToken) {
      cleanup()
      return
    }

    // Skip if nothing changed
    if (
      prevRef.current.userId === userId &&
      prevRef.current.accessToken === accessToken &&
      channelsRef.current.length > 0
    ) {
      return
    }
    prevRef.current = { userId, accessToken }

    cleanup()

    let client: AnyClient | null = null

    async function subscribe() {
      try {
        // Lazy-import Supabase (SSR-safe)
        const { createClient } = await import('@supabase/supabase-js')

        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        })

        if (!mountedRef.current) {
          client.removeAllChannels()
          return
        }

        const channels: AnyChannel[] = []

        for (const table of WATCHED_TABLES) {
          const channel = client
            .channel(`rt:${table}:${userId}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                filter: `user_id=eq.${userId}`,
              } as any,
              () => {
                // Dispatch the same event that apiFetch dispatches on writes
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('rise:data-changed'))
                }
              },
            )
            .subscribe()

          channels.push(channel)
        }

        if (mountedRef.current) {
          channelsRef.current = channels
        } else {
          channels.forEach((ch: AnyChannel) => ch.unsubscribe())
        }
      } catch (err) {
        // Graceful degradation — realtime is optional
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useSupabaseRealtime] Failed to subscribe:', err)
        }
      }
    }

    subscribe()

    return () => {
      mountedRef.current = false
      cleanup()
      try {
        client?.removeAllChannels()
      } catch {
        /* ignore */
      }
    }
  }, [userId, accessToken])
}