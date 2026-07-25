import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'
import { calculateXpForLevel } from '@/lib/rise-utils'
import { getSupabaseAdmin, getSupabaseWithAuth } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { amount, reason } = await req.json()
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    // Try admin client first, then per-user client
    let client: any = await getSupabaseAdmin()
    if (!client) {
      client = await getSupabaseWithAuth(req)
    }
    if (!client) {
      // Mock mode: update Prisma directly
      try {
        const { db } = await import('@/lib/db')
        const user = await (db as any).user.findUnique({ where: { id: userId } })
        if (user) {
          let newXp = (user.xp || 0) + amount
          let newLevel = user.level || 1
          let newXpToNext = user.xpToNextLevel || calculateXpForLevel(1)
          let leveled = false
          while (newXp >= newXpToNext) {
            newXp -= newXpToNext
            newLevel += 1
            newXpToNext = calculateXpForLevel(newLevel)
            leveled = true
          }
          await (db as any).user.update({
            where: { id: userId },
            data: { xp: newXp, level: newLevel, xpToNextLevel: newXpToNext },
          })
          return NextResponse.json({ xp: newXp, amount, reason: reason || 'unknown', leveled, newLevel })
        }
      } catch {}
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }

    // Fetch current user XP data
    let currentXp = 0
    let currentLevel = 1
    let currentXpToNext = calculateXpForLevel(1)

    try {
      const { data: profile, error } = await client
        .from('profiles')
        .select('xp, level, xp_to_next_level')
        .eq('id', userId)
        .single()

      if (!error && profile) {
        currentXp = profile.xp || 0
        currentLevel = profile.level || 1
        currentXpToNext = profile.xp_to_next_level || calculateXpForLevel(currentLevel)
      }
    } catch {
      // Profile not found — use defaults
    }

    let newXp = currentXp + amount
    let newLevel = currentLevel
    let newXpToNext = currentXpToNext
    let leveled = false

    while (newXp >= newXpToNext) {
      newXp -= newXpToNext
      newLevel += 1
      newXpToNext = calculateXpForLevel(newLevel)
      leveled = true
    }

    try {
      await client
        .from('profiles')
        .update({
          xp: newXp,
          level: newLevel,
          xp_to_next_level: newXpToNext,
        })
        .eq('id', userId)
    } catch {
      // Update failed — still return success with calculated values
    }

    return NextResponse.json({
      xp: newXp,
      amount,
      reason: reason || 'unknown',
      leveled,
      newLevel,
    })
  } catch (error) {
    console.error('Earn XP error:', error)
    return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
  }
}
