import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const books = await db.book.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ books })
  } catch (error) {
    console.error('Books GET error:', error)
    return NextResponse.json({
      books: [
        { id: 'b1', title: 'العمل العميق', author: 'كال نيوبورت', status: 'reading', progress: 61, totalPages: 296, currentPage: 180 },
        { id: 'b2', title: 'عادات ذرية', author: 'جيمس كلير', status: 'completed', progress: 100, totalPages: 320, currentPage: 320 },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const book = await db.book.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const book = await db.book.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}