import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'
import { calculateXpForLevel } from '@/lib/rise-utils'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { amount, reason } = await req.json()
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ success: true, offline: true })
    }

    // Fetch current user XP data from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('xp, level, xp_to_next_level')
      .eq('id', userId)
      .single()
      .catch(() => ({ data: null }))

    const currentXp = profile?.xp || 0
    const currentLevel = profile?.level || 1
    let currentXpToNext = profile?.xp_to_next_level || calculateXpForLevel(currentLevel)

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

    // Update user in profiles table
    await supabase
      .from('profiles')
      .update({
        xp: newXp,
        level: newLevel,
        xp_to_next_level: newXpToNext,
      })
      .eq('id', userId)
      .catch(() => null)

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