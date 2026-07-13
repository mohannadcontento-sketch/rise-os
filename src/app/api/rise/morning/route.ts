import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getToday, getLast30Days } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const today = getToday()
    const logs = await db.morningLog.findMany({
      where: { userId: USER_ID, date: { in: getLast30Days() } },
      orderBy: { date: 'desc' },
    })
    const todayLog = logs.find(l => l.date === today)
    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const today = getToday()
    const existing = await db.morningLog.findFirst({ where: { userId: USER_ID, date: body.date || today } })
    if (existing) {
      const log = await db.morningLog.update({ where: { id: existing.id }, data: body })
      return NextResponse.json(log)
    }
    const log = await db.morningLog.create({ data: { userId: USER_ID, date: today, ...body } })
    return NextResponse.json(log)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}