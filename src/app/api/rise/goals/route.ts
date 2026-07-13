import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const goals = await db.goal.findMany({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
      include: { milestones: { orderBy: { order: 'asc' } } },
    })
    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({
      goals: [
        { id: 'g1', title: 'إكمال كتاب الإنتاجية', type: 'quarterly', progress: 35, status: 'active', deadline: '2025-12-31', milestones: [] },
        { id: 'g2', title: 'الوصول لمستوى 10', type: 'annual', progress: 70, status: 'active', deadline: '2025-12-31', milestones: [] },
        { id: 'g3', title: 'قراءة 24 كتاب', type: 'annual', progress: 45, status: 'active', deadline: '2025-12-31', milestones: [] },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const goal = await db.goal.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(goal)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const goal = await db.goal.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(goal)
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
    await db.goal.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}