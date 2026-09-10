import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { withIdempotency } from '@/lib/idempotency'
import { data } from '@/lib/data'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v6 (Task 27-c) — REMOVE after root cause found.
// Bisection of the real route structure. variant=:
//  morning-no-idem : requireUser -> data.morningLogs.upsert -> return
//  idem-fake       : requireUser -> withIdempotency(handler returns fixed json)
//  full            : requireUser -> withIdempotency(handler does morning upsert)
//  clone-then-json : req.clone().text() then req.json() -> return both
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') || 'full'

  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  // auth marker only — token check needs json body; read AFTER fingerprint for clone-then-json variant
  if (variant !== 'clone-then-json') {
    let body: any = null
    try { body = await req.json() } catch {}
    if (body?.token !== DIAG_TOKEN) {
      return NextResponse.json({ error: 'bad token' }, { status: 403 })
    }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })

  if (variant === 'morning-no-idem') {
    const result = await data.morningLogs.upsert(userId, today, { score: 60, totalItems: 2, completedItems: 1 })
    return NextResponse.json({ variant, result }, { status: 200 })
  }

  if (variant === 'idem-fake') {
    return withIdempotency(req, userId, async () =>
      NextResponse.json({ variant, fake: true }, { status: 200 }),
    )
  }

  if (variant === 'full') {
    return withIdempotency(req, userId, async () => {
      const result = await data.morningLogs.upsert(userId, today, { score: 65, totalItems: 2, completedItems: 1 })
      return NextResponse.json({ variant, result }, { status: 200 })
    })
  }

  if (variant === 'clone-then-json') {
    const cloned = await req.clone().text()
    let parsed: any = null
    let jsonErr: string | null = null
    try { parsed = await req.json() } catch (e: any) { jsonErr = e?.message }
    return NextResponse.json({
      variant,
      clonedLen: cloned.length,
      jsonOk: !!parsed,
      tokenOk: parsed?.token === DIAG_TOKEN,
      jsonErr,
    }, { status: 200 })
  }

  return NextResponse.json({ error: 'unknown variant' }, { status: 400 })
}
