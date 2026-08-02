import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'

export const dynamic = 'force-dynamic'

// P2#2: Paginated tasks list (backward compatible — no params = all)
// P1#5: Zod validation on POST/PUT
// FIX: Accept both 'in_progress' (underscore, used by frontend) and 'in-progress' (hyphen).
// Normalize to 'in_progress' so the DB stores a consistent format.
const TaskStatusSchema = z
  .enum(['todo', 'in_progress', 'in-progress', 'done'])
  .transform((v) => (v === 'in-progress' ? 'in_progress' : v))

const TaskCreateSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب').max(200),
  description: z.string().max(2000).optional().nullable(),
  status: TaskStatusSchema.optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  label: z.string().max(50).optional().nullable(),
  projectId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  estimatedMin: z.number().int().min(0).max(600).optional().nullable(),
  xpReward: z.number().int().min(0).max(500).optional(),
  dependsOn: z.string().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.string().optional().nullable(),
  order: z.number().int().optional(),
}).strict()

// FIX: Removed .strict() — the frontend may send extra fields (dependsOn,
// recurringPattern, etc.) during updates. .strict() rejected them with 400.
const TaskUpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: TaskStatusSchema.optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  completedAt: z.string().optional().nullable(),
  label: z.string().max(50).optional().nullable(),
  projectId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  estimatedMin: z.number().int().min(0).max(600).optional().nullable(),
  xpReward: z.number().int().min(0).max(500).optional(),
  order: z.number().int().optional(),
  dependsOn: z.string().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) {
      return NextResponse.json({ tasks: [], projects: [] })
    }

    const [allTasks, projects] = await Promise.all([
      data.tasks.list(userId),
      data.projects.list(userId),
    ])

    // P2#2: If page param is present, return paginated response
    const url = new URL(req.url)
    const hasPagination = url.searchParams.has('page')

    if (hasPagination) {
      const params = getPaginationParams(req)
      // Optional status filter
      const status = url.searchParams.get('status')
      let filtered = allTasks
      if (status) filtered = allTasks.filter((t: any) => t.status === status)

      const pageData = filtered.slice(params.offset, params.offset + params.limit)
      const paginatedResp = NextResponse.json(paginatedResponse(pageData, filtered.length, params))
      paginatedResp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      return paginatedResp
    }

    // Backward compatible: return all tasks (no pagination)
    const response = NextResponse.json({ tasks: allTasks, projects })
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return response
  } catch (error) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({ tasks: [], projects: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = TaskCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    // Convert empty strings to null (Supabase rejects empty strings in some configs)
    const cleanData: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsed.data)) {
      cleanData[k] = v === '' ? null : v
    }

    const task = await data.tasks.create(userId, cleanData)
    return NextResponse.json(task)
  } catch (error) {
    console.error('Tasks POST error:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = TaskUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { id, ...updateData } = parsed.data
    const task = await data.tasks.update(id, userId, updateData)
    return NextResponse.json(task)
  } catch (error) {
    console.error('Tasks PUT error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
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

    await data.tasks.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Tasks DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
