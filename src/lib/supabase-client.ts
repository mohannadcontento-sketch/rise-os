'use client'

// ============================================================
// RiseOS — Client-side Supabase client
// ------------------------------------------------------------
// Key config:
//   persistSession: true   → session stored in localStorage (rise-auth key)
//   autoRefreshToken: true → Supabase refreshes the JWT ~60s before expiry
//                            (PREVENTS the 401 storm that happened when the
//                             JWT expired and the reactive refresh raced)
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const isSupabaseClientConfigured: boolean = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabaseClient: SupabaseClient | null = isSupabaseClientConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'rise-auth',
      },
    })
  : null
