import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
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
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const today = getToday()
    const journalDate = body.date || today

    // Remove date from body since upsert handles it via the date parameter
    const { date: _d, ...journalData } = body
    const result = await data.journals.upsert(userId, journalDate, journalData)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Journal POST error:', error)
    return NextResponse.json({ error: 'Failed to save journal' }, { status: 500 })
  }
}