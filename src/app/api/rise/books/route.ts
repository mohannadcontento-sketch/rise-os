import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// 'video' matches the actual type select in reading.tsx ('podcast' was never
// offered in the UI). Nullable fields below are ones the UI sends as explicit
// `null` when empty (e.g. `author: newAuthor || null`), which plain
// `.optional()` rejects — this made adding a book without an author fail.
const createBookSchema = z.object({
  title: z.string().min(1).max(300),
  author: z.string().max(200).nullable().optional(),
  type: z.enum(['book', 'article', 'course', 'video']).optional(),
  status: z.enum(['want-to-read', 'reading', 'completed', 'abandoned']).optional(),
  currentPage: z.number().int().min(0).nullable().optional(),
  totalPages: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  highlights: z.string().max(5000).nullable().optional(),
  favoriteQuote: z.string().max(1000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

const updateBookSchema = z.object({
  id: z.string().uuid('معرف الكتاب غير صالح'),
  title: z.string().min(1).max(300).optional(),
  author: z.string().max(200).nullable().optional(),
  type: z.enum(['book', 'article', 'course', 'video']).optional(),
  status: z.enum(['want-to-read', 'reading', 'completed', 'abandoned']).optional(),
  currentPage: z.number().int().min(0).nullable().optional(),
  totalPages: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  highlights: z.string().max(5000).nullable().optional(),
  favoriteQuote: z.string().max(1000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ books: [] })

    const books = await data.books.list(userId)
    return NextResponse.json({ books })
  } catch (error) {
    console.error('Books GET error:', error)
    return NextResponse.json({ books: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const validated = createBookSchema.parse(dataFields)
    const record = await data.books.create(userId, validated)
    return NextResponse.json(record)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Books POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الكتاب' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'معرف الكتاب مطلوب' }, { status: 400 })

    const validated = updateBookSchema.parse({ id, ...body })
    const { id: _id, ...updateData } = validated
    const record = await data.books.update(id, updateData)
    return NextResponse.json(record)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: error.issues }, { status: 400 })
    }
    console.error('Books PUT error:', error)
    return NextResponse.json({ error: 'فشل في تحديث الكتاب' }, { status: 500 })
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
    if (!id) return NextResponse.json({ error: 'معرف الكتاب مطلوب' }, { status: 400 })

    await data.books.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Books DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف الكتاب' }, { status: 500 })
  }
}