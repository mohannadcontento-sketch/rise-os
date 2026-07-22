import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const journalSchema = z.object({
  date: z.string().optional(),
  content: z.string().max(10000).optional(),
  gratitude: z.string().max(2000).optional(),
  wins: z.string().max(2000).optional(),
  challenges: z.string().max(2000).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  ideas: z.string().max(2000).optional(),
  tomorrowPlan: z.string().max(2000).optional(),
  tags: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ journal: null, recentJournals: [] })

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
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const validated = journalSchema.parse(body)
    
    const today = getToday()
    const journalDate = validated.date || today

    const { date: _d, ...journalData } = validated
    const result = await data.journals.upsert(userId, journalDate, journalData)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Journal POST error:', error)
    return NextResponse.json({ error: 'فشل في حفظ اليومية' }, { status: 500 })
  }
}