import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'
import { getToday } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ journal: null, recentJournals: [] })

    const today = getToday()

    const [journal, recentJournals] = await Promise.all([
      db.journal.findFirst({ where: { userId, date: today } }),
      db.journal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
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
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'journal')

    await ensureUserExists(userId)

    const body = await req.json()
    const today = getToday()
    const journalDate = body.date || today

    const existing = await db.journal.findFirst({
      where: { userId, date: journalDate },
    })

    if (existing) {
      const { date: _d, ...updateData } = body
      const updated = await db.journal.update({
        where: { id: existing.id },
        data: updateData,
      })
      return NextResponse.json(updated)
    } else {
      const { date: _d, ...createData } = body
      const created = await db.journal.create({
        data: { userId, date: journalDate, ...createData },
      })
      return NextResponse.json(created)
    }
  } catch (error) {
    return handleRouteError(error, 'journal')
  }
}