import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday, getLast30Days } from '@/lib/rise-utils'
import { pickAllowed } from '@/lib/sanitize'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const today = getToday()
    const last30 = getLast30Days()

    const logs = await data.morningLogs.list(userId, last30)
    const todayLog = logs.find((l: any) => l.date === today) || null

    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Morning GET error:', error)
    return NextResponse.json({ logs: [], todayLog: null })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const today = getToday()
    const date = body.date || today

    // Remove date and userId from body — upsert handles them via parameters.
    // FIX: whitelist columns — legacy client fields (e.g. sleep_quality that
    // no migration defines) used to break the upsert with PGRST204.
    const { date: _d, userId: _u, ...upsertData } = body
    const result = await data.morningLogs.upsert(
      userId,
      date,
      pickAllowed(upsertData, ['score', 'completedItems', 'totalItems', 'startedAt', 'completedAt'])
    )
    bustAggregateCache(userId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Morning POST error:', error)
    return NextResponse.json({ error: 'Failed to save morning log' }, { status: 500 })
  }
}