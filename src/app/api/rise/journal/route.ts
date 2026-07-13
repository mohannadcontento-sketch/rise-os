import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getToday } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const today = getToday()
    const journal = await db.journal.findFirst({ where: { userId: USER_ID, date: today } })
    const recentJournals = await db.journal.findMany({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return NextResponse.json({ journal, recentJournals })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const existing = await db.journal.findFirst({
      where: { userId: USER_ID, date: body.date || getToday() },
    })
    if (existing) {
      const journal = await db.journal.update({ where: { id: existing.id }, data: body })
      return NextResponse.json(journal)
    }
    const journal = await db.journal.create({ data: { userId: USER_ID, date: getToday(), ...body } })
    return NextResponse.json(journal)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}