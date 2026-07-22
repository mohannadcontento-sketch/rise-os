import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createTaskSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().datetime().optional(),
  projectId: z.string().uuid().optional(),
})

const updateTaskSchema = z.object({
  id: z.string().uuid('معرف المهمة غير صالح'),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
  projectId: z.string().uuid().optional(),
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
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.errors }, { status: 400 })
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
    const task = await data.tasks.update(id, updateData)
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.errors }, { status: 400 })
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

    const body = await req.json().catch(() => ({}))
    const searchParams = new URL(req.url).searchParams
    const id = body.id || searchParams.get('id')
    
    if (!id) return NextResponse.json({ error: 'معرف المهمة مطلوب' }, { status: 400 })

    await data.tasks.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Tasks DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف المهمة' }, { status: 500 })
  }
}