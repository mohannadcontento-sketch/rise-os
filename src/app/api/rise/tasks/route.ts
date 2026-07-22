import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createTaskSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  description: z.string().max(1000).optional(),
  // ✅ FIX: Accept 'urgent' priority and both 'in-progress'/'in_progress' status formats
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().optional(),
  projectId: z.string().uuid().optional(),
  status: z
    .enum(['todo', 'in-progress', 'in_progress', 'done', 'cancelled'])
    .optional(),
  order: z.number().optional(),
})

const updateTaskSchema = z.object({
  id: z.string().uuid('معرف المهمة غير صالح'),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  // ✅ FIX: Accept 'urgent' priority and both status formats
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().nullable().optional(),
  status: z
    .enum(['todo', 'in-progress', 'in_progress', 'done', 'cancelled'])
    .optional(),
  projectId: z.string().uuid().nullable().optional(),
  // ✅ FIX: Accept completedAt so it can be set/cleared
  completedAt: z.string().nullable().optional(),
  order: z.number().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) {
      return NextResponse.json({ tasks: [], projects: [] })
    }

    const [tasks, projects] = await Promise.all([
      data.tasks.list(userId),
      data.projects.list(userId),
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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const validated = createTaskSchema.parse(body)
    const task = await data.tasks.create(userId, validated)
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: error.issues },
        { status: 400 },
      )
    }
    console.error('Tasks POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المهمة' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const validated = updateTaskSchema.parse(body)
    const { id, ...updateData } = validated

    // ✅ FIX: Auto-set completedAt when task is marked done
    if (updateData.status === 'done' && !updateData.completedAt) {
      ;(updateData as any).completedAt = new Date().toISOString()
    }
    // ✅ FIX: Clear completedAt when task is moved back from done
    if (updateData.status && updateData.status !== 'done') {
      ;(updateData as any).completedAt = null
    }

    const task = await data.tasks.update(id, updateData)
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: error.issues },
        { status: 400 },
      )
    }
    console.error('Tasks PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث المهمة' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    // ✅ FIX: Support both body.id and ?id= query param
    const body = await req.json().catch(() => ({}))
    const searchParams = new URL(req.url).searchParams
    const id = body.id || searchParams.get('id')

    if (!id)
      return NextResponse.json({ error: 'معرف المهمة مطلوب' }, { status: 400 })

    await data.tasks.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Tasks DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف المهمة' }, { status: 500 })
  }
}
