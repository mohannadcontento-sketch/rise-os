import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const { amount, reason } = await req.json()
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const user = await db.user.update({
      where: { id: USER_ID },
      data: { xp: { increment: amount } },
    })

    return NextResponse.json({
      xp: user.xp,
      amount,
      reason: reason || 'unknown',
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}