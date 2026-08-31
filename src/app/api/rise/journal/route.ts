import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

// Task 24: input validation — bad payloads (e.g. mood:'good' string) used to
// hit the DB raw and answer 500. Now rejected with a clear 400.
const JournalCreateSchema = z.object({
  content: z.string().max(20000).optional().nullable(),
  gratitude: z.string().max(5000).optional().nullable(),
  wins: z.string().max(5000).optional().nullable(),
  challenges: z.string().max(5000).optional().nullable(),
  ideas: z.string().max(5000).optional().nullable(),
  tomorrowPlan: z.string().max(5000).optional().nullable(),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  energy: z.number().int().min(1).max(5).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough()

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const today = getToday()

    const [journal, recentJournals] = await Promise.all([
      data.journals.get(userId, today),
      data.journals.list(userId, 30),
    ])

    return NextResponse.json({ journal: journal || null, recentJournals })
  } catch (error) {
    console.error('Journal GET error:', error)
    return NextResponse.json({ journal: null, recentJournals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()
    const parsed = JournalCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات اليومية غير صالحة' },
        { status: 400 },
      )
    }
    const today = getToday()
    const journalDate = parsed.data.date || today

    // Remove date from body since upsert handles it via the date parameter
    const { date: _d, ...journalData } = parsed.data
    const result = await data.journals.upsert(userId, journalDate, journalData)
    bustAggregateCache(userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Journal POST error:', error)
    return NextResponse.json({ error: 'Failed to save journal' }, { status: 500 })
  }
}