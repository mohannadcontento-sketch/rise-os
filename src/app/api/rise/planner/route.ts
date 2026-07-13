import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET(req: NextRequest) {
  try {
    await ensureDb()
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const items = await db.plannerItem.findMany({
      where: { userId: USER_ID, date },
      orderBy: [{ section: 'asc' }, { order: 'asc' }],
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const { date, section, title, time } = body

    // Get next order for this section/date
    const maxOrder = await db.plannerItem.findFirst({
      where: { userId: USER_ID, date, section },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const nextOrder = (maxOrder?.order ?? -1) + 1

    const item = await db.plannerItem.create({
      data: {
        userId: USER_ID,
        date,
        section,
        title,
        time: time || null,
        order: nextOrder,
      },
    })

    return NextResponse.json(item)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()

    const item = await db.plannerItem.update({
      where: { id, userId: USER_ID },
      data: body,
    })

    return NextResponse.json(item)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDb()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.plannerItem.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}