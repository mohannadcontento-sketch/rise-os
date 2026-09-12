import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { bustAggregateCache } from '@/lib/aggregate-cache'
import { withIdempotency } from '@/lib/idempotency'

// ============================================================
// /api/rise/projects — المشاريع
//
// CRUD كامل لمشاريع المستخدم (اسم، وصف، لون، تقدم، حالة) عبر
// data.projects — وتربط بها المهام من مسار المهام لاحقاً.
//
// المسار محمي: requireUser — مشاريع شخصية معزولة بـ RLS.
// الطرق: GET — كل المشاريع. POST — مشروع جديد. PUT — تحديث
//        (المعرّف في الجسم). DELETE ?id= — حذف.
// Idempotency-Key: مطلوب لكل طفرة (withIdempotency)، وبعد
// كل كتابة bustAggregateCache (لوحة التحكم تجمع المشاريع).
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  try {
    const projects = await data.projects.list(userId)
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل المشاريع' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    try {
      const body = await req.json()
      const project = await data.projects.create(userId, body)
      bustAggregateCache(userId)
      return NextResponse.json(project)
    } catch (error) {
      console.error('Projects POST error:', error)
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }
  })
}

export async function PUT(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    try {
      const { id, ...body } = await req.json()
      const project = await data.projects.update(id, userId, body)
      bustAggregateCache(userId)
      return NextResponse.json(project)
    } catch (error) {
      console.error('Projects PUT error:', error)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }
  })
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    try {
      const { searchParams } = new URL(req.url)
      const id = searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

      await data.projects.remove(id, userId)
      bustAggregateCache(userId)
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Projects DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
    }
  })
}
