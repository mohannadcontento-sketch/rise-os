import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// 'idea' is added because the Quick Capture box (the primary way items get
// added here) always sends `type: 'idea'`, which this enum previously
// rejected — every Quick Capture save failed with 400. tags/source are
// nullable because Quick Capture also sends `tags: null, source: null`.
const createKnowledgeSchema = z.object({
  type: z.enum(['note', 'article', 'video', 'audio', 'link', 'idea']).optional(),
  title: z.string().min(1).max(300),
  content: z.string().max(50000).optional(),
  folder: z.string().max(100).optional(),
  tags: z.string().nullable().optional(),
  source: z.string().max(500).nullable().optional(),
  isFavorite: z.boolean().optional(),
})

const updateKnowledgeSchema = z.object({
  id: z.string().uuid('معرف العنصر غير صالح'),
  type: z.enum(['note', 'article', 'video', 'audio', 'link', 'idea']).optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().max(50000).optional(),
  folder: z.string().max(100).optional(),
  tags: z.string().nullable().optional(),
  source: z.string().max(500).nullable().optional(),
  isFavorite: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ items: [] })

    const items = await data.knowledgeItems.list(userId)
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Knowledge GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const validated = createKnowledgeSchema.parse(dataFields)
    const record = await data.knowledgeItems.create(userId, validated)
    return NextResponse.json(record)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Knowledge POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العنصر' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'معرف العنصر مطلوب' }, { status: 400 })

    const validated = updateKnowledgeSchema.parse({ id, ...body })
    const { id: _id, ...updateData } = validated
    const record = await data.knowledgeItems.update(id, updateData)
    return NextResponse.json(record)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Knowledge PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث العنصر' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const id = body.id || searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'معرف العنصر مطلوب' }, { status: 400 })

    await data.knowledgeItems.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Knowledge DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف العنصر' }, { status: 500 })
  }
}