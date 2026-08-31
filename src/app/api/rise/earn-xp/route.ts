import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'
import { calculateXpForLevel, isoToCairoDate } from '@/lib/rise-utils'
import { getSupabaseAdmin, getSupabaseWithAuth } from '@/lib/supabase'
import { bustAggregateCache } from '@/lib/aggregate-cache'

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
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { amount, reason } = await req.json()
    if (!amount || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (typeof reason !== 'string' || !REASON_PATTERN.test(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    }
    const xpGain = Math.min(Math.floor(amount), MAX_XP_PER_AWARD)

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
          let newXp = (user.xp || 0) + xpGain
          let newLevel = user.level || 1
          // BALANCE FIX: re-anchor to the NEW curve on every award so
          // existing users migrate to it without a migration (old stored
          // xp_to_next_level values were computed with the old 1.15 factor).
          let newXpToNext = calculateXpForLevel(newLevel)
          let leveled = false
          while (newXp >= newXpToNext) {
            newXp -= newXpToNext
            newLevel += 1
            newXpToNext = calculateXpForLevel(newLevel)
            leveled = true
          }

          // FIX: Update streak — if user earned XP today, they're active.
          // Streak increments if last activity was yesterday, resets if >1 day gap.
          const now = new Date()
          const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
          const yesterday = new Date(now)
          yesterday.setDate(yesterday.getDate() - 1)
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`
          
          const lastActive = (user as any).lastActiveDate || ''
          let newStreak = user.streak || 0
          if (lastActive !== todayStr) {
            if (lastActive === yesterdayStr) {
              newStreak = (user.streak || 0) + 1
            } else {
              newStreak = 1 // Reset streak
            }
          }
          const newLongestStreak = Math.max(newStreak, user.longestStreak || 0)

          await (db as any).user.update({
            where: { id: userId },
            data: {
              xp: newXp, level: newLevel, xpToNextLevel: newXpToNext,
              streak: newStreak, longestStreak: newLongestStreak,
              lastActiveDate: todayStr,
            } as any,
          })
          bustAggregateCache(userId)
          return NextResponse.json({ xp: newXp, amount: xpGain, reason: reason || 'unknown', leveled, newLevel })
        }
      } catch {}
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }

    // ─── IDEMPOTENCY: reject duplicate awards (double-submit farming) ───
    // task:<id> pays once ever; habit:<id> and the morning routine pay once
    // per local calendar day. Session-based sources (work/focus) repeat.
    // TZ FIX: the daily bucket used the SERVER's local day (UTC on Vercel) —
    // a habit checked at 00:30 Cairo was treated as the same "day" as the
    // previous evening, so the re-award after midnight was wrongly blocked
    // (and vice versa). Bucket by Cairo-local day instead.
    const localDay = isoToCairoDate(new Date()) || new Date().toLocaleDateString('en-CA')
    let dedupeKey: string | null = null
    if (reason.startsWith('task:')) dedupeKey = reason
    else if (reason.startsWith('habit:') || reason === 'morning-routine-complete') {
      dedupeKey = `${reason}:${localDay}`
    }

    if (dedupeKey) {
      try {
        // NOTE: must be upsert(), not insert() — in supabase-js v2 only
        // upsert() accepts { onConflict, ignoreDuplicates }; insert()
        // silently ignores them. With ignoreDuplicates a conflicting row
        // is left untouched and omitted from the returned rows, so
        // `inserted.length === 0` ⇒ this action was already awarded.
        const { data: inserted, error: dedupeErr } = await client
          .from('xp_awards')
          .upsert(
            { user_id: userId, reason, dedupe_key: dedupeKey, amount: xpGain },
            { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
          )
          .select('id')
        if (!dedupeErr) {
          if (!inserted || inserted.length === 0) {
            // Already awarded — no XP, but 200 so optimistic UI doesn't error.
            return NextResponse.json({ duplicate: true, awarded: 0 })
          }
        } else {
          // Migration 010 not applied yet (or transient) — degrade to old
          // behavior instead of blocking legitimate awards.
          console.warn('[earn-xp] dedupe unavailable:', dedupeErr.message)
        }
      } catch (e: any) {
        console.warn('[earn-xp] dedupe unavailable:', e?.message)
      }
    }

    // Fetch current user XP data
    let currentXp = 0
    let currentLevel = 1

    try {
      const { data: profile, error } = await client
        .from('profiles')
        .select('xp, level')
        .eq('id', userId)
        .single()

      if (!error && profile) {
        currentXp = profile.xp || 0
        currentLevel = profile.level || 1
      }
    } catch {
      // Profile not found — use defaults
    }

    let newXp = currentXp + xpGain
    let newLevel = currentLevel
    let leveled = false

    // BALANCE FIX: always re-anchor the requirement to the CURRENT curve
    // (old profiles stored xp_to_next_level computed with the old 1.15
    // factor) — no migration needed, self-corrects on the next award.
    let newXpToNext = calculateXpForLevel(newLevel)
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
    bustAggregateCache(userId)

    return NextResponse.json({
      xp: newXp,
      amount: xpGain,
      reason: reason || 'unknown',
      leveled,
      newLevel,
    })
  } catch (error) {
    console.error('Earn XP error:', error)
    return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
  }
}
