import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })

    const records = await db.financeRecord.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ records })
  } catch (error) {
    console.error('Finance GET error:', error)
    return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...data } = body
    const record = await db.financeRecord.create({
      data: { userId, ...data },
    })
    return NextResponse.json(record)
  } catch (error) {
    return handleRouteError(error, 'finance')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.financeRecord.deleteMany({
      where: { id, userId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'finance')
  }
}