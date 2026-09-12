import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { getTodayCairo, getLast30Days } from '@/lib/rise-utils'
import { bustAggregateCache } from '@/lib/aggregate-cache'
import { withIdempotency } from '@/lib/idempotency'

// ============================================================
// /api/rise/health — الصحة (سجلات يومية)
//
// سجل يومي واحد لكل تاريخ (upsert): نوم، ماء، خطوات، سعرات،
// وزن، مزاج، طاقة وتمرين — يغذي وحدة الصحة ومؤشراتها.
//
// المسار محمي: requireUser — بيانات صحية شخصية.
// الطرق: GET — { logs, todayLog } لآخر 30 يوماً.
//        POST { date?, ...مقاييس } — upsert سجل اليوم (أو
//        التاريخ المُرسل) ويعيد السجل المحفوظ.
// Idempotency-Key: مطلوب للـPOST + bustAggregateCache.
// تعقيم: ALLOWED_FIELDS قائمة بيضاء، وFIELD_MAP توائم أسماء
//        العميل مع أعمدة البيانات (exerciseNotes →
//        exerciseNote) — بلا التوائم تُسقَط الحقول بصمت.
// ============================================================

export const dynamic = 'force-dynamic'

/** Fields allowed to be stored in HealthLog */
const ALLOWED_FIELDS = [
  'sleepHours', 'sleepQuality', 'waterGlasses', 'steps',
  'calories', 'weight', 'mood', 'energy', 'exerciseType',
  'exerciseMin', 'exerciseNote',
] as const

/** Map frontend field names to data layer field names */
const FIELD_MAP: Record<string, string> = {
  water: 'waterGlasses',
  exercise: 'exerciseType',
  // TASK 25 FIX: the client form field is "exerciseNotes" (plural) but the DB
  // column is exercise_note — the name mismatch meant exercise notes were
  // SILENTLY DROPPED on every save ("الصحة مبيحصلش حفظ"). Accept both spellings.
  exerciseNotes: 'exerciseNote',
  exerciseNote: 'exerciseNote',
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // TZ FIX (نمط morning): تاريخ العميل (القاهرة) هو المرجع عند وجوده؛
    // البديل getTodayCairo لا getToday — ساعة الخادم UTC، فبين 00:00–02:00
    // بتوقيت القاهرة كان «اليوم» يظل أمساً فيُعرض سجل الأمس كنموذج اليوم.
    const dateParam = new URL(req.url).searchParams.get('date')
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayCairo()
    const last30 = getLast30Days()

    const logs = await data.healthLogs.list(userId, last30)
    const todayLog = logs.find((l: any) => l.date === today) || null

    return NextResponse.json({ logs, todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل السجل الصحي' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json().catch(() => ({}))
    // بديل Cairo-safe (body.date من العميل هو الأساس عادةً)
    const today = getTodayCairo()
    const targetDate = body.date || today

    // Only keep allowed fields, mapping frontend names
    const cleanData: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        cleanData[field] = body[field]
      }
    }
    for (const [frontend, mapped] of Object.entries(FIELD_MAP)) {
      if (body[frontend] !== undefined && cleanData[mapped] === undefined) {
        cleanData[mapped] = body[frontend]
      }
    }

    const result = await data.healthLogs.upsert(userId, targetDate, cleanData)
    bustAggregateCache(userId)
    return NextResponse.json(result)
  
  })} catch (error) {
    console.error('Health POST error:', error)
    return NextResponse.json({ error: 'Failed to save health log' }, { status: 500 })
  }
}