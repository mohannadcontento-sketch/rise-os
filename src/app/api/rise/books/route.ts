import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ books: [] })

    const books = await db.book.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ books })
  } catch (error) {
    console.error('Books GET error:', error)
    return NextResponse.json({ books: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...data } = body
    const record = await db.book.create({
      data: { userId, ...data },
    })
    return NextResponse.json(record)
  } catch (error) {
    return handleRouteError(error, 'books')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const record = await db.book.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(record)
  } catch (error) {
    return handleRouteError(error, 'books')
  }
}