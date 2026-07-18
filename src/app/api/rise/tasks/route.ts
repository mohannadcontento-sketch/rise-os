import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ tasks: [], projects: [] })
    }

    const [tasks, projects] = await Promise.all([
      db.task.findMany({
        where: { userId },
        include: { subtasks: true, project: { select: { name: true, color: true } } },
        orderBy: { order: 'asc' },
      }),
      db.project.findMany({ where: { userId } }),
    ])

    return NextResponse.json({ tasks, projects })
  } catch (error) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({ tasks: [], projects: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'tasks')

    const body = await req.json()
    await ensureUserExists(userId)

    const { projectId, subtasks, ...taskData } = body
    const task = await db.task.create({
      data: {
        userId,
        projectId: projectId || null,
        ...taskData,
      },
      include: { subtasks: true, project: true },
    })

    // Create subtasks if provided
    if (subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
      await db.subTask.createMany({
        data: subtasks.map((s: { title: string; completed?: boolean; order?: number }, i: number) => ({
          taskId: task.id,
          title: s.title,
          completed: s.completed || false,
          order: s.order ?? i,
        })),
      })
      // Re-fetch with subtasks
      const withSubtasks = await db.task.findUnique({
        where: { id: task.id },
        include: { subtasks: true, project: true },
      })
      return NextResponse.json(withSubtasks)
    }

    return NextResponse.json(task)
  } catch (error) {
    return handleRouteError(error, 'tasks')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'tasks')

    const { id, ...body } = await req.json()
    await ensureUserExists(userId)

    const { subtasks, projectId, ...updateData } = body

    const task = await db.task.update({
      where: { id },
      data: {
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...updateData,
      },
      include: { subtasks: true, project: true },
    })

    return NextResponse.json(task)
  } catch (error) {
    return handleRouteError(error, 'tasks')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'tasks')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await ensureUserExists(userId)
    await db.task.deleteMany({ where: { id, userId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'tasks')
  }
}