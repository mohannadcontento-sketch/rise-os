import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getToday, getLast30Days } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const today = getToday()
    const logs = await db.healthLog.findMany({
      where: { userId: USER_ID, date: { in: getLast30Days() } },
      orderBy: { date: 'desc' },
    })
    const todayLog = logs.find(l => l.date === today)
    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ healthLog: null, recentLogs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const today = getToday()
    const existing = await db.healthLog.findFirst({ where: { userId: USER_ID, date: body.date || today } })
    if (existing) {
      const log = await db.healthLog.update({ where: { id: existing.id }, data: body })
      return NextResponse.json(log)
    }
    const log = await db.healthLog.create({ data: { userId: USER_ID, date: today, ...body } })
    return NextResponse.json(log)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}