import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { calculateDailyScore, saveDailyScore, getGrade } from '@/lib/productivity'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId)
      return NextResponse.json({
        score: 0,
        breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 },
        grade: 'يحتاج تحسين',
      })

    // If no Supabase, return empty score
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        score: 0,
        breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 },
        grade: 'يحتاج تحسين',
      })
    }

    const { searchParams } = new URL(req.url)
    const datesParam = searchParams.get('dates')

    // Multi-date mode: return scores for each date
    if (datesParam) {
      const dates = datesParam.split(',').filter(Boolean)
      const scores = await Promise.all(
        dates.map(async (date) => {
          const { score } = await calculateDailyScore(userId, date.trim())
          return { date: date.trim(), score }
        }),
      )
      return NextResponse.json({ scores })
    }

    // Default: calculate for today with breakdown
    const today = getToday()
    const { score, breakdown } = await calculateDailyScore(userId, today)

    // ✅ FIX: Save the score to daily_scores so dashboard charts have data
    await saveDailyScore(userId, today, score, breakdown)

    return NextResponse.json({
      score,
      breakdown,
      grade: getGrade(score),
    })
  } catch (error) {
    console.error('Productivity score error:', error)
    return NextResponse.json({
      score: 0,
      breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 },
      grade: 'يحتاج تحسين',
    })
  }
}
