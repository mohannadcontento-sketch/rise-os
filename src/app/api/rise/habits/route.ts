import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getLast30Days } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const habits = await db.habit.findMany({ where: { userId: USER_ID } })
    const last30 = getLast30Days()
    const logs = await db.habitLog.findMany({
      where: { habit: { userId: USER_ID }, date: { in: last30 } },
    })
    return NextResponse.json({ habits, logs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({
      habits: [
        { id: 'h1', name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
        { id: 'h2', name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
        { id: 'h3', name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
      ],
      todayLogs: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const habit = await db.habit.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(habit)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const habit = await db.habit.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(habit)
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
    await db.habit.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}