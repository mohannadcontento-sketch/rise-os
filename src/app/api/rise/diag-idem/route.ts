import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { setCurrentAuthToken, getRequestAuthTokenDirect } from '@/lib/diag-token'
import { data } from '@/lib/data'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v5 (Task 27-c) — REMOVE after root cause found.
// DECISIVE TEST for module-duplication of request-context (AsyncLocalStorage):
// bind the token via diag-token's import chain, then read it back through the
// DATA LAYER's own import chain (data/core.ts → request-context).
// If tasks.create fails with anon-role errors while the token reads back fine
// here → request-context module is DUPLICATED in the server bundle.
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: Record<string, any> = {}

  setCurrentAuthToken(req)
  const tk = getRequestAuthTokenDirect()
  steps.tokenFromDiagCopy = tk ? `len=${tk.length} prefix=${tk.slice(0, 6)}` : 'UNDEFINED'

  try {
    const created = await data.tasks.create(userId, { title: `diag v5 ${Date.now()}`, status: 'todo', priority: 'medium' })
    steps.dataLayerCreate = `ok id=${(created as any)?.id}`
  } catch (e: any) {
    steps.dataLayerCreate = `FAIL: ${e?.message?.slice(0, 160)}`
  }

  try {
    const listed = await data.tasks.list(userId)
    const arr = (listed as any)?.tasks || listed || []
    steps.dataLayerListCount = Array.isArray(arr) ? arr.length : 'non-array'
  } catch (e: any) {
    steps.dataLayerListCount = `FAIL: ${e?.message?.slice(0, 160)}`
  }

  return NextResponse.json({ steps, userId }, { status: 200 })
}
