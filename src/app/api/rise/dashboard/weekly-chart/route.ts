import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { isoToCairoDate } from '@/lib/rise-utils'

export const dynamic = 'force-dynamic'

/**
 * P2#3: Decomposed dashboard — weekly chart sub-endpoint
 * GET /api/rise/dashboard/weekly-chart
 * Returns: daily scores for the last 7 days
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // TZ FIX: the 7-day window used to be built with toISOString() (UTC) —
    // mislabeled days for Cairo users between 00:00–02:00 local. Bucket each
    // instant into its Cairo-local day instead.
    const weekDays: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      weekDays.push(isoToCairoDate(d) || d.toISOString().split('T')[0])
    }

    const scores = await data.dailyScores.list(userId, weekDays).catch(() => [])

    // Fill missing days with zero scores
    const chartData = weekDays.map((date) => {
      const s: any = scores.find((x: any) => x.date === date)
      return {
        date,
        score: s?.score ?? 0,
        morningScore: s?.morningScore ?? 0,
        taskScore: s?.taskScore ?? 0,
        habitScore: s?.habitScore ?? 0,
        focusScore: s?.focusScore ?? 0,
      }
    })

    return NextResponse.json({ scores: chartData })
  } catch (error) {
    console.error('Weekly chart error:', error)
    return NextResponse.json({ scores: [] })
  }
}
