import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'
import { getToday, getLast30Days } from '@/lib/rise-utils'

/** Fields allowed to be stored in HealthLog */
const ALLOWED_FIELDS = [
  'sleepHours', 'sleepQuality', 'waterGlasses', 'steps',
  'calories', 'weight', 'mood', 'energy', 'exerciseType',
  'exerciseMin', 'exerciseNote',
] as const

/** Map frontend field names to Prisma field names */
const FIELD_MAP: Record<string, string> = {
  water: 'waterGlasses',
  exercise: 'exerciseType',
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })

    const today = getToday()
    const last30 = getLast30Days()

    const logs = await db.healthLog.findMany({
      where: { userId, date: { in: last30 } },
      orderBy: { date: 'desc' },
    })

    const todayLog = logs.find(l => l.date === today) || null
    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ logs: [], todayLog: null })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'health')

    await ensureUserExists(userId)

    const body = await req.json().catch(() => ({}))
    const today = getToday()
    const targetDate = body.date || today

    // Only keep allowed fields, mapping frontend names to Prisma names
    const cleanData: Record<string, unknown> = { userId, date: targetDate }
    for (const field of ALLOWED_FIELDS) {
      // Check both the Prisma field name and any mapped frontend name
      if (body[field] !== undefined) {
        cleanData[field] = body[field]
      }
    }
    // Also handle mapped fields from frontend (water → waterGlasses, exercise → exerciseType)
    for (const [frontend, prisma] of Object.entries(FIELD_MAP)) {
      if (body[frontend] !== undefined && cleanData[prisma] === undefined) {
        cleanData[prisma] = body[frontend]
      }
    }

    const existing = await db.healthLog.findFirst({
      where: { userId, date: targetDate },
    })

    if (existing) {
      const { date: _d, userId: _u, ...updateData } = cleanData
      const updated = await db.healthLog.update({
        where: { id: existing.id },
        data: updateData as Record<string, unknown>,
      })
      return NextResponse.json(updated)
    }

    const { date: _d, userId: _u, ...createData } = cleanData
    const created = await db.healthLog.create({
      data: createData as Record<string, unknown>,
    })
    return NextResponse.json(created)
  } catch (error) {
    return handleRouteError(error, 'health')
  }
}