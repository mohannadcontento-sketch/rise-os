import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { pickAllowed } from '@/lib/sanitize'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const goals = await data.goals.list(userId)
    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({ goals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()

    // Add milestone to existing goal: { goalId, milestoneTitle }
    if (body.goalId && body.milestoneTitle) {
      const milestone = await data.goals.addMilestone(body.goalId, userId, body.milestoneTitle)
      bustAggregateCache(userId)
      return NextResponse.json(milestone)
    }

    // Create new goal — whitelist columns (legacy client fields break the write)
    const goal = await data.goals.create(
      userId,
      pickAllowed(body, ['title', 'vision', 'why', 'type', 'progress', 'status', 'deadline'])
    )
    bustAggregateCache(userId)
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Goals POST error:', error)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
      const updated = await data.goals.toggleMilestone(body.milestoneId, userId, body.completed)
      // FIX: Recalculate and update goal progress after milestone toggle
      try {
        // Find the goal that owns this milestone
        const allGoals = await data.goals.list(userId)
        const goal = allGoals.find((g: any) =>
          (g.milestones || []).some((m: any) => m.id === body.milestoneId)
        )
        if (goal) {
          const milestones = goal.milestones || []
          const completedCount = milestones.filter((m: any) => m.completed).length
          const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0
          await data.goals.update(goal.id, userId, { progress, status: progress === 100 ? 'done' : 'active' })
        }
      } catch { /* non-critical */ }
      bustAggregateCache(userId)
      return NextResponse.json(updated)
    }

    const { id, ...updateBody } = body
    // FIX: a stale client used to PUT without a valid id → Postgres
    // 'invalid input syntax for type uuid: "undefined"'. Fail cleanly instead.
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: 'معرّف الهدف مطلوب' }, { status: 400 })
    }
    const goal = await data.goals.update(
      id,
      userId,
      pickAllowed(updateBody, ['title', 'vision', 'why', 'type', 'progress', 'status', 'deadline'])
    )
    bustAggregateCache(userId)
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Goals PUT error:', error)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.goals.remove(id, userId)
    bustAggregateCache(userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Goals DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}