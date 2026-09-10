import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v3 (Task 27-c) — REMOVE after root cause found.
// POST { token } → runs the REAL data-layer calls with per-step 8s timeout.
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'
const withTimeout = async <T,>(label: string, p: Promise<T>, ms = 8000) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const res = await Promise.race([
      p,
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms) }),
    ])
    return { step: label, result: 'ok' }
  } catch (e: any) {
    return { step: label, result: `FAIL: ${e?.message?.slice(0, 200)}` }
  } finally { if (timer) clearTimeout(timer) }
}

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: any[] = []

  // 1. read tasks (user-scoped sb() path)
  steps.push(await withTimeout('tasks.list', data.tasks.list(userId).then(r => r)))

  // 2. create task via real data layer (RPC path)
  const createRes = await (async () => {
    const r = await withTimeout('tasks.create', data.tasks.create(userId, { title: `diag v3 ${Date.now()}`, status: 'todo', priority: 'medium' }))
    return r
  })()
  steps.push(createRes)

  // 3. morning upsert
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
  steps.push(await withTimeout('morning.upsert', data.morningLogs.upsert(userId, today, { score: 50, totalItems: 1, completedItems: 0 })))

  // 4. bustAggregateCache
  steps.push(await withTimeout('bustAggregateCache', Promise.resolve(bustAggregateCache(userId))))

  // 5. delete created task (cleanup) — find it first
  steps.push(await withTimeout('cleanup', (async () => {
    const tasks = await data.tasks.list(userId)
    const mine = (tasks as any)?.tasks?.filter((t: any) => t.title?.startsWith('diag v3')) || []
    for (const t of mine) await data.tasks.remove(t.id, userId)
    return `deleted ${mine.length}`
  })()))

  return NextResponse.json({ steps, userId }, { status: 200 })
}
