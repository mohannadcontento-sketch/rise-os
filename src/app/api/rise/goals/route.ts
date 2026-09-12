import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { pickAllowed } from '@/lib/sanitize'
import { bustAggregateCache } from '@/lib/aggregate-cache'
import { withIdempotency } from '@/lib/idempotency'

// ============================================================
// /api/rise/goals — الأهداف (أهداف + محطات)
//
// واجهة كاملة لأهداف المستخدم: إنشاء هدف (رؤية، نوع، موعد
// نهائي) مع محطات جزئية، تحديث التقدم، قلب حالة المحطات،
// والحذف — كل العمليات عبر data.goals بتمرير userId (عزل RLS).
//
// المسار محمي: requireUser — أهداف شخصية.
// الطرق: GET — كل الأهداف مع محطاتها.
//        POST — هدف جديد، أو محطة على هدف قائم
//        ({ goalId, milestoneTitle }).
//        PUT — تحديث هدف، أو قلب محطة ({ milestoneId,
//        completed }). معرّف غير صالح يرد 400 لا 500.
//        DELETE ?id= — حذف الهدف.
// Idempotency-Key: مطلوب لكل طفرة (withIdempotency) وبعدها
// bustAggregateCache. الحقول بقائمة بيضاء (pickAllowed) —
// حقول عميلة قديمة تُقصى كي لا تكسر الكتابة.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const goals = await data.goals.list(userId)
    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل الأهداف' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json()

    // Add milestone to existing goal: { goalId, milestoneTitle }
    if (body.goalId && body.milestoneTitle) {
      const milestone = await data.goals.addMilestone(body.goalId, userId, body.milestoneTitle)
      bustAggregateCache(userId)
      return NextResponse.json(milestone)
    }

    // Create new goal — whitelist columns (legacy client fields break the write)
    const goal = await data.goals.create(
      userId,
      pickAllowed(body, ['title', 'vision', 'why', 'type', 'progress', 'status', 'deadline'])
    )
    bustAggregateCache(userId)
    return NextResponse.json(goal)
  
  })} catch (error) {
    console.error('Goals POST error:', error)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
      const updated = await data.goals.toggleMilestone(body.milestoneId, userId, body.completed === true)
      bustAggregateCache(userId)
      return NextResponse.json(updated)
    }

    const { id, ...updateBody } = body
    // FIX: a stale client used to PUT without a valid id → Postgres
    // 'invalid input syntax for type uuid: "undefined"'. Fail cleanly instead.
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: 'معرّف الهدف مطلوب' }, { status: 400 })
    }
    const goal = await data.goals.update(
      id,
      userId,
      pickAllowed(updateBody, ['title', 'vision', 'why', 'type', 'progress', 'status', 'deadline'])
    )
    bustAggregateCache(userId)
    return NextResponse.json(goal)
  
  })} catch (error) {
    console.error('Goals PUT error:', error)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
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

    await data.goals.remove(id, userId)
    bustAggregateCache(userId)
    return NextResponse.json({ success: true })
  
  })} catch (error) {
    console.error('Goals DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}