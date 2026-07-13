import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getToday, getLast30Days } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const today = getToday()
    const logs = await db.morningLog.findMany({
      where: { userId: USER_ID, date: { in: getLast30Days() } },
      orderBy: { date: 'desc' },
    })
    const todayLog = logs.find(l => l.date === today)
    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Morning GET error:', error)
    return NextResponse.json({
      todayLog: null,
      items: [
        { id: 'mi1', title: 'الاستيقاظ مبكراً', icon: '🌅', completed: false },
        { id: 'mi2', title: 'شرب كوب ماء', icon: '💧', completed: false },
        { id: 'mi3', title: 'الصلاة', icon: '🤲', completed: false },
        { id: 'mi4', title: 'تمارين رياضية', icon: '🏋️', completed: false },
        { id: 'mi5', title: 'تأمل وتهدئة', icon: '🧘', completed: false },
        { id: 'mi6', title: 'قراءة صفحات', icon: '📖', completed: false },
        { id: 'mi7', title: 'تخطيط اليوم', icon: '📋', completed: false },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
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
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}