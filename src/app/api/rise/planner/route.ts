import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { pickAllowed } from '@/lib/sanitize'
import { getTodayCairo } from '@/lib/rise-utils'
import { withIdempotency } from '@/lib/idempotency'

// ============================================================
// /api/rise/planner — المخطط اليومي (كتل اليوم)
//
// عناصر كتل اليوم (صباح/ظهر/مساء) بترتيبها داخل القسم، ويجلب
// بجانبها مهام اليوم ذات الوقت المحدد (linkedTasks) مصنَّفة
// حسب ساعتها — فيبدو الجدول موحّداً رغم مصدرين منفصلين.
//
// المسار محمي: requireUser — بيانات شخصية معزولة بـ RLS.
// الطرق: GET ?date — { items, linkedTasks } لليوم المطلوب
//        (المهام الملغاة مستثناة والمكتملة تظهر مشطوبة).
//        POST — عنصر جديد في نهاية قسمه (order متسلسل).
//        PUT — تحديث عنصر (نص، وقت، إتمام، ترتيب)؛ معرّف
//        غير صالح يرد 400.
//        DELETE ?id= — حذف العنصر.
// Idempotency-Key: مطلوب لكل طفرة. الحقول بقائمة بيضاء
// (pickAllowed) — حقول عميلة قديمة (مثل blocks) تُقصى.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    // العميل يرسل ?date= (تاريخه المحلي) دائماً؛ البديل Cairo-safe
    // لا getToday — ساعة الخادم UTC فتنزلق لليوم التالي بعد 02:00 صباحاً.
    const date = searchParams.get('date') || getTodayCairo()

    const [items, allTasks] = await Promise.all([
      data.plannerItems.list(userId, date),
      data.tasks.list(userId),
    ])

    // FIX: Show ALL tasks due today (including completed ones — they show as checked)
    const linkedTasks = allTasks.filter(
      (t: any) => t.dueDate === date && t.dueTime && t.status !== 'cancelled'
    ).map((t: any) => {
      // Determine section from dueTime hour
      const hour = parseInt(t.dueTime.split(':')[0], 10)
      let section = 'morning'
      if (hour >= 12 && hour < 17) section = 'noon'
      else if (hour >= 17) section = 'evening'

      return {
        id: `task-${t.id}`,
        taskId: t.id,
        title: t.title,
        completed: t.status === 'done',
        time: t.dueTime,
        section,
        order: -1, // linked tasks sort by time, not order
        priority: t.priority,
        projectName: t.project?.name || null,
        projectColor: t.project?.color || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        isLinkedTask: true,
      }
    })

    return NextResponse.json({ items, linkedTasks })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل المخطط' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json()
    const { date, section } = body

    // Get next order for this section/date
    const existing = await data.plannerItems.list(userId, date)
    const maxOrder = existing
      .filter((i: any) => i.section === section)
      .reduce((max: number, i: any) => Math.max(max, i.order ?? 0), -1)
    const nextOrder = maxOrder + 1

    // FIX: whitelist columns — legacy client fields (e.g. blocks) used to
    // break the create with PGRST204.
    const item = await data.plannerItems.create(
      userId,
      { ...pickAllowed(body, ['date', 'section', 'time', 'title']), order: nextOrder }
    )
    return NextResponse.json(item)
  
  })} catch (error) {
    console.error('Planner POST error:', error)
    return NextResponse.json({ error: 'Failed to create planner item' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const { id, ...body } = await req.json()
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: 'معرّف العنصر مطلوب' }, { status: 400 })
    }
    const item = await data.plannerItems.update(
      id,
      userId,
      pickAllowed(body, ['date', 'section', 'time', 'title', 'completed', 'order'])
    )
    return NextResponse.json(item)
  
  })} catch (error) {
    console.error('Planner PUT error:', error)
    return NextResponse.json({ error: 'Failed to update planner item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.plannerItems.remove(id, userId)
    return NextResponse.json({ success: true })
  
  })} catch (error) {
    console.error('Planner DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete planner item' }, { status: 500 })
  }
}