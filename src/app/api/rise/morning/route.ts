import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })

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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const today = getToday()
    const date = body.date || today

    // Remove date and userId from body — upsert handles them via parameters
    const { date: _d, userId: _u, ...upsertData } = body
    const result = await data.morningLogs.upsert(userId, date, upsertData)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Morning POST error:', error)
    return NextResponse.json({ error: 'Failed to save morning log' }, { status: 500 })
  }
}