import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// The goal type select (and every tab/filter/label in goals.tsx) uses 'annual',
// not 'yearly' — the mismatch here made creating or editing any yearly goal fail
// with 400. Fields are `.nullable()` because the UI sends `null` for empty
// optional text fields, which `.optional()` alone rejects.
const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  vision: z.string().max(1000).nullable().optional(),
  why: z.string().max(1000).nullable().optional(),
  type: z.enum(['annual', 'quarterly', 'monthly', 'weekly']).optional(),
  deadline: z.string().nullable().optional(),
})

const updateGoalSchema = z.object({
  id: z.string().uuid('معرف الهدف غير صالح'),
  title: z.string().min(1).max(200).optional(),
  vision: z.string().max(1000).nullable().optional(),
  why: z.string().max(1000).nullable().optional(),
  type: z.enum(['annual', 'quarterly', 'monthly', 'weekly']).optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  deadline: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ goals: [] })

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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const validated = createGoalSchema.parse(body)
    const goal = await data.goals.create(userId, validated)
    return NextResponse.json(goal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Goals POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الهدف' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()

    if (body.milestoneId) {
      const updated = await data.goals.toggleMilestone(body.milestoneId, body.completed)
      return NextResponse.json(updated)
    }

    const validated = updateGoalSchema.parse(body)
    const { id, ...updateBody } = validated
    const goal = await data.goals.update(id, updateBody)
    return NextResponse.json(goal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Goals PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث الهدف' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const id = body.id || searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'معرف الهدف مطلوب' }, { status: 400 })

    await data.goals.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Goals DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف الهدف' }, { status: 500 })
  }
}