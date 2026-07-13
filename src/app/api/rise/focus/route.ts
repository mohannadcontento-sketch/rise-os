import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const sessions = await db.focusSession.findMany({
      where: { userId: USER_ID },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Focus GET error:', error)
    return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const session = await db.focusSession.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const session = await db.focusSession.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}