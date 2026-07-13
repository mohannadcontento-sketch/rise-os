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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const habit = await db.habit.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(habit)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const habit = await db.habit.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(habit)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}