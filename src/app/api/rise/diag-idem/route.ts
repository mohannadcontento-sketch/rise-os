import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v9 (Task 27-c) — REMOVE after root cause found.
// Installs process-level error traps; any uncaught crash on this warm lambda
// is stored and returned on subsequent requests.
const g = globalThis as typeof globalThis & {
  __diagErrors?: string[]
  __diagHandlers?: boolean
}
if (!g.__diagHandlers) {
  g.__diagErrors = []
  process.on('uncaughtException', (e) => {
    g.__diagErrors!.push(`UCE: ${(e && (e.stack || e.message)) || String(e)}`.slice(0, 1500))
  })
  process.on('unhandledRejection', (e) => {
    const anyE = e as any
    g.__diagErrors!.push(`UR: ${(anyE && (anyE.stack || anyE.message)) || String(e)}`.slice(0, 1500))
  })
  g.__diagHandlers = true
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') || 'sb-write'

  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== 'diag-27c-6f4b2e91a7d84c0f') {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: string[] = []
  steps.push(`variant=${variant} pid=${process.pid}`)

  if (variant === 'sb-write') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
    // what does the data layer actually see?
    const { getRequestAuthToken } = await import('@/lib/request-context')
    const seen = getRequestAuthToken()
    steps.push(`sb-token: ${seen ? 'len=' + seen.length + ' head=' + seen.slice(0, 6) : 'NONE'}`)
    try {
      const result = await data.morningLogs.upsert(userId, today, { score: 55, totalItems: 1, completedItems: 0 })
      steps.push(`write ok: ${JSON.stringify(result).slice(0, 100)}`)
    } catch (e: any) {
      steps.push(`write CAUGHT: ${(e?.message || String(e)).slice(0, 200)}`)
    }

    // (b) manual client WITH auth options (persistSession:false)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const tk2 = seen || ''
      const c2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
        global: { headers: { Authorization: `Bearer ${tk2}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { error } = await c2.from('morning_logs').upsert(
        { user_id: userId, date: today, score: 45, total_items: 1, completed_items: 0 },
        { onConflict: 'user_id,date' },
      )
      steps.push(`manual+authOpts write: ${error ? 'ERR ' + error.message : 'ok'}`)
    } catch (e: any) {
      steps.push(`manual+authOpts THROW: ${e?.message}`)
    }

    steps.push(`errors-so-far: ${JSON.stringify((g.__diagErrors || []).slice(-3))}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  return NextResponse.json({ steps, storedErrors: (g.__diagErrors || []).slice(-5) }, { status: 200 })
}
