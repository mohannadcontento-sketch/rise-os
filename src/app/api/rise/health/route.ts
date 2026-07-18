import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday, getLast30Days } from '@/lib/rise-utils'

/** Fields allowed to be stored in HealthLog */
const ALLOWED_FIELDS = [
  'sleepHours', 'sleepQuality', 'waterGlasses', 'steps',
  'calories', 'weight', 'mood', 'energy', 'exerciseType',
  'exerciseMin', 'exerciseNote',
] as const

/** Map frontend field names to data layer field names */
const FIELD_MAP: Record<string, string> = {
  water: 'waterGlasses',
  exercise: 'exerciseType',
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })

    const today = getToday()
    const last30 = getLast30Days()

    const logs = await data.healthLogs.list(userId, last30)
    const todayLog = logs.find((l: any) => l.date === today) || null

    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ logs: [], todayLog: null })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const today = getToday()
    const targetDate = body.date || today

    // Only keep allowed fields, mapping frontend names
    const cleanData: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        cleanData[field] = body[field]
      }
    }
    for (const [frontend, mapped] of Object.entries(FIELD_MAP)) {
      if (body[frontend] !== undefined && cleanData[mapped] === undefined) {
        cleanData[mapped] = body[frontend]
      }
    }

    const result = await data.healthLogs.upsert(userId, targetDate, cleanData)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Health POST error:', error)
    return NextResponse.json({ error: 'Failed to save health log' }, { status: 500 })
  }
}