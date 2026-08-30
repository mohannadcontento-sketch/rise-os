import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

/**
 * "الشغل" — Work Sessions
 * Long-form work blocks (e.g. "5 ساعات شغل") as opposed to the
 * pomodoro-style Deep Work timer. Tracks planned vs. actual time,
 * breaks taken, and tasks accomplished, then computes a 0-100
 * quality score for the session.
 */

const BreakLogSchema = z.object({
  start: z.string(),
  end: z.string().optional().nullable(),
  min: z.number().int().min(0).max(1440).optional(),
})

const WorkCreateSchema = z.object({
  title: z.string().max(120).optional().nullable(),
  plannedMin: z.number().int().min(1).max(1440), // up to 24h
  startedAt: z.string().optional().nullable(),
}).strict()

const WorkUpdateSchema = z.object({
  id: z.string(),
  title: z.string().max(120).optional().nullable(),
  activeMin: z.number().int().min(0).max(1440).optional(),
  breakMin: z.number().int().min(0).max(1440).optional(),
  breaksCount: z.number().int().min(0).max(200).optional(),
  breaksLog: z.array(BreakLogSchema).optional(),
  taskIds: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
  completedAt: z.string().optional().nullable(),
}).strict()

/** Quality score (0-100):
 *  - 45%  duration:   كم من الوقت المخطط له فعلاً تم العمل فيه
 *  - 35%  focus:       نسبة وقت العمل الفعلي إلى (عمل + استراحات)
 *  - 20%  إنجاز:      وجود مهام مُنجزة خلال الجلسة (لا تُعاقب الجلسات بدون مهام مرتبطة)
 */
function computeQualityScore(opts: {
  plannedMin: number
  activeMin: number
  breakMin: number
  tasksCompleted: number
}): number {
  const { plannedMin, activeMin, breakMin, tasksCompleted } = opts
  const durationRatio = plannedMin > 0 ? Math.min(1, activeMin / plannedMin) : 0
  const totalElapsed = activeMin + breakMin
  const focusRatio = totalElapsed > 0 ? Math.min(1, activeMin / totalElapsed) : 1
  const achievement = tasksCompleted > 0 ? Math.min(1, tasksCompleted / 3) : 0.5

  const score = durationRatio * 45 + focusRatio * 35 + achievement * 20
  return Math.max(0, Math.min(100, Math.round(score)))
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const sessions = await data.workSessions.list(userId, 50)
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Work GET error:', error)
    return NextResponse.json({ sessions: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    const parsed = WorkCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const session = await data.workSessions.create(userId, {
      title: parsed.data.title ?? null,
      plannedMin: parsed.data.plannedMin,
      startedAt: parsed.data.startedAt || new Date().toISOString(),
      status: 'active',
      activeMin: 0,
      breakMin: 0,
      breaksCount: 0,
      tasksCompleted: 0,
    })
    return NextResponse.json(session)
  } catch (error) {
    console.error('Work POST error:', error)
    return NextResponse.json({ error: 'فشل في بدء جلسة الشغل' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    const parsed = WorkUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { id, breaksLog, taskIds, ...rest } = parsed.data
    const updateData: Record<string, any> = { ...rest }
    if (breaksLog) updateData.breaksLog = JSON.stringify(breaksLog)
    if (taskIds) {
      updateData.taskIds = JSON.stringify(taskIds)
      updateData.tasksCompleted = taskIds.length
    }

    // Compute the quality score the moment a session is marked completed.
    if (rest.status === 'completed') {
      const existing = await data.workSessions.get(id, userId)
      const plannedMin = existing?.plannedMin ?? 0
      const activeMin = rest.activeMin ?? existing?.activeMin ?? 0
      const breakMin = rest.breakMin ?? existing?.breakMin ?? 0
      const tasksCompleted = taskIds ? taskIds.length : (existing?.tasksCompleted ?? 0)
      updateData.qualityScore = computeQualityScore({ plannedMin, activeMin, breakMin, tasksCompleted })
      if (!updateData.completedAt) updateData.completedAt = new Date().toISOString()
    }

    const session = await data.workSessions.update(id, userId, updateData)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Work PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث جلسة الشغل' }, { status: 500 })
  }
}
