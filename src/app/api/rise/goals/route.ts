import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ goals: [] })
    }

    const goals = await db.goal.findMany({
      where: { userId },
      include: { milestones: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({ goals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'goals')

    await ensureUserExists(userId)

    const body = await req.json()
    const goal = await db.goal.create({
      data: { userId, ...body },
    })
    return NextResponse.json(goal)
  } catch (error) {
    return handleRouteError(error, 'goals')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'goals')

    await ensureUserExists(userId)

    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
      // Verify milestone belongs to user's goal
      const milestone = await db.milestone.findUnique({
        where: { id: body.milestoneId },
        include: { goal: { select: { userId: true } } },
      })
      if (!milestone || milestone.goal?.userId !== userId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }

      const updated = await db.milestone.update({
        where: { id: body.milestoneId },
        data: { completed: body.completed },
      })
      return NextResponse.json(updated)
    }

    const { id, ...updateBody } = body
    const goal = await db.goal.update({
      where: { id },
      data: updateBody,
    })
    return NextResponse.json(goal)
  } catch (error) {
    return handleRouteError(error, 'goals')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'goals')

    await ensureUserExists(userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.goal.deleteMany({ where: { id, userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'goals')
  }
}