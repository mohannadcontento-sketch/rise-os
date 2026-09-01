import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

// TASK 24 follow-up: garbage payloads hit the DB raw and came back as 500.
// A strict schema turns misuse into a clear 400 instead.
const BookCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).nullable().optional(),
  type: z.enum(['book', 'article', 'course', 'video']).optional(),
  status: z.enum(['reading', 'completed', 'want-to-read', 'paused']).optional(),
  currentPage: z.number().int().min(0).max(1_000_000).optional(),
  totalPages: z.number().int().min(1).max(1_000_000).nullable().optional(),
  progress: z.number().min(0).max(100).optional(),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  highlights: z.string().max(50000).nullable().optional(),
  favoriteQuote: z.string().max(5000).nullable().optional(),
  startDate: z.string().max(10).nullable().optional(),
  endDate: z.string().max(10).nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

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
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    // TASK 25: validate before touching the DB — misuse gets a clear 400
    const parsed = BookCreateSchema.safeParse(dataFields)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات الكتاب غير صالحة', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const record = await data.books.create(userId, {
      ...parsed.data,
      type: parsed.data.type || 'book',
      status: parsed.data.status || 'reading',
    })
    bustAggregateCache(userId)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Books POST error:', error)
    return NextResponse.json({ error: 'Failed to create book' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const record = await data.books.update(id, userId, body)
    bustAggregateCache(userId)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Books PUT error:', error)
    return NextResponse.json({ error: 'Failed to update book' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.books.remove(id, userId)
    bustAggregateCache(userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Books DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 })
  }
}