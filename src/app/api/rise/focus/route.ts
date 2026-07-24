import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

// P1#5: Zod validation for focus sessions
const FocusCreateSchema = z.object({
  duration: z.number().int().min(1, 'المدة يجب أن تكون دقيقة واحدة على الأقل').max(480, 'المدة كبيرة جداً'),
  actualMin: z.number().int().min(0).max(480).optional(),
  type: z.enum(['pomodoro', 'deep-work', 'break', 'custom']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  taskId: z.string().optional().nullable(),
  startedAt: z.string().optional(),
}).strict()

const FocusUpdateSchema = z.object({
  id: z.string(),
  actualMin: z.number().int().min(0).max(480).optional(),
  completed: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
}).strict()

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })

    const sessions = await data.focusSessions.list(userId, 50)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Focus GET error:', error)
    return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = FocusCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const session = await data.focusSessions.create(userId, parsed.data)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Focus POST error:', error)
    return NextResponse.json({ error: 'Failed to create focus session' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = FocusUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { id, ...updateData } = parsed.data
    const session = await data.focusSessions.update(id, updateData)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Focus PUT error:', error)
    return NextResponse.json({ error: 'Failed to update focus session' }, { status: 500 })
  }
}
