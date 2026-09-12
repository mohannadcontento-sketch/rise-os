import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { isoToCairoDate } from '@/lib/rise-utils'

// ============================================================
// /api/rise/dashboard/weekly-chart — لوحة التحكم (منحنى الأسبوع)
//
// نقطة فرعية من تفكيك لوحة التحكم (P2#3): درجات آخر 7 أيام من
// daily_scores لتغذية الرسم البياني الأسبوعي، مع تعبئة الأيام
// الناقصة بأصفار ليظهر المنحنى متصلاً بلا فجوات.
//
// المسار محمي: requireUser — درجات شخصية.
// الطرق: GET — يعيد { scores } × 7 أيام: { date, score,
//        morningScore, taskScore, habitScore, focusScore }.
// ملاحظة: نافذة الأسبوع تُبنى بأيام القاهرة المحلية
//        (isoToCairoDate) — كانت UTC فتُسمّى الأيام خطأ
//        بين منتصف الليل والفجر بتوقيت القاهرة.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * P2#3: Decomposed dashboard — weekly chart sub-endpoint
 * GET /api/rise/dashboard/weekly-chart
 * Returns: daily scores for the last 7 days
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
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

    const scores = await data.dailyScores.list(userId, weekDays)

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
    return NextResponse.json({ error: 'تعذر تحميل الرسم الأسبوعي' }, { status: 500 })
  }
}
