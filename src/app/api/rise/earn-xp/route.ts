import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { calculateXpForLevel } from '@/lib/rise-utils'

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const { amount, reason } = await req.json()
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    // Fetch current user XP data
    const { data: user, error: fetchError } = await supabase
      .from('User')
      .select('xp, level, xpToNextLevel')
      .eq('id', userId)
      .single()

    if (fetchError) throw fetchError

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
    const { error: updateError } = await supabase
      .from('User')
      .update({ xp: newXp, level: newLevel, xpToNextLevel: newXpToNext })
      .eq('id', userId)

    if (updateError) throw updateError

    return NextResponse.json({
      xp: newXp,
      amount,
      reason: reason || 'unknown',
      leveled,
      newLevel,
    })
  } catch (error) {
    // If Supabase not configured, return mock success (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ xp: 0, leveled: false, newLevel: 1, offline: true, id: 'mock-' + Date.now() })
    }
    console.error('Earn XP error:', error)
    return NextResponse.json({ xp: 0, leveled: false, newLevel: 1 })
  }
}