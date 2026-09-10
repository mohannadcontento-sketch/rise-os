import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { setCurrentAuthToken } from '@/lib/data'
import { calculateXpForLevel, isoToCairoDate } from '@/lib/rise-utils'
import { getSupabaseWithAuth, isSupabaseConfigured } from '@/lib/supabase'
import { bustAggregateCache } from '@/lib/aggregate-cache'
import { withIdempotency } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

// SECURITY: the client is untrusted — cap every award server-side.
// 300 matches the largest client-side award (a fully-loaded work session).
const MAX_XP_PER_AWARD = 300

// Only known award sources are accepted; anything else is rejected so
// arbitrary/self-minted XP requests can't masquerade as real actions.
const REASON_PATTERN =
  /^(?:(?:task|habit|work|morning|deepwork|focus|journal|reading|goal):[A-Za-z0-9_-]{1,80}|morning-routine-complete)$/

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const { amount, reason } = await req.json()
    if (!amount || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (typeof reason !== 'string' || !REASON_PATTERN.test(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    }
    const xpGain = Math.min(Math.floor(amount), MAX_XP_PER_AWARD)

    const localDay = isoToCairoDate(new Date()) || new Date().toLocaleDateString('en-CA')
    let dedupeKey: string | null = null
    if (reason.startsWith('task:')) dedupeKey = reason
    else if (reason.startsWith('habit:') || reason === 'morning-routine-complete') {
      dedupeKey = `${reason}:${localDay}`
    }

    // Production: one authenticated RPC transaction does the dedupe insert,
    // XP calculation, level progression and streak update atomically.
    if (isSupabaseConfigured()) {
      const client = await getSupabaseWithAuth(req)
      if (!client) {
        return NextResponse.json({ error: 'Database not available' }, { status: 503 })
      }

      const { data: result, error } = await (client as any).rpc('award_xp_atomic', {
        p_user_id: userId,
        p_amount: xpGain,
        p_reason: reason,
        p_dedupe_key: dedupeKey,
        p_activity_date: localDay,
      })

      if (error) {
        console.error('[earn-xp] atomic award failed:', error.message)
        return NextResponse.json({ error: 'تعذر تسجيل الخبرة بشكل آمن' }, { status: 503 })
      }

      const row = Array.isArray(result) ? result[0] : result
      if (row?.duplicate) {
        return NextResponse.json({ duplicate: true, awarded: 0 })
      }

      bustAggregateCache(userId)
      return NextResponse.json({
        xp: row?.xp ?? 0,
        amount: xpGain,
        reason,
        leveled: !!row?.leveled,
        newLevel: row?.level ?? 1,
      })
    }

    // Local SQLite/Prisma: mirror the same atomic semantics with one DB transaction.
    try {
      const { db } = await import('@/lib/db')
      const result = await (db as any).$transaction(async (tx: any) => {
        if (dedupeKey) {
          try {
            await tx.xpAward.create({
              data: { userId, reason, dedupeKey, amount: xpGain },
            })
          } catch (error: any) {
            // Unique constraint = this logical action was already paid.
            if (error?.code === 'P2002') return { duplicate: true }
            throw error
          }
        }

        const user = await tx.user.findUnique({ where: { id: userId } })
        if (!user) throw new Error('USER_NOT_FOUND')

        let newXp = (user.xp || 0) + xpGain
        let newLevel = user.level || 1
        let leveled = false
        let newXpToNext = calculateXpForLevel(newLevel)
        while (newXp >= newXpToNext) {
          newXp -= newXpToNext
          newLevel += 1
          newXpToNext = calculateXpForLevel(newLevel)
          leveled = true
        }

        const lastActive = (user.lastActiveDate || '').trim()
        let newStreak = user.streak || 0
        if (lastActive !== localDay) {
          const yesterday = new Date(`${localDay}T00:00:00`)
          yesterday.setDate(yesterday.getDate() - 1)
          const yesterdayStr = yesterday.toISOString().slice(0, 10)
          newStreak = lastActive === yesterdayStr ? (user.streak || 0) + 1 : 1
        }
        const newLongestStreak = Math.max(newStreak, user.longestStreak || 0)

        await tx.user.update({
          where: { id: userId },
          data: {
            xp: newXp,
            level: newLevel,
            xpToNextLevel: newXpToNext,
            streak: newStreak,
            longestStreak: newLongestStreak,
            lastActiveDate: localDay,
          },
        })

        return { xp: newXp, level: newLevel, leveled, duplicate: false }
      })

      if (result?.duplicate) return NextResponse.json({ duplicate: true, awarded: 0 })
      bustAggregateCache(userId)
      return NextResponse.json({
        xp: result.xp,
        amount: xpGain,
        reason,
        leveled: result.leveled,
        newLevel: result.level,
      })
    } catch (error: any) {
      console.error('[earn-xp] local atomic award failed:', error)
      return NextResponse.json({ error: 'تعذر تسجيل الخبرة بشكل آمن' }, { status: 503 })
    }

  })} catch (error) {
    console.error('Earn XP error:', error)
    return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
  }
}
