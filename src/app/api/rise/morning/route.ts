import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })

    const today = getToday()
    const last30 = getLast30Days()

    const logs = await db.morningLog.findMany({
      where: { userId, date: { in: last30 } },
      orderBy: { date: 'desc' },
    })

    const todayLog = logs.find((l) => l.date === today) || null
    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Morning GET error:', error)
    return NextResponse.json({ logs: [], todayLog: null })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'morning')

    await ensureUserExists(userId)

    const body = await req.json()
    const today = getToday()
    const date = body.date || today

    // Upsert: check if log exists for this date
    const existing = await db.morningLog.findFirst({
      where: { userId, date },
    })

    let result
    if (existing) {
      // Remove date and userId from body to avoid overwriting
      const { date: _d, userId: _u, ...updateData } = body
      result = await db.morningLog.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      const { date: _d, ...createData } = body
      result = await db.morningLog.create({
        data: { userId, date, ...createData },
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    return handleRouteError(error, 'morning')
  }
}