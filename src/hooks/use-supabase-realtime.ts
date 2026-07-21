'use client'

import { useEffect, useRef } from 'react'

/**
 * useSupabaseRealtime — subscribes to Supabase Realtime changes on key
 * tables filtered by user_id.  When any INSERT / UPDATE / DELETE is
 * received it dispatches the existing `rise:data-changed` CustomEvent so
 * that the dashboard (which still uses refreshKey) re-fetches automatically.
 *
 * Uses a SINGLE shared Supabase client instance to avoid
 * "Multiple GoTrueClient instances" warnings.
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

type AnyChannel = any
type AnyClient = any

// Shared client singleton — avoids multiple GoTrueClient instances
let sharedClient: AnyClient | null = null
let sharedClientToken: string | null = null

async function getSharedClient(accessToken: string): Promise<AnyClient> {
  // Reuse client if token hasn't changed
  if (sharedClient && sharedClientToken === accessToken) {
    return sharedClient
  }
  // Clean up old client
  if (sharedClient) {
    try { sharedClient.removeAllChannels() } catch { /* ignore */ }
  }
  const { createClient } = await import('@supabase/supabase-js')
  sharedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
  sharedClientToken = accessToken
  return sharedClient
}

export function useSupabaseRealtime(
  userId: string | null,
  accessToken: string | null,
): void {
  const channelsRef = useRef<AnyChannel[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    function cleanup() {
      channelsRef.current.forEach((ch: AnyChannel) => {
        try { ch.unsubscribe() } catch { /* channel may already be closed */ }
      })
      channelsRef.current = []
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !userId || !accessToken) {
      cleanup()
      return
    }

    cleanup()

    async function subscribe() {
      try {
        const client = await getSharedClient(accessToken)

        if (!mountedRef.current) return

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
                // Only dispatch for dashboard (other components use optimistic state)
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
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useSupabaseRealtime] Failed to subscribe:', err)
        }
      }
    }

    subscribe()

    return () => {
      mountedRef.current = false
      cleanup()
      // Don't remove all channels — shared client might be used by other instances
    }
  }, [userId, accessToken])
}