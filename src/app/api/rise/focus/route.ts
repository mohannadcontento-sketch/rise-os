import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const sessions = await db.focusSession.findMany({
      where: { userId: USER_ID },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ sessions })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const session = await db.focusSession.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...body } = await req.json()
    const session = await db.focusSession.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}