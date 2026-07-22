import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createHabitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  targetCount: z.number().int().min(1).optional(),
  reminderTime: z.string().optional(),
  xpReward: z.number().int().min(0).optional(),
})

const updateHabitSchema = z.object({
  id: z.string().uuid('معرف العادة غير صالح'),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  targetCount: z.number().int().min(1).optional(),
  reminderTime: z.string().optional(),
  xpReward: z.number().int().min(0).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ habits: [], logs: [] })

    const habitsWithLogs = await data.habits.list(userId)
    const logs = habitsWithLogs.flatMap(h => h.logs)
    const habits = habitsWithLogs.map(({ logs: _l, ...rest }) => rest)

    return NextResponse.json({ habits, logs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({ habits: [], logs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const validated = createHabitSchema.parse(body)
    const habit = await data.habits.create(userId, validated)
    return NextResponse.json(habit)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Habits POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العادة' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()

    if (body.habitId && body.date !== undefined) {
      const log = await data.habits.toggleLog(
        body.habitId,
        body.date,
        body.completed,
        body.count !== undefined ? body.count : 1,
      )
      return NextResponse.json(log)
    }

    const validated = updateHabitSchema.parse(body)
    const { id, ...updateBody } = validated
    const habit = await data.habits.update(id, updateBody)
    return NextResponse.json(habit)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Habits PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث العادة' }, { status: 500 })
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
    if (!id) return NextResponse.json({ error: 'معرف العادة مطلوب' }, { status: 400 })

    await data.habits.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Habits DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف العادة' }, { status: 500 })
  }
}