import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const goals = await db.goal.findMany({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
      include: { milestones: { orderBy: { order: 'asc' } } },
    })
    return NextResponse.json({ goals })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const goal = await db.goal.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(goal)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...body } = await req.json()
    const goal = await db.goal.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(goal)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    await db.goal.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}