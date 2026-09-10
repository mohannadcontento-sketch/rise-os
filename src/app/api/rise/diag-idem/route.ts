import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { setCurrentAuthToken, getRequestAuthTokenDirect } from '@/lib/diag-token'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v7 (Task 27-c) — REMOVE after root cause found.
// Isolate: enterWith(ALS) + supabase-call interaction post-singleton.
// variant=:
//  admin-no-auth : NO requireUser (no enterWith) -> admin select
//  admin-auth    : requireUser (enterWith) -> admin select
//  raw-fetch     : requireUser -> raw fetch to supabase REST root
//  bind-manual   : requireUser + extra setCurrentAuthToken -> admin select
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') || 'admin-auth'

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: string[] = []
  steps.push(`variant=${variant}`)

  if (variant === 'admin-no-auth') {
    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ steps, err: 'no admin' }, { status: 200 })
    const { error } = await admin.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'admin-auth') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ steps, err: 'no admin' }, { status: 200 })
    const { error } = await admin.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'bind-manual') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    setCurrentAuthToken(req)
    steps.push(`token=${getRequestAuthTokenDirect()?.length || 'none'}`)
    const admin = await getSupabaseAdmin()
    const { error } = await admin!.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'raw-fetch') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    try {
      const r = await fetch(base + '/rest/v1/', {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        signal: AbortSignal.timeout(10000),
      })
      steps.push(`raw fetch: ${r.status}`)
    } catch (e: any) {
      steps.push(`raw fetch THROW: ${e?.message}`)
    }
    return NextResponse.json({ steps }, { status: 200 })
  }

  return NextResponse.json({ error: 'unknown variant' }, { status: 400 })
}
