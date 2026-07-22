import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// NOTE: dueDate is stored as a plain string (not a DB datetime column) and the
// UI's <input type="date"> always sends "YYYY-MM-DD", never a full ISO datetime —
// so this only checks it's a non-empty string rather than requiring `.datetime()`.
// Fields below are `.nullable()` because the UI explicitly sends `null` for empty
// optional fields (e.g. `description: formDesc.trim() || null`), which
// `.optional()` alone does not accept (it only allows the key to be absent).
const createTaskSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  description: z.string().max(1000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().min(1).nullable().optional(),
  dueTime: z.string().nullable().optional(),
  projectId: z.string().uuid().optional(),
  dependsOn: z.string().nullable().optional(),
})

const updateTaskSchema = z.object({
  id: z.string().uuid('معرف المهمة غير صالح'),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().min(1).nullable().optional(),
  dueTime: z.string().nullable().optional(),
  // 'in_progress' (underscore) matches the value used everywhere in the UI
  // (kanban columns, filters, STATUSES const) — the previous 'in-progress'
  // (hyphen) never matched, so moving a task to "in progress" always failed.
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  projectId: z.string().uuid().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  order: z.number().int().optional(),
  dependsOn: z.string().nullable().optional(),
})

const subtaskUpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ tasks: [], projects: [] })

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
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
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

    // Subtask completion/edits (sent as { id, subtasks: [...] }) go through a
    // separate table and were previously stripped silently because `subtasks`
    // wasn't declared on updateTaskSchema — toggling a subtask never persisted.
    if (Array.isArray(body.subtasks)) {
      const subtasks = z.array(subtaskUpdateSchema).parse(body.subtasks)
      await data.tasks.updateSubtasks(subtasks)
      const { subtasks: _st, ...rest } = body
      if (Object.keys(rest).length <= 1) {
        // Only { id, subtasks } was sent — nothing else to update on the task itself.
        const task = await data.tasks.get(body.id)
        return NextResponse.json(task)
      }
      body.subtasks = undefined
    }

    const validated = updateTaskSchema.parse(body)
    const { id, ...updateData } = validated
    
    const task = await data.tasks.update(id, updateData)
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
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