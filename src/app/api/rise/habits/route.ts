import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'
import { getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ habits: [], logs: [] })
    }

    const habits = await db.habit.findMany({ where: { userId } })
    const last30 = getLast30Days()
    const habitIds = habits.map(h => h.id)

    let logs: Array<{ id: string; habitId: string; date: string; completed: boolean; count: number; createdAt: Date }> = []
    if (habitIds.length > 0) {
      logs = await db.habitLog.findMany({
        where: { habitId: { in: habitIds }, date: { in: last30 } },
      })
    }

    return NextResponse.json({ habits, logs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({ habits: [], logs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'habits')

    const body = await req.json()
    await ensureUserExists(userId)

    const habit = await db.habit.create({
      data: { userId, ...body },
    })
    return NextResponse.json(habit)
  } catch (error) {
    return handleRouteError(error, 'habits')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'habits')

    await ensureUserExists(userId)
    const body = await req.json()

    // Habit log toggle (from frontend habit toggle)
    if (body.habitId && body.date !== undefined) {
      // Verify habit belongs to current user
      const habit = await db.habit.findUnique({
        where: { id: body.habitId },
        select: { userId: true },
      })
      if (!habit || habit.userId !== userId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }

      const existing = await db.habitLog.findFirst({
        where: { habitId: body.habitId, date: body.date },
      })

      if (existing && !body.completed) {
        // Delete the log entry when unchecking
        await db.habitLog.delete({ where: { id: existing.id } })
        return NextResponse.json({ success: true })
      } else if (!existing && body.completed) {
        // Create log entry when checking
        const log = await db.habitLog.create({
          data: {
            habitId: body.habitId,
            date: body.date,
            completed: true,
            count: body.count !== undefined ? body.count : 1,
          },
        })
        return NextResponse.json(log)
      } else if (existing && body.completed) {
        // Update count if already exists
        const log = await db.habitLog.update({
          where: { id: existing.id },
          data: { completed: true, count: body.count || 1 },
        })
        return NextResponse.json(log)
      }
      return NextResponse.json({ success: true })
    }

    // Normal habit update
    const { id, ...updateBody } = body
    const habit = await db.habit.update({
      where: { id },
      data: updateBody,
    })
    return NextResponse.json(habit)
  } catch (error) {
    return handleRouteError(error, 'habits')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'habits')

    await ensureUserExists(userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.habit.deleteMany({ where: { id, userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'habits')
  }
}