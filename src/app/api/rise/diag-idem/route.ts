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
    try {
      const result = await data.morningLogs.upsert(userId, today, { score: 55, totalItems: 1, completedItems: 0 })
      steps.push(`write ok: ${JSON.stringify(result).slice(0, 100)}`)
    } catch (e: any) {
      steps.push(`write CAUGHT: ${(e?.stack || e?.message || String(e)).slice(0, 800)}`)
    }
    steps.push(`errors-so-far: ${JSON.stringify((g.__diagErrors || []).slice(-3))}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  return NextResponse.json({ steps, storedErrors: (g.__diagErrors || []).slice(-5) }, { status: 200 })
}
