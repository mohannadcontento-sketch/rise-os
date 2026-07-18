import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { calculateXpForLevel } from '@/lib/rise-utils'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { amount, reason } = await req.json()
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    // Fetch current user XP data
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, xpToNextLevel: true },
    })

    const currentXp = user?.xp || 0
    const currentLevel = user?.level || 1
    let currentXpToNext = user?.xpToNextLevel || calculateXpForLevel(currentLevel)

    let newXp = currentXp + amount
    let newLevel = currentLevel
    let newXpToNext = currentXpToNext
    let leveled = false

    // Check level up
    while (newXp >= newXpToNext) {
      newXp -= newXpToNext
      newLevel += 1
      newXpToNext = calculateXpForLevel(newLevel)
      leveled = true
    }

    // Update user
    await db.user.update({
      where: { id: userId },
      data: { xp: newXp, level: newLevel, xpToNextLevel: newXpToNext },
    })

    return NextResponse.json({
      xp: newXp,
      amount,
      reason: reason || 'unknown',
      leveled,
      newLevel,
    })
  } catch (error) {
    console.error('Earn XP error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}